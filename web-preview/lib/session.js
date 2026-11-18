import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  putXtreamSecret as vaultPut,
  getXtreamSecret as vaultGet,
  deleteXtreamSecret as vaultDelete,
  hasXtreamSecret as vaultHas,
  loadSecretsIntoMemory
} from './secrets.js';
import { ensureSectionGroupPrefs, defaultSectionGroupPrefs } from './groupSelection.js';
import { migrateProfileProgress } from './episodeProgress.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '.data');
const statePath = path.join(dataDir, 'preview-state.json');

/** In-memory state — never re-parse the 100MB+ JSON on every request. */
let memoryState = null;
let saveTimer = null;
let saveInFlight = false;
let saveQueued = false;

export const defaultPrefs = () => ({
  visibleRowIds: ['CONTINUE_WATCHING', 'NEW_RELEASES', 'LIBRARY_SYNCED'],
  hiddenGroupIds: [],
  hiddenItemIds: [],
  favoriteIds: [],
  watchLaterIds: [],
  watchedIds: [],
  dismissedContinueIds: [],
  progressByItemId: {},
  progressByEpisodeId: {},
  /** Structured per-episode playback (position/duration/stream) — migrates from progressByEpisodeId. */
  episodePlaybackById: {},
  /** @deprecated use preferredAudioLanguage — kept for older state files */
  preferredLanguage: 'edition:vf',
  preferredAudioLanguage: 'edition:vf',
  /** Last selected series edition language (BCP-47 / edition:*) for next episodes. */
  preferredEpisodeLanguage: '',
  /** Logical episode progress keyed by lep:workId:S:E */
  progressByLogicalEpisodeId: {},
  /** Last opened edition title id per logical work */
  lastEditionByWorkId: {},
  preferredSubtitleLanguage: 'fr',
  interfaceLanguage: 'fr',
  reduceMotion: false,
  skipSplash: false,
  autoplayNextEpisode: true,
  /** Trusted per-episode time markers only — never auto-invented. */
  timeMarkersByEpisodeId: {},
  /** last-activity timestamps for Continuer à regarder sorting */
  continueActivityById: {},
  /**
   * Snapshot resume targets per title — survives even when episode lists
   * are not fully loaded in the catalog presentation path.
   * { [titleId]: { episodeId, streamId, season, episode, episodeTitle, fraction } }
   */
  continueResumeByTitleId: {},
  continueCompletedThreshold: 0.92,
  livePreviewEnabled: true,
  lastLiveChannelId: null,
  sectionGroupPrefs: defaultSectionGroupPrefs()
});

function normalizeState(state) {
  for (const id of Object.keys(state.prefsByProfile || {})) {
    const merged = ensureSectionGroupPrefs({
      ...defaultPrefs(),
      ...state.prefsByProfile[id]
    });
    // Migrate legacy preferredLanguage → preferredAudioLanguage
    if (!state.prefsByProfile[id]?.preferredAudioLanguage && merged.preferredLanguage) {
      const legacy = String(merged.preferredLanguage);
      const map = { VF: 'edition:vf', VO: 'edition:vo', EN: 'en', NL: 'nl' };
      merged.preferredAudioLanguage = map[legacy.toUpperCase()] || legacy || 'edition:vf';
      merged.preferredLanguage = merged.preferredAudioLanguage;
    }
    if (!merged.preferredSubtitleLanguage) merged.preferredSubtitleLanguage = 'fr';
    // TASK-013: drop search history permanently (keep favorites / progress / other prefs)
    if ('recentSearches' in merged) {
      delete merged.recentSearches;
    }
    if (!merged.interfaceLanguage) merged.interfaceLanguage = 'fr';
    if (!merged.episodePlaybackById) merged.episodePlaybackById = {};
    state.prefsByProfile[id] = migrateProfileProgress(
      merged,
      state.catalog?.titles || []
    );
  }
  if (!state.settings) state.settings = { autoSyncMinutes: 0 };
  if (state.syncProgress === undefined) state.syncProgress = null;
  if (!state.liveUi) state.liveUi = null;
  if (!state.search) {
    state.search = { query: '', filter: 'all', offset: 0, result: null };
  }
  if (!state.groupSetup) {
    state.groupSetup = { open: false, section: null, mode: 'first' };
  }
  return state;
}

function initialState() {
  return normalizeState({
    screen: 'splash',
    hubSection: null,
    detail: null,
    customizeOpen: false,
    activeProfileId: null,
    profiles: [
      {
        id: 'profile_alex',
        name: 'Alex',
        avatarColor: '#E50914',
        avatarUrl: '/api/demo-art/avatar-Alex.svg'
      },
      {
        id: 'profile_sam',
        name: 'Sam',
        avatarColor: '#C9A227',
        avatarUrl: '/api/demo-art/avatar-Sam.svg'
      }
    ],
    prefsByProfile: {
      profile_alex: { ...defaultPrefs() },
      profile_sam: { ...defaultPrefs() }
    },
    sources: [],
    catalog: { groups: [], titles: [], generatedAtEpochMs: 0 },
    lastSyncMessage: null,
    lastSyncError: null,
    lastSyncAt: null,
    syncing: false,
    syncProgress: null,
    settings: { autoSyncMinutes: 0 },
    liveUi: null,
    search: { query: '', filter: 'all', offset: 0, result: null },
    player: null
  });
}

export function loadState() {
  loadSecretsIntoMemory();
  if (memoryState) return memoryState;
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(statePath)) {
    memoryState = initialState();
    writeStateSync(memoryState);
    return memoryState;
  }
  const t0 = Date.now();
  const raw = fs.readFileSync(statePath, 'utf8');
  memoryState = normalizeState(JSON.parse(raw));
  console.log(
    `[session] loaded state ${(raw.length / 1e6).toFixed(1)}MB in ${Date.now() - t0}ms · ` +
      `${memoryState.catalog?.titles?.length || 0} titles`
  );
  return memoryState;
}

function writeStateSync(state) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify(state, (key, value) => {
      if (key === 'xtreamSecrets' || key === 'password') return undefined;
      return value;
    }),
    'utf8'
  );
}

/**
 * Keep memory authoritative. Disk writes are debounced so Live/search
 * never block on rewriting a 100MB+ JSON file.
 */
export function saveState(state, { immediate = false } = {}) {
  memoryState = state;
  if (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    flushSave();
    return;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushSave();
  }, 800);
}

function flushSave() {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  if (!memoryState) return;
  saveInFlight = true;
  const snapshot = memoryState;
  setImmediate(() => {
    try {
      const t0 = Date.now();
      writeStateSync(snapshot);
      console.log(`[session] persisted in ${Date.now() - t0}ms`);
    } catch (e) {
      console.error('[session] persist failed', e.message);
    } finally {
      saveInFlight = false;
      if (saveQueued) {
        saveQueued = false;
        flushSave();
      }
    }
  });
}

/** Force persist (sync complete, process exit). */
export function flushStateSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (memoryState) writeStateSync(memoryState);
}

export function putXtreamSecret(sourceId, username, password) {
  vaultPut(sourceId, username, password);
}

export function getXtreamSecret(sourceId) {
  return vaultGet(sourceId);
}

export function deleteXtreamSecret(sourceId) {
  vaultDelete(sourceId);
}

export function hasXtreamSecret(sourceId) {
  return vaultHas(sourceId);
}

export function publicSource(source) {
  return {
    id: source.id,
    displayName: source.displayName,
    kind: source.kind,
    enabled: source.enabled,
    endpoint: source.endpoint || '',
    usernameHint: source.usernameHint || '',
    lastError: source.lastError || null,
    lastSyncEpochMs: source.lastSyncEpochMs || null,
    allowPrivateLan: !!source.allowPrivateLan,
    hasSecret: source.kind === 'XTREAM' ? hasXtreamSecret(source.id) : false,
    hasLocalFile: source.kind === 'M3U_FILE' ? !!source.localPath : false
  };
}

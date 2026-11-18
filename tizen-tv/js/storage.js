/**
 * Persistent device storage for Tizen Web TV (localStorage).
 * Profile-scoped prefs; device-scoped sources + Xtream secrets.
 * Not as strong as Android Keystore — credentials stay on-device only.
 */

const STATE_KEY = 'lks_tv_tizen_state_v1';
const SECRETS_KEY = 'lks_tv_tizen_xtream_secrets_v1';

const DEFAULT_PROFILES = [
  { id: 'profile_alex', name: 'Alex', avatarColor: 0xffe50914 },
  { id: 'profile_sam', name: 'Sam', avatarColor: 0xff44aadd }
];

export function defaultPrefs() {
  return {
    favoriteIds: [],
    watchLaterIds: [],
    hiddenGroupIds: [],
    hiddenItemIds: [],
    dismissedContinueIds: [],
    progressByItemId: {},
    progressByEpisodeId: {},
    episodePlaybackById: {},
    continueActivityById: {},
    continueResumeByTitleId: {},
    preferredLanguage: 'edition:vf',
    preferredAudioLanguage: 'fr',
    preferredSubtitleLanguage: 'fr',
    interfaceLanguage: 'fr',
    reduceMotion: false,
    livePreviewEnabled: true,
    sectionGroupPrefs: {},
    visibleRowIds: ['CONTINUE_WATCHING', 'NEW_RELEASES', 'LIBRARY_SYNCED'],
    continueCompletedThreshold: 0.95
  };
}

export function emptyState() {
  const prefsByProfile = {};
  for (const p of DEFAULT_PROFILES) prefsByProfile[p.id] = defaultPrefs();
  return {
    schemaVersion: 1,
    screen: 'splash',
    activeProfileId: null,
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
    prefsByProfile,
    sources: [],
    catalog: { groups: [], titles: [], generatedAtEpochMs: 0 },
    lastSyncMessage: null,
    lastSyncError: null,
    demoOptInAvailable: true
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      const s = emptyState();
      saveState(s);
      return s;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.profiles?.length) parsed.profiles = emptyState().profiles;
    if (!parsed.prefsByProfile) parsed.prefsByProfile = {};
    for (const p of parsed.profiles) {
      parsed.prefsByProfile[p.id] = {
        ...defaultPrefs(),
        ...(parsed.prefsByProfile[p.id] || {})
      };
    }
    if (!parsed.catalog) parsed.catalog = { groups: [], titles: [], generatedAtEpochMs: 0 };
    if (!Array.isArray(parsed.sources)) parsed.sources = [];
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  const clone = JSON.parse(JSON.stringify(state));
  // Never persist plaintext passwords inside sources.
  for (const s of clone.sources || []) {
    delete s.password;
    delete s.playlistText; // large; optional — keep for M3U_FILE offline
  }
  localStorage.setItem(STATE_KEY, JSON.stringify(clone));
}

export function loadSecrets() {
  try {
    return JSON.parse(localStorage.getItem(SECRETS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSecrets(map) {
  localStorage.setItem(SECRETS_KEY, JSON.stringify(map || {}));
}

export function putXtreamSecret(sourceId, username, password) {
  const map = loadSecrets();
  map[sourceId] = { username, password };
  saveSecrets(map);
}

export function getXtreamSecret(sourceId) {
  const map = loadSecrets();
  return map[sourceId] || null;
}

export function deleteXtreamSecret(sourceId) {
  const map = loadSecrets();
  delete map[sourceId];
  saveSecrets(map);
}

export function addProfile(state, name) {
  const id = `profile_${Date.now().toString(36)}`;
  const profile = {
    id,
    name: String(name || 'Nouveau').trim().slice(0, 24) || 'Nouveau',
    avatarColor: 0xffe50914
  };
  state.profiles.push(profile);
  state.prefsByProfile[id] = defaultPrefs();
  saveState(state);
  return profile;
}

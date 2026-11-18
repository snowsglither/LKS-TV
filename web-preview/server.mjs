/**
 * LKS TV web-preview — bind 127.0.0.1 only.
 * Xtream passwords: encrypted vault + memory; never in API JSON / logs / client JS.
 * Android APK does NOT depend on this server.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseM3u,
  presentRows,
  catalogStatus,
  selectPreferred,
  toItem
} from './lib/catalog.js';
import {
  loadState,
  saveState,
  flushStateSync,
  putXtreamSecret,
  getXtreamSecret,
  deleteXtreamSecret,
  publicSource,
  defaultPrefs
} from './lib/session.js';
import {
  buildDemoShowcaseCatalog,
  demoProgressSeeds
} from './lib/demoCatalog.js';
import {
  renderPosterSvg,
  renderBackdropSvg,
  renderHubCardSvg,
  renderAvatarSvg,
  renderEpisodeSvg
} from './lib/demoArtSvg.js';
import { runSync, uploadsDir, fetchM3uUrl } from './lib/syncEngine.js';
import { assertSafeHttpUrl, normalizeBaseUrl } from './lib/urlGuard.js';
import {
  authenticate,
  buildMediaUrl,
  parseOpaquePlaybackRef,
  fetchSeriesEpisodes
} from './lib/xtreamClient.js';
import {
  buildSearchIndex,
  searchCatalog,
  suggestFromIndex
} from './lib/searchEngine.js';
import {
  listLiveGroups,
  listLiveChannels,
  invalidateLiveIndex
} from './lib/liveCatalog.js';
import {
  versionLabel,
  cleanDisplayTitle,
  cleanEpisodeTitle,
  formatEpisodeListLabel,
  formatPlayerSeriesTitle,
  detectLangFromText
} from './lib/displayMeta.js';
import { editionLabelFromTitle } from './lib/seriesIdentity.js';
import {
  ensureWorkIds,
  findWorkEditions,
  presentWorkEditionChips,
  mergeLogicalEpisodes,
  findEpisodeVersionForLanguage,
  workIdOf,
  logicalEpisodeProgressKey
} from './lib/workIdentity.js';
import {
  migratePreferredLanguage,
  preferredLanguageChoices,
  interfaceLanguageChoices,
  languageDisplayName,
  normalizeLanguageTag
} from './lib/languages.js';
import {
  fetchUpstreamSample,
  proxyMediaStream,
  authorizeMediaHost,
  isMediaHostAllowed
} from './lib/mediaProxy.js';
import {
  ensureSectionGroupPrefs,
  listSelectableGroups,
  sectionNeedsSetup,
  setupCopy,
  pruneSelectedGroups,
  getSectionConfig,
  GROUP_SECTIONS
} from './lib/groupSelection.js';
import {
  markersForEpisode,
  reliableIntroWindow
} from './lib/introMarkers.js';
import { buildContinueWatching, touchContinueActivity } from './lib/continueWatching.js';
import { buildRecommendations } from './lib/recommendations.js';
import {
  COMPLETED_THRESHOLD,
  STARTED_THRESHOLD,
  upsertEpisodePlayback,
  resumePositionSec,
  watchState,
  migrateProfileProgress
} from './lib/episodeProgress.js';
import {
  ensureNavStack,
  pushFrame,
  popFrame,
  patchTopFrame,
  replaceStack,
  resetStack,
  snapshotFrame,
  applyFrame,
  peekFrame
} from './lib/navStack.js';
import { buildEpgGuide } from './lib/epgGuide.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.LKS_PREVIEW_HOST || '127.0.0.1';
const PORT = Number(process.env.LKS_PREVIEW_PORT || 3000);

const app = express();
app.use(express.json({ limit: '4mb' }));

/** Cached search index — rebuilt when catalog generation or search engine version changes. */
const SEARCH_INDEX_VERSION = 13;
let searchIndexCache = { generatedAtEpochMs: -1, version: -1, index: null };

function getSearchIndex(state) {
  const gen = state.catalog?.generatedAtEpochMs || 0;
  if (
    !searchIndexCache.index ||
    searchIndexCache.generatedAtEpochMs !== gen ||
    searchIndexCache.version !== SEARCH_INDEX_VERSION
  ) {
    searchIndexCache = {
      generatedAtEpochMs: gen,
      version: SEARCH_INDEX_VERSION,
      index: buildSearchIndex(state.catalog)
    };
  }
  return searchIndexCache.index;
}

/** Dynamic demo SVG art (local, deterministic) — DEMO_SHOWCASE / UI only. */
app.get('/api/demo-art/:file', (req, res) => {
  const file = String(req.params.file || '');
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const hub = file.match(/^(live|films|series)-hub\.svg$/);
  if (hub) return res.send(renderHubCardSvg(hub[1]));
  const avatar = file.match(/^avatar-(.+)\.svg$/);
  if (avatar) {
    const name = decodeURIComponent(avatar[1]);
    const color = name.toLowerCase().includes('sam') ? '#C9A227' : '#E50914';
    return res.send(renderAvatarSvg(name, color));
  }
  const ep = file.match(/^(.+)-episode\.svg$/);
  if (ep) return res.send(renderEpisodeSvg(ep[1]));
  const m = file.match(/^(.+)-(poster|backdrop)\.svg$/);
  if (!m) return res.status(404).send('not found');
  return res.send(m[2] === 'poster' ? renderPosterSvg(m[1]) : renderBackdropSvg(m[1]));
});

app.use(express.static(path.join(__dirname, 'public')));

function prefs(state) {
  const id = state.activeProfileId || 'profile_alex';
  if (!state.prefsByProfile[id]) state.prefsByProfile[id] = defaultPrefs();
  state.prefsByProfile[id] = ensureSectionGroupPrefs(state.prefsByProfile[id]);
  // Migrate/prune orphaned demo seeds + stale continue snaps (keeps real Chacal progress).
  state.prefsByProfile[id] = migrateProfileProgress(
    state.prefsByProfile[id],
    state.catalog?.titles || []
  );
  return state.prefsByProfile[id];
}

function hasEnabledSources(state) {
  return state.sources.some((s) => s.enabled);
}

function maybeOpenFirstVisitSetup(state, screen) {
  if (!GROUP_SECTIONS.includes(screen)) return;
  if (!state.groupSetup) state.groupSetup = { open: false, section: null, mode: 'first' };
  if (state.groupSetup.open && state.groupSetup.mode === 'manage') return;
  const p = prefs(state);
  if (
    sectionNeedsSetup(p, state.catalog, screen, hasEnabledSources(state)) &&
    !(state.syncing)
  ) {
    state.groupSetup = { open: true, section: screen, mode: 'first' };
  }
}

function buildGroupSetupPayload(state) {
  const gs = state.groupSetup || { open: false, section: null, mode: 'first' };
  if (!gs.open || !gs.section) {
    return { open: false, section: null, mode: 'first', groups: [], selectedGroupIds: [], copy: null };
  }
  const p = prefs(state);
  const cfg = getSectionConfig(p, gs.section);
  const copy = setupCopy(gs.section);
  return {
    open: true,
    section: gs.section,
    mode: gs.mode || 'first',
    groups: listSelectableGroups(state.catalog, gs.section, state.sources),
    selectedGroupIds: [...cfg.selectedGroupIds],
    configured: !!cfg.configured,
    copy
  };
}

function groupNameMap(state) {
  return new Map((state.catalog.groups || []).map((g) => [g.id, g.name]));
}

function enrichStreamLang(stream, groupName = '') {
  const existing = normalizeLanguageTag(stream.languageTag || stream.language || '');
  if (existing) {
    return {
      ...stream,
      language: existing,
      languageTag: existing,
      confidence: stream.confidence || 'KNOWN'
    };
  }
  const d = detectLangFromText(stream.rawTitle || '', groupName);
  const tag = normalizeLanguageTag(d.languageTag || d.language || '');
  return {
    ...stream,
    language: tag || 'UNKNOWN',
    languageTag: tag,
    confidence: d.confidence || 'UNKNOWN'
  };
}

function buildDetail(title, p, state) {
  const names = state ? groupNameMap(state) : null;
  if (state?.catalog) ensureWorkIds(state.catalog);
  const workEditions =
    state?.catalog && (title.type === 'SERIES' || title.type === 'FILM')
      ? findWorkEditions(state.catalog, title)
      : [];
  const editionTitles =
    state?.catalog && workEditions.length
      ? workEditions
          .map((ed) => (state.catalog.titles || []).find((t) => t.id === ed.id))
          .filter(Boolean)
      : [title];

  // SERIES / multi-edition FILM: merge episode/version streams across logical work
  const mergedEps =
    title.type === 'SERIES'
      ? mergeLogicalEpisodes(editionTitles, p)
      : null;

  const variantPool =
    title.type === 'SERIES'
      ? (title.variants || []).concat(
          editionTitles.flatMap((t) => (t.id === title.id ? [] : t.variants || []))
        )
      : title.variants?.length > 0
        ? title.variants
        : (title.episodes || []).flatMap((ep) => (ep.versions || []).map((v) => v.stream));

  const preferredLang =
    p.preferredEpisodeLanguage || p.preferredAudioLanguage || p.preferredLanguage;
  const preferred = selectPreferred(variantPool, preferredLang);

  const seasonsMap = {};
  const episodeSource = mergedEps || title.episodes || [];
  for (const ep of episodeSource) {
    const s = ep.seasonNumber || 1;
    if (!seasonsMap[s]) seasonsMap[s] = { number: s, title: `Saison ${s}`, episodes: [] };
    const physicalIds = ep.physicalIds || [ep.id];
    let play = null;
    let epProgress = 0;
    for (const pid of physicalIds) {
      const pl = (p.episodePlaybackById || {})[pid] || null;
      const frac = Number((p.progressByEpisodeId || {})[pid] ?? pl?.fraction ?? 0);
      if (frac >= epProgress) {
        epProgress = frac;
        play = pl || play;
      }
    }
    const lepKey = logicalEpisodeProgressKey(
      workIdOf(title),
      s,
      ep.episodeNumber
    );
    const logicalFrac = Number((p.progressByLogicalEpisodeId || {})[lepKey] ?? 0);
    if (logicalFrac > epProgress) epProgress = logicalFrac;

    const epVers = ep.versions || [];
    const status = watchState(epProgress, p.continueCompletedThreshold ?? COMPLETED_THRESHOLD);
    const preferredVer =
      selectPreferred(
        epVers.map((v) => v.stream).filter(Boolean),
        preferredLang
      ) || epVers[0]?.stream;
    seasonsMap[s].episodes.push({
      id: ep.id,
      physicalIds,
      number: ep.episodeNumber,
      seasonNumber: s,
      title: cleanEpisodeTitle(ep.title, s, ep.episodeNumber, title.canonicalTitle),
      listLabel: formatEpisodeListLabel(
        cleanEpisodeTitle(ep.title, s, ep.episodeNumber, title.canonicalTitle),
        ep.episodeNumber
      ),
      rawTitle: ep.title,
      synopsis: ep.synopsis || '',
      durationMinutes: ep.durationMinutes || null,
      progressFraction: epProgress,
      watchState: status,
      positionMs: play?.positionMs || 0,
      durationMs: play?.durationMs || 0,
      thumbUrl: ep.thumbPath || null,
      selectedStreamId: preferredVer?.id || null,
      versions: epVers.map((ver, index) => {
        const stream = enrichStreamLang(
          ver.stream,
          names?.get(ver.stream.groupId) || ''
        );
        const langTag = normalizeLanguageTag(
          ver.languageTag || stream.languageTag || stream.language || ''
        );
        return {
          id: stream.id,
          label:
            (langTag && languageDisplayName(langTag, { useful: false })) ||
            ver.editionLabel ||
            versionLabel(stream, {
              index,
              total: epVers.length,
              groupNamesById: names
            }),
          streamId: stream.id,
          languageTag: langTag,
          editionId: ver.editionId || title.id,
          physicalEpisodeId: ver.physicalEpisodeId || ep.id,
          requiresNewStream: true
        };
      })
    });
  }

  const hash = Math.abs(
    [...title.id].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0)
  );
  const isDemo = String(title.id).includes(':demo:') || title.matchKey?.value?.startsWith?.('demo:');
  const unique = [...new Map(variantPool.map((v) => [v.id, v])).values()].map((v) =>
    enrichStreamLang(v, names?.get(v.groupId) || '')
  );
  const seenLabels = new Set();
  const versions = [];
  unique.forEach((v, index) => {
    const label = versionLabel(v, {
      index,
      total: unique.length,
      groupNamesById: names
    });
    if (seenLabels.has(label) && unique.length > 8) return;
    seenLabels.add(label);
    versions.push({
      id: v.id,
      label,
      language: v.language,
      confidence: v.confidence,
      groupId: v.groupId
    });
  });

  const editionChips = presentWorkEditionChips(workEditions);
  // Prefer best artwork across editions
  const posterUrl =
    title.posterPath ||
    editionTitles.map((t) => t.posterPath).find(Boolean) ||
    null;
  const backdropUrl =
    title.backdropPath ||
    editionTitles.map((t) => t.backdropPath).find(Boolean) ||
    posterUrl;

  return {
    id: title.id,
    logicalWorkId: workIdOf(title),
    title: cleanDisplayTitle(title.canonicalTitle),
    rawTitle: title.canonicalTitle,
    synopsis:
      title.synopsis ||
      editionTitles.map((t) => t.synopsis).find((s) => s) ||
      'Aucune synopsis fournie par la source.',
    genres: title.genres || [],
    type: title.type,
    year: title.year || editionTitles.map((t) => t.year).find(Boolean) || 0,
    durationMinutes: title.durationMinutes || null,
    posterColor: `#${((0x1b2430 + (hash % 0x404040)) >>> 0).toString(16).padStart(6, '0').slice(-6)}`,
    backdropColor: `#${((0x101820 + (hash % 0x505050)) >>> 0).toString(16).padStart(6, '0').slice(-6)}`,
    posterUrl,
    backdropUrl,
    hasArtwork: !!(posterUrl || backdropUrl),
    isDemoShowcase: !!isDemo,
    episodesLoaded: title._episodesLoaded !== false || !(title._xtreamSeriesId),
    needsEpisodeFetch: !!(title._xtreamSeriesId && !title._episodesLoaded),
    versions,
    versionCount: unique.length,
    selectedVersionId: preferred?.id || versions[0]?.id || null,
    trustedMerge: workEditions.length > 1 ||
      ((title.matchKey?.type === 'PROVIDER_EXTERNAL' ||
        title.matchKey?.type === 'TITLE_YEAR') &&
        !title.singleSourceOnly),
    seasons: Object.values(seasonsMap).sort((a, b) => a.number - b.number),
    selectedSeason: Object.keys(seasonsMap).length ? Number(Object.keys(seasonsMap).sort()[0]) : null,
    editions: editionChips,
    editionHint: editionLabelFromTitle(title.canonicalTitle || '').label,
    availableLanguages: editionChips
      .filter((e) => e.languageTag)
      .map((e) => ({
        tag: e.languageTag,
        label: e.label,
        editionId: e.id,
        selected: !!e.selected
      })),
    isFavorite: (p.favoriteIds || []).includes(title.id),
    isWatchLater: (p.watchLaterIds || []).includes(title.id),
    isWatched: (p.watchedIds || []).includes(title.id),
    moreOpen: false,
    related: [],
    recommendations: null
  };
}

function attachRecommendations(detail, catalog) {
  if (!detail || !catalog?.titles?.length) return detail;
  const seed = (catalog.titles || []).find((t) => t.id === detail.id);
  if (!seed) return detail;
  // Cap scan for large catalogs: same type first, sample if huge
  const sameType = [];
  for (const t of catalog.titles) {
    if (t.type !== seed.type || t.id === seed.id) continue;
    sameType.push(t);
    if (sameType.length >= 4000) break;
  }
  const raw = buildRecommendations(seed, sameType, { limit: 12 });
  const toCard = (t) => ({
    id: t.id,
    title: cleanDisplayTitle(t.canonicalTitle),
    year: t.year || 0,
    posterUrl: t.posterPath || null,
    genres: (t.genres || []).slice(0, 3),
    type: t.type
  });
  detail.recommendations = {
    saga: raw.saga.map(toCard),
    similar: raw.similar.map(toCard),
    sameGenre: raw.sameGenre.map(toCard),
    sameCast: raw.sameCast.map(toCard)
  };
  return detail;
}

/** Cache presented film/series rows per catalog generation + profile prefs fingerprint. */
const presentCache = new Map();

function prefsFingerprint(p) {
  const sgp = p.sectionGroupPrefs || {};
  const sgParts = GROUP_SECTIONS.map((s) => {
    const c = sgp[s] || {};
    return `${s}:${c.configured ? 1 : 0}:${(c.selectedGroupIds || []).join(',')}`;
  });
  const contAct = p.continueActivityById || {};
  const contKeys = Object.keys(contAct).sort().slice(-40);
  const progItems = Object.keys(p.progressByItemId || {}).sort().slice(-40);
  const progEps = Object.keys(p.progressByEpisodeId || {}).sort().slice(-40);
  return [
    (p.visibleRowIds || []).join(','),
    (p.hiddenGroupIds || []).join(','),
    (p.hiddenItemIds || []).join(','),
    (p.dismissedContinueIds || []).join(','),
    p.preferredLanguage || 'VF',
    progItems.map((k) => `${k}:${(p.progressByItemId || {})[k]}`).join(','),
    progEps.map((k) => `${k}:${(p.progressByEpisodeId || {})[k]}`).join(','),
    contKeys.map((k) => `${k}:${contAct[k]}`).join(','),
    ...sgParts
  ].join('|');
}

function cachedPresent(state, type, p) {
  const gen = state.catalog?.generatedAtEpochMs || 0;
  const key = `${type}:${gen}:${state.activeProfileId}:${prefsFingerprint(p)}`;
  if (presentCache.has(key)) return presentCache.get(key);
  const names = groupNameMap(state);
  const value = presentRows(state.catalog, type, p, names);
  presentCache.set(key, value);
  if (presentCache.size > 24) {
    const first = presentCache.keys().next().value;
    presentCache.delete(first);
  }
  return value;
}

function countByType(catalog) {
  let film = 0;
  let series = 0;
  let live = 0;
  for (const t of catalog.titles || []) {
    if (t.type === 'FILM') film += 1;
    else if (t.type === 'SERIES') series += 1;
    else if (t.type === 'LIVE') live += 1;
  }
  return { film, series, live, total: film + series + live };
}

function buildClientState(state) {
  const p = prefs(state);
  const hasEnabled = state.sources.some((s) => s.enabled);
  const films = cachedPresent(state, 'FILM', p);
  const series = cachedPresent(state, 'SERIES', p);
  const status = catalogStatus(hasEnabled, state.catalog, state.syncing, state.lastSyncError);
  const profile = state.profiles.find((x) => x.id === state.activeProfileId) || null;
  const demoActive = state.sources.some((s) => s.kind === 'DEMO_SHOWCASE' && s.enabled);
  const realActive = state.sources.some((s) => s.kind !== 'DEMO_SHOWCASE' && s.enabled);
  const counts = countByType(state.catalog);
  const liveMeta = listLiveGroups(state.catalog, p);
  return {
    previewDisclaimer:
      'Environnement IPTV localhost (127.0.0.1) — ne valide pas le focus Compose / D-pad natif Android TV.',
    designSystem: 'TASK-006.3/007.1 continue + panels + premium ref',
    apiRoutes: {
      groupsSetupOpen: 'POST /api/groups/setup/open',
      groupsSetupSave: 'POST /api/groups/setup/save',
      groupsSetupClose: 'POST /api/groups/setup/close',
      search: 'POST /api/search',
      liveChannels: 'POST /api/live/channels'
    },
    demoShowcaseActive: demoActive,
    realCatalogActive: realActive && !demoActive,
    screen: state.screen || 'splash',
    profiles: state.profiles.map((pr) => ({
      ...pr,
      avatarUrl: pr.avatarUrl || `/api/demo-art/avatar-${encodeURIComponent(pr.name)}.svg`
    })),
    activeProfileId: state.activeProfileId,
    activeProfile: profile
      ? {
          ...profile,
          avatarUrl: profile.avatarUrl || `/api/demo-art/avatar-${encodeURIComponent(profile.name)}.svg`
        }
      : null,
    preferences: (() => {
      const { recentSearches: _dropRecent, ...rest } = p;
      return {
        ...rest,
        preferredAudioLanguage: p.preferredAudioLanguage || migratePreferredLanguage(p.preferredLanguage),
        preferredSubtitleLanguage: p.preferredSubtitleLanguage || 'fr',
        interfaceLanguage: p.interfaceLanguage || 'fr'
      };
    })(),
    uiRestore: state.uiRestore || null,
    navDepth: Array.isArray(state.navStack) ? state.navStack.length : 0,
    epg: state.epg || null,
    languageChoices: {
      audio: preferredLanguageChoices(),
      subtitles: preferredLanguageChoices().filter((c) => !String(c.value).startsWith('edition:') || c.value === 'edition:multi'),
      interface: interfaceLanguageChoices()
    },
    customizeOpen: !!state.customizeOpen,
    sources: state.sources.map(publicSource),
    groups: state.catalog.groups.map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      sourceId: g.sourceId,
      sourceLabel: state.sources.find((s) => s.id === g.sourceId)?.displayName || g.sourceId
    })),
    films: {
      rows: films.rows,
      hero: films.hero,
      titleCount: films.titleCount || 0,
      status,
      sectionConfigured: !!films.sectionConfigured,
      selectedGroupCount: films.selectedGroupCount || 0
    },
    series: {
      rows: series.rows,
      hero: series.hero,
      titleCount: series.titleCount || 0,
      status,
      sectionConfigured: !!series.sectionConfigured,
      selectedGroupCount: series.selectedGroupCount || 0
    },
    // Hub mixed Continuer à regarder (films + séries) — profile progress, not allowlist
    continueWatching: (() => {
      ensureWorkIds(state.catalog);
      const nameMap = new Map((state.catalog.groups || []).map((g) => [g.id, g.name]));
      const preferred = p.preferredLanguage || 'VF';
      const pool = (state.catalog.titles || []).filter(
        (t) =>
          (t.type === 'FILM' || t.type === 'SERIES') &&
          !(p.hiddenItemIds || []).includes(t.id)
      );
      return buildContinueWatching(
        pool,
        p,
        (t, frac) => ({
          ...toItem(t, preferred, frac, nameMap),
          logicalWorkId: workIdOf(t)
        }),
        24
      );
    })(),
    live: {
      deferred: true,
      status,
      totalChannels: liveMeta.totalChannels,
      groupCount: liveMeta.groups.length,
      // Shell only — channels loaded via /api/live/channels
      groups: liveMeta.groups.slice(0, 200),
      favorites: liveMeta.favorites,
      all: liveMeta.all,
      selectedGroupId: state.liveUi?.groupId || liveMeta.groups[0]?.id || '__all__',
      channels: state.liveUi?.channels || null,
      selectedChannelId: state.liveUi?.channelId || null,
      sectionConfigured: !!liveMeta.sectionConfigured,
      selectedGroupCount: liveMeta.selectedGroupCount || 0
    },
    groupSetup: buildGroupSetupPayload(state),
    sectionGroupPrefs: {
      tv: getSectionConfig(p, 'tv'),
      films: getSectionConfig(p, 'films'),
      series: getSectionConfig(p, 'series')
    },
    catalogTitleCount: counts.total,
    liveCount: counts.live,
    filmCount: counts.film,
    seriesCount: counts.series,
    syncing: state.syncing,
    syncProgress: state.syncProgress,
    lastSyncMessage: state.lastSyncMessage,
    lastSyncError: state.lastSyncError,
    lastSyncAt: state.lastSyncAt,
    settings: state.settings || { autoSyncMinutes: 0 },
    detail: state.detail || null,
    player: state.player || null,
    hubSection: state.hubSection || null,
    search: (() => {
      const s = state.search || { query: '', filter: 'all', offset: 0, result: null };
      return {
        query: s.query || '',
        filter: s.filter || 'all',
        offset: s.offset || 0,
        result: s.result || null,
        suggestions: s.suggestions || []
      };
    })()
  };
}

function disableDemoSources(state) {
  for (const s of state.sources) {
    if (s.kind === 'DEMO_SHOWCASE') s.enabled = false;
  }
}

/** Drop fictive DEMO_SHOWCASE catalog + seeded continue progress when a real source is validated. */
function clearDemoCatalogIfPresent(state) {
  const demoIds = new Set(
    (state.sources || []).filter((s) => s.kind === 'DEMO_SHOWCASE').map((s) => s.id)
  );
  const titles = state.catalog?.titles || [];
  const looksDemo =
    titles.some((t) => String(t.id || '').includes('demo_') || String(t.matchKey?.value || '').includes('demo')) ||
    titles.some((t) => (t.variants || []).some((v) => demoIds.has(v.sourceId) || String(v.playbackUrl || '').includes('example.invalid')));
  if (!looksDemo && titles.length === 0) {
    state.catalog = { groups: [], titles: [], generatedAtEpochMs: Date.now() };
    return;
  }
  if (looksDemo || demoIds.size > 0) {
    state.catalog = { groups: [], titles: [], generatedAtEpochMs: Date.now() };
    for (const pid of Object.keys(state.prefsByProfile || {})) {
      const pr = state.prefsByProfile[pid];
      if (!pr) continue;
      // Strip obvious demo progress seeds; keep keys that remain after real sync.
      pr.progressByItemId = Object.fromEntries(
        Object.entries(pr.progressByItemId || {}).filter(([id]) => !String(id).includes('demo_'))
      );
      pr.continueResumeByTitleId = Object.fromEntries(
        Object.entries(pr.continueResumeByTitleId || {}).filter(([id]) => !String(id).includes('demo_'))
      );
      pr.favoriteIds = (pr.favoriteIds || []).filter((id) => !String(id).includes('demo_'));
      pr.watchLaterIds = (pr.watchLaterIds || []).filter((id) => !String(id).includes('demo_'));
    }
  }
}

function hasEnabledRealSource(state) {
  return (state.sources || []).some((s) => s.enabled && s.kind !== 'DEMO_SHOWCASE');
}

function disableRealSources(state) {
  for (const s of state.sources) {
    if (s.kind !== 'DEMO_SHOWCASE') s.enabled = false;
  }
}

/** Cold start / hard refresh — always gate on profile picker (no auto-select). */
app.post('/api/session/boot', (_req, res) => {
  const state = loadState();
  state.activeProfileId = null;
  state.screen = 'splash';
  state.detail = null;
  state.player = null;
  state.customizeOpen = false;
  state.hubSection = null;
  state.groupSetup = { open: false, section: null, mode: 'first' };
  saveState(state, { immediate: true });
  res.json(buildClientState(state));
});

app.get('/api/state', (_req, res) => {
  res.json(buildClientState(loadState()));
});

app.post('/api/navigate', async (req, res) => {
  const state = loadState();
  ensureNavStack(state);
  const {
    screen,
    hubSection,
    detailId,
    customizeOpen,
    scrollY,
    focusKey,
    replace,
    selectedSeason
  } = req.body || {};

  // Persist restore metadata on the frame we are leaving
  if (state.screen && state.screen !== 'splash') {
    patchTopFrame(state, {
      scrollY: Number(scrollY) || peekFrame(state)?.scrollY || 0,
      focusKey: focusKey || peekFrame(state)?.focusKey || null,
      selectedSeason: state.detail?.selectedSeason ?? peekFrame(state)?.selectedSeason ?? null,
      searchQuery: state.search?.query || '',
      searchFilter: state.search?.filter || 'all',
      searchOffset: state.search?.offset || 0,
      liveGroupId: state.liveUi?.groupId || null,
      liveChannelId: state.liveUi?.channelId || null,
      detailId: state.detail?.id || peekFrame(state)?.detailId || null,
      screen: state.screen === 'player' ? peekFrame(state)?.screen : state.screen
    });
  }

  if (screen) state.screen = screen;
  // Changing profile from the app returns to the gate — clear active profile
  if (screen === 'profiles' || screen === 'splash') {
    state.activeProfileId = null;
    state.detail = null;
    state.player = null;
    state.customizeOpen = false;
    state.epg = null;
    resetStack(state, { screen: screen || 'profiles' });
  }
  if (hubSection !== undefined) state.hubSection = hubSection;
  if (customizeOpen !== undefined) state.customizeOpen = !!customizeOpen;
  if (screen && GROUP_SECTIONS.includes(screen)) {
    maybeOpenFirstVisitSetup(state, screen);
  } else if (screen && screen !== 'detail') {
    if (state.groupSetup?.mode === 'first') {
      state.groupSetup = { open: false, section: null, mode: 'first' };
    }
  }
  if (detailId) {
    let title = state.catalog.titles.find((t) => t.id === detailId);
    if (title?._xtreamSeriesId && !title._episodesLoaded) {
      try {
        const editionRefs = (title._xtreamEditionIds?.length
          ? title._xtreamEditionIds
          : [{ sourceId: title._xtreamSourceId, seriesId: title._xtreamSeriesId, rawTitle: title.canonicalTitle }]
        ).filter((e) => e?.sourceId && e?.seriesId);
        const episodesByKey = new Map();
        let primaryGroupId = title.variants?.[0]?.groupId || null;
        for (const ed of editionRefs) {
          const source = state.sources.find((s) => s.id === ed.sourceId);
          const creds = getXtreamSecret(ed.sourceId);
          if (!source || !creds) continue;
          const pack = await fetchSeriesEpisodes(
            source.endpoint,
            creds,
            ed.seriesId,
            !!source.allowPrivateLan
          );
          const groupId = primaryGroupId || `${source.id}::series`;
          primaryGroupId = groupId;
          const edLang = detectLangFromText(
            ed.rawTitle || title.canonicalTitle || '',
            groupNameMap(state).get(groupId) || ''
          );
          for (const ep of pack.episodes || []) {
            const key = `${ep.season}:${ep.episodeNum}`;
            const stream = {
              id: `${source.id}::series::${ed.seriesId}::${ep.id}`,
              sourceId: source.id,
              providerStreamId: ep.id,
              playbackUrl: `lks-xtream://${source.id}/series/${ep.id}?ext=${ep.containerExtension || 'mp4'}`,
              groupId,
              language: edLang.languageTag || edLang.language || 'UNKNOWN',
              languageTag: edLang.languageTag || '',
              confidence: edLang.confidence || 'UNKNOWN',
              rawTitle: ep.title || ed.rawTitle || title.canonicalTitle
            };
            if (!episodesByKey.has(key)) {
              episodesByKey.set(key, {
                id: `ep:${title._xtreamSeriesId}:${ep.season}:${ep.episodeNum}`,
                seasonNumber: ep.season,
                episodeNumber: ep.episodeNum,
                title: ep.title,
                synopsis: ep.plot || '',
                durationMinutes: ep.durationMinutes,
                thumbPath: ep.thumb || pack.info.cover || title.posterPath,
                versions: [{ stream }]
              });
            } else {
              const cur = episodesByKey.get(key);
              if (!cur.versions.some((v) => v.stream.id === stream.id)) {
                cur.versions.push({ stream });
              }
              cur.thumbPath = cur.thumbPath || ep.thumb || pack.info.cover || title.posterPath;
              cur.synopsis = cur.synopsis || ep.plot || '';
              cur.durationMinutes = cur.durationMinutes || ep.durationMinutes;
            }
          }
          if (pack.info.plot && !title.synopsis) title.synopsis = pack.info.plot;
          if (pack.info.cover) title.posterPath = title.posterPath || pack.info.cover;
          if (pack.info.backdrop) title.backdropPath = title.backdropPath || pack.info.backdrop;
        }
        title.episodes = [...episodesByKey.values()].sort(
          (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
        );
        title._episodesLoaded = true;
        // Keep series shell (language/group) — never flatten episode streams into variants
        if (title.episodes.length) {
          const shells = (title.variants || []).filter((v) =>
            String(v.id || '').endsWith('::shell')
          );
          if (shells.length) {
            title.variants = shells.map((shell) => {
              const lang = detectLangFromText(
                shell.rawTitle || title.canonicalTitle || '',
                groupNameMap(state).get(shell.groupId || primaryGroupId) || ''
              );
              return {
                ...shell,
                language: lang.languageTag || lang.language || shell.language,
                languageTag: lang.languageTag || shell.languageTag || '',
                confidence: lang.confidence || shell.confidence || 'UNKNOWN'
              };
            });
          } else {
            title.variants = (title.variants || []).slice(0, 1);
          }
        }
        saveState(state);
      } catch (e) {
        /* detail still opens; seasons may be empty */
        title._episodeFetchError = e.message;
      }
      title = state.catalog.titles.find((t) => t.id === detailId);
    }
    // Load sibling edition episodes for the same logical work (capped)
    if (title?.type === 'SERIES' && state.catalog) {
      ensureWorkIds(state.catalog);
      const siblings = findWorkEditions(state.catalog, title).filter((e) => e.id !== title.id);
      for (const sib of siblings.slice(0, 6)) {
        const sibTitle = state.catalog.titles.find((t) => t.id === sib.id);
        if (!sibTitle?._xtreamSeriesId || sibTitle._episodesLoaded) continue;
        try {
          const source = state.sources.find((s) => s.id === sibTitle._xtreamSourceId);
          const creds = getXtreamSecret(sibTitle._xtreamSourceId);
          if (!source || !creds) continue;
          const pack = await fetchSeriesEpisodes(
            source.endpoint,
            creds,
            sibTitle._xtreamSeriesId,
            !!source.allowPrivateLan
          );
          const groupId = sibTitle.variants?.[0]?.groupId || `${source.id}::series`;
          const edLang = detectLangFromText(
            sibTitle.canonicalTitle || '',
            groupNameMap(state).get(groupId) || ''
          );
          sibTitle.episodes = (pack.episodes || []).map((ep) => {
            const stream = {
              id: `${source.id}::series::${sibTitle._xtreamSeriesId}::${ep.id}`,
              sourceId: source.id,
              providerStreamId: ep.id,
              playbackUrl: `lks-xtream://${source.id}/series/${ep.id}?ext=${ep.containerExtension || 'mp4'}`,
              groupId,
              language: edLang.languageTag || edLang.language || 'UNKNOWN',
              languageTag: edLang.languageTag || '',
              confidence: edLang.confidence || 'UNKNOWN',
              rawTitle: ep.title || sibTitle.canonicalTitle
            };
            return {
              id: `ep:${sibTitle._xtreamSeriesId}:${ep.season}:${ep.episodeNum}`,
              seasonNumber: ep.season,
              episodeNumber: ep.episodeNum,
              title: ep.title,
              synopsis: ep.plot || '',
              durationMinutes: ep.durationMinutes,
              thumbPath: ep.thumb || pack.info.cover || sibTitle.posterPath,
              versions: [{ stream }]
            };
          });
          sibTitle._episodesLoaded = true;
          if (pack.info.cover) sibTitle.posterPath = sibTitle.posterPath || pack.info.cover;
        } catch {
          /* sibling edition optional */
        }
      }
      saveState(state);
      title = state.catalog.titles.find((t) => t.id === detailId) || title;
    }
    if (title) {
      state.detail = attachRecommendations(
        buildDetail(title, prefs(state), state),
        state.catalog
      );
      if (title._episodeFetchError) state.detail.episodeFetchError = title._episodeFetchError;
      if (selectedSeason != null) state.detail.selectedSeason = Number(selectedSeason);
      state.screen = 'detail';
      state.customizeOpen = false;
      state.player = null;
      const detailFrame = {
        screen: 'detail',
        detailId: title.id,
        selectedSeason: state.detail.selectedSeason ?? null,
        focusKey: focusKey || `detail:${title.id}`,
        scrollY: 0
      };
      if (replace) replaceStack(state, detailFrame);
      else pushFrame(state, detailFrame);
      applyFrame(state, peekFrame(state));
    }
  } else if (screen && screen !== 'detail' && screen !== 'player') {
    if (screen !== 'search') state.detail = null;
    state.player = null;
    if (screen !== 'epg') state.epg = null;
    const frame = snapshotFrame(state, {
      screen,
      scrollY: Number(scrollY) || 0,
      focusKey: focusKey || null
    });
    if (replace || screen === 'hub' || screen === 'profiles' || screen === 'splash') {
      replaceStack(state, frame);
    } else {
      pushFrame(state, frame);
    }
    applyFrame(state, peekFrame(state));
  }
  saveState(state);
  res.json(buildClientState(state));
});

/** Pop navigation stack — single source of truth for Back / Escape. */
app.post('/api/navigate/back', async (req, res) => {
  const state = loadState();
  ensureNavStack(state);
  if (state.customizeOpen) {
    state.customizeOpen = false;
    saveState(state);
    return res.json(buildClientState(state));
  }
  if (state.groupSetup?.open) {
    if (state.groupSetup.mode === 'manage') {
      state.groupSetup = { open: false, section: null, mode: 'first' };
      saveState(state);
      return res.json(buildClientState(state));
    }
    resetStack(state, { screen: 'hub' });
    applyFrame(state, peekFrame(state));
    state.groupSetup = { open: false, section: null, mode: 'first' };
    saveState(state);
    return res.json(buildClientState(state));
  }
  if (state.screen === 'player' && state.player?.open) {
    return res.status(400).json({ error: 'Fermer le lecteur via /api/player/close' });
  }
  const prev = popFrame(state);
  state.player = null;
  if (prev.screen === 'detail' && prev.detailId) {
    const title = state.catalog.titles.find((t) => t.id === prev.detailId);
    if (title) {
      state.detail = attachRecommendations(buildDetail(title, prefs(state), state), state.catalog);
      if (prev.selectedSeason != null) state.detail.selectedSeason = prev.selectedSeason;
      state.screen = 'detail';
    } else {
      state.detail = null;
      state.screen = 'hub';
      replaceStack(state, { screen: 'hub' });
    }
  } else if (prev.screen === 'epg') {
    state.screen = 'epg';
    try {
      state.epg = await buildEpgGuide(state, prefs(state), {
        groupId: prev.liveGroupId || state.liveUi?.groupId || null,
        offset: 0,
        limit: 40
      });
    } catch (e) {
      state.epg = {
        hasEpgData: false,
        rows: [],
        emptyReason: e.message || 'Échec chargement EPG',
        diagnosis: e.message || ''
      };
    }
  } else if (prev.screen === 'search') {
    state.screen = 'search';
    if (state.search) {
      state.search.query = prev.searchQuery || state.search.query || '';
      state.search.filter = prev.searchFilter || state.search.filter || 'all';
      state.search.offset = prev.searchOffset || 0;
    }
  } else {
    state.detail = prev.screen === 'detail' ? state.detail : null;
    if (prev.screen !== 'epg') state.epg = null;
    applyFrame(state, prev);
  }
  applyFrame(state, peekFrame(state));
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/profile/select', (req, res) => {
  const state = loadState();
  const { profileId } = req.body || {};
  if (!state.profiles.some((p) => p.id === profileId)) {
    return res.status(400).json({ error: 'Profil inconnu' });
  }
  state.activeProfileId = profileId;
  resetStack(state, { screen: 'hub' });
  state.detail = null;
  state.player = null;
  state.epg = null;
  state.uiRestore = null;
  state.screen = 'hub';
  state.detail = null;
  state.player = null;
  state.customizeOpen = false;
  state.groupSetup = { open: false, section: null, mode: 'first' };
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/prefs/toggle-group', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const { groupId } = req.body || {};
  const set = new Set(p.hiddenGroupIds);
  if (set.has(groupId)) set.delete(groupId);
  else set.add(groupId);
  p.hiddenGroupIds = [...set];
  saveState(state);
  res.json(buildClientState(state));
});

/** Open group setup (first visit or manage). */
app.post('/api/groups/setup/open', (req, res) => {
  const state = loadState();
  const section = req.body?.section;
  const mode = req.body?.mode === 'manage' ? 'manage' : 'first';
  if (!GROUP_SECTIONS.includes(section)) {
    return res.status(400).json({ error: 'Section invalide' });
  }
  if (!hasEnabledSources(state) || !(state.catalog?.groups || []).length) {
    return res.status(409).json({
      error: 'Catalogue indisponible — synchronisez une source avant de configurer les groupes.'
    });
  }
  state.groupSetup = { open: true, section, mode };
  state.customizeOpen = false;
  if (!GROUP_SECTIONS.includes(state.screen)) {
    state.screen = section;
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/groups/setup/close', (req, res) => {
  const state = loadState();
  const gs = state.groupSetup || {};
  if (gs.mode === 'manage' || req.body?.force) {
    state.groupSetup = { open: false, section: null, mode: 'first' };
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/groups/setup/save', (req, res) => {
  const state = loadState();
  const section = req.body?.section || state.groupSetup?.section;
  if (!GROUP_SECTIONS.includes(section)) {
    return res.status(400).json({ error: 'Section invalide' });
  }
  if (!hasEnabledSources(state) || state.syncing) {
    return res.status(409).json({
      error: 'Impossible d’enregistrer pendant une sync ou sans source.'
    });
  }
  const selectable = new Set(
    listSelectableGroups(state.catalog, section, state.sources).map((g) => g.id)
  );
  const incoming = Array.isArray(req.body?.selectedGroupIds)
    ? req.body.selectedGroupIds.map(String)
    : [];
  const selected = [...new Set(incoming.filter((id) => selectable.has(id)))];
  const p = prefs(state);
  p.sectionGroupPrefs[section] = {
    configured: true,
    selectedGroupIds: selected
  };
  state.prefsByProfile[state.activeProfileId || 'profile_alex'] = p;
  state.groupSetup = { open: false, section: null, mode: 'first' };
  presentCache.clear();
  invalidateLiveIndex();
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/prefs/language', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const audio = migratePreferredLanguage(
    req.body?.audioLanguage || req.body?.language || p.preferredAudioLanguage || p.preferredLanguage
  );
  p.preferredAudioLanguage = audio;
  p.preferredLanguage = audio; // legacy alias
  if (req.body?.subtitleLanguage != null) {
    p.preferredSubtitleLanguage = normalizeLanguageTag(req.body.subtitleLanguage) || 'fr';
  }
  if (req.body?.interfaceLanguage != null) {
    p.interfaceLanguage = normalizeLanguageTag(req.body.interfaceLanguage) || 'fr';
  }
  presentCache.clear();
  saveState(state);
  res.json(buildClientState(state));
});

/** Remember last series edition language for subsequent episodes (when available). */
app.post('/api/prefs/episode-language', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const tag = normalizeLanguageTag(req.body?.language || req.body?.languageTag || '');
  p.preferredEpisodeLanguage = tag || '';
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/prefs/toggle-row', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const rowId = req.body?.rowId;
  const list = [...p.visibleRowIds];
  const idx = list.indexOf(rowId);
  if (idx >= 0) {
    if (list.length > 1) list.splice(idx, 1);
  } else if (rowId) list.push(rowId);
  p.visibleRowIds = list;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/prefs/reduce-motion', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  p.reduceMotion = !!req.body?.reduceMotion;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/search', (req, res) => {
  const state = loadState();
  ensureNavStack(state);
  const p = prefs(state);
  const query = String(req.body?.query ?? state.search?.query ?? '');
  const filter = String(req.body?.filter ?? state.search?.filter ?? 'all');
  const offset = Math.max(0, Number(req.body?.offset ?? 0));
  const limit = Math.min(100, Math.max(1, Number(req.body?.limit ?? 48)));
  const index = getSearchIndex(state);
  const result = searchCatalog({ index, query, filter, prefs: p, offset, limit });
  // TASK-013: no recent-search persistence
  if (p.recentSearches) delete p.recentSearches;
  state.search = {
    query,
    filter,
    offset,
    result,
    suggestions: suggestFromIndex(index, p, 12)
  };
  state.screen = 'search';
  pushFrame(state, {
    screen: 'search',
    searchQuery: query,
    searchFilter: filter,
    searchOffset: offset,
    focusKey: 'search:input',
    scrollY: Number(req.body?.scrollY) || 0
  });
  applyFrame(state, peekFrame(state));
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/settings/auto-sync', (req, res) => {
  const state = loadState();
  const minutes = Number(req.body?.autoSyncMinutes ?? 0);
  state.settings = state.settings || {};
  state.settings.autoSyncMinutes = [0, 30, 60, 180, 360].includes(minutes) ? minutes : 0;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/detail/version', (req, res) => {
  const state = loadState();
  if (state.detail && req.body?.versionId) {
    state.detail.selectedVersionId = req.body.versionId;
    const ver = (state.detail.versions || []).find((v) => v.id === req.body.versionId);
    const tag = normalizeLanguageTag(ver?.language || ver?.languageTag || '');
    if (tag) prefs(state).preferredEpisodeLanguage = tag;
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/detail/season', (req, res) => {
  const state = loadState();
  if (state.detail && req.body?.season != null) {
    state.detail.selectedSeason = Number(req.body.season);
    patchTopFrame(state, {
      screen: 'detail',
      detailId: state.detail.id,
      selectedSeason: state.detail.selectedSeason
    });
  }
  saveState(state);
  res.json(buildClientState(state));
});

function toggleList(arr, id) {
  const set = new Set(arr || []);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set];
}

app.post('/api/lists/toggle', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const { list, itemId } = req.body || {};
  if (!itemId || !list) return res.status(400).json({ error: 'list + itemId requis' });
  if (list === 'favorite') p.favoriteIds = toggleList(p.favoriteIds, itemId);
  else if (list === 'watchLater') p.watchLaterIds = toggleList(p.watchLaterIds, itemId);
  else if (list === 'watched') p.watchedIds = toggleList(p.watchedIds, itemId);
  else if (list === 'hide') p.hiddenItemIds = toggleList(p.hiddenItemIds, itemId);
  else if (list === 'dismissContinue') {
    p.dismissedContinueIds = toggleList(p.dismissedContinueIds, itemId);
  } else return res.status(400).json({ error: 'list inconnue' });
  if (state.detail?.id === itemId) {
    const title = state.catalog.titles.find((t) => t.id === itemId);
    if (title) {
      state.detail = attachRecommendations(buildDetail(title, p, state), state.catalog);
    }
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/import-sample', (_req, res) => {
  const state = loadState();
  disableDemoSources(state);
  clearDemoCatalogIfPresent(state);
  const samplePath = path.join(__dirname, 'data', 'sample_playlist.m3u');
  const sourceId = 'm3u_sample_local';
  const existing = state.sources.find((s) => s.id === sourceId);
  if (!existing) {
    state.sources.push({
      id: sourceId,
      displayName: 'Sample M3U (local)',
      kind: 'M3U_FILE',
      enabled: true,
      endpoint: '',
      localPath: samplePath,
      usernameHint: ''
    });
  } else {
    existing.enabled = true;
    existing.localPath = samplePath;
  }
  state.lastSyncMessage = 'Sample IPTV importé. Lancez Synchroniser / Actualiser.';
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/load-demo-showcase', (_req, res) => {
  const state = loadState();
  const id = 'demo_showcase_ui';
  disableRealSources(state);
  const existing = state.sources.find((s) => s.id === id);
  if (!existing) {
    state.sources.push({
      id,
      displayName: 'Démo UI LKS TV (fictive)',
      kind: 'DEMO_SHOWCASE',
      enabled: true,
      endpoint: '',
      usernameHint: ''
    });
  } else {
    existing.enabled = true;
  }
  const cat = buildDemoShowcaseCatalog(id);
  state.catalog = {
    groups: cat.groups,
    titles: cat.titles,
    generatedAtEpochMs: cat.generatedAtEpochMs
  };
  const seeds = demoProgressSeeds(cat);
  for (const pid of Object.keys(state.prefsByProfile)) {
    const pr = state.prefsByProfile[pid];
    pr.progressByItemId = { ...(pr.progressByItemId || {}), ...seeds };
    if (!pr.progressByEpisodeId) pr.progressByEpisodeId = {};
  }
  state.syncing = false;
  state.lastSyncError = null;
  state.lastSyncAt = Date.now();
  state.lastSyncMessage = `Démo UI chargée — ${cat.filmCount} films, ${cat.seriesCount} séries (DEMO_SHOWCASE seul, hors IPTV réel).`;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/m3u-url', async (req, res) => {
  try {
    const { displayName, playlistUrl, allowPrivateLan } = req.body || {};
    if (!playlistUrl) return res.status(400).json({ error: 'URL playlist requise' });
    assertSafeHttpUrl(playlistUrl, { allowPrivate: !!allowPrivateLan });
    const text = await fetchM3uUrl(String(playlistUrl).trim(), !!allowPrivateLan);
    const parsed = parseM3u(text, 'm3u_validate');
    if (!parsed?.titles?.length) {
      return res.status(400).json({ error: 'Playlist M3U sans entrée exploitable' });
    }
    const state = loadState();
    disableDemoSources(state);
    clearDemoCatalogIfPresent(state);
    const id = `m3u_url_${Date.now().toString(36)}`;
    state.sources.push({
      id,
      displayName: displayName || 'M3U URL',
      kind: 'M3U_URL',
      enabled: true,
      endpoint: String(playlistUrl).trim(),
      allowPrivateLan: !!allowPrivateLan,
      usernameHint: ''
    });
    state.lastSyncMessage =
      `Source M3U validée (${parsed.titles.length} titres détectés) — DEMO_SHOWCASE désactivé. Lancez Synchroniser.`;
    saveState(state);
    res.json(buildClientState(state));
  } catch (e) {
    res.status(400).json({ error: e.message || 'URL refusée' });
  }
});

app.post('/api/sources/m3u-file', (req, res) => {
  const { displayName, filename, contentBase64 } = req.body || {};
  if (!contentBase64) return res.status(400).json({ error: 'Fichier M3U requis' });
  const buf = Buffer.from(String(contentBase64), 'base64');
  if (buf.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'Fichier trop volumineux (max 8 Mo)' });
  }
  const text = buf.toString('utf8');
  let parsed;
  try {
    parsed = parseM3u(text, 'm3u_file_validate');
  } catch (e) {
    return res.status(400).json({ error: e.message || 'M3U invalide' });
  }
  if (!parsed?.titles?.length) {
    return res.status(400).json({ error: 'Playlist M3U sans entrée exploitable' });
  }
  const state = loadState();
  disableDemoSources(state);
  clearDemoCatalogIfPresent(state);
  const id = `m3u_file_${Date.now().toString(36)}`;
  const safeName = String(filename || 'playlist.m3u').replace(/[^\w.\-]+/g, '_').slice(0, 80);
  const dest = path.join(uploadsDir(), `${id}_${safeName}`);
  fs.writeFileSync(dest, buf);
  state.sources.push({
    id,
    displayName: displayName || safeName || 'M3U fichier',
    kind: 'M3U_FILE',
    enabled: true,
    endpoint: '',
    localPath: dest,
    usernameHint: ''
  });
  state.lastSyncMessage =
    `Fichier M3U validé (${parsed.titles.length} titres) — DEMO_SHOWCASE désactivé. Lancez Synchroniser.`;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/toggle', (req, res) => {
  const state = loadState();
  const source = state.sources.find((s) => s.id === req.body?.sourceId);
  if (source) {
    source.enabled = !source.enabled;
    if (source.enabled && source.kind === 'DEMO_SHOWCASE') {
      disableRealSources(state);
    }
    if (source.enabled && source.kind !== 'DEMO_SHOWCASE') {
      disableDemoSources(state);
      clearDemoCatalogIfPresent(state);
    }
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/remove', (req, res) => {
  const state = loadState();
  const id = req.body?.sourceId;
  if (!req.body?.confirm) {
    return res.status(400).json({ error: 'Confirmation requise (confirm: true)' });
  }
  const src = state.sources.find((s) => s.id === id);
  if (src?.localPath && String(src.localPath).includes(`${path.sep}.data${path.sep}uploads`)) {
    try {
      fs.unlinkSync(src.localPath);
    } catch {
      /* ignore */
    }
  }
  state.sources = state.sources.filter((s) => s.id !== id);
  deleteXtreamSecret(id);
  if (!hasEnabledRealSource(state)) {
    state.lastSyncMessage =
      'Aucune source IPTV réelle restante. La démo ne se réactive pas automatiquement — ' +
      'utilisez « Charger DEMO_SHOWCASE » si vous voulez le mode démonstration.';
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/sources/xtream', async (req, res) => {
  try {
    const { displayName, serverUrl, username, password, allowPrivateLan } = req.body || {};
    if (!serverUrl || !username || !password) {
      return res.status(400).json({ error: 'URL, identifiant et mot de passe requis' });
    }
    const endpoint = normalizeBaseUrl(serverUrl, { allowPrivate: !!allowPrivateLan });
    await authenticate(endpoint, { username, password }, !!allowPrivateLan);
    const state = loadState();
    disableDemoSources(state);
    clearDemoCatalogIfPresent(state);
    const id = `xtream_${Date.now().toString(36)}`;
    putXtreamSecret(id, username, password);
    state.sources.push({
      id,
      displayName: displayName || 'Xtream',
      kind: 'XTREAM',
      enabled: true,
      endpoint,
      allowPrivateLan: !!allowPrivateLan,
      usernameHint: `${String(username).slice(0, 2)}•••`,
      lastError: null
    });
    state.lastSyncMessage =
      'Source Xtream authentifiée — DEMO_SHOWCASE désactivé (secret chiffré). Lancez Synchroniser.';
    saveState(state);
    res.json(buildClientState(state));
  } catch (e) {
    res.status(400).json({ error: e.message || 'Échec Xtream' });
  }
});

app.post('/api/sync', async (_req, res) => {
  const state = loadState();
  state.syncing = true;
  state.syncProgress = 'Démarrage…';
  state.lastSyncError = null;
  saveState(state);

  try {
    // Do not persist on every progress tick (huge catalogs). Keep progress in memory only.
    const result = await runSync(state, (msg) => {
      state.syncProgress = msg;
    });
    state.catalog = result.catalog;
    state.syncing = false;
    state.syncProgress = null;
    for (const pid of Object.keys(state.prefsByProfile || {})) {
      state.prefsByProfile[pid] = pruneSelectedGroups(
        ensureSectionGroupPrefs(state.prefsByProfile[pid]),
        state.catalog
      );
    }
    presentCache.clear();
    invalidateLiveIndex();
    state.lastSyncAt = Date.now();
    state.lastSyncError = result.errors.length ? result.errors.join(' · ') : null;
    state.lastSyncMessage = result.message;
    // Clear per-source lastError when fully OK
    if (!result.errors.length) {
      for (const s of state.sources) {
        if (s.enabled) s.lastError = null;
      }
    }
    saveState(state);
    res.json(buildClientState(state));
  } catch (e) {
    state.syncing = false;
    state.syncProgress = null;
    state.lastSyncError = e.message || 'erreur';
    state.lastSyncMessage = `Échec sync: ${state.lastSyncError}`;
    saveState(state);
    res.status(500).json(buildClientState(state));
  }
});

app.post('/api/live/channels', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const groupId = String(req.body?.groupId || state.liveUi?.groupId || '__all__');
  const offset = Math.max(0, Number(req.body?.offset || 0));
  const limit = Math.min(120, Math.max(20, Number(req.body?.limit || 80)));
  const query = String(req.body?.query || '');
  const channels = listLiveChannels(state.catalog, p, { groupId, offset, limit, query });
  const prevItems = offset > 0 ? state.liveUi?.channels?.items || [] : [];
  state.liveUi = {
    ...(state.liveUi || {}),
    groupId,
    channelId: state.liveUi?.channelId || channels.items[0]?.id || null,
    channels: {
      ...channels,
      items: offset > 0 ? [...prevItems, ...channels.items] : channels.items,
      offset: 0,
      hasMore: channels.hasMore
    }
  };
  state.screen = 'tv';
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/live/select', (req, res) => {
  const state = loadState();
  if (!state.liveUi) state.liveUi = {};
  if (req.body?.groupId) state.liveUi.groupId = req.body.groupId;
  if (req.body?.channelId) state.liveUi.channelId = req.body.channelId;
  state.screen = 'tv';
  saveState(state);
  res.json(buildClientState(state));
});

/**
 * Probe upstream (not loopback self) so HTTP status is real and codecs can be sniffed.
 * Never logs credentialed URLs.
 */
async function probeUpstream(upstreamUrl) {
  const t0 = Date.now();
  const diag = {
    ok: false,
    httpStatus: null,
    contentType: null,
    bytesSampled: 0,
    acceptRanges: null,
    contentRange: null,
    redirected: false,
    elapsedMs: 0,
    hint: null,
    sniff: null,
    browserLikely: 'unknown'
  };
  try {
    const looksHls = /\.m3u8(\?|$)/i.test(String(upstreamUrl));
    const sample = await fetchUpstreamSample(upstreamUrl, {
      maxBytes: looksHls ? 256 * 1024 : 512 * 1024,
      timeoutMs: 12000,
      withRange: !looksHls
    });
    diag.httpStatus = sample.status;
    diag.contentType = sample.contentType;
    diag.acceptRanges = sample.acceptRanges;
    diag.contentRange = sample.contentRange;
    diag.redirected = sample.redirected;
    diag.finalHost = (() => {
      try {
        return new URL(sample.finalUrl || upstreamUrl).host;
      } catch {
        return null;
      }
    })();
    diag.bytesSampled = sample.bytes;
    diag.sniff = sample.sniff;
    diag.browserLikely = sample.sniff?.browserLikely || 'unknown';
    diag.elapsedMs = Date.now() - t0;
    if (!(sample.status === 200 || sample.status === 206)) {
      diag.hint = `Upstream HTTP ${sample.status}`;
      return diag;
    }
    if (sample.sniff?.container !== 'hls' && /html/i.test(String(sample.contentType || ''))) {
      diag.ok = false;
      diag.hint =
        'Upstream a renvoyé du HTML au lieu d’un média/HLS (URL live invalide ou session expirée).';
      return diag;
    }
    if (sample.sniff?.browserLikely === 'no') {
      diag.ok = false;
      diag.hint = sample.sniff.reason;
      return diag;
    }
    diag.ok = true;
    diag.hint =
      sample.sniff?.reason ||
      (sample.status === 206 ? 'HTTP 206 Partial — Range OK' : 'HTTP 200 — octets reçus');
    if (diag.finalHost) diag.hint += ` · host final ${diag.finalHost}`;
    if (!sample.acceptRanges && sample.status === 200 && !looksHls) {
      diag.hint += ' · Accept-Ranges absent (lecture progressive risquée)';
    }
    return diag;
  } catch (e) {
    diag.elapsedMs = Date.now() - t0;
    diag.hint =
      e.name === 'AbortError'
        ? 'Délai probe upstream (12s)'
        : 'Échec réseau probe upstream';
    return diag;
  }
}

function findStreamInCatalog(catalog, streamId) {
  if (!streamId) return null;
  // Episodes BEFORE title.variants — after lazy series load, variants often mirror
  // every episode stream; matching variants first forced episode=null then E1 fallback.
  for (const t of catalog.titles || []) {
    for (const ep of t.episodes || []) {
      for (const ver of ep.versions || []) {
        if (ver.stream?.id === streamId) {
          return { url: ver.stream.playbackUrl, episode: ep, title: t, via: 'episode' };
        }
      }
    }
  }
  for (const t of catalog.titles || []) {
    for (const v of t.variants || []) {
      if (v.id === streamId) {
        return { url: v.playbackUrl, episode: null, title: t, via: 'variant' };
      }
    }
  }
  return null;
}

/** Pick resume / first unfinished episode for hero "Lire" on a series shell. */
function pickSeriesDefaultEpisode(title, p) {
  const eps = [...(title?.episodes || [])].sort(
    (a, b) => (a.seasonNumber - b.seasonNumber) || (a.episodeNumber - b.episodeNumber)
  );
  if (!eps.length) return null;
  const threshold = p.continueCompletedThreshold ?? COMPLETED_THRESHOLD;
  const inProgress = eps.find((ep) => {
    const frac = Number(
      (p.progressByEpisodeId || {})[ep.id] ??
        (p.episodePlaybackById || {})[ep.id]?.fraction ??
        0
    );
    return watchState(frac, threshold) === 'in_progress';
  });
  if (inProgress) return inProgress;
  const next = eps.find((ep) => {
    const frac = Number(
      (p.progressByEpisodeId || {})[ep.id] ??
        (p.episodePlaybackById || {})[ep.id]?.fraction ??
        0
    );
    return watchState(frac, threshold) !== 'completed';
  });
  return next || eps[0];
}

function preferredEpisodeStream(episode, preferredLang) {
  const streams = (episode?.versions || []).map((v) => v.stream).filter((s) => s?.id);
  const unique = [...new Map(streams.map((s) => [s.id, s])).values()];
  return selectPreferred(unique, preferredLang) || unique[0] || null;
}

function buildBrowserPlayUrl(playbackUrl, sourceEndpointHint = null) {
  const opaque = parseOpaquePlaybackRef(playbackUrl);
  let playUrl;
  let mode = 'auto';
  let kind = 'unknown';
  let upstreamForProbe = null;
  if (opaque) {
    kind = opaque.kind;
    playUrl = `/api/media/xtream/${encodeURIComponent(opaque.sourceId)}/${encodeURIComponent(opaque.kind)}/${encodeURIComponent(opaque.streamId)}?ext=${encodeURIComponent(opaque.ext || 'mp4')}`;
    mode = opaque.kind === 'live' || opaque.ext === 'm3u8' ? 'hls' : opaque.ext === 'mkv' ? 'incompatible' : ' progressive'.trim();
    if (opaque.ext === 'mkv') mode = 'incompatible';
    else if (opaque.kind === 'live' || opaque.ext === 'm3u8') mode = 'hls';
    else mode = 'progressive';
    const creds = getXtreamSecret(opaque.sourceId);
    // upstream probe uses resolved URL inside player/open; preview skips heavy probe
    upstreamForProbe = null;
    if (sourceEndpointHint && creds) {
      /* keep null — preview trusts proxy */
    }
  } else if (/^https?:\/\//i.test(playbackUrl)) {
    authorizeMediaHost(playbackUrl);
    playUrl = `/api/media/direct?u=${encodeURIComponent(playbackUrl)}`;
    kind = /\.m3u8(\?|$)/i.test(playbackUrl) ? 'live' : 'vod';
    mode = kind === 'live' || /\.m3u8(\?|$)/i.test(playbackUrl) ? 'hls' : 'progressive';
  } else {
    playUrl = playbackUrl;
    mode = 'progressive';
  }
  return { playUrl, mode, kind, opaque, upstreamForProbe };
}

/** Lightweight live preview resolve — does not open the player screen. */
app.post('/api/live/preview', (req, res) => {
  const state = loadState();
  const streamId = req.body?.streamId;
  if (!streamId) return res.status(400).json({ error: 'streamId requis' });
  if (prefs(state).livePreviewEnabled === false) {
    return res.json({ enabled: false, playUrl: null });
  }
  const hit = findStreamInCatalog(state.catalog, streamId);
  if (!hit?.url) return res.status(404).json({ error: 'Flux introuvable' });
  const built = buildBrowserPlayUrl(hit.url);
  if (req.body?.channelId) prefs(state).lastLiveChannelId = String(req.body.channelId);
  saveState(state);
  res.json({
    enabled: true,
    playUrl: built.playUrl,
    mode: built.mode,
    kind: built.kind,
    title: cleanDisplayTitle(hit.title?.canonicalTitle || '')
  });
});

/** Resolve a catalog stream to a browser-playable URL (loopback proxy for Xtream). */
app.post('/api/player/open', async (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const preferredLang = p.preferredAudioLanguage || p.preferredLanguage || 'edition:vf';
  let streamId = req.body?.streamId || state.detail?.selectedVersionId;
  const requestedEpisodeId = req.body?.episodeId ? String(req.body.episodeId) : null;
  if (!streamId && !requestedEpisodeId) {
    return res.status(400).json({ error: 'streamId requis' });
  }

  let hit = streamId ? findStreamInCatalog(state.catalog, streamId) : null;
  let playbackUrl = hit?.url || null;
  let matchedTitle = hit?.title || null;
  let matchedEpisode = hit?.episode || null;

  // Explicit episodeId: resolve on the matched title (or detail title) without silent E1 remap
  if (requestedEpisodeId) {
    const titleForEp =
      matchedTitle ||
      (state.detail?.id
        ? (state.catalog.titles || []).find((t) => t.id === state.detail.id)
        : null);
    const ep = (titleForEp?.episodes || []).find((e) => e.id === requestedEpisodeId);
    if (!ep) {
      return res.status(404).json({
        error: 'Épisode introuvable ou indisponible — lecture annulée (aucun repli silencieux vers E1).'
      });
    }
    matchedTitle = titleForEp;
    matchedEpisode = ep;
    if (!hit?.episode || hit.episode.id !== ep.id) {
      const ver = preferredEpisodeStream(ep, preferredLang);
      if (!ver?.id || !ver.playbackUrl) {
        return res.status(404).json({ error: 'Aucun flux disponible pour cet épisode' });
      }
      streamId = ver.id;
      playbackUrl = ver.playbackUrl;
      hit = { url: playbackUrl, episode: ep, title: matchedTitle, via: 'episodeId' };
    }
  }

  // Series hero / shell: soft-pick resume episode only when no concrete episode stream matched
  if (
    matchedTitle?.type === 'SERIES' &&
    !matchedEpisode &&
    (matchedTitle.episodes || []).length
  ) {
    const isShell =
      hit?.via === 'variant' ||
      String(streamId || '').endsWith('::shell') ||
      !streamId;
    if (!isShell) {
      return res.status(404).json({
        error: 'Épisode introuvable pour ce flux — lecture annulée (aucun repli silencieux vers E1).'
      });
    }
    matchedEpisode = pickSeriesDefaultEpisode(matchedTitle, p);
    if (!matchedEpisode) {
      return res.status(404).json({ error: 'Aucun épisode disponible pour cette série' });
    }
    const ver = preferredEpisodeStream(matchedEpisode, preferredLang);
    if (!ver?.id || !ver.playbackUrl) {
      return res.status(404).json({ error: 'Aucun flux disponible pour cet épisode' });
    }
    streamId = ver.id;
    playbackUrl = ver.playbackUrl;
  }

  if (!playbackUrl || !streamId) {
    return res.status(404).json({ error: 'Flux introuvable dans le catalogue' });
  }

  let title = cleanDisplayTitle(matchedTitle?.canonicalTitle || state.detail?.title || 'Lecture');
  let playerSubtitle = '';
  let rawIptvTitle = matchedTitle?.canonicalTitle || '';
  if (matchedTitle?.type === 'SERIES' && matchedEpisode) {
    title = formatPlayerSeriesTitle(
      matchedTitle.canonicalTitle,
      matchedEpisode.seasonNumber,
      matchedEpisode.episodeNumber
    );
    const epLabel = cleanEpisodeTitle(
      matchedEpisode.title,
      matchedEpisode.seasonNumber,
      matchedEpisode.episodeNumber,
      matchedTitle.canonicalTitle
    );
    playerSubtitle = epLabel && !/^épisode\s*\d+$/i.test(epLabel) ? epLabel : '';
    rawIptvTitle = matchedEpisode.title || matchedTitle.canonicalTitle || '';
  }

  const opaque = parseOpaquePlaybackRef(playbackUrl);
  let playUrl;
  let mode = 'auto';
  let kind = 'unknown';
  let upstreamForProbe = null;
  if (opaque) {
    playUrl = `/api/media/xtream/${encodeURIComponent(opaque.sourceId)}/${opaque.kind}/${encodeURIComponent(opaque.streamId)}?ext=${encodeURIComponent(opaque.ext)}`;
    if (opaque.kind === 'live' || opaque.ext === 'm3u8') mode = 'hls';
    else if (opaque.ext === 'mkv' || opaque.ext === 'ts') mode = 'incompatible';
    else mode = 'progressive';
    kind = opaque.kind;
    const source = state.sources.find((s) => s.id === opaque.sourceId && s.kind === 'XTREAM');
    const creds = getXtreamSecret(opaque.sourceId);
    if (source && creds) {
      upstreamForProbe = buildMediaUrl(
        source.endpoint,
        creds,
        opaque.kind,
        opaque.streamId,
        opaque.ext
      );
    }
  } else if (/^https?:\/\//i.test(playbackUrl)) {
    playUrl = `/api/media/direct?u=${encodeURIComponent(playbackUrl)}`;
    mode = /\.m3u8(\?|$)/i.test(playbackUrl)
      ? 'hls'
      : /\.mkv(\?|$)/i.test(playbackUrl)
        ? 'incompatible'
        : 'progressive';
    kind = 'direct';
    upstreamForProbe = playbackUrl;
  } else {
    return res.status(400).json({ error: 'URL de lecture non supportée' });
  }

  let probe = {
    ok: false,
    httpStatus: null,
    hint: 'Probe upstream non exécuté',
    browserLikely: 'unknown',
    sniff: null,
    elapsedMs: 0,
    bytesSampled: 0
  };
  if (upstreamForProbe) {
    probe = await probeUpstream(upstreamForProbe);
  }
  if (opaque?.ext === 'mkv' || mode === 'incompatible') {
    probe.ok = false;
    probe.browserLikely = 'no';
    probe.hint =
      probe.hint && probe.sniff?.container
        ? probe.hint
        : 'Conteneur probablement incompatible navigateur (MKV/TS) — Media3 Android recommandé.';
  }

  const codecBlock = probe.browserLikely === 'no';
  const isLive = kind === 'live';
  // Episode neighbors (series only) — merge across logical-work editions
  let episodeNav = null;
  let availableEpisodeLanguages = [];
  if (matchedTitle?.type === 'SERIES' && matchedEpisode) {
    ensureWorkIds(state.catalog);
    const wid = workIdOf(matchedTitle);
    const editionTitles = (state.catalog.titles || []).filter(
      (t) => t.type === 'SERIES' && workIdOf(t) === wid
    );
    const logicalEps = mergeLogicalEpisodes(
      editionTitles.length ? editionTitles : [matchedTitle],
      p
    );
    const editionPref = p.preferredEpisodeLanguage || preferredLang;
    const threshold = p.continueCompletedThreshold ?? COMPLETED_THRESHOLD;
    const flat = [];
    for (const ep of logicalEps) {
      const streams = (ep.versions || []).map((v) => v.stream).filter((s) => s?.id);
      const uniqueStreams = [...new Map(streams.map((s) => [s.id, s])).values()];
      const ver =
        selectPreferred(uniqueStreams, editionPref) ||
        selectPreferred(uniqueStreams, preferredLang) ||
        uniqueStreams[0];
      if (!ver?.id) continue;
      let frac = 0;
      for (const pid of ep.physicalIds || [ep.id]) {
        frac = Math.max(
          frac,
          Number(
            (p.progressByEpisodeId || {})[pid] ??
              (p.episodePlaybackById || {})[pid]?.fraction ??
              0
          )
        );
      }
      const lepKey = logicalEpisodeProgressKey(wid, ep.seasonNumber, ep.episodeNumber);
      frac = Math.max(frac, Number((p.progressByLogicalEpisodeId || {})[lepKey] ?? 0));
      flat.push({
        id: ep.id,
        streamId: ver.id,
        season: ep.seasonNumber,
        episode: ep.episodeNumber,
        title: cleanEpisodeTitle(
          ep.title,
          ep.seasonNumber,
          ep.episodeNumber,
          matchedTitle.canonicalTitle
        ),
        listLabel: formatEpisodeListLabel(
          cleanEpisodeTitle(
            ep.title,
            ep.seasonNumber,
            ep.episodeNumber,
            matchedTitle.canonicalTitle
          ),
          ep.episodeNumber
        ),
        progressFraction: frac,
        watchState: watchState(frac, threshold),
        durationMinutes: ep.durationMinutes || null,
        thumbUrl: ep.thumbPath || matchedTitle.backdropPath || matchedTitle.posterPath || null,
        languages: (() => {
          const seen = new Set();
          const out = [];
          for (const v of ep.versions || []) {
            if (!v.stream?.id) continue;
            const tag = normalizeLanguageTag(v.languageTag || '');
            const label =
              (tag && languageDisplayName(tag, { useful: false })) ||
              v.editionLabel ||
              'Édition';
            const key = tag ? `lang:${tag}` : `ed:${v.editionId || v.stream.id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
              tag,
              label,
              streamId: v.stream.id,
              editionId: v.editionId,
              physicalEpisodeId: v.physicalEpisodeId,
              requiresNewStream: true
            });
          }
          return out;
        })()
      });
    }
    const idx = flat.findIndex(
      (e) =>
        e.streamId === streamId ||
        e.id === matchedEpisode.id ||
        (e.season === matchedEpisode.seasonNumber &&
          e.episode === matchedEpisode.episodeNumber)
    );
    const seasonsMap = {};
    for (const e of flat) {
      if (!seasonsMap[e.season]) seasonsMap[e.season] = [];
      seasonsMap[e.season].push(e);
    }
    episodeNav = {
      titleId: matchedTitle.id,
      logicalWorkId: wid,
      current: idx >= 0 ? flat[idx] : null,
      previous: idx > 0 ? flat[idx - 1] : null,
      next: idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null,
      episodes: flat.slice(0, 120),
      seasons: Object.keys(seasonsMap)
        .map(Number)
        .sort((a, b) => a - b)
        .map((n) => ({ number: n, episodes: seasonsMap[n] }))
    };
    availableEpisodeLanguages = episodeNav.current?.languages || [];
    if (wid) {
      p.lastEditionByWorkId = p.lastEditionByWorkId || {};
      p.lastEditionByWorkId[wid] = matchedTitle.id;
    }
  }

  // Live channel neighbors from current liveUi page + favorites
  let liveNav = null;
  if (isLive && state.liveUi?.channels?.items?.length) {
    const items = state.liveUi.channels.items;
    const idx = items.findIndex((c) => c.id === req.body?.channelId || c.streamId === streamId);
    const channelId = req.body?.channelId || items[idx]?.id || null;
    if (channelId) prefs(state).lastLiveChannelId = channelId;
    const liveMeta = listLiveGroups(state.catalog, prefs(state));
    liveNav = {
      channelId,
      logoUrl: items[idx]?.logoUrl || matchedTitle?.posterPath || null,
      title: items[idx]?.title || title,
      isFavorite: channelId
        ? (prefs(state).favoriteIds || []).includes(channelId)
        : false,
      selectedGroupId: state.liveUi?.groupId || liveMeta.groups[0]?.id || '__all__',
      groups: [
        liveMeta.favorites,
        liveMeta.all,
        ...(liveMeta.groups || [])
      ]
        .filter(Boolean)
        .slice(0, 80)
        .map((g) => ({ id: g.id, name: g.name, count: g.count })),
      previous: idx > 0 ? items[idx - 1] : null,
      next: idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null,
      channels: items.slice(0, 80).map((c) => ({
        id: c.id,
        title: c.title,
        streamId: c.streamId,
        logoUrl: c.logoUrl || null,
        isFavorite: (prefs(state).favoriteIds || []).includes(c.id)
      }))
    };
  }

  state.player = {
    open: true,
    title,
    subtitle: playerSubtitle || '',
    rawIptvTitle: rawIptvTitle || '',
    streamId,
    playUrl,
    mode: mode.trim(),
    kind,
    // Explicit UI mode — never leak live drawers into VOD or vice versa
    uiMode: isLive ? 'live' : matchedTitle?.type === 'SERIES' ? 'series' : 'film',
    ext: opaque?.ext || null,
    error: codecBlock || (!probe.ok && !isLive) ? probe.hint : codecBlock ? probe.hint : null,
    diagnostic: {
      httpStatus: probe.httpStatus,
      contentType: probe.contentType,
      acceptRanges: probe.acceptRanges || null,
      contentRange: probe.contentRange || null,
      bytesSampled: probe.bytesSampled,
      elapsedMs: probe.elapsedMs,
      hint: probe.hint,
      ok: probe.ok,
      browserLikely: probe.browserLikely,
      finalHost: probe.finalHost || null,
      sniff: probe.sniff
        ? {
            container: probe.sniff.container,
            videoCodec: probe.sniff.videoCodec,
            audioCodec: probe.sniff.audioCodec,
            brands: probe.sniff.brands,
            reason: probe.sniff.reason
          }
        : null,
      opaqueKind: opaque?.kind || kind,
      sourceId: opaque?.sourceId || null,
      // loadedmetadata ≠ succès
      successCriteria: 'playing + currentTime > 0 + videoWidth > 0'
    },
    isLive,
    episodeNav: isLive ? null : episodeNav,
    liveNav: isLive ? liveNav : null,
    availableEpisodeLanguages: isLive ? [] : availableEpisodeLanguages,
    logicalWorkId: matchedTitle ? workIdOf(matchedTitle) : null,
    seasonNumber: matchedEpisode?.seasonNumber ?? null,
    episodeNumber: matchedEpisode?.episodeNumber ?? null,
    autoplayNextEpisode: !!prefs(state).autoplayNextEpisode,
    // Only expose intro skip when trusted markers exist (never invent durations).
    introMarkers: (() => {
      const raw = markersForEpisode(
        prefs(state).timeMarkersByEpisodeId,
        matchedEpisode?.id
      );
      const win = reliableIntroWindow(raw);
      return win
        ? {
            introStartSec: win.introStartSec,
            introEndSec: win.introEndSec,
            outroStartSec:
              Number.isFinite(Number(raw?.outroStartSec))
                ? Number(raw.outroStartSec)
                : null
          }
        : null;
    })(),
    progressFraction:
      matchedEpisode
        ? (prefs(state).progressByEpisodeId || {})[matchedEpisode.id] ||
          (prefs(state).episodePlaybackById || {})[matchedEpisode.id]?.fraction ||
          0
        : matchedTitle
          ? (prefs(state).progressByItemId || {})[matchedTitle.id] || 0
          : 0,
    resumePositionSec: (() => {
      const forced = Number(req.body?.resumePositionSec);
      if (Number.isFinite(forced) && forced > 2) return forced;
      const pref = prefs(state);
      if (matchedEpisode) {
        const play = (pref.episodePlaybackById || {})[matchedEpisode.id];
        if (play) return resumePositionSec(play);
        const frac = Number((pref.progressByEpisodeId || {})[matchedEpisode.id] || 0);
        return frac > STARTED_THRESHOLD ? null : 0;
      }
      const snap = matchedTitle
        ? (pref.continueResumeByTitleId || {})[matchedTitle.id]
        : null;
      if (snap) return resumePositionSec(snap);
      return null;
    })(),
    contentId: matchedTitle?.id || null,
    episodeId: matchedEpisode?.id || null,
    playbackConfirmed: false,
    browserLimitation:
      'Succès navigateur = événement playing ET currentTime > 0 ET videoWidth > 0. loadedmetadata/durée seuls ne comptent pas. Media3 Android pour HEVC/MKV/TS.'
  };
  // Navigation context — never default every close to Live TV just because liveUi exists.
  const requestedReturn = String(req.body?.returnScreen || '').trim();
  const allowedReturn = new Set([
    'hub',
    'films',
    'series',
    'tv',
    'detail',
    'search',
    'library',
    'settings'
  ]);
  let returnScreen;
  if (allowedReturn.has(requestedReturn)) {
    returnScreen = requestedReturn;
  } else if (req.body?.fromLive) {
    returnScreen = 'tv';
  } else if (state.detail?.id) {
    returnScreen = 'detail';
  } else if (['films', 'series', 'tv', 'search', 'hub', 'library'].includes(state.screen)) {
    returnScreen = state.screen === 'player' ? 'hub' : state.screen;
  } else {
    returnScreen = 'hub';
  }
  // Capture opening context on stack before entering player
  ensureNavStack(state);
  patchTopFrame(state, {
    screen: state.screen === 'player' ? peekFrame(state)?.screen : state.screen,
    detailId: state.detail?.id || null,
    selectedSeason: state.detail?.selectedSeason ?? null,
    searchQuery: state.search?.query || '',
    searchFilter: state.search?.filter || 'all',
    searchOffset: state.search?.offset || 0,
    liveGroupId: state.liveUi?.groupId || null,
    liveChannelId: req.body?.channelId || state.liveUi?.channelId || null
  });
  state.player.returnTo = {
    screen: returnScreen,
    detailId: state.detail?.id || null,
    selectedSeason: state.detail?.selectedSeason ?? null,
    searchQuery: state.search?.query || '',
    searchFilter: state.search?.filter || 'all',
    searchOffset: state.search?.offset || 0,
    liveGroupId: state.liveUi?.groupId || null,
    liveChannelId: req.body?.channelId || state.liveUi?.channelId || null
  };
  pushFrame(state, {
    screen: 'player',
    detailId: state.detail?.id || null,
    focusKey: 'player:back'
  });
  state.screen = 'player';
  if (state.liveUi && req.body?.fromLive) {
    state.liveUi.channelId = req.body.channelId || state.liveUi.channelId;
  }
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/player/close', (req, res) => {
  const state = loadState();
  ensureNavStack(state);
  // Persist progress atomically before clearing player (avoids race with async POST).
  if (req.body?.progress) {
    applyPlaybackProgress(state, req.body.progress);
  }
  const ret = state.player?.returnTo || null;
  state.player = null;
  // Pop player frame; restore previous opening context (never invent from liveUi alone)
  let prev = peekFrame(state);
  if (prev?.screen === 'player') prev = popFrame(state);
  else if (!prev && ret) {
    prev = {
      screen: ret.screen,
      detailId: ret.detailId,
      selectedSeason: ret.selectedSeason,
      searchQuery: ret.searchQuery,
      searchFilter: ret.searchFilter,
      searchOffset: ret.searchOffset,
      liveGroupId: ret.liveGroupId,
      liveChannelId: ret.liveChannelId
    };
    replaceStack(state, prev);
  }

  if (prev?.screen === 'detail' && (state.detail?.id || prev.detailId)) {
    if (!state.detail && prev.detailId) {
      const title = state.catalog.titles.find((t) => t.id === prev.detailId);
      if (title) {
        state.detail = attachRecommendations(buildDetail(title, prefs(state), state), state.catalog);
      }
    }
    if (state.detail && prev.selectedSeason != null) {
      state.detail.selectedSeason = prev.selectedSeason;
    }
    state.screen = 'detail';
  } else if (prev?.screen === 'tv') {
    state.screen = 'tv';
    state.liveUi = state.liveUi || {};
    if (prev.liveGroupId) state.liveUi.groupId = prev.liveGroupId;
    if (prev.liveChannelId) state.liveUi.channelId = prev.liveChannelId;
  } else if (prev?.screen === 'search') {
    state.screen = 'search';
    state.search = state.search || { query: '', filter: 'all', offset: 0, result: null };
    state.search.query = prev.searchQuery ?? state.search.query;
    state.search.filter = prev.searchFilter ?? state.search.filter;
    state.search.offset = prev.searchOffset ?? state.search.offset;
  } else if (prev?.screen === 'epg') {
    state.screen = 'epg';
  } else if (prev?.screen && prev.screen !== 'player') {
    state.screen = prev.screen;
  } else if (state.detail) {
    state.screen = 'detail';
  } else {
    state.screen = 'hub';
    replaceStack(state, { screen: 'hub' });
  }
  applyFrame(state, peekFrame(state));
  presentCache.clear();
  saveState(state, { immediate: true });
  res.json(buildClientState(state));
});

/** EPG guide — real XMLTV only; never invents programmes. */
app.post('/api/epg/guide', async (req, res) => {
  const state = loadState();
  ensureNavStack(state);
  const groupId = req.body?.groupId || state.liveUi?.groupId || null;
  const offset = Math.max(0, Number(req.body?.offset || 0));
  const limit = Math.min(80, Math.max(10, Number(req.body?.limit || 40)));
  try {
    state.epg = await buildEpgGuide(state, prefs(state), { groupId, offset, limit });
  } catch (e) {
    state.epg = {
      hasEpgData: false,
      rows: [],
      hours: [],
      emptyReason: e.message || 'Échec EPG',
      diagnosis: e.message || ''
    };
  }
  state.screen = 'epg';
  pushFrame(state, {
    screen: 'epg',
    liveGroupId: groupId,
    focusKey: 'epg:grid',
    scrollY: 0
  });
  applyFrame(state, peekFrame(state));
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/epg/refresh', async (req, res) => {
  const state = loadState();
  const { invalidateEpgMemory } = await import('./lib/epgXmltv.js');
  invalidateEpgMemory();
  for (const src of state.sources || []) {
    if (src.kind !== 'XTREAM' || !src.enabled) continue;
    const creds = getXtreamSecret(src.id);
    const { ensureEpgIndex } = await import('./lib/epgXmltv.js');
    await ensureEpgIndex(src, creds, { force: true });
  }
  state.epg = await buildEpgGuide(state, prefs(state), {
    groupId: req.body?.groupId || state.liveUi?.groupId || null,
    offset: 0,
    limit: 40
  });
  saveState(state);
  res.json(buildClientState(state));
});

app.get('/api/media/xtream/:sourceId/:kind/:streamId', async (req, res) => {
  try {
    const { sourceId, kind, streamId } = req.params;
    const ext = String(req.query.ext || 'mp4');
    const state = loadState();
    const source = state.sources.find((s) => s.id === sourceId && s.kind === 'XTREAM');
    if (!source) return res.status(404).send('Source inconnue');
    const creds = getXtreamSecret(sourceId);
    if (!creds) return res.status(401).send('Secret absent');
    authorizeMediaHost(source.endpoint);
    const upstream = buildMediaUrl(source.endpoint, creds, kind, streamId, ext);
    await proxyMediaStream(req, res, upstream, {
      rewriteHls: kind === 'live' || ext === 'm3u8'
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (!res.headersSent) {
      res.status(502).type('text/plain').send(`proxy error: ${e.message || 'upstream'}`);
    }
  }
});

app.get('/api/media/direct', async (req, res) => {
  try {
    const raw = String(req.query.u || '');
    const url = assertSafeHttpUrl(raw, { allowPrivate: true });
    const state = loadState();
    const xtreamHosts = state.sources
      .filter((s) => s.kind === 'XTREAM' && s.endpoint)
      .map((s) => {
        try {
          authorizeMediaHost(s.endpoint);
          return new URL(s.endpoint).host.toLowerCase();
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const hostOk =
      xtreamHosts.includes(url.host.toLowerCase()) || isMediaHostAllowed(url.host);
    // Catalog direct HTTP (M3U) + hosts discovered via HLS redirect/rewrite
    const allowed =
      hostOk ||
      state.catalog.titles.some((t) => {
        const urls = [
          ...(t.variants || []).map((v) => v.playbackUrl),
          ...(t.episodes || []).flatMap((ep) =>
            (ep.versions || []).map((v) => v.stream.playbackUrl)
          )
        ];
        return (
          urls.includes(raw) ||
          urls.some(
            (u) =>
              u &&
              String(u).startsWith('http') &&
              raw.startsWith(String(u).replace(/[^/]+$/, ''))
          )
        );
      });
    if (!allowed) {
      return res.status(403).type('text/plain').send('URL non autorisée (hôte CDN non trusté)');
    }
    await proxyMediaStream(req, res, url.href, {
      rewriteHls: /\.m3u8(\?|$)/i.test(raw) || /\.m3u8(\?|$)/i.test(url.pathname)
    });
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (!res.headersSent) res.status(400).send(e.message || 'direct error');
  }
});

/**
 * Apply real playback progress to profile prefs.
 * Ignores unconfirmed / tiny fractions so failed MKV attempts do not create continue cards.
 * Accepts streamId in the payload so close can persist after clearing player.
 */
function applyPlaybackProgress(state, body = {}) {
  const p = prefs(state);
  const confirmed = body.confirmed !== false;
  const contentId = body.contentId ? String(body.contentId) : null;
  const episodeId = body.episodeId ? String(body.episodeId) : null;
  const f = Math.max(0, Math.min(0.999, Number(body.fraction) || 0));
  const positionMs = Math.max(0, Number(body.positionMs) || 0);
  const durationMs = Math.max(0, Number(body.durationMs) || 0);
  if (!confirmed || (!contentId && !episodeId)) return false;

  const threshold = p.continueCompletedThreshold ?? COMPLETED_THRESHOLD;

  // Below started threshold: do not invent a watching session; clear stale snap.
  if (!(f > STARTED_THRESHOLD)) {
    if (contentId) {
      const snap = { ...(p.continueResumeByTitleId || {}) };
      if (snap[contentId]) {
        delete snap[contentId];
        p.continueResumeByTitleId = snap;
      }
    }
    return true;
  }

  const cur = state.player?.episodeNav?.current;
  let season = body.season ?? cur?.season ?? null;
  let episode = body.episode ?? cur?.episode ?? null;
  let episodeTitle = body.episodeTitle || cur?.title || '';
  let streamId = body.streamId || state.player?.streamId || cur?.streamId || null;
  const eid = episodeId || cur?.id || null;
  if (eid && (season == null || episode == null || !streamId)) {
    const title = (state.catalog?.titles || []).find((t) => t.id === contentId);
    const ep = (title?.episodes || []).find((e) => e.id === eid);
    if (ep) {
      season = season ?? ep.seasonNumber;
      episode = episode ?? ep.episodeNumber;
      episodeTitle =
        episodeTitle || cleanEpisodeTitle(ep.title, ep.seasonNumber, ep.episodeNumber);
      if (!streamId) {
        const preferred = p.preferredAudioLanguage || p.preferredLanguage || 'VF';
        const ver =
          (ep.versions || []).find((v) => v.stream?.language === preferred) ||
          (ep.versions || [])[0];
        streamId = ver?.stream?.id || null;
      }
    }
  }
  if (!streamId) streamId = body.streamId || state.player?.streamId || null;

  // Per-episode row — preserves siblings when watching another episode
  if (eid) {
    upsertEpisodePlayback(p, {
      episodeId: eid,
      contentId,
      sourceId: body.sourceId || state.player?.diagnostic?.sourceId || null,
      season,
      episode,
      streamId,
      fraction: f,
      positionMs,
      durationMs
    });
  }
  // Logical episode progress (shared across language editions)
  const workId = state.player?.logicalWorkId || body.logicalWorkId || null;
  if (workId && season != null && episode != null) {
    const lepKey = logicalEpisodeProgressKey(workId, season, episode);
    p.progressByLogicalEpisodeId = {
      ...(p.progressByLogicalEpisodeId || {}),
      [lepKey]: f
    };
    p.lastEditionByWorkId = {
      ...(p.lastEditionByWorkId || {}),
      [workId]: contentId || p.lastEditionByWorkId?.[workId]
    };
  }
  if (contentId) {
    p.progressByItemId = { ...(p.progressByItemId || {}), [contentId]: f };
    // Mirror progress onto other edition title ids of the same work for Continuer
    if (workId && state.catalog) {
      ensureWorkIds(state.catalog);
      for (const t of state.catalog.titles || []) {
        if (workIdOf(t) === workId) {
          p.progressByItemId[t.id] = f;
        }
      }
    }
  }
  touchContinueActivity(p, { contentId, episodeId: eid });

  if (contentId && !eid && f >= threshold) {
    const snap = { ...(p.continueResumeByTitleId || {}) };
    delete snap[contentId];
    p.continueResumeByTitleId = snap;
    return true;
  }

  // Continue snap only for in-progress (not completed) — one card per series
  if (contentId && f > STARTED_THRESHOLD && f < threshold) {
    p.continueResumeByTitleId = {
      ...(p.continueResumeByTitleId || {}),
      [contentId]: {
        episodeId: eid,
        streamId,
        season,
        episode,
        episodeTitle,
        fraction: f,
        positionMs,
        durationMs
      }
    };
    p.dismissedContinueIds = (p.dismissedContinueIds || []).filter((id) => id !== contentId);
  } else if (contentId && eid && f >= threshold) {
    // Episode finished: drop snap so Continuer promotes the next episode via progress maps
    const snap = { ...(p.continueResumeByTitleId || {}) };
    if (snap[contentId]?.episodeId === eid) {
      delete snap[contentId];
      p.continueResumeByTitleId = snap;
    }
  }
  return true;
}

/**
 * Resolve a same-episode (or film) language/edition switch target.
 * Client saves progress then calls /api/player/open — never silently changes S/E.
 */
app.post('/api/player/switch-edition', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  const languageTag = normalizeLanguageTag(req.body?.languageTag || '');
  const editionId = req.body?.editionId ? String(req.body.editionId) : null;
  if (!languageTag && !editionId) {
    return res.status(400).json({ error: 'languageTag ou editionId requis' });
  }
  const pl = state.player;
  if (!pl?.open || pl.isLive) {
    return res.status(400).json({ error: 'Lecteur VOD requis' });
  }
  if (req.body?.progress) {
    applyPlaybackProgress(state, { ...req.body.progress, confirmed: true });
  }

  ensureWorkIds(state.catalog);
  const content = (state.catalog.titles || []).find((t) => t.id === pl.contentId);
  const workId = pl.logicalWorkId || workIdOf(content);
  const type = content?.type || (pl.uiMode === 'series' ? 'SERIES' : 'FILM');
  const editionTitles = (state.catalog.titles || []).filter(
    (t) => t.type === type && workIdOf(t) === workId
  );

  let ver = null;
  let season = Number(pl.seasonNumber ?? pl.episodeNav?.current?.season);
  let episode = Number(pl.episodeNumber ?? pl.episodeNav?.current?.episode);

  if (type === 'SERIES') {
    if (!Number.isFinite(season) || !Number.isFinite(episode)) {
      return res.status(400).json({ error: 'Épisode courant inconnu' });
    }
    const logicalEps = mergeLogicalEpisodes(editionTitles, p);
    if (editionId) {
      const ep = logicalEps.find(
        (e) => e.seasonNumber === season && e.episodeNumber === episode
      );
      ver = ep?.versions?.find((v) => v.editionId === editionId) || null;
    }
    if (!ver && languageTag) {
      ver = findEpisodeVersionForLanguage(logicalEps, season, episode, languageTag);
    }
    if (!ver?.stream?.id) {
      return res.status(404).json({
        error: 'Cette langue n’est pas disponible pour cet épisode',
        available: pl.availableEpisodeLanguages || []
      });
    }
  } else {
    // Film: pick another edition’s preferred variant — never invent a language
    const targetEd =
      (editionId && editionTitles.find((t) => t.id === editionId)) ||
      (languageTag &&
        editionTitles.find((t) => {
          const ed = editionLabelFromTitle(t.canonicalTitle || '', '');
          return normalizeLanguageTag(ed.languageTag || '') === languageTag;
        })) ||
      null;
    if (!targetEd) {
      return res.status(404).json({
        error: 'Cette langue n’est pas disponible pour ce film',
        available: pl.availableEpisodeLanguages || []
      });
    }
    const streams = targetEd.variants || [];
    const chosen =
      selectPreferred(streams, languageTag || p.preferredAudioLanguage) || streams[0];
    if (!chosen?.id) {
      return res.status(404).json({ error: 'Aucun flux pour cette édition' });
    }
    ver = {
      stream: chosen,
      editionId: targetEd.id,
      languageTag: languageTag || editionLabelFromTitle(targetEd.canonicalTitle || '').languageTag,
      physicalEpisodeId: null
    };
    season = null;
    episode = null;
  }

  if (languageTag) p.preferredEpisodeLanguage = languageTag;
  if (workId) {
    p.lastEditionByWorkId = { ...(p.lastEditionByWorkId || {}), [workId]: ver.editionId };
  }
  saveState(state);
  const positionSec = Number(req.body?.positionSec);
  res.json({
    ok: true,
    sameStream: ver.stream.id === pl.streamId,
    requiresNewStream: ver.stream.id !== pl.streamId,
    streamId: ver.stream.id,
    episodeId: ver.physicalEpisodeId || null,
    editionId: ver.editionId,
    languageTag: languageTag || ver.languageTag || '',
    season,
    episode,
    resumePositionSec: Number.isFinite(positionSec) && positionSec > 2 ? positionSec : null,
    returnScreen: pl.returnTo?.screen || 'detail'
  });
});

/** Persist playback progress (profile-scoped). */
app.post('/api/player/progress', (req, res) => {
  const state = loadState();
  applyPlaybackProgress(state, req.body || {});
  presentCache.clear();
  saveState(state, { immediate: true });
  res.json({ ok: true });
});

app.post('/api/prefs/live-preview', (req, res) => {
  const state = loadState();
  prefs(state).livePreviewEnabled = !!req.body?.livePreviewEnabled;
  saveState(state);
  res.json(buildClientState(state));
});

app.post('/api/prefs/autoplay-next', (req, res) => {
  const state = loadState();
  const p = prefs(state);
  p.autoplayNextEpisode = !!req.body?.autoplayNextEpisode;
  saveState(state);
  res.json(buildClientState(state));
});

/** Client playback telemetry — no secrets; used to confirm playing+currentTime. */
app.post('/api/player/client-diag', (req, res) => {
  const state = loadState();
  if (!state.player) return res.status(404).json({ error: 'Pas de session player' });
  const body = req.body || {};
  const safe = {
    at: Date.now(),
    event: String(body.event || '').slice(0, 40),
    readyState: Number(body.readyState),
    networkState: Number(body.networkState),
    currentTime: Number(body.currentTime),
    duration: Number(body.duration),
    videoWidth: Number(body.videoWidth),
    videoHeight: Number(body.videoHeight),
    paused: !!body.paused,
    errorCode: body.errorCode ?? null,
    playPromise: body.playPromise || null,
    note: String(body.note || '').slice(0, 200)
  };
  state.player.clientLog = [...(state.player.clientLog || []).slice(-40), safe];
  if (
    safe.event === 'playing' &&
    safe.currentTime > 0.05 &&
    safe.videoWidth > 0
  ) {
    state.player.playbackConfirmed = true;
    state.player.error = null;
  }
  // Debounced persist — do not rewrite catalog for each timeupdate
  if (safe.event !== 'timeupdate') saveState(state);
  res.json({ ok: true, playbackConfirmed: !!state.player.playbackConfirmed });
});

/** JSON 404 for unknown /api/* — avoids HTML "Cannot POST" → alert("Not Found"). */
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `Endpoint indisponible: ${req.method} ${req.originalUrl}. Redémarrez le serveur web-preview pour charger TASK-005.`
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, HOST, () => {
  console.log(`LKS TV web-preview listening on http://${HOST}:${PORT}`);
  console.log('Bind: loopback only. Xtream secrets encrypted under web-preview/.data/');
  console.log('API groups: POST /api/groups/setup/{open,save,close}');
});

/** Optional periodic sync while process is alive. */
setInterval(() => {
  try {
    const state = loadState();
    const mins = Number(state.settings?.autoSyncMinutes || 0);
    if (!mins || state.syncing) return;
    const last = state.lastSyncAt || 0;
    if (Date.now() - last < mins * 60 * 1000) return;
    runSync(state, () => {}).then((result) => {
      const s = loadState();
      s.catalog = result.catalog;
      s.lastSyncAt = Date.now();
      s.lastSyncError = result.errors.length ? result.errors.join(' · ') : null;
      s.lastSyncMessage = `[auto] ${result.message}`;
      saveState(s);
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}, 60_000);

export { server };

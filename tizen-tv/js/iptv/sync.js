/**
 * Catalog sync for Tizen — DEMO_SHOWCASE never merges with real IPTV.
 */
import { parseM3u } from '../lib/catalog.js';
import { buildDemoShowcaseCatalog } from '../lib/demoCatalog.js';
import { ensureWorkIds } from '../lib/workIdentity.js';
import { appendAll } from '../lib/arrayUtil.js';
import { assertSafeHttpUrl } from '../lib/urlGuard.js';
import { ingestXtreamSource } from './xtreamIngest.js';

export function hasEnabledRealSource(sources) {
  return (sources || []).some((s) => s.enabled && s.kind !== 'DEMO_SHOWCASE');
}

export function hasEnabledDemo(sources) {
  return (sources || []).some((s) => s.enabled && s.kind === 'DEMO_SHOWCASE');
}

export function disableDemoSources(sources) {
  for (const s of sources || []) {
    if (s.kind === 'DEMO_SHOWCASE') s.enabled = false;
  }
}

export function disableRealSources(sources) {
  for (const s of sources || []) {
    if (s.kind !== 'DEMO_SHOWCASE') s.enabled = false;
  }
}

export function clearDemoCatalog(state) {
  state.catalog = { groups: [], titles: [], generatedAtEpochMs: Date.now() };
  for (const pid of Object.keys(state.prefsByProfile || {})) {
    const pr = state.prefsByProfile[pid];
    if (!pr) continue;
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

async function fetchM3uText(url, allowPrivate) {
  assertSafeHttpUrl(url, { allowPrivate });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`Playlist HTTP ${res.status}`);
    const text = await res.text();
    if (!text.trim()) throw new Error('Playlist M3U vide');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} state
 * @param {(id: string) => ({username:string,password:string}|null)} getXtreamCreds
 * @param {(msg: string) => void} [onProgress]
 */
export async function runSync(state, getXtreamCreds, onProgress = () => {}) {
  const enabled = (state.sources || []).filter((s) => s.enabled);
  if (!enabled.length) {
    return { catalog: state.catalog, errors: [], message: 'Aucune source activée.' };
  }

  const hasDemo = enabled.some((s) => s.kind === 'DEMO_SHOWCASE');
  const hasReal = enabled.some((s) => s.kind !== 'DEMO_SHOWCASE');
  if (hasDemo && hasReal) {
    onProgress('Isolation DEMO : source fictive ignorée pendant le sync IPTV réel');
  }
  const syncSources = hasReal
    ? enabled.filter((s) => s.kind !== 'DEMO_SHOWCASE')
    : enabled;

  const allGroups = [];
  const allTitles = [];
  const errors = [];

  for (const source of syncSources) {
    onProgress(`Sync « ${source.displayName} » (${source.kind})…`);
    try {
      let cat;
      if (source.kind === 'DEMO_SHOWCASE') {
        cat = buildDemoShowcaseCatalog(source.id);
      } else if (source.kind === 'M3U_URL') {
        const text = await fetchM3uText(source.endpoint, !!source.allowPrivateLan);
        cat = parseM3u(text, source.id);
        if (!cat?.titles?.length) throw new Error('Playlist sans entrée exploitable');
      } else if (source.kind === 'M3U_FILE') {
        if (!source.playlistText) throw new Error('Contenu M3U local manquant');
        cat = parseM3u(source.playlistText, source.id);
        if (!cat?.titles?.length) throw new Error('Fichier M3U sans entrée exploitable');
      } else if (source.kind === 'XTREAM') {
        const creds = getXtreamCreds(source.id);
        if (!creds?.username || !creds?.password) {
          throw new Error('Identifiants Xtream absents');
        }
        cat = await ingestXtreamSource(source, creds, onProgress);
      } else {
        throw new Error(`Type de source inconnu: ${source.kind}`);
      }
      appendAll(allGroups, cat.groups || []);
      appendAll(allTitles, cat.titles || []);
      source.lastError = null;
      source.lastSyncEpochMs = Date.now();
      onProgress(`« ${source.displayName} » : ${(cat.titles || []).length} titres`);
    } catch (e) {
      const msg = e?.message || String(e);
      source.lastError = msg;
      errors.push(`${source.displayName}: ${msg}`);
      // Temporary outage must NOT re-enable demo.
    }
  }

  const catalog = {
    groups: allGroups,
    titles: allTitles,
    generatedAtEpochMs: Date.now()
  };
  ensureWorkIds(catalog);
  state.catalog = catalog;
  autoConfigureGroups(state);
  return {
    catalog,
    errors,
    message: errors.length
      ? `Sync partielle — ${allTitles.length} titres, ${errors.length} erreur(s)`
      : `Sync OK — ${allTitles.length} titres`
  };
}

/**
 * Validate before persisting a new real source.
 */
export async function validateM3uUrl(playlistUrl, allowPrivate = false) {
  const text = await fetchM3uText(playlistUrl, allowPrivate);
  const cat = parseM3u(text, 'm3u_validate');
  if (!cat?.titles?.length) throw new Error('Playlist M3U sans entrée exploitable');
  return { text, titleCount: cat.titles.length };
}

export async function validateXtream(endpoint, creds, allowPrivate = false) {
  const { authenticate } = await import('../lib/xtreamClient.js');
  await authenticate(endpoint, creds, allowPrivate);
}

/** First sync configures Films/Séries/TV groups so catalogue is not empty (TASK-005 allowlist). */
export function autoConfigureGroups(state) {
  const groups = state.catalog?.groups || [];
  const bySection = { films: [], series: [], tv: [] };
  for (const g of groups) {
    if (g.kind === 'SERIES') bySection.series.push(g.id);
    else if (g.kind === 'LIVE') bySection.tv.push(g.id);
    else bySection.films.push(g.id);
  }
  for (const pid of Object.keys(state.prefsByProfile || {})) {
    const p = state.prefsByProfile[pid];
    if (!p) continue;
    p.sectionGroupPrefs = p.sectionGroupPrefs || {};
    for (const [section, ids] of Object.entries(bySection)) {
      if (ids.length && !p.sectionGroupPrefs[section]?.configured) {
        p.sectionGroupPrefs[section] = {
          configured: true,
          selectedGroupIds: ids
        };
      }
    }
  }
}

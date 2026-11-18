/**
 * Multi-source sync for web-preview.
 * DEMO_SHOWCASE is never merged with real IPTV in the same catalog.
 *
 * Stack-safe for large catalogs: never `push(...tensOfThousands)`.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseM3u } from './catalog.js';
import { buildDemoShowcaseCatalog } from './demoCatalog.js';
import { ingestXtreamSource } from './xtreamIngest.js';
import { assertSafeHttpUrl } from './urlGuard.js';
import { appendAll, cloneTitleShallow } from './arrayUtil.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function appendVariants(cur, incoming) {
  if (!incoming?.length) return;
  if (!cur.variants) cur.variants = [];
  appendAll(cur.variants, incoming);
}

function appendEpisodes(cur, incoming) {
  if (!incoming?.length) return;
  if (!cur.episodes) cur.episodes = [];
  appendAll(cur.episodes, incoming);
}

export function mergeTitleMaps(allTitles) {
  const byId = new Map();
  for (let i = 0; i < allTitles.length; i++) {
    const t = allTitles[i];
    if (!byId.has(t.id)) {
      byId.set(t.id, cloneTitleShallow(t));
      continue;
    }
    const cur = byId.get(t.id);
    const aLocal = cur.matchKey?.type === 'SOURCE_LOCAL';
    const bLocal = t.matchKey?.type === 'SOURCE_LOCAL';
    if (aLocal || bLocal) {
      // SOURCE_LOCAL ids should already be unique; skip silent overwrite
      continue;
    }
    appendVariants(cur, t.variants);
    appendEpisodes(cur, t.episodes);
    cur.posterPath = cur.posterPath || t.posterPath;
    cur.backdropPath = cur.backdropPath || t.backdropPath;
    cur.synopsis = cur.synopsis || t.synopsis;
    cur.singleSourceOnly = false;
  }
  return Array.from(byId.values());
}

/** Deduplicate groups by stable id (iterative). */
export function dedupeGroups(allGroups) {
  const map = new Map();
  for (let i = 0; i < allGroups.length; i++) {
    const g = allGroups[i];
    if (!map.has(g.id)) map.set(g.id, g);
  }
  return Array.from(map.values());
}

export async function fetchM3uUrl(url, allowPrivate) {
  const safe = assertSafeHttpUrl(url, { allowPrivate });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(safe, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} state
 * @param {(msg: string) => void} [onProgress]
 */
export async function runSync(state, onProgress = () => {}) {
  const enabled = state.sources.filter((s) => s.enabled);
  if (!enabled.length) {
    return {
      catalog: state.catalog,
      errors: [],
      message: 'Aucune source activée.'
    };
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
      } else if (source.kind === 'M3U_FILE') {
        const filePath = source.localPath;
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error('Fichier M3U introuvable');
        }
        const text = fs.readFileSync(filePath, 'utf8');
        cat = parseM3u(text, source.id);
      } else if (source.kind === 'M3U_URL') {
        const text = await fetchM3uUrl(source.endpoint, !!source.allowPrivateLan);
        cat = parseM3u(text, source.id);
      } else if (source.kind === 'XTREAM') {
        cat = await ingestXtreamSource(source, onProgress);
      } else {
        throw new Error(`Type de source inconnu: ${source.kind}`);
      }

      // Stack-safe append (was: push(...cat.titles) → Maximum call stack size exceeded)
      appendAll(allGroups, cat.groups);
      appendAll(allTitles, cat.titles);
      onProgress(
        `« ${source.displayName} » : ${cat.titles.length} titres, ${cat.groups.length} groupes`
      );
      source.lastError = null;
      source.lastSyncEpochMs = Date.now();
    } catch (e) {
      const msg = e.message || String(e);
      source.lastError = msg;
      errors.push(`${source.displayName}: ${msg}`);
    }
  }

  onProgress(`Fusion catalogue (${allTitles.length} titres)…`);
  const catalog = {
    groups: dedupeGroups(allGroups),
    titles: mergeTitleMaps(allTitles),
    generatedAtEpochMs: Date.now()
  };

  const message = errors.length
    ? `Sync partielle — ${catalog.titles.length} titres, ${catalog.groups.length} groupes. ${errors.length} erreur(s). Préférences profil préservées.`
    : `Sync OK — ${catalog.titles.length} titres, ${catalog.groups.length} groupes.`;

  return { catalog, errors, message };
}

export function uploadsDir() {
  const dir = path.join(__dirname, '..', '.data', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

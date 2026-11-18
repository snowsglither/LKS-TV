/**
 * Logical work identity — groups multilingual IPTV editions of the same film/series.
 * Merge only via trusted external ids or official alias pairs + compatible year.
 * Never merges on fuzzy title similarity alone.
 */

import { cleanDisplayTitle } from './displayMeta.js';
import { resolveAliases } from './titleAliases.js';
import { editionLabelFromTitle } from './seriesIdentity.js';
import { languageDisplayName, normalizeLanguageTag } from './languages.js';

const IPTV_PREFIX_RE =
  /^(fr|en|es|de|nl|it|pt|ar|tr|ja|ko|zh|pl|ro|hu|cs|sk|se|no|dk|fi|he|hi|th|vi|id|ms|fa|ur|al|gr|bg|ex|ru|ua|cz|sv|vf|vo|vostfr|vostnl|vost|multi|truefrench|4k|uhd|fhd|hd|sd|cafr|us|uk|be|qc|som)\b[\s._:-]*/i;

function normalizeSearchText(input) {
  let s = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/&/g, ' and ');
  s = s.replace(/['\u2019]s\b/g, '');
  s = s.replace(/['\u2019]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

function stripIptvPrefixes(normTitle) {
  let t = String(normTitle || '').trim();
  for (let i = 0; i < 4; i++) {
    const next = t.replace(IPTV_PREFIX_RE, '').trim();
    if (next === t) break;
    t = next;
  }
  return t.replace(/\s+(19|20)\d{2}$/, '').trim();
}

function find(parent, x) {
  let r = x;
  while (parent.get(r) !== r) r = parent.get(r);
  let c = x;
  while (c !== r) {
    const n = parent.get(c);
    parent.set(c, r);
    c = n;
  }
  return r;
}

function union(parent, a, b) {
  const ra = find(parent, a);
  const rb = find(parent, b);
  if (ra === rb) return;
  // Prefer lexicographically smaller root for stable ids
  if (ra < rb) parent.set(rb, ra);
  else parent.set(ra, rb);
}

export function extractYear(title) {
  const y = Number(title?.year);
  if (Number.isFinite(y) && y >= 1900 && y <= 2100) return y;
  const m = String(title?.canonicalTitle || '').match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

const TRAILING_NOISE_RE =
  /\b(gb|us|uk|ca|au|nz|ie|be|ch|cam|telesync|telecine|hdrip|webrip|web dl|bluray|dvdrip|x264|x265|multi)\b/g;

export function coreTitleKey(rawTitle = '') {
  const norm = normalizeSearchText(cleanDisplayTitle(rawTitle));
  let core = stripIptvPrefixes(norm);
  core = core.replace(/^[a-z]{2}\s+/, '').trim();
  // Drop year tokens anywhere (keep extractYear for graph edges)
  core = core.replace(/\b(19|20)\d{2}\b/g, ' ').trim();
  // Drop residual country / quality noise after parentheses were flattened
  core = core.replace(TRAILING_NOISE_RE, ' ').trim();
  core = core.replace(/\s+/g, ' ').trim();
  return core;
}

function yearsCompatible(a, b) {
  if (!a || !b) return true; // one unknown — allow alias link only (still need alias edge)
  return a === b;
}

/**
 * Assign logicalWorkId on each catalog title (mutates titles in place for session use).
 * Safe on 100k+: Union-Find + hash maps.
 */
export function assignLogicalWorkIds(catalog) {
  const titles = catalog?.titles || [];
  const byId = new Map(titles.map((t) => [t.id, t]));
  const parent = new Map();
  const byExternal = new Map(); // tmdb:/imdb: → titleId
  const byTitleYear = new Map(); // series:norm:year → titleId
  const byCoreYear = new Map(); // `${core}|${year|0}|${type}` → [titleId]

  for (const t of titles) {
    parent.set(t.id, t.id);
  }

  for (const t of titles) {
    const mk = t.matchKey;
    if (mk?.type === 'PROVIDER_EXTERNAL' && mk.value) {
      const key = String(mk.value).toLowerCase();
      const prev = byExternal.get(key);
      if (prev) union(parent, prev, t.id);
      else byExternal.set(key, t.id);
    }
    if (mk?.type === 'TITLE_YEAR' && mk.value) {
      const key = String(mk.value).toLowerCase();
      const prev = byTitleYear.get(key);
      if (prev) union(parent, prev, t.id);
      else byTitleYear.set(key, t.id);
    }
    if (mk?.type === 'EXPLICIT' && mk.value) {
      const key = `explicit:${String(mk.value).toLowerCase()}`;
      const prev = byExternal.get(key);
      if (prev) union(parent, prev, t.id);
      else byExternal.set(key, t.id);
    }

    const core = coreTitleKey(t.canonicalTitle || '');
    const year = extractYear(t);
    const type = t.type || 'UNK';
    if (core.length >= 4) {
      const ck = `${core}|${year || 0}|${type}`;
      const list = byCoreYear.get(ck) || [];
      for (const other of list) union(parent, other, t.id);
      list.push(t.id);
      byCoreYear.set(ck, list);
      // Also index year=0 bucket for alias resolution lookups
      if (year) {
        const ck0 = `${core}|0|${type}`;
        const list0 = byCoreYear.get(ck0) || [];
        list0.push(t.id);
        byCoreYear.set(ck0, list0);
      }
    }
  }

  // Official alias edges — only when years compatible
  for (const t of titles) {
    const core = coreTitleKey(t.canonicalTitle || '');
    if (core.length < 4) continue;
    const year = extractYear(t);
    const type = t.type || 'UNK';
    const tmdb =
      t.matchKey?.type === 'PROVIDER_EXTERNAL' && /^tmdb:/i.test(t.matchKey.value || '')
        ? t.matchKey.value
        : null;
    const aliases = resolveAliases({ normalizedTitle: core, tmdbId: tmdb });
    for (const alias of aliases) {
      const aCore = coreTitleKey(alias);
      if (!aCore || aCore === core) continue;
      const candidates = [
        ...(byCoreYear.get(`${aCore}|${year || 0}|${type}`) || []),
        ...(year ? byCoreYear.get(`${aCore}|0|${type}`) || [] : [])
      ];
      for (const otherId of candidates) {
        if (otherId === t.id) continue;
        const other = byId.get(otherId);
        if (!other || other.type !== t.type) continue;
        if (!yearsCompatible(year, extractYear(other))) continue;
        union(parent, t.id, otherId);
      }
    }
  }

  const workIds = new Map();
  for (const t of titles) {
    const root = find(parent, t.id);
    const workId = `work:${root}`;
    t.logicalWorkId = workId;
    workIds.set(t.id, workId);
  }
  catalog._workIdsAssigned = true;
  return workIds;
}

export function ensureWorkIds(catalog) {
  if (!catalog?._workIdsAssigned) assignLogicalWorkIds(catalog);
  return catalog;
}

export function workIdOf(title) {
  return title?.logicalWorkId || (title?.id ? `work:${title.id}` : null);
}

/**
 * All catalog titles sharing the same logical work (editions).
 */
export function findWorkEditions(catalog, title, { max = 24 } = {}) {
  ensureWorkIds(catalog);
  if (!title) return [];
  const wid = workIdOf(title);
  const out = [];
  for (const t of catalog.titles || []) {
    if (t.type !== title.type) continue;
    if (workIdOf(t) !== wid) continue;
    const ed = editionLabelFromTitle(t.canonicalTitle || '', '');
    out.push({
      id: t.id,
      titleId: t.id,
      title: cleanDisplayTitle(t.canonicalTitle || ''),
      rawTitle: t.canonicalTitle,
      label: ed.label,
      languageTag: ed.languageTag,
      technicalKey: ed.technicalKey || '',
      confidence: ed.confidence,
      year: extractYear(t),
      posterPath: t.posterPath || null,
      selected: t.id === title.id,
      _xtreamSeriesId: t._xtreamSeriesId || null,
      _xtreamSourceId: t._xtreamSourceId || null,
      episodesLoaded: t._episodesLoaded !== false || !t._xtreamSeriesId
    });
    if (out.length >= max) break;
  }
  // Prefer selected first, then distinct languages
  out.sort((a, b) => Number(b.selected) - Number(a.selected) || a.label.localeCompare(b.label));
  return out;
}

export function presentWorkEditionChips(editions = []) {
  const seen = new Set();
  const out = [];
  for (const ed of editions) {
    const tag = normalizeLanguageTag(ed.languageTag || '');
    const tech = ed.technicalKey || '';
    const label =
      (tag && languageDisplayName(tag, { useful: false })) ||
      (ed.label && !/^unknown$/i.test(ed.label) ? ed.label : null);
    if (!label) continue;
    // Dedup proven languages; keep distinct technical editions (GB/AL…) separate.
    const key = tag ? `lang:${tag}` : tech ? `tech:${tech}` : `label:${label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...ed,
      label,
      languageTag: tag || '',
      technicalKey: tech || ed.technicalKey || ''
    });
  }
  if (!out.length && editions.length) {
    const sel = editions.find((e) => e.selected) || editions[0];
    out.push({ ...sel, label: 'Édition principale', languageTag: '', technicalKey: '' });
  }
  return out;
}

/**
 * Merge episodes across editions by season:episode.
 * Each logical episode carries versions from every edition that has that S/E.
 */
export function mergeLogicalEpisodes(editionTitles = [], prefs = {}) {
  const byKey = new Map();
  for (const title of editionTitles) {
    const edMeta = editionLabelFromTitle(title.canonicalTitle || '', '');
    for (const ep of title.episodes || []) {
      const key = `${ep.seasonNumber || 1}:${ep.episodeNumber || 0}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: `lep:${workIdOf(title)}:${key}`,
          seasonNumber: ep.seasonNumber || 1,
          episodeNumber: ep.episodeNumber || 0,
          title: ep.title,
          synopsis: ep.synopsis || '',
          durationMinutes: ep.durationMinutes || null,
          thumbPath: ep.thumbPath || null,
          versions: [],
          physicalIds: []
        });
      }
      const cur = byKey.get(key);
      cur.physicalIds.push(ep.id);
      if (!cur.thumbPath && ep.thumbPath) cur.thumbPath = ep.thumbPath;
      if (!cur.synopsis && ep.synopsis) cur.synopsis = ep.synopsis;
      if (!cur.durationMinutes && ep.durationMinutes) cur.durationMinutes = ep.durationMinutes;
      for (const ver of ep.versions || []) {
        const stream = ver.stream;
        if (!stream?.id) continue;
        const lang =
          normalizeLanguageTag(stream.languageTag || stream.language || '') ||
          edMeta.languageTag ||
          '';
        cur.versions.push({
          stream: {
            ...stream,
            language: lang || stream.language,
            languageTag: lang,
            confidence: stream.confidence || edMeta.confidence || 'UNKNOWN',
            rawTitle: stream.rawTitle || title.canonicalTitle
          },
          editionId: title.id,
          editionLabel: edMeta.label,
          languageTag: lang,
          physicalEpisodeId: ep.id
        });
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
  );
}

/** Find same S/E stream in another edition language. */
export function findEpisodeVersionForLanguage(logicalEpisodes, season, episode, languageTag) {
  const key = `${season}:${episode}`;
  const ep = logicalEpisodes.find(
    (e) => `${e.seasonNumber}:${e.episodeNumber}` === key
  );
  if (!ep) return null;
  const want = normalizeLanguageTag(languageTag || '');
  if (!want) return null;
  const hit =
    ep.versions.find((v) => normalizeLanguageTag(v.languageTag || '') === want) ||
    ep.versions.find((v) =>
      String(v.languageTag || '')
        .toLowerCase()
        .startsWith(want.split('-')[0])
    );
  return hit || null;
}

export function logicalEpisodeProgressKey(workId, season, episode) {
  return `lep:${workId}:${season}:${episode}`;
}

/** Search / continue dedupe key — prefer assigned work id. */
export function workDedupeKey(title) {
  if (title?.logicalWorkId) return title.logicalWorkId;
  const mk = title?.matchKey;
  if (mk && (mk.type === 'PROVIDER_EXTERNAL' || mk.type === 'TITLE_YEAR' || mk.type === 'EXPLICIT')) {
    return `${mk.type}:${String(mk.value).toLowerCase()}`;
  }
  const core = coreTitleKey(title?.canonicalTitle || '');
  const year = extractYear(title);
  const type = title?.type || 'UNK';
  if (core.length >= 6 && year) return `soft:${type}:${core}:${year}`;
  return `id:${title?.id}`;
}

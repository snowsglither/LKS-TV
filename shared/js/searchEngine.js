/**
 * LKS TV intelligent catalog search — stack-safe for 100k+ titles.
 * Strict ranking, compound titles, controlled fuzzy, logical dedupe.
 */

import { resolveAliases } from './titleAliases.js';
import { ensureWorkIds, workDedupeKey } from './workIdentity.js';

const IPTV_PREFIX_RE =
  /^(fr|en|es|de|nl|it|pt|ar|tr|ja|ko|zh|pl|ro|hu|cs|sk|se|no|dk|fi|he|hi|th|vi|id|ms|fa|ur|al|gr|bg|ex|ru|ua|cz|sv|vf|vo|vostfr|vostnl|vost|multi|truefrench|4k|uhd|fhd|hd|sd|cafr|us|uk|be|qc|som)\b[\s._:-]*/i;

const YEAR_TOKEN_RE = /^(19|20)\d{2}$/;

/** Score tiers — lower is better. >= 1000 = reject. */
export const SCORE = {
  EXACT: 0,
  EXACT_COMPACT: 1,
  EXACT_CORE: 2,
  EXACT_ALIAS: 5,
  PREFIX_TITLE: 10,
  PREFIX_ALIAS: 12,
  PHRASE_TITLE: 20,
  TOKENS_STRONG: 25,
  FUZZY: 45,
  META: 70,
  REJECT: 1000
};

export function normalizeSearchText(input) {
  let s = String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/&/g, ' and ');
  // Possessives: perry's → perry (avoid orphan "s" tokens)
  s = s.replace(/['\u2019]s\b/g, '');
  s = s.replace(/['\u2019]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

/** Compact form: spider-man / spider man / spiderman → spiderman */
export function compactSearchText(input) {
  return normalizeSearchText(input).replace(/\s+/g, '');
}

/** Strip leading IPTV language/quality tags for core title matching. */
export function stripIptvPrefixes(normTitle) {
  let t = String(normTitle || '').trim();
  for (let i = 0; i < 4; i++) {
    const next = t.replace(IPTV_PREFIX_RE, '').trim();
    if (next === t) break;
    t = next;
  }
  // Drop trailing year token for core compare
  t = t.replace(/\s+(19|20)\d{2}$/, '').trim();
  return t;
}

export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prev[j - 2] + cost);
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

function significantTokens(norm) {
  return String(norm || '')
    .split(' ')
    .filter((t) => t && t.length >= 2 && !YEAR_TOKEN_RE.test(t));
}

/**
 * Controlled token match — never query.startsWith(shortHayToken).
 * That bug matched "supernatural" / "spiderman" to every "super" / orphan "s".
 */
function tokenMatchQuality(qt, hayTokens) {
  if (!qt || qt.length < 2) return null;
  for (let i = 0; i < hayTokens.length; i++) {
    const t = hayTokens[i];
    if (t === qt) return 'exact';
  }
  for (let i = 0; i < hayTokens.length; i++) {
    const t = hayTokens[i];
    // Autocomplete: hay token starts with query (user typed prefix)
    if (qt.length >= 2 && t.startsWith(qt) && t.length - qt.length <= 10) return 'prefix';
  }
  // Fuzzy: longer tokens, shared 4-char prefix, distance 1 (blocks chacal↔chawal)
  if (qt.length >= 5) {
    const prefixLen = Math.min(4, qt.length - 1);
    for (let i = 0; i < hayTokens.length; i++) {
      const t = hayTokens[i];
      if (t.length < 5) continue;
      if (t.slice(0, prefixLen) !== qt.slice(0, prefixLen)) continue;
      if (Math.abs(t.length - qt.length) > 1) continue;
      if (editDistance(qt, t, 1) <= 1) return 'fuzzy';
    }
  }
  return null;
}

function phraseBoundaryIncludes(hay, phrase) {
  if (!phrase || !hay) return false;
  if (hay === phrase) return true;
  if (hay.startsWith(`${phrase} `) || hay.endsWith(` ${phrase}`)) return true;
  return hay.includes(` ${phrase} `);
}

/**
 * Rank: lower is better.
 */
export function scoreTitle(queryNorm, titleNorm, altNorm = '', metaNorm = '', compactTitle = '') {
  if (!queryNorm) return SCORE.REJECT;
  const qCompact = queryNorm.replace(/\s+/g, '');
  const tCompact = compactTitle || titleNorm.replace(/\s+/g, '');
  const coreTitle = stripIptvPrefixes(titleNorm);
  const coreAlt = stripIptvPrefixes(altNorm);

  if (titleNorm === queryNorm) return SCORE.EXACT;
  if (tCompact && qCompact && tCompact === qCompact) return SCORE.EXACT_COMPACT;
  if (coreTitle && coreTitle === queryNorm) return SCORE.EXACT_CORE;
  if (coreTitle && coreTitle.replace(/\s+/g, '') === qCompact) return SCORE.EXACT_COMPACT;
  if (altNorm && (altNorm === queryNorm || coreAlt === queryNorm)) return SCORE.EXACT_ALIAS;
  if (altNorm && altNorm.replace(/\s+/g, '') === qCompact) return SCORE.EXACT_ALIAS;
  // Official alias phrase present as a whole unit (e.g. "money heist" in alt bag)
  if (altNorm && phraseBoundaryIncludes(altNorm, queryNorm)) return SCORE.EXACT_ALIAS;
  if (altNorm && qCompact.length >= 4 && altNorm.replace(/\s+/g, '').includes(qCompact)) {
    return SCORE.EXACT_ALIAS;
  }

  if (titleNorm.startsWith(queryNorm) || coreTitle.startsWith(queryNorm)) return SCORE.PREFIX_TITLE;
  if (altNorm && (altNorm.startsWith(`${queryNorm} `) === false) &&
      (altNorm.startsWith(queryNorm) || coreAlt.startsWith(queryNorm))) {
    return SCORE.PREFIX_ALIAS;
  }

  if (phraseBoundaryIncludes(titleNorm, queryNorm) || phraseBoundaryIncludes(coreTitle, queryNorm)) {
    return SCORE.PHRASE_TITLE;
  }

  // Compound: query "spiderman" inside compact title / alias
  if (qCompact.length >= 4) {
    if (tCompact.includes(qCompact) && qCompact.length >= Math.min(6, tCompact.length)) {
      // Prefer when compact lengths are close (avoid tiny query in huge compact)
      if (qCompact.length >= tCompact.length * 0.5 || tCompact.includes(qCompact)) {
        if (tCompact === qCompact || tCompact.startsWith(qCompact) || tCompact.includes(qCompact)) {
          if (tCompact === qCompact) return SCORE.EXACT_COMPACT;
          if (tCompact.startsWith(qCompact) || coreTitle.replace(/\s+/g, '').startsWith(qCompact)) {
            return SCORE.PREFIX_TITLE;
          }
          // contained as whole compound word only if substantial
          if (qCompact.length >= 6) return SCORE.TOKENS_STRONG;
        }
      }
    }
    const aCompact = (altNorm || '').replace(/\s+/g, '');
    if (aCompact && (aCompact === qCompact || aCompact.startsWith(qCompact))) {
      return aCompact === qCompact ? SCORE.EXACT_ALIAS : SCORE.PREFIX_ALIAS;
    }
  }

  const qTokens = significantTokens(queryNorm);
  if (!qTokens.length) return SCORE.REJECT;

  const titleTokens = significantTokens(`${coreTitle} ${titleNorm}`);
  const altTokens = significantTokens(altNorm);
  const primaryTokens = [...new Set([...titleTokens, ...altTokens])];

  let exactCount = 0;
  let prefixCount = 0;
  let fuzzyCount = 0;
  let miss = 0;
  for (const qt of qTokens) {
    const q = tokenMatchQuality(qt, primaryTokens);
    if (q === 'exact') exactCount += 1;
    else if (q === 'prefix') prefixCount += 1;
    else if (q === 'fuzzy') fuzzyCount += 1;
    else miss += 1;
  }

  if (miss === 0 && fuzzyCount === 0) {
    return exactCount === qTokens.length ? SCORE.TOKENS_STRONG : SCORE.TOKENS_STRONG + 2;
  }
  if (miss === 0 && fuzzyCount > 0) return SCORE.FUZZY;

  // Meta only when every query token is an exact word in meta — never via short prefix
  if (metaNorm) {
    const metaTokens = significantTokens(metaNorm);
    let metaOk = 0;
    for (const qt of qTokens) {
      if (metaTokens.includes(qt)) metaOk += 1;
      else if (qt.length >= 5 && metaTokens.some((t) => t.startsWith(qt))) metaOk += 1;
    }
    if (metaOk === qTokens.length && qTokens.length >= 2) return SCORE.META;
    // Single long token exact in meta (actor name etc.)
    if (qTokens.length === 1 && qTokens[0].length >= 6 && metaTokens.includes(qTokens[0])) {
      return SCORE.META;
    }
  }

  return SCORE.REJECT;
}

function sectionForType(type) {
  if (type === 'FILM') return 'films';
  if (type === 'SERIES') return 'series';
  if (type === 'LIVE') return 'tv';
  return null;
}

function allowedSetForSection(prefs, section) {
  const cfg = prefs.sectionGroupPrefs?.[section];
  if (!cfg?.configured) return null;
  const hidden = new Set(prefs.hiddenGroupIds || []);
  const set = new Set();
  for (const id of cfg.selectedGroupIds || []) {
    if (!hidden.has(id)) set.add(id);
  }
  return set;
}

function visibleForProfile(title, prefs) {
  const hiddenItems = new Set(prefs.hiddenItemIds || []);
  if (hiddenItems.has(title.id)) return false;
  const section = sectionForType(title.type);
  const groupIds =
    title.groupIds ||
    (() => {
      const ids = new Set();
      for (const v of title.variants || []) if (v.groupId) ids.add(v.groupId);
      for (const ep of title.episodes || []) {
        for (const ver of ep.versions || []) if (ver.stream?.groupId) ids.add(ver.stream.groupId);
      }
      return [...ids];
    })();
  if (section) {
    const allowed = allowedSetForSection(prefs, section);
    if (allowed === null) return false;
    if (!groupIds.length) return false;
    return groupIds.some((g) => allowed.has(g));
  }
  const hiddenGroups = new Set(prefs.hiddenGroupIds || []);
  if (!hiddenGroups.size) return true;
  if (!groupIds.length) return true;
  return groupIds.some((g) => !hiddenGroups.has(g));
}

function typeMatches(titleType, filter) {
  const f = String(filter || 'all').toLowerCase();
  if (f === 'all' || f === 'tout') return true;
  if (f === 'films' || f === 'film') return titleType === 'FILM';
  if (f === 'series' || f === 'série') return titleType === 'SERIES';
  if (f === 'tv' || f === 'live' || f === 'channels' || f === 'chaines') return titleType === 'LIVE';
  return true;
}

function tmdbIdOf(title) {
  const mk = title?.matchKey;
  if (mk?.type === 'PROVIDER_EXTERNAL' && /^tmdb:/i.test(mk.value || '')) {
    return String(mk.value).replace(/^tmdb:/i, '');
  }
  return title?.tmdbId || null;
}

function yearFromNorm(titleNorm, explicitYear) {
  if (explicitYear && Number(explicitYear) > 1900) return Number(explicitYear);
  const m = String(titleNorm || '').match(/\b((?:19|20)\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

function matchLabel(score) {
  if (score <= SCORE.EXACT_ALIAS) return '';
  if (score <= SCORE.PREFIX_ALIAS) return '';
  if (score <= SCORE.TOKENS_STRONG + 2) return '';
  if (score <= SCORE.FUZZY) return 'Proche';
  if (score <= SCORE.META) return '';
  return '';
}

/**
 * Build a lightweight searchable index once per catalog generation.
 */
export function buildSearchIndex(catalog) {
  ensureWorkIds(catalog);
  const titles = catalog?.titles || [];
  const entries = new Array(titles.length);
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    const titleNorm = normalizeSearchText(t.canonicalTitle);
    const core = stripIptvPrefixes(titleNorm).replace(/^[a-z]{2}\s+/, '').trim();
    const providedAlts = (t.alternativeTitles || t.alts || []).map(String);
    const aliasList = resolveAliases({
      normalizedTitle: core,
      tmdbId: tmdbIdOf(t)
    });
    const altJoined = [...providedAlts, ...aliasList].join(' ');
    const actors = (t.actors || t.cast || []).join(' ');
    const directors = (t.directors || []).join(' ');
    // Meta: genres + cast only — NOT full synopsis (avoids accidental long-text hits)
    const meta = [...(t.genres || []), actors, directors].filter(Boolean).join(' ');
    const groupIds = collectGroupIds(t);
    entries[i] = {
      id: t.id,
      type: t.type,
      title: t.canonicalTitle,
      titleNorm,
      titleCore: core,
      titleCompact: compactSearchText(t.canonicalTitle),
      altNorm: normalizeSearchText(altJoined),
      metaNorm: normalizeSearchText(meta),
      year: t.year || yearFromNorm(titleNorm, t.year) || 0,
      posterPath: t.posterPath || null,
      backdropPath: t.backdropPath || null,
      groupIds,
      dedupeKey: workDedupeKey(t),
      logicalWorkId: t.logicalWorkId || null,
      ref: t
    };
  }
  return {
    generatedAtEpochMs: catalog?.generatedAtEpochMs || 0,
    size: entries.length,
    entries
  };
}

function collectGroupIds(title) {
  const ids = new Set();
  for (const v of title.variants || []) if (v.groupId) ids.add(v.groupId);
  for (const ep of title.episodes || []) {
    for (const ver of ep.versions || []) if (ver.stream?.groupId) ids.add(ver.stream.groupId);
  }
  return [...ids];
}

function preferEntry(a, b) {
  // Prefer better score, then artwork, then shorter title (cleaner IPTV label)
  if (a.score !== b.score) return a.score < b.score ? a : b;
  const artA = a.e.posterPath ? 1 : 0;
  const artB = b.e.posterPath ? 1 : 0;
  if (artA !== artB) return artA > artB ? a : b;
  return a.e.title.length <= b.e.title.length ? a : b;
}

/**
 * @param {object} opts
 */
export function searchCatalog({
  index,
  query,
  filter = 'all',
  prefs = {},
  offset = 0,
  limit = 48
} = {}) {
  const q = normalizeSearchText(query);
  if (!index?.entries?.length) {
    return emptyResult(q, filter, offset, limit, 0);
  }

  const t0 = Date.now();
  const entries = index.entries;
  /** @type {{ e: object, score: number }[]} */
  const scored = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!typeMatches(e.type, filter)) continue;
    if (!visibleForProfile(e, prefs)) continue;
    if (!q) continue;
    const score = scoreTitle(q, e.titleNorm, e.altNorm, e.metaNorm, e.titleCompact);
    if (score >= SCORE.REJECT) continue;
    scored.push({ e, score });
  }

  // Dedupe logical editions — keep best card per work
  const byKey = new Map();
  for (const row of scored) {
    const key = row.e.dedupeKey || `id:${row.e.id}`;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, row);
    else byKey.set(key, preferEntry(prev, row));
  }
  let unique = [...byKey.values()];

  // If strong title hits exist, drop meta-only noise
  const hasStrong = unique.some((r) => r.score <= SCORE.TOKENS_STRONG + 2);
  if (hasStrong) {
    unique = unique.filter((r) => r.score <= SCORE.FUZZY);
  }

  unique.sort(
    (a, b) =>
      a.score - b.score ||
      (b.e.year || 0) - (a.e.year || 0) ||
      a.e.title.localeCompare(b.e.title)
  );

  const total = unique.length;
  const page = [];
  const end = Math.min(offset + limit, total);
  for (let i = offset; i < end; i++) {
    const { e, score } = unique[i];
    const variants = e.ref?.variants || [];
    page.push({
      id: e.id,
      title: e.title,
      type: e.type,
      year: e.year,
      posterUrl: e.posterPath,
      backdropUrl: e.backdropPath,
      selectedVersionId: variants[0]?.id || null,
      score,
      matchLabel: matchLabel(score),
      section: sectionForType(e.type)
    });
  }

  // Section buckets for premium UI (from full unique set, not just page)
  const sections = { best: [], films: [], series: [], tv: [] };
  for (const row of unique) {
    const card = {
      id: row.e.id,
      title: row.e.title,
      type: row.e.type,
      year: row.e.year,
      posterUrl: row.e.posterPath,
      score: row.score
    };
    if (row.score <= SCORE.PREFIX_ALIAS && sections.best.length < 8) sections.best.push(card);
    if (row.e.type === 'FILM') sections.films.push(card);
    else if (row.e.type === 'SERIES') sections.series.push(card);
    else if (row.e.type === 'LIVE') sections.tv.push(card);
  }
  sections.films = sections.films.slice(0, 24);
  sections.series = sections.series.slice(0, 24);
  sections.tv = sections.tv.slice(0, 24);

  return {
    query: q,
    filter,
    total,
    offset,
    limit,
    items: page,
    sections,
    tookMs: Date.now() - t0,
    indexSize: index.size
  };
}

function emptyResult(q, filter, offset, limit, indexSize) {
  return {
    query: q,
    filter,
    total: 0,
    offset,
    limit,
    items: [],
    sections: { best: [], films: [], series: [], tv: [] },
    tookMs: 0,
    indexSize
  };
}

export function suggestFromIndex(index, prefs = {}, limit = 12) {
  const out = [];
  const entries = index?.entries || [];
  for (let i = 0; i < entries.length && out.length < limit; i++) {
    const e = entries[i];
    if (!visibleForProfile(e, prefs)) continue;
    if (e.year >= 2020 || out.length < 4) {
      out.push({
        id: e.id,
        title: e.title,
        type: e.type,
        year: e.year,
        posterUrl: e.posterPath
      });
    }
  }
  return out;
}

export function isVisibleForProfile(title, prefs) {
  return visibleForProfile(title, prefs);
}

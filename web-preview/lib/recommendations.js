/**
 * Deterministic recommendations from real IPTV catalog metadata only.
 * Never invents titles. Hides sections when signals are too weak.
 */

const STOP = new Set([
  'the', 'a', 'an', 'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'and', 'of', 'or',
  'film', 'movie', 'serie', 'series', 'saison', 'season', 'episode', 'vf', 'vo', 'hd', 'fhd', '4k'
]);

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s) {
  return norm(s)
    .split(' ')
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function genreSet(t) {
  return new Set((t.genres || []).map((g) => norm(g)).filter(Boolean));
}

function castSet(t) {
  const raw = t.actors || t.cast || [];
  return new Set(raw.map((a) => norm(a)).filter((a) => a.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

function multiTokenPhraseOverlap(aTitle, bTitle) {
  const a = tokens(aTitle);
  const b = new Set(tokens(bTitle));
  if (a.length < 2) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  // Require at least 2 meaningful shared tokens (e.g. "spider man")
  return hit >= 2 ? hit / Math.max(a.length, 2) : 0;
}

function sameTrustedExternal(a, b) {
  const ka = a.matchKey;
  const kb = b.matchKey;
  if (!ka || !kb) return false;
  if (ka.type !== 'PROVIDER_EXTERNAL' || kb.type !== 'PROVIDER_EXTERNAL') return false;
  // Same external id → same title (skip). Shared collection ids are not in catalog.
  return false;
}

/**
 * Score candidate vs seed. Returns 0 if too weak / duplicate.
 */
export function scoreRecommendation(seed, cand) {
  if (!seed || !cand || seed.id === cand.id) return 0;
  if (seed.type !== cand.type) return 0;
  // Same logical external key → duplicate variant, not a recommendation
  if (
    seed.matchKey?.type === 'PROVIDER_EXTERNAL' &&
    cand.matchKey?.type === 'PROVIDER_EXTERNAL' &&
    String(seed.matchKey.value).toLowerCase() === String(cand.matchKey.value).toLowerCase()
  ) {
    return 0;
  }

  const gSeed = genreSet(seed);
  const gCand = genreSet(cand);
  const gScore = jaccard(gSeed, gCand);
  const sharedGenres = [...gSeed].filter((g) => gCand.has(g)).length;

  const cScore = jaccard(castSet(seed), castSet(cand));
  const phrase = multiTokenPhraseOverlap(seed.canonicalTitle, cand.canonicalTitle);

  const ySeed = Number(seed.year) || 0;
  const yCand = Number(cand.year) || 0;
  let yearBonus = 0;
  if (ySeed > 0 && yCand > 0) {
    const d = Math.abs(ySeed - yCand);
    if (d <= 2) yearBonus = 0.15;
    else if (d <= 5) yearBonus = 0.08;
  }

  // Hard gates — never genre-less single-token title matches alone
  const strong =
    sharedGenres >= 2 ||
    (sharedGenres >= 1 && (cScore >= 0.15 || phrase >= 0.5 || yearBonus >= 0.08)) ||
    cScore >= 0.25 ||
    (phrase >= 0.66 && sharedGenres >= 1);

  if (!strong) return 0;

  const score = gScore * 0.45 + cScore * 0.3 + phrase * 0.2 + yearBonus;
  return score >= 0.22 ? score : 0;
}

/**
 * @returns {{ saga: object[], similar: object[], sameGenre: object[], sameCast: object[] }}
 * each list capped; empty lists mean "hide section"
 */
export function buildRecommendations(seed, catalogTitles, { limit = 12, typeFilter = null } = {}) {
  const out = { saga: [], similar: [], sameGenre: [], sameCast: [] };
  if (!seed || !catalogTitles?.length) return out;

  const scored = [];
  for (const t of catalogTitles) {
    if (typeFilter && t.type !== typeFilter && t.type !== seed.type) continue;
    if (t.type !== seed.type) continue;
    const s = scoreRecommendation(seed, t);
    if (s <= 0) continue;
    scored.push({ t, s, g: jaccard(genreSet(seed), genreSet(t)), c: jaccard(castSet(seed), castSet(t)), p: multiTokenPhraseOverlap(seed.canonicalTitle, t.canonicalTitle) });
  }
  scored.sort((a, b) => b.s - a.s || (b.t.year || 0) - (a.t.year || 0));

  const used = new Set();
  const take = (pred, bucket, n) => {
    for (const row of scored) {
      if (bucket.length >= n) break;
      if (used.has(row.t.id)) continue;
      if (!pred(row)) continue;
      used.add(row.t.id);
      bucket.push(row.t);
    }
  };

  // Saga / franchise-ish: strong multi-token title overlap + some meta
  take((r) => r.p >= 0.5 && (r.g > 0 || r.c > 0), out.saga, Math.min(8, limit));
  take((r) => r.c >= 0.2, out.sameCast, Math.min(8, limit));
  take((r) => [...genreSet(seed)].filter((g) => genreSet(r.t).has(g)).length >= 2, out.sameGenre, Math.min(8, limit));
  take(() => true, out.similar, Math.min(limit, 12));

  return out;
}

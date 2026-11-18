/**
 * Official title aliases for multilingual search (browser / Tizen safe — no fs).
 * Curated only — never invents TMDB ids.
 */

export const CURATED_ALIASES = {
  'the jackal': ['le chacal', 'chacal', 'jackal', 'the day of the jackal', 'day of the jackal'],
  'le chacal': ['the jackal', 'chacal', 'jackal', 'the day of the jackal', 'day of the jackal'],
  chacal: ['le chacal', 'the jackal', 'the day of the jackal', 'day of the jackal'],
  'the day of the jackal': ['le chacal', 'chacal', 'the jackal', 'day of the jackal'],
  'day of the jackal': ['the day of the jackal', 'le chacal', 'chacal'],
  'money heist': ['la casa de papel', 'casa de papel', 'haus des geldes'],
  'la casa de papel': ['money heist', 'casa de papel', 'haus des geldes'],
  'casa de papel': ['money heist', 'la casa de papel'],
  supernatural: ['supernatural the anime'],
  'stranger things': ['stranger thing'],
  'spider man': ['spiderman', 'amazing spider man'],
  spiderman: ['spider man', 'amazing spider man']
};

/** @param {string} normTitle — already space-normalized lowercase */
export function aliasesForNormalizedTitle(normTitle) {
  if (!normTitle) return [];
  const curated = CURATED_ALIASES[normTitle];
  return curated ? [...curated] : [];
}

/** @param {string|null} tmdbId */
export function aliasesForTmdbId(_tmdbId) {
  // Disk cache is Node/web-preview only — Tizen/shared has curated map only.
  return [];
}

export function resolveAliases({ normalizedTitle, tmdbId } = {}) {
  const out = new Set();
  for (const a of aliasesForNormalizedTitle(normalizedTitle)) out.add(a);
  for (const a of aliasesForTmdbId(tmdbId)) out.add(a);
  return [...out];
}

export function _setDiskCacheForTests(_cache) {
  /* no-op on shared / Tizen */
}

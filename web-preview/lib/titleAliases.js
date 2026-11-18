/**
 * Official title aliases for multilingual search.
 * Only curated / cached metadata — never invents TMDB ids or machine-translates.
 *
 * Optional on-disk cache: web-preview/.data/title-aliases.json
 * {
 *   "byTmdb": { "1412": ["Supernatural"] },
 *   "byNormalizedTitle": { "money heist": ["la casa de papel", "casa de papel"] }
 * }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', '.data', 'title-aliases.json');

/** Curated official bilingual / alt titles (tests + common IPTV gaps). */
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

let diskCache = null;
let diskTried = false;

function loadDiskCache() {
  if (diskTried) return diskCache;
  diskTried = true;
  try {
    if (fs.existsSync(CACHE_PATH)) {
      diskCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch {
    diskCache = null;
  }
  return diskCache;
}

/** @param {string} normTitle — already space-normalized lowercase */
export function aliasesForNormalizedTitle(normTitle) {
  if (!normTitle) return [];
  const out = new Set();
  const curated = CURATED_ALIASES[normTitle];
  if (curated) curated.forEach((a) => out.add(a));
  const disk = loadDiskCache();
  const fromDisk = disk?.byNormalizedTitle?.[normTitle];
  if (Array.isArray(fromDisk)) fromDisk.forEach((a) => out.add(String(a)));
  return [...out];
}

/** @param {string|null} tmdbId */
export function aliasesForTmdbId(tmdbId) {
  if (!tmdbId) return [];
  const id = String(tmdbId).replace(/^tmdb:/i, '').trim();
  if (!id) return [];
  const disk = loadDiskCache();
  const list = disk?.byTmdb?.[id];
  return Array.isArray(list) ? list.map(String) : [];
}

export function resolveAliases({ normalizedTitle, tmdbId } = {}) {
  const out = new Set();
  for (const a of aliasesForNormalizedTitle(normalizedTitle)) out.add(a);
  for (const a of aliasesForTmdbId(tmdbId)) out.add(a);
  return [...out];
}

/** Test helper — inject cache without touching disk. */
export function _setDiskCacheForTests(cache) {
  diskCache = cache;
  diskTried = true;
}

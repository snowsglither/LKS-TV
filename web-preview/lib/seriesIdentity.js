/**
 * Logical series identity vs language editions / streams.
 * Never merges ambiguous titles; prefers trusted metadata ids.
 */

import { cleanDisplayTitle, detectLangFromText, technicalEditionKey } from './displayMeta.js';
import { languageDisplayName, normalizeLanguageTag } from './languages.js';

/**
 * Strip language/edition/quality noise and return a stable key fragment.
 * Returns null when too short / ambiguous.
 */
export function normalizeSeriesTitle(raw = '') {
  let t = cleanDisplayTitle(String(raw || ''));
  // Drop trailing year / country / edition tags (order may vary: (2024) (KR))
  for (let i = 0; i < 4; i++) {
    const next = t
      .replace(/\s*[\[(]?(?:19|20)\d{2}[\])]?\s*$/g, '')
      .replace(/\s*[\[(][A-Z]{2,3}[\])]?\s*$/gi, '')
      .replace(/\s*[-–:|]\s*(VF|VO|VOSTFR|MULTI|TRUEFRENCH)\s*$/i, '')
      .trim();
    if (next === t) break;
    t = next;
  }
  t = t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  if (t.length < 6) return null;
  return t;
}

/**
 * Cautious logical key for series editions.
 * @returns {{ type: string, value: string } | null}
 */
export function seriesLogicalMatchKey(rawTitle, year, tmdbId = null) {
  if (tmdbId) {
    return { type: 'PROVIDER_EXTERNAL', value: `tmdb:${String(tmdbId).trim()}` };
  }
  const y = Number(year);
  const norm = normalizeSeriesTitle(rawTitle);
  if (!norm || !Number.isFinite(y) || y < 1900 || y > 2100) return null;
  return { type: 'TITLE_YEAR', value: `series:${norm}:${y}` };
}

export function editionLabelFromTitle(rawTitle = '', groupName = '') {
  const d = detectLangFromText(rawTitle, groupName);
  const tag = normalizeLanguageTag(d.languageTag || d.language || '');
  if (tag) {
    const name = languageDisplayName(tag, { useful: false });
    if (name) {
      return {
        label: name,
        languageTag: tag,
        confidence: d.confidence || 'KNOWN',
        technicalKey: ''
      };
    }
  }
  const tech = technicalEditionKey(rawTitle);
  if (tech) {
    return {
      label: `Édition ${tech}`,
      languageTag: '',
      confidence: 'UNKNOWN',
      technicalKey: tech
    };
  }
  return { label: 'Édition', languageTag: '', confidence: 'UNKNOWN', technicalKey: '' };
}

/**
 * Soft-link sibling editions in the same catalog without forcing a destructive merge
 * when episode lists are lazily loaded per Xtream series id.
 */
export function findSeriesEditions(catalog, title, { max = 12 } = {}) {
  if (!title || title.type !== 'SERIES') return [];
  const selfKey =
    title.matchKey?.type === 'PROVIDER_EXTERNAL' || title.matchKey?.type === 'TITLE_YEAR'
      ? `${title.matchKey.type}:${String(title.matchKey.value).toLowerCase()}`
      : null;
  const norm = normalizeSeriesTitle(title.canonicalTitle || '');
  const year = title.year || null;
  const titles = catalog?.titles || [];
  const out = [];
  for (const t of titles) {
    if (t.type !== 'SERIES' || t.id === title.id) continue;
    let linked = false;
    if (selfKey && t.matchKey) {
      const otherKey = `${t.matchKey.type}:${String(t.matchKey.value).toLowerCase()}`;
      if (otherKey === selfKey) linked = true;
    }
    if (!linked && norm && year && t.year === year) {
      const otherNorm = normalizeSeriesTitle(t.canonicalTitle || '');
      if (otherNorm && otherNorm === norm) linked = true;
    }
    if (!linked) continue;
    const ed = editionLabelFromTitle(t.canonicalTitle || '', '');
    out.push({
      id: t.id,
      title: cleanDisplayTitle(t.canonicalTitle || ''),
      label: ed.label,
      languageTag: ed.languageTag,
      confidence: ed.confidence
    });
    if (out.length >= max) break;
  }
  // Include self as selected edition
  const selfEd = editionLabelFromTitle(title.canonicalTitle || '', '');
  return [
    {
      id: title.id,
      title: cleanDisplayTitle(title.canonicalTitle || ''),
      label: selfEd.label,
      languageTag: selfEd.languageTag,
      confidence: selfEd.confidence,
      selected: true
    },
    ...out.map((e) => ({ ...e, selected: false }))
  ];
}

/**
 * Deduplicate edition chips: prefer distinct language labels, drop UNKNOWN spam.
 */
export function presentEditionChips(editions = []) {
  const seen = new Set();
  const out = [];
  for (const ed of editions) {
    const label = ed.label && !/^unknown$/i.test(ed.label) ? ed.label : null;
    if (!label) continue;
    const key = `${label}|${ed.languageTag || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...ed, label });
  }
  // If everything was UNKNOWN, keep a single "Édition" chip for the selected title only
  if (!out.length && editions.length) {
    const sel = editions.find((e) => e.selected) || editions[0];
    out.push({ ...sel, label: 'Édition principale' });
  }
  return out;
}

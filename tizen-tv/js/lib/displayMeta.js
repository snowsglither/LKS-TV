/**
 * Display helpers: version labels, title cleaning.
 * Never invents language; never mutates raw provider ids/titles in storage.
 */

import {
  detectMediaLanguage,
  languageDisplayName,
  normalizeLanguageTag,
  isEditionTag
} from './languages.js';

const QUALITY_RE = /\b(4K|UHD|2160P|1080P|720P|480P|HD|SD|FHD|HDR|DV|DOLBY)\b/i;
const CODEC_RE = /\b(H\.?265|HEVC|H\.?264|AVC|AV1|XVID|AAC|AC3|DTS)\b/i;
const CONTAINER_RE = /\b(MKV|MP4|TS|AVI|MOV)\b/i;

/**
 * @returns {{ language: string, confidence: string }}
 * language is BCP-47 or edition:* ; empty string = unidentified
 */
export function detectLangFromText(title = '', group = '') {
  const d = detectMediaLanguage(title, group, { useGroup: true });
  return {
    language: d.language || 'UNKNOWN',
    confidence: d.confidence || 'UNKNOWN',
    languageTag: d.language || '',
    edition: d.edition
  };
}

export function extractQuality(text = '') {
  const m = String(text).match(QUALITY_RE);
  return m ? m[1].toUpperCase() : null;
}

export function extractCodec(text = '') {
  const m = String(text).match(CODEC_RE);
  return m ? m[1].toUpperCase() : null;
}

export function extractContainer(text = '', ext = '') {
  if (ext) return String(ext).replace(/^\./, '').toUpperCase();
  const m = String(text).match(CONTAINER_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Unique useful label for a stream variant.
 * Shows French language/edition names — never spam "Langue inconnue".
 */
export function versionLabel(stream, opts = {}) {
  const {
    groupName = '',
    index = 0,
    total = 1,
    groupNamesById = null
  } = opts;
  const raw = stream.rawTitle || '';
  const gName =
    groupName ||
    (groupNamesById && stream.groupId ? groupNamesById.get(stream.groupId) : '') ||
    '';

  let tag = normalizeLanguageTag(stream.languageTag || stream.language || '');
  let confidence = stream.confidence || 'UNKNOWN';
  if (!tag || tag === 'unknown') {
    const d = detectMediaLanguage(raw, gName, { useGroup: true });
    tag = d.language || '';
    confidence = d.confidence || 'UNKNOWN';
  }

  const parts = [];
  if (tag) {
    const name = languageDisplayName(tag, { useful: false });
    if (name) {
      parts.push(confidence === 'ASSUMED' ? `${name} (supposée)` : name);
    }
  }
  const q = extractQuality(raw) || extractQuality(gName);
  if (q) parts.push(q);
  const codec = extractCodec(raw);
  if (codec) parts.push(codec);
  const cont = extractContainer(raw, stream.containerExtension || stream.ext);
  if (cont) parts.push(cont);
  if (gName && !parts.includes(gName) && parts.length < 3) {
    const short = gName.length > 28 ? `${gName.slice(0, 26)}…` : gName;
    if (!parts.some((p) => String(p).includes(short.slice(0, 8)))) parts.push(short);
  }
  if (!parts.length) {
    parts.push(total > 1 ? `Version ${index + 1}` : 'Version unique');
  } else if (!tag && total > 1 && !parts.some((p) => /^Version /.test(p) || /^v\d/.test(p))) {
    parts.unshift(`v${index + 1}`);
  }
  return parts.join(' · ');
}

/** Clean display title — does not alter stored raw title. */
export function cleanDisplayTitle(raw = '') {
  let t = String(raw);
  // Strip IPTV language OR ambiguous country/provider prefixes (GB/AL/EX/GR…).
  t = t.replace(
    /^\[?\s*[A-Za-z]{2,3}\s*\]?\s*[-–|:./]\s+/,
    ''
  );
  t = t.replace(
    /^\[?\s*(VF|VO|VOSTFR|VOSTNL|VOST|MULTI|TRUEFRENCH|FR|EN|ES|NL|DE|AR|TR|PT|JA|KO|ZH|IT)\s*\]?\s*[-–:|.]?\s*/i,
    ''
  );
  t = t.replace(
    /\s*[\[(](VF|VO|VOSTFR|VOSTNL|TRUEFRENCH|MULTI|FR|EN|ES|NL|DE|AR|TR|1080P|720P|4K|HD)[\])]?\s*/gi,
    ' '
  );
  // Trailing / mid country-provider tokens: (GB), (AL), (EX)…
  t = t.replace(/\s*[\[(][A-Z]{2,3}[\])]\s*/g, ' ');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || String(raw).trim();
}

/**
 * Episode title for lists — never repeats the series IPTV blob.
 * @returns clean title or « Épisode N »
 */
export function cleanEpisodeTitle(raw = '', season, episode, seriesTitle = '') {
  const seriesClean = cleanDisplayTitle(seriesTitle || '');
  // Normalize IPTV prefixes first so series strip can match.
  let t = cleanDisplayTitle(raw || '');
  if (seriesClean) {
    const esc = seriesClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`^${esc}\\s*(?:\\(\\d{4}\\))?\\s*[-–:|]?\\s*`, 'i'), '');
    // Also strip series without year if present
    const noYear = seriesClean.replace(/\s*\(\d{4}\)\s*$/, '').trim();
    if (noYear && noYear !== seriesClean) {
      const esc2 = noYear.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      t = t.replace(new RegExp(`^${esc2}\\s*(?:\\(\\d{4}\\))?\\s*[-–:|]?\\s*`, 'i'), '');
    }
  }
  t = t.replace(/\bS\d{1,2}\s*[xE.e]\s*\d{1,3}\b\s*[-–:.]?\s*/gi, '');
  if (season != null && episode != null) {
    t = t.replace(
      new RegExp(`^S?0*${season}\\s*[xE.e]\\s*0*${episode}\\s*[-–:.]?\\s*`, 'i'),
      ''
    );
  }
  t = t.replace(/^E0*\d+\s*[-–:.]?\s*/i, '');
  t = t.replace(/^\(\d{4}\)\s*/g, '').replace(/^[-–:|]\s*/, '').replace(/\s{2,}/g, ' ').trim();
  if (!t || /^episode\s*\d+$/i.test(t) || /^épisode\s*\d+$/i.test(t)) {
    return `Épisode ${episode}`;
  }
  if (seriesClean && t.toLowerCase() === seriesClean.toLowerCase()) {
    return `Épisode ${episode}`;
  }
  if (seriesClean) {
    const noYear = seriesClean.replace(/\s*\(\d{4}\)\s*$/, '').trim().toLowerCase();
    if (noYear && t.toLowerCase() === noYear) return `Épisode ${episode}`;
  }
  return t;
}

/** List label: « 1. Épisode 1 » or « 1. Titre réel » */
export function formatEpisodeListLabel(cleanTitle, episodeNum) {
  const n = Number(episodeNum) || 0;
  const t = String(cleanTitle || '').trim();
  if (!t || /^épisode\s*\d+$/i.test(t) || /^episode\s*\d+$/i.test(t)) {
    return `${n}. Épisode ${n}`;
  }
  return `${n}. ${t}`;
}

/** Player chrome: « Chacal — S1:E1 » */
export function formatPlayerSeriesTitle(seriesTitle, season, episode) {
  const name = cleanDisplayTitle(seriesTitle || 'Série') || 'Série';
  return `${name} — S${season}:E${episode}`;
}

/** IPTV country/provider prefix when it is NOT a proven language. */
export function technicalEditionKey(rawTitle = '') {
  const m = String(rawTitle || '').match(/^\s*([A-Za-z]{2,3})\s*[-–|:./]\s+/);
  if (!m) return '';
  const token = m[1];
  if (normalizeLanguageTag(token)) return '';
  return token.toUpperCase();
}

export function redactUrl(url = '') {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/[^/]+\/[^/]+\/[^/]+/, '/…/…/…')}`;
  } catch {
    return String(url).replace(/\/\/[^/]+@/, '//***@').slice(0, 80);
  }
}

export { languageDisplayName, normalizeLanguageTag, isEditionTag, detectMediaLanguage };

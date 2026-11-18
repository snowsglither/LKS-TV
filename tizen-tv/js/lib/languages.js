/**
 * Universal IPTV language helpers — ISO 639 / BCP 47.
 * Edition markers (VF, VO, MULTI, VOST*) are NOT ISO languages.
 */

/** ISO 639-2/3 (and aliases) → BCP 47 primary subtag */
const ISO_ALIASES = {
  fra: 'fr', fre: 'fr', fr: 'fr',
  nld: 'nl', dut: 'nl', nl: 'nl',
  eng: 'en', en: 'en',
  deu: 'de', ger: 'de', de: 'de',
  spa: 'es', es: 'es',
  ita: 'it', it: 'it',
  por: 'pt', pt: 'pt',
  ara: 'ar', ar: 'ar',
  tur: 'tr', tr: 'tr',
  jpn: 'ja', ja: 'ja',
  kor: 'ko', ko: 'ko',
  zho: 'zh', chi: 'zh', zh: 'zh',
  rus: 'ru', ru: 'ru',
  pol: 'pl', pl: 'pl',
  ukr: 'uk', uk: 'uk',
  ron: 'ro', rum: 'ro', ro: 'ro',
  hun: 'hu', hu: 'hu',
  ces: 'cs', cze: 'cs', cs: 'cs',
  swe: 'sv', sv: 'sv',
  nor: 'no', nob: 'no', nno: 'nn', no: 'no',
  dan: 'da', da: 'da',
  fin: 'fi', fi: 'fi',
  ell: 'el', gre: 'el', el: 'el',
  heb: 'he', iw: 'he', he: 'he',
  hin: 'hi', hi: 'hi',
  tha: 'th', th: 'th',
  vie: 'vi', vi: 'vi',
  ind: 'id', id: 'id',
  msa: 'ms', may: 'ms', ms: 'ms',
  bul: 'bg', bg: 'bg',
  hrv: 'hr', hr: 'hr',
  srp: 'sr', sr: 'sr',
  slk: 'sk', slo: 'sk', sk: 'sk',
  slv: 'sl', sl: 'sl',
  lit: 'lt', lt: 'lt',
  lav: 'lv', lv: 'lv',
  est: 'et', et: 'et',
  cat: 'ca', ca: 'ca',
  eus: 'eu', eu: 'eu',
  glg: 'gl', gl: 'gl',
  fas: 'fa', per: 'fa', fa: 'fa',
  urd: 'ur', ur: 'ur',
  ben: 'bn', bn: 'bn',
  tam: 'ta', ta: 'ta',
  tel: 'te', te: 'te',
  mar: 'mr', mr: 'mr',
  guj: 'gu', gu: 'gu',
  kan: 'kn', kn: 'kn',
  mal: 'ml', ml: 'ml',
  pan: 'pa', pa: 'pa',
  mya: 'my', bur: 'my', my: 'my',
  khm: 'km', km: 'km',
  lao: 'lo', lo: 'lo',
  kat: 'ka', geo: 'ka', ka: 'ka',
  hye: 'hy', arm: 'hy', hy: 'hy',
  aze: 'az', az: 'az',
  kaz: 'kk', kk: 'kk',
  uzb: 'uz', uz: 'uz',
  mon: 'mn', mn: 'mn',
  nep: 'ne', ne: 'ne',
  sin: 'si', si: 'si',
  sqi: 'sq', alb: 'sq', sq: 'sq',
  mkd: 'mk', mac: 'mk', mk: 'mk',
  bel: 'be', be: 'be',
  isl: 'is', ice: 'is', is: 'is',
  gle: 'ga', ga: 'ga',
  cym: 'cy', cy: 'cy',
  afr: 'af', af: 'af',
  swa: 'sw', sw: 'sw',
  amh: 'am', am: 'am',
  yor: 'yo', yo: 'yo',
  zul: 'zu', zu: 'zu',
  xho: 'xh', xh: 'xh',
  som: 'so', so: 'so',
  hau: 'ha', ha: 'ha',
  ibo: 'ig', ig: 'ig',
  tgl: 'tl', fil: 'fil', tl: 'tl',
  ceb: 'ceb',
  jav: 'jv', jv: 'jv',
  sun: 'su', su: 'su',
  ckb: 'ckb',
  kur: 'ku', ku: 'ku',
  pus: 'ps', ps: 'ps',
  tgk: 'tg', tg: 'tg',
  tuk: 'tk', tk: 'tk',
  kir: 'ky', ky: 'ky',
  bak: 'ba', ba: 'ba',
  tat: 'tt', tt: 'tt',
  chv: 'cv', cv: 'cv',
  sah: 'sah',
  yid: 'yi', yi: 'yi',
  lat: 'la', la: 'la',
  epo: 'eo', eo: 'eo',
  und: 'und',
  mul: 'mul',
  zxx: 'zxx'
};

/** French labels for common tags (Intl.DisplayNames used as fallback). */
const FR_NAMES = {
  fr: 'Français',
  en: 'Anglais',
  nl: 'Néerlandais',
  de: 'Allemand',
  es: 'Espagnol',
  it: 'Italien',
  pt: 'Portugais',
  'pt-BR': 'Portugais (Brésil)',
  'pt-PT': 'Portugais (Portugal)',
  ar: 'Arabe',
  tr: 'Turc',
  ja: 'Japonais',
  ko: 'Coréen',
  zh: 'Chinois',
  'zh-Hans': 'Chinois simplifié',
  'zh-Hant': 'Chinois traditionnel',
  ru: 'Russe',
  pl: 'Polonais',
  uk: 'Ukrainien',
  ro: 'Roumain',
  hu: 'Hongrois',
  cs: 'Tchèque',
  sv: 'Suédois',
  no: 'Norvégien',
  da: 'Danois',
  fi: 'Finnois',
  el: 'Grec',
  he: 'Hébreu',
  hi: 'Hindi',
  th: 'Thaï',
  vi: 'Vietnamien',
  id: 'Indonésien',
  ms: 'Malais',
  bg: 'Bulgare',
  hr: 'Croate',
  sr: 'Serbe',
  sk: 'Slovaque',
  sl: 'Slovène',
  lt: 'Lituanien',
  lv: 'Letton',
  et: 'Estonien',
  ca: 'Catalan',
  eu: 'Basque',
  gl: 'Galicien',
  fa: 'Persan',
  ur: 'Ourdou',
  bn: 'Bengali',
  ta: 'Tamoul',
  te: 'Télougou',
  mr: 'Marathi',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Pendjabi',
  my: 'Birman',
  km: 'Khmer',
  lo: 'Lao',
  ka: 'Géorgien',
  hy: 'Arménien',
  az: 'Azéri',
  kk: 'Kazakh',
  uz: 'Ouzbek',
  mn: 'Mongol',
  ne: 'Népalais',
  si: 'Cingalais',
  sq: 'Albanais',
  mk: 'Macédonien',
  be: 'Biélorusse',
  is: 'Islandais',
  ga: 'Irlandais',
  cy: 'Gallois',
  af: 'Afrikaans',
  sw: 'Swahili',
  am: 'Amharique',
  yo: 'Yoruba',
  zu: 'Zoulou',
  so: 'Somali',
  ha: 'Haoussa',
  ig: 'Igbo',
  tl: 'Tagalog',
  fil: 'Filipino',
  jv: 'Javanais',
  ku: 'Kurde',
  ps: 'Pachto',
  la: 'Latin',
  eo: 'Espéranto',
  mul: 'Multi-langues',
  und: 'Langue non renseignée'
};

const EDITION_LABELS = {
  vf: 'VF',
  vo: 'VO',
  multi: 'Multi',
  vostfr: 'VOSTFR',
  vostnl: 'VOSTNL',
  vost: 'VOST',
  truefrench: 'TrueFrench'
};

let displayNamesFr = null;
function intlName(tag) {
  try {
    if (!displayNamesFr) {
      displayNamesFr = new Intl.DisplayNames(['fr'], { type: 'language' });
    }
    const name = displayNamesFr.of(tag);
    if (name && name.toLowerCase() !== tag.toLowerCase()) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    /* ignore */
  }
  return null;
}

export function normalizeLanguageTag(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim().replace(/_/g, '-');
  if (!s) return '';
  // Edition markers stored as edition:*
  if (/^edition:/i.test(s)) return s.toLowerCase();
  if (/^(vf|vo|multi|vostfr|vostnl|vost|truefrench)$/i.test(s)) {
    return `edition:${s.toLowerCase()}`;
  }
  // Legacy catalog tokens
  if (s.toUpperCase() === 'UNKNOWN' || s.toUpperCase() === 'OTHER') return '';
  if (s.toUpperCase() === 'VF') return 'edition:vf';
  if (s.toUpperCase() === 'VO') return 'edition:vo';

  const lower = s.toLowerCase();
  // BCP 47 with region/script
  const bcp = lower.match(/^([a-z]{2,3})(?:-([a-z0-9]{2,8}))?(?:-([a-z0-9]{2,8}))?/i);
  if (bcp) {
    // Strict allowlist only — never treat IPTV country/provider prefixes (GB, AL, EX, GR…) as languages.
    const primary = ISO_ALIASES[bcp[1].toLowerCase()] || '';
    if (!primary || primary === 'und') return '';
    const rest = [bcp[2], bcp[3]].filter(Boolean);
    // Special cases
    if (primary === 'zh' && rest[0]) {
      const r = rest[0].toLowerCase();
      if (r === 'hant' || r === 'tw' || r === 'hk') return 'zh-Hant';
      if (r === 'hans' || r === 'cn' || r === 'sg') return 'zh-Hans';
    }
    if (primary === 'pt' && rest[0]) {
      const r = rest[0].toUpperCase();
      if (r === 'BR') return 'pt-BR';
      if (r === 'PT') return 'pt-PT';
    }
    if (rest.length && rest[0].length === 2) {
      return `${primary}-${rest[0].toUpperCase()}`;
    }
    if (rest.length && /^(hans|hant)$/i.test(rest[0])) {
      return `${primary}-${rest[0][0].toUpperCase()}${rest[0].slice(1).toLowerCase()}`;
    }
    return primary;
  }
  return ISO_ALIASES[lower] || '';
}

export function isEditionTag(tag) {
  return /^edition:/i.test(String(tag || ''));
}

export function editionOf(tag) {
  const m = String(tag || '').toLowerCase().match(/^edition:(.+)$/);
  return m ? m[1] : '';
}

export function languageDisplayName(tag, { useful = true } = {}) {
  const norm = normalizeLanguageTag(tag);
  if (!norm) return useful ? 'Langue non renseignée' : '';
  if (isEditionTag(norm)) {
    const ed = editionOf(norm);
    return EDITION_LABELS[ed] || ed.toUpperCase();
  }
  if (FR_NAMES[norm]) return FR_NAMES[norm];
  const primary = norm.split('-')[0];
  if (FR_NAMES[norm]) return FR_NAMES[norm];
  if (FR_NAMES[primary]) {
    // region variant not in map
    if (norm.includes('-')) {
      const intl = intlName(norm);
      if (intl) return intl;
    }
    return FR_NAMES[primary];
  }
  return intlName(norm) || intlName(primary) || norm.toUpperCase();
}

/**
 * Does stream language satisfy a profile preference?
 * preferred may be BCP-47, legacy VF/EN, or edition:vf.
 */
export function matchesPreferredLanguage(streamTag, preferred) {
  const pref = normalizeLanguageTag(preferred) || String(preferred || '').toLowerCase();
  const got = normalizeLanguageTag(streamTag);
  if (!pref || pref === 'und') return true;
  if (!got) return false;
  if (pref === got) return true;
  // VF preference ↔ French
  if (pref === 'edition:vf' || pref === 'vf') {
    return got === 'edition:vf' || got === 'fr' || got.startsWith('fr-');
  }
  if (pref === 'fr' || pref.startsWith('fr-')) {
    return got === 'fr' || got.startsWith('fr-') || got === 'edition:vf';
  }
  if (pref === 'edition:vo' || pref === 'vo') {
    return got === 'edition:vo' || got === 'edition:vost' || got === 'edition:vostfr' || got === 'edition:vostnl';
  }
  if (pref === 'edition:multi' || pref === 'multi' || pref === 'mul') {
    return got === 'edition:multi' || got === 'mul';
  }
  const prefPrimary = pref.split('-')[0];
  const gotPrimary = got.split('-')[0];
  if (isEditionTag(got)) return false;
  return prefPrimary === gotPrimary;
}

function scanEditions(text) {
  const t = String(text || '');
  if (/\bTRUEFRENCH\b/i.test(t)) return { tag: 'edition:truefrench', confidence: 'KNOWN' };
  if (/\bVOSTFR\b/i.test(t)) return { tag: 'edition:vostfr', confidence: 'KNOWN' };
  if (/\bVOSTNL\b/i.test(t)) return { tag: 'edition:vostnl', confidence: 'KNOWN' };
  if (/\bVOST\b/i.test(t) && !/\bVOSTFR\b/i.test(t) && !/\bVOSTNL\b/i.test(t)) {
    return { tag: 'edition:vost', confidence: 'KNOWN' };
  }
  if (/\bMULTI\b/i.test(t)) return { tag: 'edition:multi', confidence: 'KNOWN' };
  if (/\b(VF|VFF|VFQ|VFI)\b/i.test(t)) return { tag: 'edition:vf', confidence: 'KNOWN' };
  // VO alone (not VOST*)
  if (/(?:^|[^A-Z0-9])VO(?:[^A-Z0-9]|$)/i.test(t) && !/\bVOST/i.test(t)) {
    return { tag: 'edition:vo', confidence: 'KNOWN' };
  }
  if (/\bOV\b/i.test(t)) return { tag: 'edition:vo', confidence: 'KNOWN' };
  return null;
}

function scanIsoInText(text, confidence) {
  const t = String(text || '');
  // Prefer explicit bracket/paren tokens: [NL] (FR) {EN} - PT-BR -
  const explicit = [
    ...t.matchAll(/[\[({]\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)\s*[\])}]/g),
    ...t.matchAll(/(?:^|[\s|_./-])([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)(?=[\s|_./-]|$)/g)
  ];
  for (const m of explicit) {
    const cand = m[1];
    // Skip quality/codecs mistaken as langs
    if (/^(HD|SD|UHD|HDR|DV|MKV|MP4|TS|AVC|AAC|AC3|DTS|H264|H265|HEVC|AV1|XVID|WEB|DL|BLURAY|REMUX)$/i.test(cand)) {
      continue;
    }
    // Skip season/episode-ish
    if (/^S\d/i.test(cand) || /^\d/.test(cand)) continue;
    const norm = normalizeLanguageTag(cand);
    if (norm && !isEditionTag(norm) && norm !== 'und') {
      return { tag: norm, confidence };
    }
  }

  // Language names (French/English) in title
  const names = [
    [/français|francais|french/i, 'fr'],
    [/english|anglais/i, 'en'],
    [/nederland|dutch|néerlandais|neerlandais|flamand/i, 'nl'],
    [/deutsch|german|allemand/i, 'de'],
    [/español|espanol|spanish|castellano|espagnol/i, 'es'],
    [/italiano|italian|italien/i, 'it'],
    [/português|portugues|portuguese|portugais/i, 'pt'],
    [/arabic|arabe|العربية/i, 'ar'],
    [/turkish|turc|türkçe|turkce/i, 'tr'],
    [/japanese|japonais|日本語/i, 'ja'],
    [/korean|coréen|coreen|한국어/i, 'ko'],
    [/chinese|chinois|中文|mandarin/i, 'zh'],
    [/russian|russe|русский/i, 'ru'],
    [/hindi|हिन्दी/i, 'hi'],
    [/polish|polonais/i, 'pl'],
    [/ukrainian|ukrainien/i, 'uk']
  ];
  for (const [re, tag] of names) {
    if (re.test(t)) return { tag, confidence };
  }
  return null;
}

/**
 * Detect language/edition from stream title and optional group.
 * Group-only hits are ASSUMED (category ≠ proven audio).
 */
export function detectMediaLanguage(title = '', group = '', opts = {}) {
  const useGroup = opts.useGroup !== false;
  const fromTitleEdition = scanEditions(title);
  if (fromTitleEdition) {
    return {
      language: fromTitleEdition.tag,
      confidence: fromTitleEdition.confidence,
      edition: editionOf(fromTitleEdition.tag) || null,
      source: 'title'
    };
  }
  const fromTitleIso = scanIsoInText(title, 'KNOWN');
  if (fromTitleIso) {
    return {
      language: fromTitleIso.tag,
      confidence: fromTitleIso.confidence,
      edition: null,
      source: 'title'
    };
  }
  // Prefix tokens like "FR - Title" / "NL | Title"
  const prefix = String(title).match(/^\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)\s*[-–|:./]\s+/);
  if (prefix) {
    const norm = normalizeLanguageTag(prefix[1]);
    if (norm && !isEditionTag(norm)) {
      return { language: norm, confidence: 'ASSUMED', edition: null, source: 'title-prefix' };
    }
  }

  if (useGroup && group) {
    const fromGroupEdition = scanEditions(group);
    // Edition in group name is weak
    if (fromGroupEdition) {
      return {
        language: fromGroupEdition.tag,
        confidence: 'ASSUMED',
        edition: editionOf(fromGroupEdition.tag) || null,
        source: 'group'
      };
    }
    const fromGroupIso = scanIsoInText(group, 'ASSUMED');
    if (fromGroupIso) {
      return {
        language: fromGroupIso.tag,
        confidence: 'ASSUMED',
        edition: null,
        source: 'group'
      };
    }
  }

  return { language: '', confidence: 'UNKNOWN', edition: null, source: null };
}

/** Preference options for settings UI */
export function preferredLanguageChoices() {
  return [
    { value: 'edition:vf', label: 'VF (français)' },
    { value: 'fr', label: 'Français' },
    { value: 'edition:vo', label: 'VO' },
    { value: 'en', label: 'Anglais' },
    { value: 'nl', label: 'Néerlandais' },
    { value: 'de', label: 'Allemand' },
    { value: 'es', label: 'Espagnol' },
    { value: 'it', label: 'Italien' },
    { value: 'pt', label: 'Portugais' },
    { value: 'pt-BR', label: 'Portugais (Brésil)' },
    { value: 'ar', label: 'Arabe' },
    { value: 'tr', label: 'Turc' },
    { value: 'ja', label: 'Japonais' },
    { value: 'ko', label: 'Coréen' },
    { value: 'zh-Hans', label: 'Chinois simplifié' },
    { value: 'zh-Hant', label: 'Chinois traditionnel' },
    { value: 'ru', label: 'Russe' },
    { value: 'edition:multi', label: 'Multi' }
  ];
}

export function interfaceLanguageChoices() {
  return [
    { value: 'fr', label: 'Français' },
    { value: 'en', label: 'English' },
    { value: 'nl', label: 'Nederlands' }
  ];
}

/** Map legacy preferredLanguage tokens to new tags */
export function migratePreferredLanguage(legacy) {
  const s = String(legacy || '').trim();
  if (!s) return 'edition:vf';
  const n = normalizeLanguageTag(s);
  if (n) return n;
  const u = s.toUpperCase();
  if (u === 'VF') return 'edition:vf';
  if (u === 'VO') return 'edition:vo';
  if (u === 'EN') return 'en';
  if (u === 'NL') return 'nl';
  if (u === 'OTHER' || u === 'UNKNOWN') return 'edition:vf';
  return 'edition:vf';
}

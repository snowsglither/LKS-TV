/**
 * SSRF / destination guards for outbound IPTV fetches (loopback preview only).
 */

const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata'
]);

function isPrivateIp(hostname) {
  const h = hostname.toLowerCase();
  if (h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local')) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * @param {string} raw
 * @param {{ allowPrivate?: boolean }} [opts]
 * @returns {URL}
 */
export function assertSafeHttpUrl(raw, opts = {}) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch {
    throw new Error('URL invalide');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Seuls http/https sont autorisés');
  }
  if (url.username || url.password) {
    throw new Error('Identifiants dans l’URL interdits');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    throw new Error('Hôte local/métadonnées interdit');
  }
  if (!opts.allowPrivate && isPrivateIp(host)) {
    throw new Error(
      'Adresse privée/interne interdite (sauf fournisseur déjà autorisé avec allowPrivate).'
    );
  }
  return url;
}

export function normalizeBaseUrl(raw, opts = {}) {
  const url = assertSafeHttpUrl(raw, opts);
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
}

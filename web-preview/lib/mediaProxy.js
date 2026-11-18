/**
 * Streaming media proxy — Range/206, HLS rewrite, codec sniff (no credentials logged).
 */
import { Readable } from 'stream';

const UA = 'LKS-TV-Preview/0.4';

/** Hosts authorized for /api/media/direct (panel + CDN redirect targets). */
const allowedMediaHosts = new Set();

export function authorizeMediaHost(urlOrHost) {
  try {
    const host = String(urlOrHost).includes('://')
      ? new URL(urlOrHost).host
      : String(urlOrHost);
    if (host) allowedMediaHosts.add(host.toLowerCase());
  } catch {
    /* ignore */
  }
}

export function isMediaHostAllowed(urlOrHost) {
  try {
    const host = String(urlOrHost).includes('://')
      ? new URL(urlOrHost).host
      : String(urlOrHost);
    return allowedMediaHosts.has(String(host).toLowerCase());
  } catch {
    return false;
  }
}

export function clearMediaHostAllowlist() {
  allowedMediaHosts.clear();
}

/** Detect container/codecs from a small byte sample (no secrets). */
export function sniffMedia(buf) {
  const out = {
    container: null,
    videoCodec: null,
    audioCodec: null,
    brands: [],
    browserLikely: 'unknown',
    reason: null
  };
  if (!buf || !buf.length) {
    out.reason = 'échantillon vide';
    return out;
  }
  if (buf[0] === 0x47) {
    out.container = 'mpeg-ts';
    out.browserLikely = 'unlikely';
    out.reason = 'MPEG-TS — Chrome ne décode généralement pas en <video> natif';
    return out;
  }
  if (buf.length < 12) {
    out.reason = 'échantillon trop court';
    return out;
  }
  const head = buf.slice(0, Math.min(buf.length, 16)).toString('utf8');
  if (/^#EXTM3U/i.test(head)) {
    out.container = 'hls';
    out.browserLikely = 'ok-hls';
    out.reason = 'playlist HLS';
    return out;
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    const asAscii = buf.slice(0, Math.min(buf.length, 64)).toString('latin1');
    if (/webm/i.test(asAscii)) {
      out.container = 'webm';
      out.browserLikely = 'ok';
      out.reason = 'WebM';
    } else {
      out.container = 'mkv';
      out.browserLikely = 'no';
      out.reason = 'Matroska/MKV — non supporté par Chrome <video>';
    }
    return out;
  }

  const latin = buf.toString('latin1');
  const brands = [];
  for (const b of [
    'isom',
    'iso2',
    'mp41',
    'mp42',
    'avc1',
    'avc3',
    'hev1',
    'hvc1',
    'vp09',
    'av01',
    'mp4a',
    'dash',
    'M4V ',
    'qt  '
  ]) {
    if (latin.includes(b)) brands.push(b.trim());
  }
  out.brands = brands;

  if (latin.includes('ftyp') || brands.length) {
    out.container = 'mp4';
  }

  if (brands.includes('hev1') || brands.includes('hvc1')) {
    out.videoCodec = 'hevc';
    out.browserLikely = 'no';
    out.reason =
      'Vidéo HEVC/H.265 détectée — Chrome desktop ne décode pas HEVC dans <video> (métadonnées/durée OK, image noire). Media3 Android recommandé.';
    return out;
  }
  if (brands.includes('av01')) {
    out.videoCodec = 'av1';
    out.browserLikely = 'ok';
    out.reason = 'AV1';
  } else if (brands.includes('vp09')) {
    out.videoCodec = 'vp9';
    out.browserLikely = 'ok';
    out.reason = 'VP9';
  } else if (brands.includes('avc1') || brands.includes('avc3')) {
    out.videoCodec = 'avc';
    out.browserLikely = 'ok';
    out.reason = 'H.264/AVC';
  } else if (out.container === 'mp4') {
    out.videoCodec = 'unknown-mp4';
    out.browserLikely = 'uncertain';
    out.reason =
      'MP4 sans marqueur codec clair dans l’échantillon — durée possible sans décode vidéo';
  }

  if (brands.includes('mp4a')) out.audioCodec = 'aac';

  return out;
}

export async function fetchUpstreamSample(
  upstreamUrl,
  { maxBytes = 512 * 1024, timeoutMs = 10000, withRange = true } = {}
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = { 'User-Agent': UA, Accept: '*/*' };
    // Range on HLS playlists can confuse some CDNs; optional.
    const looksHls = /\.m3u8(\?|$)/i.test(String(upstreamUrl));
    if (withRange && !looksHls) {
      headers.Range = `bytes=0-${maxBytes - 1}`;
    }
    const res = await fetch(upstreamUrl, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: ctrl.signal
    });
    authorizeMediaHost(upstreamUrl);
    if (res.url) authorizeMediaHost(res.url);
    const ct = res.headers.get('content-type');
    const status = res.status;
    const acceptRanges = res.headers.get('accept-ranges');
    const contentRange = res.headers.get('content-range');
    // Cap read — never buffer a live .ts forever
    const reader = res.body?.getReader?.();
    let buf;
    if (reader) {
      const chunks = [];
      let total = 0;
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        total += value.byteLength;
        if (total >= maxBytes) break;
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      buf = Buffer.concat(chunks, Math.min(total, maxBytes));
    } else {
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > maxBytes) buf = buf.subarray(0, maxBytes);
    }
    return {
      status,
      contentType: ct,
      acceptRanges,
      contentRange,
      redirected: res.redirected,
      finalUrl: res.url || upstreamUrl,
      bytes: buf.length,
      sniff: sniffMedia(buf),
      ok: status === 200 || status === 206
    };
  } finally {
    clearTimeout(timer);
  }
}

function copyHopHeaders(from, to, extras = {}) {
  const pass = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'content-encoding'
  ];
  for (const h of pass) {
    const v = from.headers.get(h);
    if (v) to.setHeader(h, v);
  }
  for (const [k, v] of Object.entries(extras)) {
    if (v != null) to.setHeader(k, v);
  }
  to.setHeader('Cache-Control', 'no-store');
}

function toProxyUrl(absoluteUrl) {
  authorizeMediaHost(absoluteUrl);
  return `/api/media/direct?u=${encodeURIComponent(absoluteUrl)}`;
}

function resolveAgainst(baseUrl, ref) {
  try {
    return new URL(ref, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Rewrite HLS playlists so child playlists / segments / keys go through our proxy.
 * Uses the *final* URL after redirects as resolution base (CDN IP ≠ panel host).
 */
export function rewriteHlsPlaylist(text, baseUrl) {
  const resolveLine = (ref) => {
    const abs = resolveAgainst(baseUrl, ref);
    return abs ? toProxyUrl(abs) : ref;
  };

  return String(text)
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // URI="..." inside tags (KEY, MAP, MEDIA, SESSION-KEY, …)
      if (trimmed.startsWith('#') && /URI="/i.test(trimmed)) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri) => `URI="${resolveLine(uri)}"`);
      }

      if (trimmed.startsWith('#')) return line;

      return resolveLine(trimmed);
    })
    .join('\n');
}

/**
 * Proxy upstream with Range forwarding and streaming (no full buffering of media).
 */
export async function proxyMediaStream(req, res, upstreamUrl, { rewriteHls = false } = {}) {
  authorizeMediaHost(upstreamUrl);

  const headers = { 'User-Agent': UA, Accept: '*/*' };
  const looksPlaylist =
    rewriteHls ||
    /\.m3u8(\?|$)/i.test(String(upstreamUrl)) ||
    /mpegurl|m3u8/i.test(String(req.headers.accept || ''));

  // Never forward Range to HLS playlists — breaks some live CDNs.
  if (!looksPlaylist && req.headers.range) {
    headers.Range = req.headers.range;
  }
  if (req.headers['if-range'] && headers.Range) {
    headers['If-Range'] = req.headers['if-range'];
  }

  const ctrl = new AbortController();
  req.on('close', () => ctrl.abort());

  const upstreamRes = await fetch(upstreamUrl, {
    method: 'GET',
    redirect: 'follow',
    headers,
    signal: ctrl.signal
  });

  const finalUrl = upstreamRes.url || upstreamUrl;
  authorizeMediaHost(finalUrl);

  const ct = upstreamRes.headers.get('content-type') || 'application/octet-stream';
  const isPlaylist =
    rewriteHls ||
    /mpegurl|m3u8/i.test(ct) ||
    /\.m3u8(\?|$)/i.test(String(upstreamUrl)) ||
    /\.m3u8(\?|$)/i.test(String(finalUrl));

  if (isPlaylist) {
    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    let text = buf.toString('utf8');
    if (/^#EXTM3U/im.test(text)) {
      text = rewriteHlsPlaylist(text, finalUrl);
      res.status(200);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(text);
    }
    // Not a playlist body (HTML error page, etc.)
    res.status(upstreamRes.status === 200 ? 502 : upstreamRes.status);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(
      `Upstream n’a pas renvoyé de playlist HLS (ct=${ct}, bytes=${buf.length}).`
    );
  }

  res.status(upstreamRes.status);
  copyHopHeaders(upstreamRes, res, {
    'Accept-Ranges': upstreamRes.headers.get('accept-ranges') || 'bytes',
    'Access-Control-Allow-Origin': '*'
  });

  if (!upstreamRes.body) {
    return res.end();
  }

  const nodeStream = Readable.fromWeb(upstreamRes.body);
  nodeStream.on('error', () => {
    if (!res.headersSent) res.status(502);
    res.end();
  });
  nodeStream.pipe(res);
}

/**
 * Diagnose Xtream live HLS without logging credentials.
 */
import { loadState, getXtreamSecret } from '../lib/session.js';
import { buildMediaUrl } from '../lib/xtreamClient.js';
import { sniffMedia } from '../lib/mediaProxy.js';

const state = loadState();
const src = state.sources.find((s) => s.kind === 'XTREAM' && s.enabled);
if (!src) {
  console.error('No Xtream source');
  process.exit(1);
}
const creds = getXtreamSecret(src.id);
const live = state.catalog.titles.find(
  (t) =>
    t.type === 'LIVE' &&
    /DAZN 1\b/i.test(t.canonicalTitle || '') &&
    !String(t.canonicalTitle).includes('#')
);
const streamId =
  live?.variants?.[0]?.providerStreamId ||
  String(live?.variants?.[0]?.id || '').split('::').pop();
console.log(
  'sourceHost',
  new URL(src.endpoint).host,
  'title',
  live?.canonicalTitle,
  'streamId',
  streamId,
  'allowPrivate',
  !!src.allowPrivateLan
);

function redact(url) {
  return String(url)
    .replaceAll(creds.username, 'USER')
    .replaceAll(creds.password, 'PASS')
    .replaceAll(encodeURIComponent(creds.username), 'USER')
    .replaceAll(encodeURIComponent(creds.password), 'PASS');
}

async function tryUrl(label, url, { range = false } = {}) {
  const headers = {
    'User-Agent': 'LKS-TV-Preview/0.4',
    Accept: '*/*'
  };
  if (range) headers.Range = 'bytes=0-65535';
  try {
    const r = await fetch(url, { redirect: 'follow', headers });
    const buf = Buffer.from(await r.arrayBuffer());
    const sniff = sniffMedia(buf);
    let finalHost = '?';
    try {
      finalHost = new URL(r.url).host;
    } catch {
      /* ignore */
    }
    console.log(
      label,
      'status',
      r.status,
      'finalHost',
      finalHost,
      'ct',
      r.headers.get('content-type'),
      'bytes',
      buf.length,
      'sniff',
      sniff.container || sniff.reason,
      'head',
      buf.slice(0, 70).toString('utf8').replace(/\n/g, '|')
    );
    return { ok: r.ok, buf, ct: r.headers.get('content-type'), finalUrl: r.url };
  } catch (e) {
    console.log(label, 'ERR', e.name, e.message);
    return null;
  }
}

const base = String(src.endpoint).replace(/\/$/, '');
const u = creds.username;
const p = creds.password;
const variants = [
  ['buildMediaUrl-m3u8', buildMediaUrl(src.endpoint, creds, 'live', streamId, 'm3u8')],
  ['raw-m3u8', `${base}/live/${u}/${p}/${streamId}.m3u8`],
  ['raw-ts', `${base}/live/${u}/${p}/${streamId}.ts`],
  ['raw-noext', `${base}/live/${u}/${p}/${streamId}`]
];

for (const [lab, url] of variants) {
  console.log('URL', lab, redact(url));
  await tryUrl(lab, url, { range: false });
  await tryUrl(lab + '+Range', url, { range: true });
}

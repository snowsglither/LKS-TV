/**
 * HTTP regression TASK-006 — Live HLS through proxy must rewrite CDN hosts.
 * Tries several channels until a working HLS playlist is found.
 */
import assert from 'assert';

const BASE = process.env.LKS_PREVIEW_URL || 'http://127.0.0.1:3000';

async function j(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, text: text.slice(0, 240), json };
}

const state = await j('/api/state');
assert.equal(state.status, 200, 'state');

const groups = (state.json.live?.groups || []).filter(
  (g) => g.id !== '__all__' && g.id !== '__favorites__' && (g.count || 0) > 3
);
assert.ok(groups.length, 'need live groups (configure TV groups first)');

const candidates = [];
for (const g of groups.slice(0, 12)) {
  const page = await j('/api/live/channels', { groupId: g.id, offset: 0, limit: 25 });
  const items = (page.json?.live?.channels?.items || []).filter(
    (c) => c.streamId && c.title && !String(c.title).includes('#')
  );
  for (const c of items) candidates.push(c);
}
assert.ok(candidates.length, 'no live channel');

// Prefer known-good naming from diagnostic
candidates.sort((a, b) => {
  const score = (t) =>
    (/FR.*DAZN 1/i.test(t) ? 0 : /DAZN 1/i.test(t) ? 1 : /FHD/i.test(t) ? 2 : 3);
  return score(a.title) - score(b.title);
});

let ok = null;
for (const channel of candidates.slice(0, 20)) {
  const open = await j('/api/player/open', {
    streamId: channel.streamId,
    fromLive: 1,
    channelId: channel.id
  });
  if (open.status !== 200 || open.json?.player?.mode !== 'hls') continue;
  const pl = open.json.player;
  const man = await fetch(`${BASE}${pl.playUrl}`);
  const body = await man.text();
  console.log(
    'try',
    channel.title.slice(0, 40),
    'probe',
    pl.diagnostic?.httpStatus,
    pl.diagnostic?.finalHost,
    'manifest',
    man.status,
    body.slice(0, 40).replace(/\n/g, '|')
  );
  if (man.status === 200 && /^#EXTM3U/im.test(body) && body.includes('/api/media/direct?u=')) {
    ok = { channel, pl, body };
    break;
  }
}

assert.ok(ok, 'no working live HLS playlist via proxy among candidates');
console.log('OK channel', ok.channel.title, 'finalHost', ok.pl.diagnostic?.finalHost);

const uris = ok.body
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
assert.ok(uris.length, 'has media URIs');
const first = uris[0].startsWith('/') ? uris[0] : `/${uris[0]}`;
const seg = await fetch(`${BASE}${first}`);
const segBuf = Buffer.from(await seg.arrayBuffer());
console.log(
  'firstURI status',
  seg.status,
  'ct',
  seg.headers.get('content-type'),
  'bytes',
  segBuf.length
);
assert.ok(seg.status === 200 || seg.status === 206, `segment/child HTTP ${seg.status}`);
assert.notEqual(seg.status, 403, 'CDN host must be authorized');

if (/^#EXTM3U/im.test(segBuf.toString('utf8').slice(0, 12))) {
  const child = segBuf.toString('utf8');
  assert.ok(child.includes('/api/media/direct?u='), 'child playlist rewritten');
  const childUris = child
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  const u2 = childUris[0];
  assert.ok(u2, 'child has segments');
  const seg2 = await fetch(`${BASE}${u2.startsWith('/') ? u2 : `/${u2}`}`);
  const b2 = Buffer.from(await seg2.arrayBuffer());
  console.log('segment', seg2.status, b2.length, 'mpegts', b2[0] === 0x47);
  assert.ok(seg2.status === 200 || seg2.status === 206);
  assert.notEqual(seg2.status, 403);
}

await j('/api/player/close', {});
console.log('http-live-hls: all passed');

import assert from 'assert';
import {
  rewriteHlsPlaylist,
  authorizeMediaHost,
  isMediaHostAllowed,
  clearMediaHostAllowlist
} from '../lib/mediaProxy.js';

clearMediaHostAllowlist();

const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
chunklist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000
https://cdn.example.test/hi/index.m3u8
`;

const rewritten = rewriteHlsPlaylist(master, 'http://panel.example.test/live/u/p/1.m3u8');
assert.ok(rewritten.includes('/api/media/direct?u='));
assert.ok(rewritten.includes(encodeURIComponent('http://panel.example.test/live/u/p/chunklist.m3u8')));
assert.ok(rewritten.includes(encodeURIComponent('https://cdn.example.test/hi/index.m3u8')));
assert.ok(isMediaHostAllowed('cdn.example.test'));
assert.ok(isMediaHostAllowed('panel.example.test'));

const media = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="keys/1.key"
#EXTINF:6.0,
seg0.ts
#EXTINF:6.0,
/abs/seg1.ts
`;
const mediaOut = rewriteHlsPlaylist(media, 'http://185.1.2.3/live/stream/index.m3u8');
assert.ok(mediaOut.includes(encodeURIComponent('http://185.1.2.3/live/stream/keys/1.key')));
assert.ok(mediaOut.includes(encodeURIComponent('http://185.1.2.3/live/stream/seg0.ts')));
assert.ok(mediaOut.includes(encodeURIComponent('http://185.1.2.3/abs/seg1.ts')));
assert.ok(isMediaHostAllowed('185.1.2.3'));

authorizeMediaHost('http://line.dino.ws/');
assert.ok(isMediaHostAllowed('line.dino.ws'));

console.log('smoke-hls-rewrite: all passed');

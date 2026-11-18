/**
 * Local smoke tests for TASK-004.5 (no real provider credentials).
 */
import assert from 'assert';
import { assertSafeHttpUrl } from '../lib/urlGuard.js';
import { parseM3u, presentRows } from '../lib/catalog.js';
import { buildDemoShowcaseCatalog } from '../lib/demoCatalog.js';
import { parseOpaquePlaybackRef, opaquePlaybackRef } from '../lib/xtreamClient.js';
import { appendAll } from '../lib/arrayUtil.js';
import { mergeTitleMaps } from '../lib/syncEngine.js';
import {
  normalizeSearchText,
  scoreTitle,
  buildSearchIndex,
  searchCatalog
} from '../lib/searchEngine.js';
import { listLiveGroups, listLiveChannels } from '../lib/liveCatalog.js';
import { versionLabel, cleanEpisodeTitle } from '../lib/displayMeta.js';
import { sniffMedia } from '../lib/mediaProxy.js';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, e.message);
  }
}

test('urlGuard blocks private IP by default', () => {
  assert.throws(() => assertSafeHttpUrl('http://192.168.1.10/x'));
  assert.throws(() => assertSafeHttpUrl('http://127.0.0.1/x'));
});

test('urlGuard allows public https', () => {
  const u = assertSafeHttpUrl('https://example.com/playlist.m3u');
  assert.equal(u.hostname, 'example.com');
});

test('urlGuard can allow private when opted in', () => {
  assertSafeHttpUrl('http://10.0.0.5:8080', { allowPrivate: true });
});

test('opaque xtream refs round-trip', () => {
  const ref = opaquePlaybackRef('src1', 'vod', '99', 'mkv');
  const p = parseOpaquePlaybackRef(ref);
  assert.deepEqual(p, { sourceId: 'src1', kind: 'vod', streamId: '99', ext: 'mkv' });
});

test('M3U uses tvg-logo and does not invent DEMO art for random IPTV', () => {
  const text = `#EXTM3U
#EXTINF:-1 tvg-id="x1" tvg-logo="https://cdn.example.com/p.jpg" group-title="Films",Mon Film
http://cdn.example.com/stream.m3u8
#EXTINF:-1 tvg-id="c1" group-title="Live TV",News 24
http://cdn.example.com/live.m3u8
`;
  const cat = parseM3u(text, 'm3u_real_provider');
  const film = cat.titles.find((t) => t.type === 'FILM');
  const live = cat.titles.find((t) => t.type === 'LIVE');
  assert.ok(film);
  assert.equal(film.posterPath, 'https://cdn.example.com/p.jpg');
  assert.ok(!String(film.posterPath || '').includes('demo-art'));
  assert.ok(live);
  assert.equal(live.type, 'LIVE');
});

test('profile hidden groups filter rows', () => {
  const text = `#EXTM3U
#EXTINF:-1 group-title="Kids",Kid Movie
http://cdn.example.com/a.mp4
#EXTINF:-1 group-title="Adult",Dark Movie
http://cdn.example.com/b.mp4
`;
  const cat = parseM3u(text, 'm3u_x');
  const kids = cat.groups.find((g) => g.name === 'Kids');
  const adult = cat.groups.find((g) => g.name === 'Adult');
  const prefs = {
    hiddenGroupIds: [],
    preferredLanguage: 'VF',
    progressByItemId: {},
    dismissedContinueIds: [],
    hiddenItemIds: [],
    visibleRowIds: ['LIBRARY_SYNCED'],
    sectionGroupPrefs: {
      films: { configured: true, selectedGroupIds: [adult.id] },
      series: { configured: false, selectedGroupIds: [] },
      tv: { configured: false, selectedGroupIds: [] }
    }
  };
  const rows = presentRows(cat, 'FILM', prefs);
  const all = (rows.rows || []).flatMap((r) => r.items);
  assert.ok(!all.some((i) => i.title === 'Kid Movie'));
  assert.ok(all.some((i) => i.title === 'Dark Movie'));
});

test('DEMO_SHOWCASE catalog is labeled and dense', () => {
  const cat = buildDemoShowcaseCatalog('demo_showcase_ui');
  assert.ok(cat.demoShowcase);
  assert.ok(cat.filmCount + cat.seriesCount >= 15);
  assert.ok(cat.titles.every((t) => String(t.id).includes('demo')));
});

test('appendAll + mergeTitleMaps handle 20k without stack overflow', () => {
  const buf = [];
  const titles = [];
  for (let i = 0; i < 20_000; i++) {
    titles.push({
      id: `logical:t:${i}`,
      type: 'FILM',
      canonicalTitle: `T${i}`,
      matchKey: { type: 'SOURCE_LOCAL', value: `t:${i}` },
      variants: [],
      episodes: [],
      genres: []
    });
  }
  appendAll(buf, titles);
  assert.equal(buf.length, 20_000);
  assert.equal(mergeTitleMaps(buf).length, 20_000);
});

test('search normalize + ranking', () => {
  assert.equal(normalizeSearchText('Café NOIR'), 'cafe noir');
  assert.ok(scoreTitle('matrix', 'matrix') < scoreTitle('mat', 'matrix'));
  assert.ok(scoreTitle('mat', 'matrix') < scoreTitle('trix', 'matrix'));
});

test('sniffMedia detects HEVC vs AVC brands', () => {
  const hevc = Buffer.from('....ftypisomhev1hvc1mp42', 'latin1');
  const s = sniffMedia(hevc);
  assert.equal(s.videoCodec, 'hevc');
  assert.equal(s.browserLikely, 'no');
  const avc = Buffer.from('....ftypisomiso2avc1mp41mp4a', 'latin1');
  const a = sniffMedia(avc);
  assert.equal(a.videoCodec, 'avc');
  assert.ok(a.browserLikely === 'ok');
  const ts = Buffer.from([0x47, 0x00, 0x00, 0x00]);
  assert.equal(sniffMedia(ts).container, 'mpeg-ts');
});

test('version labels distinct when language unknown', () => {
  const a = versionLabel({ language: 'UNKNOWN', rawTitle: 'Cross 1080p', groupId: 'g' }, { index: 0, total: 2 });
  const b = versionLabel({ language: 'UNKNOWN', rawTitle: 'Cross 720p', groupId: 'g' }, { index: 1, total: 2 });
  assert.notEqual(a, b);
  assert.ok(!/Langue inconnue/.test(a));
});

test('clean episode title', () => {
  assert.equal(cleanEpisodeTitle('S01E01 - Pilote', 1, 1), 'Pilote');
});

test('live catalog paginates without dumping all channels', () => {
  const titles = [];
  const groups = [{ id: 'g1', name: 'FR', kind: 'LIVE', sourceId: 's' }];
  for (let i = 0; i < 500; i++) {
    titles.push({
      id: `live-${i}`,
      type: 'LIVE',
      canonicalTitle: `Chaine ${i}`,
      variants: [{ id: `v${i}`, groupId: 'g1', playbackUrl: 'http://x/' + i }],
      episodes: []
    });
  }
  const cat = { titles, groups, generatedAtEpochMs: 5_000_001 };
  const prefs = {
    sectionGroupPrefs: {
      tv: { configured: true, selectedGroupIds: ['g1'] },
      films: { configured: false, selectedGroupIds: [] },
      series: { configured: false, selectedGroupIds: [] }
    },
    hiddenGroupIds: [],
    hiddenItemIds: [],
    favoriteIds: []
  };
  const meta = listLiveGroups(cat, prefs);
  assert.equal(meta.totalChannels, 500);
  const page = listLiveChannels(cat, prefs, { groupId: 'g1', offset: 0, limit: 80 });
  assert.equal(page.items.length, 80);
  assert.equal(page.total, 500);
  assert.ok(page.hasMore);
});

test('search filters hidden groups and types', () => {
  const cat = {
    generatedAtEpochMs: 1,
    titles: [
      {
        id: 'a',
        type: 'FILM',
        canonicalTitle: 'Matrix',
        genres: [],
        variants: [{ id: 'a1', groupId: 'g-vod' }],
        episodes: []
      },
      {
        id: 'b',
        type: 'FILM',
        canonicalTitle: 'Matrix Kids',
        genres: [],
        variants: [{ id: 'b1', groupId: 'g-kids' }],
        episodes: []
      },
      {
        id: 'c',
        type: 'LIVE',
        canonicalTitle: 'News 24',
        genres: [],
        variants: [{ id: 'c1', groupId: 'g-live' }],
        episodes: []
      }
    ]
  };
  const index = buildSearchIndex(cat);
  const page = searchCatalog({
    index,
    query: 'matrix',
    filter: 'films',
    prefs: {
      hiddenGroupIds: [],
      hiddenItemIds: [],
      sectionGroupPrefs: {
        films: { configured: true, selectedGroupIds: ['g-vod'] },
        series: { configured: false, selectedGroupIds: [] },
        tv: { configured: false, selectedGroupIds: [] }
      }
    },
    offset: 0,
    limit: 20
  });
  assert.equal(page.total, 1);
  assert.equal(page.items[0].title, 'Matrix');
  const tv = searchCatalog({
    index,
    query: 'news',
    filter: 'tv',
    prefs: {
      hiddenGroupIds: [],
      hiddenItemIds: [],
      sectionGroupPrefs: {
        films: { configured: false, selectedGroupIds: [] },
        series: { configured: false, selectedGroupIds: [] },
        tv: { configured: true, selectedGroupIds: ['g-live'] }
      }
    }
  });
  assert.equal(tv.total, 1);
  assert.equal(tv.items[0].type, 'LIVE');
});

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke tests passed');

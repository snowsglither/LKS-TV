/**
 * Load tests: synthetic catalogs 10k / 50k / 100k must merge without stack overflow.
 */
import assert from 'assert';
import { appendAll, cloneTitleShallow } from '../lib/arrayUtil.js';
import { mergeTitleMaps, dedupeGroups, runSync } from '../lib/syncEngine.js';
import { buildSearchIndex, searchCatalog } from '../lib/searchEngine.js';

function makeTitles(n, sourceId = 'load') {
  const titles = new Array(n);
  for (let i = 0; i < n; i++) {
    titles[i] = {
      id: `logical:${sourceId}::vod:${i}`,
      type: 'FILM',
      canonicalTitle: `Title ${i}`,
      year: 2000 + (i % 25),
      synopsis: '',
      genres: ['Action'],
      durationMinutes: 100,
      posterPath: i % 3 === 0 ? `https://cdn.example.com/${i}.jpg` : null,
      backdropPath: null,
      matchKey: { type: 'SOURCE_LOCAL', value: `${sourceId}::vod:${i}` },
      variants: [
        {
          id: `${sourceId}::vod::${i}`,
          sourceId,
          providerStreamId: String(i),
          playbackUrl: `http://cdn.example.com/${i}.mp4`,
          groupId: `${sourceId}::cat${i % 50}`,
          language: 'VF',
          confidence: 'KNOWN',
          rawTitle: `Title ${i}`
        }
      ],
      episodes: [],
      singleSourceOnly: true
    };
  }
  return titles;
}

function makeGroups(n, sourceId = 'load') {
  const groups = [];
  for (let i = 0; i < n; i++) {
    groups.push({
      id: `${sourceId}::cat${i}`,
      sourceId,
      providerGroupId: `cat${i}`,
      name: `Category ${i}`,
      kind: 'VOD'
    });
  }
  return groups;
}

let failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r
        .then(() => console.log('OK', name, `${Date.now() - t0}ms`))
        .catch((e) => {
          failed += 1;
          console.error('FAIL', name, e.message);
        });
    }
    console.log('OK', name, `${Date.now() - t0}ms`);
  } catch (e) {
    failed += 1;
    console.error('FAIL', name, e.message);
  }
}

await test('appendAll 100k no stack overflow', () => {
  const a = [];
  const b = makeTitles(100_000);
  appendAll(a, b);
  assert.equal(a.length, 100_000);
});

await test('push spread 100k MUST throw or be unsafe — document baseline', () => {
  const a = [];
  const b = new Array(100_000).fill(1);
  let threw = false;
  try {
    a.push(...b);
  } catch (e) {
    threw = /stack|Maximum/i.test(e.message);
  }
  // On some engines it may succeed; on Node it typically throws. Either way appendAll is required.
  assert.ok(threw || a.length === 100_000);
  if (!threw) console.log('  (note: this Node build accepted push(...100k); appendAll still mandatory)');
});

await test('mergeTitleMaps 10k', () => {
  const merged = mergeTitleMaps(makeTitles(10_000));
  assert.equal(merged.length, 10_000);
  assert.ok(merged[0].variants.length === 1);
});

await test('mergeTitleMaps 50k', () => {
  const merged = mergeTitleMaps(makeTitles(50_000));
  assert.equal(merged.length, 50_000);
});

await test('mergeTitleMaps 100k', () => {
  const merged = mergeTitleMaps(makeTitles(100_000));
  assert.equal(merged.length, 100_000);
  const c = cloneTitleShallow(merged[0]);
  assert.equal(c.canonicalTitle, merged[0].canonicalTitle);
});

await test('dedupeGroups keeps stable ids', () => {
  const g = makeGroups(607, 'xt');
  appendAll(g, makeGroups(607, 'xt')); // duplicates
  const d = dedupeGroups(g);
  assert.equal(d.length, 607);
});

await test('runSync DEMO then synthetic via M3U_FILE path size', async () => {
  // Build a synthetic M3U-like catalog through merge path only (no disk)
  const groups = makeGroups(100);
  const titles = makeTitles(10_000, 'syn');
  const allG = [];
  const allT = [];
  appendAll(allG, groups);
  appendAll(allT, titles);
  const catalog = {
    groups: dedupeGroups(allG),
    titles: mergeTitleMaps(allT),
    generatedAtEpochMs: Date.now()
  };
  assert.equal(catalog.titles.length, 10_000);
  assert.equal(catalog.groups.length, 100);
});

await test('runSync empty sources', async () => {
  const result = await runSync({ sources: [], catalog: { groups: [], titles: [] } });
  assert.equal(result.message, 'Aucune source activée.');
});

function searchLoad(n) {
  const titles = makeTitles(n);
  titles[Math.min(42, n - 1)].canonicalTitle = 'Café Étoile Unique';
  const catalog = {
    generatedAtEpochMs: Date.now(),
    titles,
    groups: makeGroups(50)
  };
  const t0 = Date.now();
  const index = buildSearchIndex(catalog);
  const indexMs = Date.now() - t0;
  const t1 = Date.now();
  const page = searchCatalog({
    index,
    query: 'cafe etoile',
    filter: 'all',
    prefs: { hiddenGroupIds: [], hiddenItemIds: [] },
    limit: 48
  });
  const searchMs = Date.now() - t1;
  assert.equal(index.size, n);
  assert.ok(page.total >= 1, `expected hit in ${n}`);
  assert.ok(indexMs < 20_000, `index ${n}: ${indexMs}ms`);
  assert.ok(searchMs < 5_000, `search ${n}: ${searchMs}ms`);
  return { indexMs, searchMs, total: page.total };
}

await test('search index+query 10k', () => {
  const r = searchLoad(10_000);
  console.log(`  index ${r.indexMs}ms search ${r.searchMs}ms hits ${r.total}`);
});

await test('search index+query 50k', () => {
  const r = searchLoad(50_000);
  console.log(`  index ${r.indexMs}ms search ${r.searchMs}ms hits ${r.total}`);
});

await test('search index+query 100k', () => {
  const r = searchLoad(100_000);
  console.log(`  index ${r.indexMs}ms search ${r.searchMs}ms hits ${r.total}`);
});

if (failed) {
  console.error(`\n${failed} load test(s) failed`);
  process.exit(1);
}
console.log('\nAll load tests passed');

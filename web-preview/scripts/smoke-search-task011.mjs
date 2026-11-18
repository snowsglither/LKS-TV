#!/usr/bin/env node
/**
 * TASK-011 — intelligent multilingual search regression.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSearchText,
  compactSearchText,
  scoreTitle,
  buildSearchIndex,
  searchCatalog,
  SCORE
} from '../lib/searchEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

assert.equal(normalizeSearchText("Tyler Perry's Finding Joy"), 'tyler perry finding joy');
assert.equal(compactSearchText('spider-man'), compactSearchText('spiderman'));
assert.equal(compactSearchText('Spider Man'), 'spiderman');

assert.equal(scoreTitle('supernatural', 'supernatural'), SCORE.EXACT);
assert.equal(
  scoreTitle('supernatural', normalizeSearchText('CAFR - SUPER ECRAN 1')),
  SCORE.REJECT
);
assert.equal(
  scoreTitle('spiderman', normalizeSearchText("Tyler Perry's Finding Joy (2025)")),
  SCORE.REJECT
);
assert.ok(
  scoreTitle(
    normalizeSearchText('spiderman'),
    normalizeSearchText('Spider-Man'),
    '',
    '',
    compactSearchText('Spider-Man')
  ) <= SCORE.EXACT_COMPACT
);
assert.ok(
  scoreTitle(
    normalizeSearchText('money heist'),
    normalizeSearchText('FR - La Casa de Papel'),
    normalizeSearchText('money heist la casa de papel')
  ) <= SCORE.EXACT_ALIAS
);
assert.ok(
  scoreTitle(
    normalizeSearchText('le chacal'),
    normalizeSearchText('The Jackal'),
    normalizeSearchText('le chacal the jackal')
  ) <= SCORE.EXACT_ALIAS
);
assert.ok(scoreTitle('matrx', 'matrix revolutions') === SCORE.FUZZY);
assert.equal(scoreTitle('zzzznotitle', 'matrix'), SCORE.REJECT);

const fixture = {
  generatedAtEpochMs: 1,
  titles: [
    {
      id: 's1',
      type: 'SERIES',
      canonicalTitle: 'FR - Supernatural',
      year: 2005,
      matchKey: { type: 'PROVIDER_EXTERNAL', value: 'tmdb:1412' },
      variants: [{ id: 'v1', groupId: 'g::series' }],
      episodes: [],
      genres: ['Drama']
    },
    {
      id: 'live1',
      type: 'LIVE',
      canonicalTitle: 'CAFR - SUPER ECRAN 1',
      year: 0,
      matchKey: { type: 'SOURCE_LOCAL', value: 'live1' },
      variants: [{ id: 'lv', groupId: 'g::live' }],
      episodes: [],
      genres: []
    },
    {
      id: 'f1',
      type: 'FILM',
      canonicalTitle: "Tyler Perry's Finding Joy (2025)",
      year: 2025,
      matchKey: { type: 'SOURCE_LOCAL', value: 'f1' },
      variants: [{ id: 'fv', groupId: 'g::films' }],
      episodes: [],
      genres: []
    },
    {
      id: 'sp1',
      type: 'FILM',
      canonicalTitle: 'FR - Spider-Man (2002)',
      year: 2002,
      matchKey: { type: 'TITLE_YEAR', value: 'film:spiderman:2002' },
      variants: [{ id: 'spv', groupId: 'g::films' }],
      episodes: [],
      genres: []
    },
    {
      id: 'sp2',
      type: 'FILM',
      canonicalTitle: 'EN - Spider-Man (2002)',
      year: 2002,
      matchKey: { type: 'TITLE_YEAR', value: 'film:spiderman:2002' },
      variants: [{ id: 'spv2', groupId: 'g::films' }],
      episodes: [],
      genres: []
    },
    {
      id: 'casa',
      type: 'SERIES',
      canonicalTitle: 'ES - La Casa de Papel',
      year: 2017,
      matchKey: { type: 'SOURCE_LOCAL', value: 'casa' },
      variants: [{ id: 'cv', groupId: 'g::series' }],
      episodes: [],
      genres: []
    },
    {
      id: 'tvexact',
      type: 'LIVE',
      canonicalTitle: 'BFM TV',
      year: 0,
      matchKey: { type: 'SOURCE_LOCAL', value: 'tvexact' },
      variants: [{ id: 'tvv', groupId: 'g::live' }],
      episodes: [],
      genres: []
    }
  ],
  groups: [
    { id: 'g::films', kind: 'VOD' },
    { id: 'g::series', kind: 'SERIES' },
    { id: 'g::live', kind: 'LIVE' }
  ]
};

const prefs = {
  sectionGroupPrefs: {
    films: { configured: true, selectedGroupIds: ['g::films'] },
    series: { configured: true, selectedGroupIds: ['g::series'] },
    tv: { configured: true, selectedGroupIds: ['g::live'] }
  }
};

const index = buildSearchIndex(fixture);

const supernatural = searchCatalog({ index, query: 'supernatural', filter: 'all', prefs });
assert.equal(supernatural.total, 1, `supernatural total=${supernatural.total}`);
assert.match(supernatural.items[0].title, /supernatural/i);
assert.ok(!supernatural.items.some((i) => /ecran/i.test(i.title)));

const spiderman = searchCatalog({ index, query: 'spiderman', filter: 'all', prefs });
assert.ok(spiderman.total >= 1);
assert.ok(spiderman.items.every((i) => /spider/i.test(i.title)));
assert.ok(!spiderman.items.some((i) => /perry/i.test(i.title)));
// dedupe FR/EN Spider-Man 2002
assert.equal(
  spiderman.items.filter((i) => /spider-man \(2002\)/i.test(i.title)).length,
  1
);

const spiderHyphen = searchCatalog({ index, query: 'spider-man', filter: 'all', prefs });
assert.ok(spiderHyphen.total >= 1);

const money = searchCatalog({ index, query: 'money heist', filter: 'all', prefs });
assert.ok(money.total >= 1);
assert.match(money.items[0].title, /casa de papel/i);

const empty = searchCatalog({ index, query: 'zzzxqwy123', filter: 'all', prefs });
assert.equal(empty.total, 0);

const tv = searchCatalog({ index, query: 'bfm tv', filter: 'tv', prefs });
assert.equal(tv.total, 1);
assert.equal(tv.items[0].type, 'LIVE');

// Live catalog before/after if present
const statePath = path.join(__dirname, '..', '.data', 'preview-state.json');
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const p =
    state.prefsByProfile?.[state.activeProfileId] ||
    Object.values(state.prefsByProfile || {})[0] ||
    prefs;
  // Ensure sections allow search
  for (const s of ['films', 'series', 'tv']) {
    p.sectionGroupPrefs = p.sectionGroupPrefs || {};
    if (!p.sectionGroupPrefs[s]?.configured) {
      p.sectionGroupPrefs[s] = {
        configured: true,
        selectedGroupIds: (state.catalog.groups || []).map((g) => g.id)
      };
    }
  }
  const liveIndex = buildSearchIndex(state.catalog);
  const r = searchCatalog({
    index: liveIndex,
    query: 'supernatural',
    filter: 'all',
    prefs: p,
    limit: 20
  });
  console.log('live supernatural', { total: r.total, tookMs: r.tookMs, top: r.items.slice(0, 5).map((i) => i.title) });
  assert.ok(r.total < 200, `live supernatural still too loose: ${r.total}`);
  assert.ok(
    !r.items.some((i) => /super\s*ecran/i.test(i.title)),
    'SUPER ECRAN must not appear for supernatural'
  );
  assert.ok(
    r.items.some((i) => /supernatural/i.test(i.title)),
    'expected at least one Supernatural title'
  );
  const r2 = searchCatalog({ index: liveIndex, query: 'spiderman', filter: 'all', prefs: p, limit: 20 });
  console.log('live spiderman', { total: r2.total, tookMs: r2.tookMs, top: r2.items.slice(0, 5).map((i) => i.title) });
  assert.ok(r2.total < 500, `live spiderman still too loose: ${r2.total}`);
}

console.log('smoke-search-task011: OK');

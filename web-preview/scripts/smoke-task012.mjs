#!/usr/bin/env node
/**
 * TASK-012 — logical work identity, unified search, edition switch helpers.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSearchIndex, searchCatalog } from '../lib/searchEngine.js';
import {
  assignLogicalWorkIds,
  ensureWorkIds,
  findEpisodeVersionForLanguage,
  mergeLogicalEpisodes,
  workDedupeKey,
  workIdOf
} from '../lib/workIdentity.js';
import { buildContinueWatching } from '../lib/continueWatching.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ep(id, s, e, streamId, lang) {
  return {
    id,
    seasonNumber: s,
    episodeNumber: e,
    title: `E${e}`,
    synopsis: '',
    versions: [
      {
        stream: {
          id: streamId,
          languageTag: lang,
          language: lang,
          confidence: 'KNOWN',
          groupId: 'g::series',
          playbackUrl: `opaque://${streamId}`
        }
      }
    ]
  };
}

const fixture = {
  generatedAtEpochMs: 1,
  titles: [
    {
      id: 'jackal-en',
      type: 'SERIES',
      canonicalTitle: 'EN - The Day of the Jackal (2024)',
      year: 2024,
      matchKey: { type: 'SOURCE_LOCAL', value: 'jackal-en' },
      variants: [],
      episodes: [
        ep('en-s1e1', 1, 1, 'en-s1e1-st', 'en'),
        ep('en-s1e3', 1, 3, 'en-s1e3-st', 'en')
      ],
      genres: ['Drama']
    },
    {
      id: 'jackal-fr',
      type: 'SERIES',
      canonicalTitle: 'FR - Le Chacal (2024)',
      year: 2024,
      matchKey: { type: 'SOURCE_LOCAL', value: 'jackal-fr' },
      variants: [],
      episodes: [
        ep('fr-s1e1', 1, 1, 'fr-s1e1-st', 'fr'),
        ep('fr-s1e3', 1, 3, 'fr-s1e3-st', 'fr')
      ],
      genres: ['Drama']
    },
    {
      id: 'other-jackal',
      type: 'FILM',
      canonicalTitle: 'The Jackal (1997)',
      year: 1997,
      matchKey: { type: 'SOURCE_LOCAL', value: 'other-jackal' },
      variants: [{ id: 'oj', groupId: 'g::films', languageTag: 'en' }],
      episodes: [],
      genres: []
    },
    {
      id: 'film-vf',
      type: 'FILM',
      canonicalTitle: 'FR - Matrix (1999)',
      year: 1999,
      matchKey: { type: 'TITLE_YEAR', value: 'film:matrix:1999' },
      variants: [{ id: 'mx-fr', groupId: 'g::films', languageTag: 'fr' }],
      episodes: [],
      genres: []
    },
    {
      id: 'film-vo',
      type: 'FILM',
      canonicalTitle: 'EN - The Matrix (1999)',
      year: 1999,
      matchKey: { type: 'TITLE_YEAR', value: 'film:matrix:1999' },
      variants: [{ id: 'mx-en', groupId: 'g::films', languageTag: 'en' }],
      episodes: [],
      genres: []
    }
  ],
  groups: [
    { id: 'g::series', kind: 'SERIES' },
    { id: 'g::films', kind: 'VOD' }
  ]
};

assignLogicalWorkIds(fixture);
assert.equal(
  workIdOf(fixture.titles[0]),
  workIdOf(fixture.titles[1]),
  'jackal EN/FR must share logicalWorkId via official aliases + year'
);
assert.notEqual(
  workIdOf(fixture.titles[0]),
  workIdOf(fixture.titles[2]),
  '1997 Jackal film must not merge with 2024 series'
);
assert.equal(
  workDedupeKey(fixture.titles[3]),
  workDedupeKey(fixture.titles[4]),
  'Matrix TITLE_YEAR editions share dedupe key'
);

const logical = mergeLogicalEpisodes(
  [fixture.titles[0], fixture.titles[1]],
  { preferredEpisodeLanguage: 'fr' }
);
assert.equal(logical.length, 2);
const e3 = logical.find((e) => e.seasonNumber === 1 && e.episodeNumber === 3);
assert.ok(e3);
assert.equal(e3.versions.length, 2);
const frVer = findEpisodeVersionForLanguage(logical, 1, 3, 'fr');
const enVer = findEpisodeVersionForLanguage(logical, 1, 3, 'en');
assert.equal(frVer.stream.id, 'fr-s1e3-st');
assert.equal(enVer.stream.id, 'en-s1e3-st');
assert.equal(findEpisodeVersionForLanguage(logical, 1, 3, 'de'), null, 'missing language → null');

const prefs = {
  sectionGroupPrefs: {
    films: { configured: true, selectedGroupIds: ['g::films'] },
    series: { configured: true, selectedGroupIds: ['g::series'] },
    tv: { configured: true, selectedGroupIds: [] }
  },
  progressByEpisodeId: { 'en-s1e3': 0.4, 'fr-s1e3': 0.4 },
  progressByItemId: { 'jackal-en': 0.4, 'jackal-fr': 0.4 },
  continueActivityById: { 'jackal-en': 100, 'jackal-fr': 90 },
  continueResumeByTitleId: {},
  dismissedContinueIds: [],
  preferredLanguage: 'edition:vf',
  continueCompletedThreshold: 0.92
};

const index = buildSearchIndex(fixture);
const jackal = searchCatalog({ index, query: 'jackal', filter: 'series', prefs });
const chacal = searchCatalog({ index, query: 'chacal', filter: 'series', prefs });
assert.ok(jackal.total >= 1);
assert.ok(chacal.total >= 1);
const jackalSeries = jackal.items.filter((i) => /jackal|chacal/i.test(i.title));
const chacalSeries = chacal.items.filter((i) => /jackal|chacal/i.test(i.title));
assert.equal(jackalSeries.length, 1, `jackal series cards=${jackalSeries.length}`);
assert.equal(chacalSeries.length, 1, `chacal series cards=${chacalSeries.length}`);
assert.equal(
  jackalSeries[0].id === chacalSeries[0].id ||
    workDedupeKey(fixture.titles.find((t) => t.id === jackalSeries[0].id)) ===
      workDedupeKey(fixture.titles.find((t) => t.id === chacalSeries[0].id)),
  true,
  'jackal and chacal must resolve to the same logical work card'
);

ensureWorkIds(fixture);
const cont = buildContinueWatching(
  fixture.titles.filter((t) => t.type === 'SERIES'),
  prefs,
  (t, frac) => ({
    id: t.id,
    title: t.canonicalTitle,
    type: t.type,
    logicalWorkId: workIdOf(t),
    progressFraction: frac,
    selectedVersionId: null
  }),
  24
);
assert.equal(
  cont.filter((c) => /jackal|chacal/i.test(c.title)).length,
  1,
  'Continuer must show one card for multilingual jackal editions'
);

// Live catalog sanity if present
const statePath = path.join(__dirname, '..', '.data', 'preview-state.json');
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const p =
    state.prefsByProfile?.[state.activeProfileId] ||
    Object.values(state.prefsByProfile || {})[0] ||
    prefs;
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
  const a = searchCatalog({ index: liveIndex, query: 'jackal', filter: 'series', prefs: p, limit: 20 });
  const b = searchCatalog({ index: liveIndex, query: 'chacal', filter: 'series', prefs: p, limit: 20 });
  console.log('live jackal', {
    total: a.total,
    top: a.items.slice(0, 5).map((i) => i.title)
  });
  console.log('live chacal', {
    total: b.total,
    top: b.items.slice(0, 5).map((i) => i.title)
  });
  if (a.total > 0 && b.total > 0) {
    const wa = a.items[0];
    const wb = b.items[0];
    // When both hit Day of the Jackal / Chacal, they should share work id after assign
    ensureWorkIds(state.catalog);
    const ta = (state.catalog.titles || []).find((t) => t.id === wa.id);
    const tb = (state.catalog.titles || []).find((t) => t.id === wb.id);
    if (ta && tb && /jackal|chacal/i.test(ta.canonicalTitle) && /jackal|chacal/i.test(tb.canonicalTitle)) {
      assert.equal(
        workIdOf(ta),
        workIdOf(tb),
        'live jackal/chacal top hits must share logicalWorkId when both are the 2024 series'
      );
    }
  }
}

console.log('smoke-task012: OK');

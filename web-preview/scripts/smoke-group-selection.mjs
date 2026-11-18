import assert from 'assert';
import {
  defaultSectionGroupPrefs,
  ensureSectionGroupPrefs,
  listSelectableGroups,
  pruneSelectedGroups,
  sectionNeedsSetup
} from '../lib/groupSelection.js';
import { presentRows } from '../lib/catalog.js';
import { searchCatalog, buildSearchIndex } from '../lib/searchEngine.js';
import { listLiveGroupsFromIndex, getLiveIndex } from '../lib/liveIndex.js';

function catalogFixture() {
  return {
    generatedAtEpochMs: 1,
    groups: [
      { id: 's1::live-a', name: 'Sports', kind: 'LIVE', sourceId: 's1' },
      { id: 's1::live-b', name: 'News', kind: 'LIVE', sourceId: 's1' },
      { id: 's1::vod-a', name: 'Action', kind: 'VOD', sourceId: 's1' },
      { id: 's1::vod-b', name: 'Kids', kind: 'VOD', sourceId: 's1' },
      { id: 's1::ser-a', name: 'FR', kind: 'SERIES', sourceId: 's1' },
      { id: 's1::ser-b', name: 'Anime', kind: 'SERIES', sourceId: 's1' }
    ],
    titles: [
      {
        id: 'ch1',
        type: 'LIVE',
        canonicalTitle: 'Sport 1',
        year: 0,
        matchKey: { type: 'SOURCE_LOCAL', value: 'ch1' },
        singleSourceOnly: true,
        variants: [{ id: 'v1', groupId: 's1::live-a' }],
        episodes: []
      },
      {
        id: 'ch2',
        type: 'LIVE',
        canonicalTitle: 'News 1',
        year: 0,
        matchKey: { type: 'SOURCE_LOCAL', value: 'ch2' },
        singleSourceOnly: true,
        variants: [{ id: 'v2', groupId: 's1::live-b' }],
        episodes: []
      },
      {
        id: 'f1',
        type: 'FILM',
        canonicalTitle: 'Boom',
        year: 2024,
        matchKey: { type: 'SOURCE_LOCAL', value: 'f1' },
        singleSourceOnly: true,
        variants: [{ id: 'vf1', groupId: 's1::vod-a' }],
        episodes: []
      },
      {
        id: 'f2',
        type: 'FILM',
        canonicalTitle: 'Kids Film',
        year: 2022,
        matchKey: { type: 'SOURCE_LOCAL', value: 'f2' },
        singleSourceOnly: true,
        variants: [{ id: 'vf2', groupId: 's1::vod-b' }],
        episodes: []
      },
      {
        id: 'se1',
        type: 'SERIES',
        canonicalTitle: 'Serie FR',
        year: 2023,
        matchKey: { type: 'SOURCE_LOCAL', value: 'se1' },
        singleSourceOnly: true,
        variants: [{ id: 'vs1', groupId: 's1::ser-a' }],
        episodes: []
      },
      {
        id: 'se2',
        type: 'SERIES',
        canonicalTitle: 'Anime X',
        year: 2021,
        matchKey: { type: 'SOURCE_LOCAL', value: 'se2' },
        singleSourceOnly: true,
        variants: [{ id: 'vs2', groupId: 's1::ser-b' }],
        episodes: []
      }
    ]
  };
}

function test(name, fn) {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (e) {
    console.error(`FAIL — ${name}`);
    throw e;
  }
}

test('unconfigured section needs setup', () => {
  const cat = catalogFixture();
  const prefs = ensureSectionGroupPrefs({});
  assert.equal(sectionNeedsSetup(prefs, cat, 'series', true), true);
  assert.equal(sectionNeedsSetup(prefs, cat, 'films', true), true);
  assert.equal(sectionNeedsSetup(prefs, cat, 'tv', true), true);
  assert.equal(sectionNeedsSetup(prefs, cat, 'series', false), false);
});

test('presentRows empty until configured', () => {
  const cat = catalogFixture();
  const prefs = ensureSectionGroupPrefs({
    visibleRowIds: ['LIBRARY_SYNCED'],
    preferredLanguage: 'VF',
    progressByItemId: {},
    dismissedContinueIds: [],
    hiddenItemIds: [],
    hiddenGroupIds: []
  });
  const empty = presentRows(cat, 'FILM', prefs);
  assert.equal(empty.titleCount, 0);
  assert.equal(empty.sectionConfigured, false);

  prefs.sectionGroupPrefs.films = {
    configured: true,
    selectedGroupIds: ['s1::vod-a']
  };
  const rows = presentRows(cat, 'FILM', prefs);
  const titles = rows.rows.flatMap((r) => r.items).map((i) => i.title);
  assert.ok(titles.includes('Boom'));
  assert.ok(!titles.includes('Kids Film'));
  assert.equal(rows.sectionConfigured, true);
});

test('independent sections + prune keeps selection', () => {
  let prefs = ensureSectionGroupPrefs({});
  prefs.sectionGroupPrefs.series = {
    configured: true,
    selectedGroupIds: ['s1::ser-a', 's1::ser-b', 'gone']
  };
  prefs.sectionGroupPrefs.films = {
    configured: true,
    selectedGroupIds: ['s1::vod-b']
  };
  prefs = pruneSelectedGroups(prefs, catalogFixture());
  assert.deepEqual(prefs.sectionGroupPrefs.series.selectedGroupIds.sort(), [
    's1::ser-a',
    's1::ser-b'
  ]);
  assert.deepEqual(prefs.sectionGroupPrefs.films.selectedGroupIds, ['s1::vod-b']);
});

test('search respects allowlist', () => {
  const cat = catalogFixture();
  const index = buildSearchIndex(cat);
  const prefs = ensureSectionGroupPrefs({
    sectionGroupPrefs: {
      ...defaultSectionGroupPrefs(),
      films: { configured: true, selectedGroupIds: ['s1::vod-a'] },
      series: { configured: true, selectedGroupIds: ['s1::ser-b'] },
      tv: { configured: true, selectedGroupIds: ['s1::live-a'] }
    }
  });
  const filmHit = searchCatalog({ index, query: 'Kids', filter: 'films', prefs });
  assert.equal(filmHit.total, 0);
  const boom = searchCatalog({ index, query: 'Boom', filter: 'films', prefs });
  assert.equal(boom.total, 1);
  const anime = searchCatalog({ index, query: 'Anime', filter: 'series', prefs });
  assert.equal(anime.total, 1);
});

test('live groups only selected', () => {
  const cat = { ...catalogFixture(), generatedAtEpochMs: 9001 };
  const index = getLiveIndex(cat);
  const prefs = ensureSectionGroupPrefs({
    sectionGroupPrefs: {
      ...defaultSectionGroupPrefs(),
      tv: { configured: true, selectedGroupIds: ['s1::live-a'] }
    },
    favoriteIds: [],
    hiddenItemIds: [],
    hiddenGroupIds: []
  });
  const meta = listLiveGroupsFromIndex(index, prefs);
  assert.equal(meta.sectionConfigured, true);
  assert.ok(meta.groups.every((g) => g.id === 's1::live-a'));
  assert.ok(meta.totalChannels >= 1);
});

test('selectable groups list real names only', () => {
  const groups = listSelectableGroups(catalogFixture(), 'films', [
    { id: 's1', displayName: 'Provider One' }
  ]);
  assert.ok(groups.some((g) => g.name === 'Action'));
  assert.ok(groups.every((g) => !String(g.id).includes('password')));
});

console.log('smoke-group-selection: all passed');

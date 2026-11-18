import assert from 'assert';
import { buildContinueWatching, resumeEpisodeForSeries } from '../lib/continueWatching.js';
import { buildRecommendations, scoreRecommendation } from '../lib/recommendations.js';

const prefs = {
  preferredLanguage: 'VF',
  progressByItemId: { film1: 0.4 },
  progressByEpisodeId: { 'ep-s1e2': 0.35, 'ep-s1e1': 0.99 },
  continueActivityById: { 'ep:ep-s1e2': 200, film1: 100 },
  dismissedContinueIds: [],
  continueCompletedThreshold: 0.92
};

const series = {
  id: 'ser1',
  type: 'SERIES',
  canonicalTitle: 'Demo Series',
  episodes: [
    {
      id: 'ep-s1e1',
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Pilot',
      versions: [{ stream: { id: 's1', language: 'VF', confidence: 'KNOWN' } }]
    },
    {
      id: 'ep-s1e2',
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'Next',
      versions: [{ stream: { id: 's2', language: 'VF', confidence: 'KNOWN' } }]
    }
  ]
};
const film = {
  id: 'film1',
  type: 'FILM',
  canonicalTitle: 'Demo Film',
  durationMinutes: 100,
  variants: [{ id: 'f1', language: 'VF' }]
};

const resume = resumeEpisodeForSeries(series, prefs);
assert.equal(resume.episodeId, 'ep-s1e2');
assert.ok(resume.fraction > 0.3);

const cards = buildContinueWatching([series, film], prefs, (t, frac) => ({
  id: t.id,
  title: t.canonicalTitle,
  progressFraction: frac,
  versions: [],
  selectedVersionId: null
}));
assert.equal(cards.length, 2);
assert.equal(cards[0].id, 'ser1'); // higher activity
assert.ok(cards[0].resumeLabel);

// Finished E1 → propose E2 as next (one card per series)
const nextPrefs = {
  preferredLanguage: 'VF',
  progressByItemId: {},
  progressByEpisodeId: { 'ep-s1e1': 0.95 },
  continueActivityById: { 'ep:ep-s1e1': 900 },
  dismissedContinueIds: [],
  continueCompletedThreshold: 0.92
};
const nextResume = resumeEpisodeForSeries(series, nextPrefs);
assert.equal(nextResume.episodeId, 'ep-s1e2');
assert.equal(nextResume.isNext, true);
const nextCards = buildContinueWatching([series], nextPrefs, (t, frac) => ({
  id: t.id,
  title: t.canonicalTitle,
  progressFraction: frac
}));
assert.equal(nextCards.length, 1);
assert.ok(String(nextCards[0].resumeLabel).includes('Suivant'));

// Finished film leaves the row
const doneFilmPrefs = {
  ...prefs,
  progressByItemId: { film1: 0.95 },
  continueActivityById: { film1: 50 }
};
const doneCards = buildContinueWatching([film], doneFilmPrefs, (t, frac) => ({
  id: t.id,
  title: t.canonicalTitle,
  progressFraction: frac
}));
assert.equal(doneCards.length, 0);

// Snapshot fallback when episode list is empty but continueResumeByTitleId exists
const sparseSeries = {
  id: 'vision',
  type: 'SERIES',
  canonicalTitle: 'VisionQuest',
  episodes: []
};
const snapPrefs = {
  preferredLanguage: 'VF',
  progressByItemId: { vision: 0.22 },
  progressByEpisodeId: {},
  continueActivityById: { vision: 500 },
  continueResumeByTitleId: {
    vision: {
      episodeId: 'ep1',
      streamId: 'st1',
      season: 1,
      episode: 1,
      episodeTitle: 'Pilot',
      fraction: 0.22
    }
  },
  dismissedContinueIds: [],
  continueCompletedThreshold: 0.92
};
const snapCards = buildContinueWatching([sparseSeries], snapPrefs, (t, frac) => ({
  id: t.id,
  title: t.canonicalTitle,
  progressFraction: frac
}));
assert.equal(snapCards.length, 1);
assert.equal(snapCards[0].resumeLabel, 'S1 · E1');
assert.equal(snapCards[0].resumeStreamId, 'st1');

const spider = {
  id: 'a',
  type: 'FILM',
  canonicalTitle: 'Spider-Man Homecoming',
  genres: ['Action', 'Aventure'],
  year: 2017,
  matchKey: { type: 'SOURCE_LOCAL', value: 'a' }
};
const spider2 = {
  id: 'b',
  type: 'FILM',
  canonicalTitle: 'Spider-Man Far From Home',
  genres: ['Action', 'Aventure'],
  year: 2019,
  matchKey: { type: 'SOURCE_LOCAL', value: 'b' }
};
const random = {
  id: 'c',
  type: 'FILM',
  canonicalTitle: 'Cooking Show',
  genres: ['Documentaire'],
  year: 2020,
  matchKey: { type: 'SOURCE_LOCAL', value: 'c' }
};
assert.ok(scoreRecommendation(spider, spider2) > 0);
assert.equal(scoreRecommendation(spider, random), 0);
const reco = buildRecommendations(spider, [spider2, random], { limit: 8 });
assert.ok(reco.saga.length + reco.similar.length >= 1);
assert.ok(!reco.similar.find((t) => t.id === 'c') || reco.sameGenre.length === 0);

console.log('smoke-continue-reco: OK');

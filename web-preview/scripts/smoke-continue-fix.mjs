#!/usr/bin/env node
/**
 * Continuer à regarder — regression: multi titles, stale snap, series shell, threshold.
 */
import assert from 'node:assert/strict';
import { buildContinueWatching } from '../lib/continueWatching.js';

const toUi = (t, frac) => ({
  id: t.id,
  title: t.canonicalTitle,
  type: t.type,
  progressFraction: frac,
  selectedVersionId: t.variants?.[0]?.id || null
});

const filmA = {
  id: 'film-a',
  type: 'FILM',
  canonicalTitle: 'Film A',
  variants: [{ id: 'sa' }]
};
const filmB = {
  id: 'film-b',
  type: 'FILM',
  canonicalTitle: 'Film B',
  variants: [{ id: 'sb' }]
};
const chacal = {
  id: 'series-chacal',
  type: 'SERIES',
  canonicalTitle: 'Chacal (2024)',
  episodes: [
    {
      id: 'ep:1',
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'E1',
      versions: [{ stream: { id: 'ch-s1', language: 'VF', confidence: 'KNOWN' } }]
    }
  ]
};
const visionShell = {
  id: 'series-vision',
  type: 'SERIES',
  canonicalTitle: 'VisionQuest',
  episodes: [],
  variants: [{ id: 'vis-stream' }]
};

// 1) Two films with real progress → both cards, newest activity first
{
  const prefs = {
    progressByItemId: { 'film-a': 0.2, 'film-b': 0.45 },
    continueActivityById: { 'film-a': 100, 'film-b': 500 },
    continueResumeByTitleId: {
      'film-a': { streamId: 'sa', fraction: 0.2 },
      'film-b': { streamId: 'sb', fraction: 0.45 }
    }
  };
  const cards = buildContinueWatching([filmA, filmB], prefs, toUi, 24);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, 'film-b');
  assert.equal(cards[1].id, 'film-a');
}

// 2) Tiny progress must NOT invent a continue card
{
  const prefs = {
    progressByItemId: { 'film-a': 0.001 },
    continueActivityById: { 'film-a': Date.now() },
    continueResumeByTitleId: {}
  };
  const cards = buildContinueWatching([filmA], prefs, toUi, 24);
  assert.equal(cards.length, 0);
}

// 3) Stale snap + collapsed live progress → drop card
{
  const prefs = {
    progressByItemId: { 'series-chacal': 0.0005 },
    progressByEpisodeId: { 'ep:1': 0.0005 },
    continueActivityById: { 'series-chacal': Date.now() },
    continueResumeByTitleId: {
      'series-chacal': { streamId: 'ch-s1', episodeId: 'ep:1', fraction: 0.117, season: 1, episode: 1 }
    }
  };
  const cards = buildContinueWatching([chacal], prefs, toUi, 24);
  assert.equal(cards.length, 0, 'stale snap must not keep Chacal');
}

// 4) Real episode progress → one series card
{
  const prefs = {
    progressByEpisodeId: { 'ep:1': 0.33 },
    continueActivityById: { 'ep:ep:1': 900, 'series-chacal': 900 },
    continueResumeByTitleId: {}
  };
  const cards = buildContinueWatching([chacal, filmA], prefs, toUi, 24);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'series-chacal');
  assert.equal(cards[0].resumeEpisodeId, 'ep:1');
}

// 5) Series shell without episodes uses film-like progress
{
  const prefs = {
    progressByItemId: { 'series-vision': 0.31 },
    continueActivityById: { 'series-vision': 800 },
    continueResumeByTitleId: {
      'series-vision': { streamId: 'vis-stream', fraction: 0.31 }
    }
  };
  const cards = buildContinueWatching([visionShell], prefs, toUi, 24);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'series-vision');
  assert.equal(cards[0].resumeStreamId, 'vis-stream');
}

console.log('smoke-continue-fix: OK');

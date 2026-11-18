#!/usr/bin/env node
/**
 * TASK-009 — per-episode progress, migration, continue card rules.
 */
import assert from 'node:assert/strict';
import {
  watchState,
  resumePositionSec,
  migrateProfileProgress,
  upsertEpisodePlayback,
  episodeProgressKey,
  COMPLETED_THRESHOLD
} from '../lib/episodeProgress.js';
import { buildContinueWatching } from '../lib/continueWatching.js';

assert.equal(watchState(0), 'none');
assert.equal(watchState(0.01), 'none');
assert.equal(watchState(0.48), 'in_progress');
assert.equal(watchState(0.92), 'completed');
assert.equal(watchState(0.99), 'completed');

assert.equal(
  episodeProgressKey({ episodeId: 'ep:27194:1:2' }),
  'ep:27194:1:2'
);
assert.equal(
  episodeProgressKey({ sourceId: 'xt', seriesProviderId: '99', season: 2, episode: 3 }),
  'ep:xt:99:2:3'
);

assert.equal(
  resumePositionSec({ positionMs: 120_000, durationMs: 600_000, fraction: 0.2 }),
  116
);

// Migration drops orphaned demo seeds + stale Chacal snap
{
  const prefs = migrateProfileProgress(
    {
      progressByItemId: {
        'logical:demo:obsidian-night': 0.42,
        'logical:xtream::series:27194': 0.002,
        'logical:xtream::vod:1': 0.2
      },
      progressByEpisodeId: {
        'demo:aurora-station:s1e1': 1,
        'ep:27194:1:1': 0.002
      },
      continueResumeByTitleId: {
        'logical:xtream::series:27194': {
          streamId: 's1',
          episodeId: 'ep:27194:1:1',
          fraction: 0.117
        },
        'logical:xtream::vod:1': { streamId: 'f1', fraction: 0.2 }
      },
      continueActivityById: {
        'logical:demo:obsidian-night': 1,
        'logical:xtream::vod:1': 2
      },
      episodePlaybackById: {}
    },
    [
      { id: 'logical:xtream::series:27194' },
      { id: 'logical:xtream::vod:1' }
    ]
  );
  assert.equal(prefs.progressByItemId['logical:demo:obsidian-night'], undefined);
  assert.equal(prefs.progressByEpisodeId['demo:aurora-station:s1e1'], undefined);
  assert.equal(prefs.continueResumeByTitleId['logical:xtream::series:27194'], undefined);
  assert.ok(prefs.continueResumeByTitleId['logical:xtream::vod:1']);
  assert.ok(prefs.episodePlaybackById['ep:27194:1:1']);
}

// Two episodes independent + one continue card
{
  const prefs = {
    preferredLanguage: 'VF',
    progressByEpisodeId: {},
    episodePlaybackById: {},
    progressByItemId: {},
    continueActivityById: {},
    continueResumeByTitleId: {},
    continueCompletedThreshold: COMPLETED_THRESHOLD
  };
  upsertEpisodePlayback(prefs, {
    episodeId: 'ep:1',
    contentId: 'ser1',
    season: 1,
    episode: 1,
    streamId: 's1',
    fraction: 0.99,
    positionMs: 2400000,
    durationMs: 2500000
  });
  upsertEpisodePlayback(prefs, {
    episodeId: 'ep:2',
    contentId: 'ser1',
    season: 1,
    episode: 2,
    streamId: 's2',
    fraction: 0.48,
    positionMs: 900000,
    durationMs: 2000000
  });
  assert.equal(prefs.progressByEpisodeId['ep:1'], 0.99);
  assert.equal(prefs.progressByEpisodeId['ep:2'], 0.48);

  const series = {
    id: 'ser1',
    type: 'SERIES',
    canonicalTitle: 'Demo Series',
    episodes: [
      {
        id: 'ep:1',
        seasonNumber: 1,
        episodeNumber: 1,
        title: 'E1',
        versions: [{ stream: { id: 's1', language: 'VF', confidence: 'KNOWN' } }]
      },
      {
        id: 'ep:2',
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'E2',
        versions: [{ stream: { id: 's2', language: 'VF', confidence: 'KNOWN' } }]
      }
    ]
  };
  const film = {
    id: 'film1',
    type: 'FILM',
    canonicalTitle: 'Film',
    variants: [{ id: 'f1' }]
  };
  prefs.progressByItemId.film1 = 0.3;
  prefs.continueActivityById.film1 = 100;
  prefs.continueActivityById['ep:ep:2'] = 500;
  prefs.continueActivityById.ser1 = 500;
  prefs.continueResumeByTitleId.film1 = { streamId: 'f1', fraction: 0.3 };

  const cards = buildContinueWatching([series, film], prefs, (t, f) => ({
    id: t.id,
    title: t.canonicalTitle,
    progressFraction: f
  }));
  assert.equal(cards.length, 2);
  assert.equal(cards[0].id, 'ser1');
  assert.equal(cards[0].resumeEpisodeId, 'ep:2');
  assert.equal(cards[1].id, 'film1');
}

console.log('smoke-episode-progress: OK');

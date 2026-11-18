#!/usr/bin/env node
/**
 * TASK-010 — episode selection must not silently fall back to E1.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSeriesTitle,
  seriesLogicalMatchKey,
  findSeriesEditions,
  presentEditionChips
} from '../lib/seriesIdentity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// --- Pure helpers (mirror server findStream order) ---
function findStreamInCatalog(catalog, streamId) {
  if (!streamId) return null;
  for (const t of catalog.titles || []) {
    for (const ep of t.episodes || []) {
      for (const ver of ep.versions || []) {
        if (ver.stream?.id === streamId) {
          return { url: ver.stream.playbackUrl, episode: ep, title: t, via: 'episode' };
        }
      }
    }
  }
  for (const t of catalog.titles || []) {
    for (const v of t.variants || []) {
      if (v.id === streamId) {
        return { url: v.playbackUrl, episode: null, title: t, via: 'variant' };
      }
    }
  }
  return null;
}

function buildSeriesFixture() {
  const mkEp = (n, streamSuffix) => ({
    id: `ep:demo:1:${n}`,
    seasonNumber: 1,
    episodeNumber: n,
    title: `Chapitre ${n}`,
    thumbPath: `https://example.test/e${n}.jpg`,
    durationMinutes: 40 + n,
    versions: [
      {
        stream: {
          id: `src::series::demo::${streamSuffix}`,
          playbackUrl: `lks-xtream://src/series/${streamSuffix}?ext=mkv`
        }
      }
    ]
  });
  const episodes = [1, 2, 3, 8].map((n) => mkEp(n, 1000 + n));
  return {
    titles: [
      {
        id: 'logical:demo-series',
        type: 'SERIES',
        canonicalTitle: 'FR - Demo Series (2024)',
        year: 2024,
        matchKey: { type: 'TITLE_YEAR', value: 'series:demoseries:2024' },
        // Intentionally flattened variants (legacy bug shape) — episode match must win
        variants: episodes.map((e) => e.versions[0].stream),
        episodes,
        posterPath: null,
        backdropPath: null
      },
      {
        id: 'logical:demo-series-es',
        type: 'SERIES',
        canonicalTitle: 'ES - Demo Series (2024)',
        year: 2024,
        matchKey: { type: 'TITLE_YEAR', value: 'series:demoseries:2024' },
        variants: [],
        episodes: []
      }
    ]
  };
}

const catalog = buildSeriesFixture();
const series = catalog.titles[0];

for (const n of [1, 2, 3, 8]) {
  const ep = series.episodes.find((e) => e.episodeNumber === n);
  const hit = findStreamInCatalog(catalog, ep.versions[0].stream.id);
  assert.equal(hit?.via, 'episode', `E${n} must resolve via episode`);
  assert.equal(hit?.episode?.id, ep.id, `E${n} must keep its episode id`);
  assert.equal(hit.episode.episodeNumber, n, `E${n} must keep its episode number`);
  assert.equal(hit.url, ep.versions[0].stream.playbackUrl);
}

// Independent stream ids
const ids = series.episodes.map((e) => e.versions[0].stream.id);
assert.equal(new Set(ids).size, ids.length, 'each episode has distinct stream id');

// Series identity
assert.equal(normalizeSeriesTitle('FR - Demo Series (2024)'), 'demoseries');
assert.equal(normalizeSeriesTitle('ES - Demo Series (2024)'), 'demoseries');
const key = seriesLogicalMatchKey('ES - Demo Series (2024) (KR)', 2024, null);
assert.equal(key?.type, 'TITLE_YEAR');
assert.equal(key?.value, 'series:demoseries:2024');
assert.equal(seriesLogicalMatchKey('X', null, null), null, 'no year → no TITLE_YEAR');
assert.equal(
  seriesLogicalMatchKey('Short', 2024, null),
  null,
  'too-short normalized title must not merge'
);
assert.equal(
  seriesLogicalMatchKey('Anything', 2024, '99').type,
  'PROVIDER_EXTERNAL'
);

const editions = presentEditionChips(findSeriesEditions(catalog, series));
assert.ok(editions.length >= 2, 'soft editions should link FR/ES');
assert.ok(editions.every((e) => e.label && !/unknown/i.test(e.label)));

// Live preview-state regression when present
const statePath = path.join(root, '.data', 'preview-state.json');
if (fs.existsSync(statePath)) {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const live = (state.catalog?.titles || []).find(
    (t) => t.type === 'SERIES' && (t.episodes || []).length >= 8
  );
  if (live) {
    const e2 = live.episodes.find((e) => e.episodeNumber === 2);
    const e8 = live.episodes.find((e) => e.episodeNumber === 8);
    if (e2?.versions?.[0]?.stream?.id && e8?.versions?.[0]?.stream?.id) {
      const h2 = findStreamInCatalog(state.catalog, e2.versions[0].stream.id);
      const h8 = findStreamInCatalog(state.catalog, e8.versions[0].stream.id);
      assert.equal(h2?.episode?.episodeNumber, 2);
      assert.equal(h8?.episode?.episodeNumber, 8);
      assert.notEqual(h2.episode.id, h8.episode.id);
      assert.ok(e2.thumbPath || e8.thumbPath, 'real thumbs expected on IPTV episodes');
      console.log('live-catalog check: OK', live.canonicalTitle?.slice(0, 40));
    }
  }
}

console.log('smoke-episode-select: OK');

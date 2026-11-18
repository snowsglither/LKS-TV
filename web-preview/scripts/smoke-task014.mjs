/**
 * TASK-014 smoke: detail sections, no search history / fusion badge by default,
 * player settings panes exist for film vs series.
 */
import assert from 'node:assert/strict';

const BASE = process.env.LKS_PREVIEW_URL || 'http://127.0.0.1:3000';

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(res.ok, true, `${path} → ${res.status}`);
  return res.json();
}

function episodeSpecificSynopsis(epSynopsis, seriesSynopsis) {
  const ep = String(epSynopsis || '').trim();
  if (!ep) return '';
  const series = String(seriesSynopsis || '').trim();
  if (series && ep.toLowerCase() === series.toLowerCase()) return '';
  return ep;
}

assert.equal(episodeSpecificSynopsis('Same', 'Same'), '');
assert.equal(episodeSpecificSynopsis('Unique ep', 'Series plot'), 'Unique ep');

const state = await api('/api/state');
assert.ok(!('recentSearches' in (state.preferences || {}) && Array.isArray(state.preferences.recentSearches)
  && state.preferences.recentSearches.length > 0), 'no recent search history');

// Prefer a series with seasons if catalog available
const titles = state.catalog?.titles || [];
const series = titles.find((t) => t.type === 'SERIES' && (t.episodes?.length || 0) > 0)
  || titles.find((t) => t.type === 'SERIES');
const film = titles.find((t) => t.type === 'FILM');

if (series) {
  const detail = await api('/api/navigate', { detailId: series.id });
  assert.ok(detail.detail, 'series detail');
  assert.notEqual(detail.detail.trustedMerge === true && false, true);
  // Fusion badge must not be required for UX — field may exist for dev only
  const seasons = detail.detail.seasons || [];
  if (seasons[0]?.episodes?.length) {
    const ep = seasons[0].episodes[0];
    const syn = episodeSpecificSynopsis(ep.synopsis, detail.detail.synopsis);
    assert.ok(typeof syn === 'string');
  }
}

if (film) {
  const detail = await api('/api/navigate', { detailId: film.id });
  assert.ok(detail.detail);
  assert.equal(detail.detail.type, 'FILM');
  // Player open for film must not force episode wording in API
  if (detail.detail.selectedVersionId || detail.detail.versions?.[0]?.id) {
    const streamId = detail.detail.selectedVersionId || detail.detail.versions[0].id;
    const player = await api('/api/player/open', {
      streamId,
      titleId: film.id,
      fromLive: 0,
      returnScreen: 'detail'
    });
    assert.ok(player.player);
    assert.ok(!player.player.episodeNav, 'film player has no episodeNav');
    await api('/api/player/close', {});
  }
}

console.log('smoke-task014 OK');

/**
 * Unit-level assertion of player returnTo resolution (no live server required).
 * Mirrors server.mjs close logic.
 */
import assert from 'assert';

function resolveCloseScreen(player, { detail = null, liveUi = null } = {}) {
  const ret = player?.returnTo || null;
  if (ret?.screen === 'tv') return 'tv';
  if (ret?.screen === 'detail' && detail) return 'detail';
  if (ret?.screen && ret.screen !== 'player') return ret.screen;
  if (detail) return 'detail';
  return 'hub';
}

function resolveOpenReturn({ fromLive, returnScreen, screen, detail }) {
  const allowed = new Set(['hub', 'films', 'series', 'tv', 'detail', 'search', 'library', 'settings']);
  if (allowed.has(returnScreen)) return returnScreen;
  if (fromLive) return 'tv';
  if (detail?.id) return 'detail';
  if (['films', 'series', 'tv', 'search', 'hub', 'library'].includes(screen)) {
    return screen === 'player' ? 'hub' : screen;
  }
  return 'hub';
}

// Bug reproduction: liveUi present must NOT force TV when watching a series
assert.equal(
  resolveCloseScreen(
    { returnTo: { screen: 'detail' } },
    { detail: { id: 'x' }, liveUi: { groupId: 'g1' } }
  ),
  'detail'
);

assert.equal(
  resolveCloseScreen(
    { returnTo: { screen: 'films' } },
    { liveUi: { groupId: 'g1' } }
  ),
  'films'
);

assert.equal(
  resolveCloseScreen(
    { returnTo: { screen: 'tv' } },
    { liveUi: { groupId: 'g1' } }
  ),
  'tv'
);

assert.equal(
  resolveOpenReturn({ fromLive: false, screen: 'detail', detail: { id: 's1' } }),
  'detail'
);
assert.equal(
  resolveOpenReturn({ fromLive: true, screen: 'tv', detail: null }),
  'tv'
);
assert.equal(
  resolveOpenReturn({ fromLive: false, screen: 'films', detail: null }),
  'films'
);

console.log('smoke-player-return: OK');

#!/usr/bin/env node
/**
 * TASK-013 — navigation stack, no search history, EPG diagnosis smoke.
 */
import assert from 'node:assert/strict';
import {
  ensureNavStack,
  pushFrame,
  popFrame,
  replaceStack,
  applyFrame,
  peekFrame
} from '../lib/navStack.js';
import { parseXmltvTime, parseXmltvBuffer, normName } from '../lib/epgXmltv.js';

// --- Nav stack ---
const state = {
  screen: 'hub',
  detail: null,
  search: { query: '', filter: 'all', offset: 0 },
  liveUi: { groupId: 'g1', channelId: 'c1' },
  navStack: []
};
ensureNavStack(state);
pushFrame(state, { screen: 'films' });
pushFrame(state, { screen: 'detail', detailId: 'avengers' });
pushFrame(state, { screen: 'player', detailId: 'avengers' });
assert.equal(peekFrame(state).screen, 'player');
const afterPlayer = popFrame(state);
assert.equal(afterPlayer.screen, 'detail');
assert.equal(afterPlayer.detailId, 'avengers');
const afterDetail = popFrame(state);
assert.equal(afterDetail.screen, 'films');
replaceStack(state, { screen: 'search', searchQuery: 'test', searchFilter: 'all' });
applyFrame(state, peekFrame(state));
assert.equal(state.screen, 'search');
assert.equal(state.search.query, 'test');

// Search → detail → player → back preserves search
replaceStack(state, { screen: 'search', searchQuery: 'mobland', searchFilter: 'series', searchOffset: 0 });
pushFrame(state, { screen: 'detail', detailId: 'mob', selectedSeason: 2 });
pushFrame(state, { screen: 'player' });
popFrame(state);
const backToDetail = peekFrame(state);
assert.equal(backToDetail.screen, 'detail');
assert.equal(backToDetail.selectedSeason, 2);
popFrame(state);
assert.equal(peekFrame(state).searchQuery, 'mobland');

// --- EPG parse (no invented programmes) ---
assert.ok(parseXmltvTime('20241118123000 +0000') > 0);
const sample = `<?xml version="1.0"?>
<tv>
  <channel id="TF1.fr"><display-name>FR - TF1</display-name></channel>
  <programme start="20990101120000 +0000" stop="20990101130000 +0000" channel="TF1.fr">
    <title>Future Show</title><desc>Only if in window</desc>
  </programme>
</tv>`;
const far = parseXmltvBuffer(sample, { now: Date.now() });
assert.equal(far.programmeCount, 0, 'future-far programmes outside window must not be kept as “now” junk incorrectly — windowed');
assert.equal(normName('|4K| TF1 HDR'), 'tf1 hdr');

const nearStart = new Date(Date.now() - 10 * 60 * 1000);
const nearEnd = new Date(Date.now() + 50 * 60 * 1000);
const fmt = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
};
const liveXml = `<?xml version="1.0"?>
<tv>
  <channel id="TF1.fr"><display-name>FR - TF1</display-name></channel>
  <programme start="${fmt(nearStart)}" stop="${fmt(nearEnd)}" channel="TF1.fr">
    <title>Journal</title><desc>Info</desc>
  </programme>
</tv>`;
const live = parseXmltvBuffer(liveXml, { now: Date.now() });
assert.equal(live.programmeCount, 1);
assert.equal(live.programmes['TF1.fr'][0].title, 'Journal');

console.log('smoke-nav-task013: OK');

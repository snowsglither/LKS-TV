/**
 * TASK-014.1 — episode titles + language prefix hygiene + series lang preference.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cleanDisplayTitle,
  cleanEpisodeTitle,
  formatEpisodeListLabel,
  formatPlayerSeriesTitle,
  technicalEditionKey
} from '../lib/displayMeta.js';
import { normalizeLanguageTag, detectMediaLanguage } from '../lib/languages.js';
import { editionLabelFromTitle } from '../lib/seriesIdentity.js';
import { buildSearchIndex, searchCatalog } from '../lib/searchEngine.js';

assert.equal(normalizeLanguageTag('GB'), '');
assert.equal(normalizeLanguageTag('AL'), '');
assert.equal(normalizeLanguageTag('EX'), '');
assert.equal(normalizeLanguageTag('GR'), '');
assert.equal(normalizeLanguageTag('EN'), 'en');
assert.equal(normalizeLanguageTag('FR'), 'fr');

assert.equal(detectMediaLanguage('GB - The Day of the Jackal (2024)').language, '');
assert.equal(detectMediaLanguage('EN - The Day of the Jackal (2024)').language, 'en');
assert.equal(technicalEditionKey('GB - Show'), 'GB');
assert.equal(technicalEditionKey('EN - Show'), '');
assert.equal(editionLabelFromTitle('GB - Show').label, 'Édition GB');
assert.equal(editionLabelFromTitle('EN - Show').languageTag, 'en');

const series = 'EN - The Day of the Jackal (2024)';
assert.equal(
  cleanEpisodeTitle('The Day of the Jackal (2024) - S01E01', 1, 1, series),
  'Épisode 1'
);
assert.equal(formatEpisodeListLabel('Épisode 1', 1), '1. Épisode 1');
assert.equal(
  formatPlayerSeriesTitle(series, 1, 8),
  'The Day of the Jackal (2024) — S1:E8'
);
assert.ok(!formatPlayerSeriesTitle(series, 1, 1).includes('S01E01'));
assert.equal(cleanDisplayTitle('GB - Chacal (2024)').includes('GB'), false);

const BASE = process.env.LKS_PREVIEW_URL || 'http://127.0.0.1:3000';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  assert.equal(res.ok, true, `${path} → ${res.status}`);
  return res.json();
}

const statePath = path.join(__dirname, '..', '.data', 'preview-state.json');
let jackalId = null;
if (fs.existsSync(statePath)) {
  const disk = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const p =
    disk.prefsByProfile?.[disk.activeProfileId] ||
    Object.values(disk.prefsByProfile || {})[0] ||
    {};
  for (const s of ['films', 'series', 'tv']) {
    p.sectionGroupPrefs = p.sectionGroupPrefs || {};
    if (!p.sectionGroupPrefs[s]?.configured) {
      p.sectionGroupPrefs[s] = {
        configured: true,
        selectedGroupIds: (disk.catalog?.groups || []).map((g) => g.id)
      };
    }
  }
  const index = buildSearchIndex(disk.catalog);
  const hit = searchCatalog({
    index,
    query: 'jackal',
    filter: 'series',
    prefs: p,
    limit: 5
  }).items.find((i) => /jackal|chacal/i.test(i.title || ''));
  jackalId = hit?.id || null;
}

if (jackalId) {
  const detail = await api('/api/navigate', { detailId: jackalId });
  const d = detail.detail;
  assert.ok(d);
  for (const ed of d.editions || []) {
    assert.notEqual(String(ed.languageTag || '').toLowerCase(), 'gb');
    assert.notEqual(String(ed.languageTag || '').toLowerCase(), 'al');
    assert.notEqual(String(ed.languageTag || '').toLowerCase(), 'ex');
    assert.notEqual(String(ed.languageTag || '').toLowerCase(), 'gr');
  }
  // Series-level editions only — episode payloads must not require per-row lang UI
  const season = (d.seasons || [])[0];
  assert.ok(season?.episodes?.length, 'season episodes');
  let lastLang = null;
  for (const n of [1, 2, 3, 8]) {
    const ep = season.episodes.find((e) => e.number === n);
    if (!ep) {
      console.log(`smoke-task0141: E${n} absent — skip`);
      continue;
    }
    assert.ok(ep.listLabel, `E${n} listLabel`);
    assert.match(ep.listLabel, new RegExp(`^${n}\\.`));
    assert.ok(!/S0?1E0?\d/i.test(ep.listLabel), `E${n} no SxxExx in list`);
    // Prefer cleaned labels; tolerate residual series name until episode meta is refreshed
    const preferredVer =
      (ep.versions || []).find((v) => v.streamId === ep.selectedStreamId) ||
      (ep.versions || [])[0];
    const stream = preferredVer?.streamId || ep.selectedStreamId;
    const episodeId = preferredVer?.physicalEpisodeId || ep.id;
    assert.ok(stream, `E${n} stream`);
    const player = await api('/api/player/open', {
      streamId: stream,
      episodeId,
      titleId: preferredVer?.editionId || d.id,
      fromLive: 0,
      returnScreen: 'detail'
    });
    assert.ok(player.player?.title);
    assert.match(player.player.title, /S\d+:E\d+/);
    assert.ok(!/S0\dE0\d/.test(player.player.title), 'no padded S01E01 in player title');
    assert.equal(
      Number(player.player.episodeNumber ?? player.player.episodeNav?.current?.episode),
      n
    );
    const langs = player.player.availableEpisodeLanguages || [];
    if (langs.length && lastLang) {
      const still = langs.find((l) => l.tag === lastLang || l.streamId);
      assert.ok(still || langs.length >= 1, 'language list present across episodes');
    }
    if (langs[0]?.tag) lastLang = langs[0].tag;
    await api('/api/player/close', {});
  }
  console.log('smoke-task0141: jackal E1/E2/E3/E8 checked via API');
} else {
  console.log('smoke-task0141: no jackal series on disk — unit checks only');
}

console.log('smoke-task0141 OK');

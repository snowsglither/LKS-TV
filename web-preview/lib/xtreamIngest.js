/**
 * Xtream → catalog shape (aligned with Android SourceIngestor rules).
 * Series episodes are lazy-loaded on detail open (performance).
 */
import {
  authenticate,
  fetchCategories,
  fetchStreams,
  fetchSeriesList,
  opaquePlaybackRef
} from './xtreamClient.js';
import { getXtreamSecret } from './secrets.js';
import { appendAll, maybeYield } from './arrayUtil.js';

import { detectMediaLanguage, normalizeLanguageTag } from './languages.js';
import { seriesLogicalMatchKey } from './seriesIdentity.js';

function detectLang(title, group) {
  const d = detectMediaLanguage(title, group, { useGroup: true });
  const tag = normalizeLanguageTag(d.language || '');
  return {
    language: tag || 'UNKNOWN',
    languageTag: tag,
    confidence: d.confidence || 'UNKNOWN'
  };
}

function parseYear(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function genresOf(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureGroup(groupsMap, sourceId, providerGroupId, name, kind) {
  const id = `${sourceId}::${providerGroupId}`;
  if (!groupsMap.has(id)) {
    groupsMap.set(id, {
      id,
      sourceId,
      providerGroupId,
      name: name || providerGroupId,
      kind
    });
  }
  return id;
}

/**
 * Full Xtream catalog ingest (VOD + live + series shells without episodes).
 * @param {(msg: string) => void} [onProgress]
 */
export async function ingestXtreamSource(source, onProgress = () => {}) {
  const creds = getXtreamSecret(source.id);
  if (!creds) throw new Error('Identifiants Xtream absents du coffre');
  const allowPrivate = !!source.allowPrivateLan;
  onProgress('Xtream : authentification…');
  await authenticate(source.endpoint, creds, allowPrivate);

  const groupsMap = new Map();
  const titles = [];

  onProgress('Xtream : catégories…');
  const [vodCats, seriesCats, liveCats] = await Promise.all([
    fetchCategories(source.endpoint, creds, 'get_vod_categories', allowPrivate).catch(() => []),
    fetchCategories(source.endpoint, creds, 'get_series_categories', allowPrivate).catch(() => []),
    fetchCategories(source.endpoint, creds, 'get_live_categories', allowPrivate).catch(() => [])
  ]);

  for (const c of vodCats) ensureGroup(groupsMap, source.id, c.categoryId, c.categoryName, 'VOD');
  for (const c of seriesCats) ensureGroup(groupsMap, source.id, c.categoryId, c.categoryName, 'SERIES');
  for (const c of liveCats) ensureGroup(groupsMap, source.id, c.categoryId, c.categoryName, 'LIVE');

  onProgress('Xtream : flux VOD / live / séries…');
  const [vod, live, series] = await Promise.all([
    fetchStreams(source.endpoint, creds, 'get_vod_streams', allowPrivate).catch(() => []),
    fetchStreams(source.endpoint, creds, 'get_live_streams', allowPrivate).catch(() => []),
    fetchSeriesList(source.endpoint, creds, allowPrivate).catch(() => [])
  ]);
  onProgress(
    `Xtream : ${vod.length} films, ${series.length} séries, ${live.length} chaînes, ${groupsMap.size} groupes`
  );

  for (let i = 0; i < vod.length; i++) {
    const stream = vod[i];
    await maybeYield(i);
    const groupId = ensureGroup(
      groupsMap,
      source.id,
      stream.categoryId || 'vod',
      stream.categoryId ? groupsMap.get(`${source.id}::${stream.categoryId}`)?.name || 'VOD' : 'VOD',
      'VOD'
    );
    const lang = detectLang(stream.name, groupsMap.get(groupId)?.name || '');
    const streamRef = {
      id: `${source.id}::vod::${stream.streamId}`,
      sourceId: source.id,
      providerStreamId: stream.streamId,
      playbackUrl: opaquePlaybackRef(source.id, 'vod', stream.streamId, stream.containerExtension),
      groupId,
      ...lang,
      rawTitle: stream.name,
      containerExtension: stream.containerExtension
    };
    const matchKey = stream.tmdbId
      ? { type: 'PROVIDER_EXTERNAL', value: `tmdb:${stream.tmdbId}` }
      : { type: 'SOURCE_LOCAL', value: `${source.id}::vod:${stream.streamId}` };
    titles.push({
      id: matchKey.type === 'PROVIDER_EXTERNAL'
        ? `logical:provider_external:${matchKey.value.toLowerCase()}`
        : `logical:${matchKey.value}`,
      type: 'FILM',
      canonicalTitle: stream.name.replace(/\[[^\]]*\]/g, '').trim() || stream.name,
      year: parseYear(stream.year),
      synopsis: stream.plot || '',
      genres: genresOf(stream.genre),
      durationMinutes: null,
      posterPath: stream.streamIcon || null,
      backdropPath: stream.streamIcon || null,
      matchKey,
      variants: [streamRef],
      episodes: [],
      singleSourceOnly: matchKey.type === 'SOURCE_LOCAL',
      _xtreamSeriesId: null
    });
  }

  for (let i = 0; i < live.length; i++) {
    const stream = live[i];
    await maybeYield(i);
    const groupId = ensureGroup(
      groupsMap,
      source.id,
      stream.categoryId || 'live',
      stream.categoryId ? groupsMap.get(`${source.id}::${stream.categoryId}`)?.name || 'Live' : 'Live',
      'LIVE'
    );
    const lang = detectLang(stream.name, groupsMap.get(groupId)?.name || '');
    const streamRef = {
      id: `${source.id}::live::${stream.streamId}`,
      sourceId: source.id,
      providerStreamId: stream.streamId,
      playbackUrl: opaquePlaybackRef(source.id, 'live', stream.streamId, 'm3u8'),
      groupId,
      ...lang,
      rawTitle: stream.name
    };
    const matchKey = { type: 'SOURCE_LOCAL', value: `${source.id}::live:${stream.streamId}` };
    titles.push({
      id: `logical:${matchKey.value}`,
      type: 'LIVE',
      canonicalTitle: stream.name,
      year: null,
      synopsis: '',
      genres: [],
      durationMinutes: null,
      posterPath: stream.streamIcon || null,
      backdropPath: stream.streamIcon || null,
      matchKey,
      variants: [streamRef],
      episodes: [],
      singleSourceOnly: true
    });
  }

  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    await maybeYield(i);
    const groupId = ensureGroup(
      groupsMap,
      source.id,
      s.categoryId || 'series',
      s.categoryId ? groupsMap.get(`${source.id}::${s.categoryId}`)?.name || 'Séries' : 'Séries',
      'SERIES'
    );
    const year = parseYear(s.year);
    const logical = seriesLogicalMatchKey(s.name, year, s.tmdbId || null);
    const matchKey =
      logical ||
      { type: 'SOURCE_LOCAL', value: `${source.id}::series:${s.seriesId}` };
    // Placeholder variant so preferred language / group filters work before episode fetch
    const lang = detectLang(s.name, groupsMap.get(groupId)?.name || '');
    const placeholder = {
      id: `${source.id}::series::${s.seriesId}::shell`,
      sourceId: source.id,
      providerStreamId: s.seriesId,
      playbackUrl: opaquePlaybackRef(source.id, 'series', s.seriesId, 'mp4'),
      groupId,
      ...lang,
      rawTitle: s.name
    };
    const logicalId =
      matchKey.type === 'PROVIDER_EXTERNAL'
        ? `logical:provider_external:${matchKey.value.toLowerCase()}`
        : matchKey.type === 'TITLE_YEAR'
          ? `logical:title_year:${matchKey.value.toLowerCase()}`
          : `logical:${matchKey.value}`;
    titles.push({
      id: logicalId,
      type: 'SERIES',
      canonicalTitle: s.name.replace(/\[[^\]]*\]/g, '').trim() || s.name,
      year,
      synopsis: s.plot || '',
      genres: genresOf(s.genre),
      durationMinutes: null,
      posterPath: s.cover || null,
      backdropPath: (Array.isArray(s.backdrop) ? s.backdrop[0] : s.backdrop) || s.cover || null,
      matchKey,
      variants: [placeholder],
      episodes: [],
      singleSourceOnly: matchKey.type === 'SOURCE_LOCAL',
      _xtreamSeriesId: s.seriesId,
      _xtreamSourceId: source.id,
      _xtreamEditionIds: [{ sourceId: source.id, seriesId: s.seriesId, rawTitle: s.name }],
      _episodesLoaded: false
    });
  }

  // Deduplicate by id within this source pass (tmdb / title-year collisions)
  const byId = new Map();
  for (let i = 0; i < titles.length; i++) {
    const t = titles[i];
    if (!byId.has(t.id)) byId.set(t.id, t);
    else {
      const cur = byId.get(t.id);
      if (!cur.variants) cur.variants = [];
      appendAll(cur.variants, t.variants || []);
      cur.posterPath = cur.posterPath || t.posterPath;
      cur.backdropPath = cur.backdropPath || t.backdropPath;
      cur.synopsis = cur.synopsis || t.synopsis;
      cur.singleSourceOnly = false;
      cur._xtreamEditionIds = [
        ...(cur._xtreamEditionIds || []),
        ...(t._xtreamEditionIds || [])
      ];
      // Keep first series id for lazy fetch; editions listed for subsequent loads
      if (!cur._xtreamSeriesId && t._xtreamSeriesId) {
        cur._xtreamSeriesId = t._xtreamSeriesId;
        cur._xtreamSourceId = t._xtreamSourceId;
      }
    }
  }

  return {
    groups: Array.from(groupsMap.values()),
    titles: Array.from(byId.values()),
    generatedAtEpochMs: Date.now()
  };
}

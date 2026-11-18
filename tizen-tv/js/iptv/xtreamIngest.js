/**
 * Client-side Xtream ingest for Tizen (credentials injected — never logged).
 */
import {
  authenticate,
  fetchCategories,
  fetchStreams,
  fetchSeriesList,
  fetchSeriesEpisodes,
  buildMediaUrl
} from '../lib/xtreamClient.js';
import { detectLangFromText } from '../lib/displayMeta.js';
import { appendAll } from '../lib/arrayUtil.js';

function groupId(sourceId, providerGroupId) {
  return `${sourceId}::${providerGroupId}`;
}

function streamRef(sourceId, kind, streamId, url, groupIdValue, rawTitle, lang) {
  return {
    id: `${sourceId}::${kind}::${streamId}`,
    sourceId,
    providerStreamId: String(streamId),
    playbackUrl: url,
    groupId: groupIdValue,
    language: lang.language || 'UNKNOWN',
    languageTag: lang.languageTag || '',
    languageConfidence: lang.confidence || 'low',
    rawTitle: rawTitle || ''
  };
}

/**
 * @param {object} source
 * @param {{ username: string, password: string }} creds
 * @param {(msg: string) => void} [onProgress]
 */
export async function ingestXtreamSource(source, creds, onProgress = () => {}) {
  const allowPrivate = !!source.allowPrivateLan;
  const endpoint = source.endpoint;
  onProgress('Authentification Xtream…');
  await authenticate(endpoint, creds, allowPrivate);

  const groups = [];
  const titles = [];

  const vodCats = await fetchCategories(endpoint, creds, 'get_vod_categories', allowPrivate);
  const seriesCats = await fetchCategories(endpoint, creds, 'get_series_categories', allowPrivate);
  const liveCats = await fetchCategories(endpoint, creds, 'get_live_categories', allowPrivate);

  for (const c of vodCats) {
    groups.push({
      id: groupId(source.id, c.categoryId),
      sourceId: source.id,
      providerGroupId: c.categoryId,
      name: c.categoryName,
      kind: 'VOD'
    });
  }
  for (const c of seriesCats) {
    groups.push({
      id: groupId(source.id, c.categoryId),
      sourceId: source.id,
      providerGroupId: c.categoryId,
      name: c.categoryName,
      kind: 'SERIES'
    });
  }
  for (const c of liveCats) {
    groups.push({
      id: groupId(source.id, c.categoryId),
      sourceId: source.id,
      providerGroupId: c.categoryId,
      name: c.categoryName,
      kind: 'LIVE'
    });
  }

  onProgress('Import VOD…');
  const vod = await fetchStreams(endpoint, creds, 'get_vod_streams', allowPrivate);
  for (const s of vod) {
    const gid = groupId(source.id, s.categoryId || 'vod');
    const lang = detectLangFromText(s.name, '');
    const url = buildMediaUrl(endpoint, creds, 'movie', s.streamId, s.containerExtension || 'mp4');
    titles.push({
      id: `${source.id}::vod::${s.streamId}`,
      type: 'FILM',
      canonicalTitle: s.name,
      year: s.year ? Number(String(s.year).slice(0, 4)) || null : null,
      synopsis: s.plot || '',
      genres: s.genre ? String(s.genre).split(/[,|]/).map((x) => x.trim()).filter(Boolean) : [],
      matchKey: s.tmdbId
        ? { type: 'PROVIDER_EXTERNAL', value: `tmdb:${s.tmdbId}` }
        : { type: 'SOURCE_LOCAL', value: `${source.id}::vod:${s.streamId}` },
      variants: [streamRef(source.id, 'vod', s.streamId, url, gid, s.name, lang)],
      episodes: [],
      posterUrl: s.streamIcon || null,
      backdropUrl: s.streamIcon || null,
      singleSourceOnly: true
    });
  }

  onProgress('Import Live…');
  const live = await fetchStreams(endpoint, creds, 'get_live_streams', allowPrivate);
  for (const s of live) {
    const gid = groupId(source.id, s.categoryId || 'live');
    const lang = detectLangFromText(s.name, '');
    const url = buildMediaUrl(endpoint, creds, 'live', s.streamId, 'm3u8');
    titles.push({
      id: `${source.id}::live::${s.streamId}`,
      type: 'LIVE',
      canonicalTitle: s.name,
      year: null,
      synopsis: '',
      genres: [],
      matchKey: { type: 'SOURCE_LOCAL', value: `${source.id}::live:${s.streamId}` },
      variants: [streamRef(source.id, 'live', s.streamId, url, gid, s.name, lang)],
      episodes: [],
      posterUrl: s.streamIcon || null,
      posterPath: s.streamIcon || null,
      backdropUrl: s.streamIcon || null,
      singleSourceOnly: true
    });
  }

  onProgress('Import Séries…');
  const seriesList = await fetchSeriesList(endpoint, creds, allowPrivate);
  let i = 0;
  for (const series of seriesList) {
    i += 1;
    if (i % 25 === 0) onProgress(`Séries ${i}/${seriesList.length}…`);
    const gid = groupId(source.id, series.categoryId || 'series');
    let episodes = [];
    try {
      const detail = await fetchSeriesEpisodes(endpoint, creds, series.seriesId, allowPrivate);
      const rawEps = detail?.episodes || [];
      episodes = rawEps.map((ep) => {
        const lang = detectLangFromText(ep.title || series.name, '');
        const url = buildMediaUrl(endpoint, creds, 'series', ep.id, ep.containerExtension || 'mp4');
        return {
          id: `ep:${series.seriesId}:${ep.season}:${ep.episodeNum}`,
          seasonNumber: ep.season,
          episodeNumber: ep.episodeNum,
          title: ep.title || `Épisode ${ep.episodeNum}`,
          versions: [
            {
              stream: streamRef(source.id, 'series', ep.id, url, gid, ep.title, lang),
              seasonNumber: ep.season,
              episodeNumber: ep.episodeNum,
              episodeTitle: ep.title || ''
            }
          ],
          synopsis: ep.plot || '',
          durationMinutes: ep.durationMinutes || null,
          thumbUrl: ep.thumb || series.cover || null
        };
      });
    } catch {
      episodes = [];
    }
    titles.push({
      id: `${source.id}::series::${series.seriesId}`,
      type: 'SERIES',
      canonicalTitle: series.name,
      year: series.year ? Number(String(series.year).slice(0, 4)) || null : null,
      synopsis: series.plot || '',
      genres: series.genre ? String(series.genre).split(/[,|]/).map((x) => x.trim()).filter(Boolean) : [],
      matchKey: series.tmdbId
        ? { type: 'PROVIDER_EXTERNAL', value: `tmdb:${series.tmdbId}` }
        : { type: 'SOURCE_LOCAL', value: `${source.id}::series:${series.seriesId}` },
      variants: [],
      episodes,
      posterUrl: series.cover || null,
      backdropUrl: series.backdrop || series.cover || null,
      singleSourceOnly: true
    });
  }

  return {
    groups,
    titles,
    generatedAtEpochMs: Date.now()
  };
}

export { appendAll };

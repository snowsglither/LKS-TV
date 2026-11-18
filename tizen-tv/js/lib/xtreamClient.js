/**
 * Xtream Codes player_api client for web-preview (mirrors Android OkHttpXtreamGateway).
 * Credentials never logged.
 */
import { assertSafeHttpUrl } from './urlGuard.js';

const TIMEOUT_MS = 60000;

async function playerApi(baseUrl, username, password, params = {}, allowPrivate = false) {
  const base = assertSafeHttpUrl(String(baseUrl).replace(/\/$/, ''), { allowPrivate });
  const api = new URL(`${base.origin}${base.pathname.replace(/\/$/, '')}/player_api.php`);
  api.searchParams.set('username', username);
  api.searchParams.set('password', password);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') api.searchParams.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(api, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json,text/plain,*/*' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} depuis le serveur Xtream`);
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Réponse Xtream non JSON');
    }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Délai dépassé (Xtream)');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function asArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') return Object.values(data);
  return [];
}

export async function authenticate(baseUrl, creds, allowPrivate = false) {
  const data = await playerApi(baseUrl, creds.username, creds.password, {}, allowPrivate);
  const status = data?.user_info?.status || data?.user_info?.auth;
  if (String(status).toLowerCase() === 'disabled' || String(status) === '0') {
    throw new Error('Identifiants Xtream refusés');
  }
  if (data?.user_info && String(data.user_info.auth) === '0') {
    throw new Error('Identifiants Xtream refusés');
  }
  return { status: data?.user_info?.status || 'Active' };
}

export async function fetchCategories(baseUrl, creds, action, allowPrivate = false) {
  const data = await playerApi(baseUrl, creds.username, creds.password, { action }, allowPrivate);
  return asArray(data).map((c) => ({
    categoryId: String(c.category_id ?? c.id ?? ''),
    categoryName: String(c.category_name ?? c.name ?? 'Sans nom')
  })).filter((c) => c.categoryId);
}

export async function fetchStreams(baseUrl, creds, action, allowPrivate = false) {
  const data = await playerApi(baseUrl, creds.username, creds.password, { action }, allowPrivate);
  return asArray(data).map((s) => ({
    streamId: String(s.stream_id ?? s.num ?? ''),
    name: String(s.name || 'Sans titre'),
    categoryId: String(s.category_id || ''),
    containerExtension: s.container_extension ? String(s.container_extension) : null,
    tmdbId: s.tmdb_id ? String(s.tmdb_id) : null,
    plot: s.plot ? String(s.plot) : '',
    genre: s.genre ? String(s.genre) : '',
    year: s.year || s.releasedate || null,
    streamIcon: s.stream_icon || s.cover || null,
    rating: s.rating || null
  })).filter((s) => s.streamId);
}

export async function fetchSeriesList(baseUrl, creds, allowPrivate = false) {
  const data = await playerApi(baseUrl, creds.username, creds.password, { action: 'get_series' }, allowPrivate);
  return asArray(data).map((s) => ({
    seriesId: String(s.series_id ?? s.num ?? ''),
    name: String(s.name || 'Sans titre'),
    categoryId: String(s.category_id || ''),
    tmdbId: s.tmdb_id ? String(s.tmdb_id) : null,
    plot: s.plot ? String(s.plot) : '',
    genre: s.genre ? String(s.genre) : '',
    year: s.year || null,
    cover: s.cover || s.stream_icon || null,
    backdrop: s.backdrop_path || null
  })).filter((s) => s.seriesId);
}

export async function fetchSeriesEpisodes(baseUrl, creds, seriesId, allowPrivate = false) {
  const data = await playerApi(
    baseUrl,
    creds.username,
    creds.password,
    { action: 'get_series_info', series_id: seriesId },
    allowPrivate
  );
  const episodes = [];
  const info = data?.info || {};
  const seasons = data?.episodes || {};
  if (seasons && typeof seasons === 'object') {
    for (const [seasonKey, list] of Object.entries(seasons)) {
      const seasonNum = Number(seasonKey) || 1;
      for (const ep of asArray(list)) {
        episodes.push({
          id: String(ep.id ?? ep.episode_num ?? ''),
          season: Number(ep.season ?? seasonNum) || seasonNum,
          episodeNum: Number(ep.episode_num ?? ep.episode ?? 0) || 0,
          title: String(ep.title || `Épisode ${ep.episode_num || ''}`),
          plot: ep.plot ? String(ep.plot) : (info.plot ? String(info.plot) : ''),
          containerExtension: ep.container_extension ? String(ep.container_extension) : 'mp4',
          durationMinutes: ep.duration ? Number(String(ep.duration).replace(/\D/g, '')) || null : null,
          thumb: ep.info?.movie_image || ep.movie_image || null
        });
      }
    }
  }
  return {
    info: {
      name: info.name || '',
      plot: info.plot || '',
      cover: info.cover || null,
      backdrop: Array.isArray(info.backdrop_path) ? info.backdrop_path[0] : info.backdrop_path || null,
      genre: info.genre || '',
      year: info.releaseDate || info.year || null
    },
    episodes: episodes.filter((e) => e.id)
  };
}

/** Build direct Xtream media URL (server-side only — never send password to browser). */
export function buildMediaUrl(baseUrl, creds, kind, streamId, ext = 'mp4') {
  const base = String(baseUrl).replace(/\/$/, '');
  const e = String(ext || 'mp4').replace(/^\./, '');
  const u = encodeURIComponent(creds.username);
  const p = encodeURIComponent(creds.password);
  const id = encodeURIComponent(streamId);
  if (kind === 'live') return `${base}/live/${u}/${p}/${id}.m3u8`;
  if (kind === 'series') return `${base}/series/${u}/${p}/${id}.${e}`;
  return `${base}/movie/${u}/${p}/${id}.${e}`;
}

export function opaquePlaybackRef(sourceId, kind, streamId, ext) {
  const e = (ext || 'mp4').replace(/^\./, '');
  return `lks-xtream://${sourceId}/${kind}/${streamId}?ext=${e}`;
}

export function parseOpaquePlaybackRef(url) {
  const m = String(url || '').match(/^lks-xtream:\/\/([^/]+)\/(vod|live|series)\/([^?]+)(?:\?ext=([^&]+))?/);
  if (!m) return null;
  return { sourceId: m[1], kind: m[2], streamId: decodeURIComponent(m[3]), ext: m[4] || 'mp4' };
}

/**
 * Per-episode playback progress — profile-scoped maps in prefs.
 * Never invents progress; never hardcodes titles (Chacal, demo, etc.).
 */

export const COMPLETED_THRESHOLD = 0.92;
export const STARTED_THRESHOLD = 0.02;
/** Seek a few seconds earlier on resume so the user doesn't miss context. */
export const RESUME_MARGIN_SEC = 4;

/**
 * Stable episode key: prefer catalog episode id (already source/series/season/ep).
 * Fallback builds profile-independent key from IPTV coordinates.
 */
export function episodeProgressKey({
  episodeId,
  sourceId,
  seriesProviderId,
  season,
  episode
} = {}) {
  if (episodeId) return String(episodeId);
  const src = sourceId || 'src';
  const series = seriesProviderId || 'series';
  const s = Number(season) || 0;
  const e = Number(episode) || 0;
  return `ep:${src}:${series}:${s}:${e}`;
}

/** @returns {'none'|'in_progress'|'completed'} */
export function watchState(fraction, threshold = COMPLETED_THRESHOLD) {
  const f = Number(fraction) || 0;
  if (!(f > STARTED_THRESHOLD)) return 'none';
  if (f >= threshold) return 'completed';
  return 'in_progress';
}

export function resumePositionSec(entry, { marginSec = RESUME_MARGIN_SEC } = {}) {
  if (!entry) return 0;
  const durationSec =
    Number(entry.durationMs) > 0
      ? Number(entry.durationMs) / 1000
      : Number(entry.durationSec) || 0;
  let posSec =
    Number(entry.positionMs) > 0
      ? Number(entry.positionMs) / 1000
      : Number(entry.positionSec) || 0;
  if (!(posSec > 0) && durationSec > 0 && Number(entry.fraction) > STARTED_THRESHOLD) {
    posSec = Number(entry.fraction) * durationSec;
  }
  if (!(posSec > 0)) return 0;
  const capped =
    durationSec > 0 ? Math.min(posSec, Math.max(0, durationSec - 1)) : posSec;
  return Math.max(0, capped - marginSec);
}

/**
 * Migrate + prune prefs progress.
 * - Keeps real IPTV progress (including Chacal if fraction is real).
 * - Drops orphaned logical:demo:* keys when demo titles are absent.
 * - Drops stale continueResume snaps with no live progress.
 * - Seeds episodePlaybackById from progressByEpisodeId fractions.
 */
export function migrateProfileProgress(prefs, catalogTitles = []) {
  const p = prefs || {};
  const titleIds = new Set((catalogTitles || []).map((t) => t.id));
  const demoPresent = [...titleIds].some((id) => String(id).includes('logical:demo:'));
  const threshold = Number(p.continueCompletedThreshold ?? COMPLETED_THRESHOLD);

  const itemProg = { ...(p.progressByItemId || {}) };
  const epProg = { ...(p.progressByEpisodeId || {}) };
  const playback = { ...(p.episodePlaybackById || {}) };
  const snap = { ...(p.continueResumeByTitleId || {}) };
  const activity = { ...(p.continueActivityById || {}) };

  // Orphaned demo seeds left after switching to real IPTV
  if (!demoPresent) {
    for (const id of Object.keys(itemProg)) {
      if (String(id).includes('logical:demo:')) delete itemProg[id];
    }
    for (const id of Object.keys(epProg)) {
      if (String(id).startsWith('demo:')) delete epProg[id];
    }
    for (const id of Object.keys(activity)) {
      if (String(id).includes('logical:demo:') || String(id).startsWith('ep:demo:')) {
        delete activity[id];
      }
    }
    for (const id of Object.keys(snap)) {
      if (String(id).includes('logical:demo:')) delete snap[id];
    }
  }

  // Migrate fraction-only episode rows → structured playback entries
  for (const [eid, frac] of Object.entries(epProg)) {
    const f = Number(frac) || 0;
    if (!(f > 0)) continue;
    if (!playback[eid]) {
      playback[eid] = {
        key: eid,
        episodeId: eid,
        fraction: f,
        positionMs: 0,
        durationMs: 0,
        streamId: null,
        seriesId: null,
        sourceId: null,
        season: null,
        episode: null,
        updatedAt: 0
      };
    } else if (playback[eid].fraction == null) {
      playback[eid].fraction = f;
    }
  }

  // Stale continue snaps: no live title/episode progress above started threshold
  for (const [titleId, entry] of Object.entries(snap)) {
    const live = Number(itemProg[titleId] || 0);
    const eid = entry?.episodeId;
    const epLive = eid ? Number(epProg[eid] || playback[eid]?.fraction || 0) : 0;
    const storedFrac = Number(entry?.fraction || 0);
    const hasReal =
      live > STARTED_THRESHOLD ||
      epLive > STARTED_THRESHOLD ||
      (storedFrac > STARTED_THRESHOLD &&
        storedFrac < threshold &&
        entry?.streamId &&
        // keep only if title still exists in catalog
        titleIds.has(titleId) &&
        !(live > 0 && live <= STARTED_THRESHOLD && epLive <= STARTED_THRESHOLD));
    // Explicit: collapsed live progress + tiny ep progress → drop snap (Chacal ghost)
    if (
      titleIds.has(titleId) &&
      live > 0 &&
      live <= STARTED_THRESHOLD &&
      epLive <= STARTED_THRESHOLD &&
      storedFrac > STARTED_THRESHOLD
    ) {
      delete snap[titleId];
      continue;
    }
    if (!titleIds.has(titleId) || !hasReal) {
      // Keep snap only when title exists and there is usable progress signal
      if (!titleIds.has(titleId)) delete snap[titleId];
      else if (!(storedFrac > STARTED_THRESHOLD && entry?.streamId) && !(epLive > STARTED_THRESHOLD)) {
        delete snap[titleId];
      }
    }
  }

  p.progressByItemId = itemProg;
  p.progressByEpisodeId = epProg;
  p.episodePlaybackById = playback;
  p.continueResumeByTitleId = snap;
  p.continueActivityById = activity;
  return p;
}

export function upsertEpisodePlayback(prefs, payload = {}) {
  const key = episodeProgressKey(payload);
  if (!key) return null;
  const map = { ...(prefs.episodePlaybackById || {}) };
  const prev = map[key] || {};
  map[key] = {
    key,
    episodeId: payload.episodeId || prev.episodeId || key,
    seriesId: payload.contentId || payload.seriesId || prev.seriesId || null,
    sourceId: payload.sourceId || prev.sourceId || null,
    season: payload.season ?? prev.season ?? null,
    episode: payload.episode ?? prev.episode ?? null,
    streamId: payload.streamId || prev.streamId || null,
    fraction: Number(payload.fraction) || 0,
    positionMs: Math.max(0, Number(payload.positionMs) || 0),
    durationMs: Math.max(0, Number(payload.durationMs) || 0),
    updatedAt: Date.now()
  };
  prefs.episodePlaybackById = map;
  prefs.progressByEpisodeId = {
    ...(prefs.progressByEpisodeId || {}),
    [key]: map[key].fraction
  };
  return key;
}

/**
 * Temporal intro / outro markers for series episodes.
 *
 * Architecture only: markers must come from trusted metadata (provider, manual
 * curation, or a future detector). Never invent fixed durations — many shows
 * have different intro lengths per episode or none at all.
 *
 * Shape (seconds, relative to episode start):
 *   { introStartSec?: number, introEndSec?: number, outroStartSec?: number }
 *
 * UI rule: show « Passer l'intro » only when introEndSec is a finite number
 * greater than introStartSec (default 0) and currentTime is inside that window.
 */

/** @typedef {{ introStartSec?: number, introEndSec?: number, outroStartSec?: number }} EpisodeTimeMarkers */

/**
 * @param {EpisodeTimeMarkers|null|undefined} markers
 * @returns {{ introStartSec: number, introEndSec: number }|null}
 */
export function reliableIntroWindow(markers) {
  if (!markers || typeof markers !== 'object') return null;
  const start = Number(markers.introStartSec ?? 0);
  const end = Number(markers.introEndSec);
  if (!Number.isFinite(end) || end <= start) return null;
  if (!Number.isFinite(start) || start < 0) return null;
  return { introStartSec: start, introEndSec: end };
}

/**
 * @param {EpisodeTimeMarkers|null|undefined} markers
 * @param {number} currentTimeSec
 */
export function shouldShowSkipIntro(markers, currentTimeSec) {
  const win = reliableIntroWindow(markers);
  if (!win) return false;
  const t = Number(currentTimeSec);
  if (!Number.isFinite(t)) return false;
  return t >= win.introStartSec && t < win.introEndSec - 0.25;
}

/**
 * Resolve markers for an episode id from a profile-scoped map.
 * Returns null when unknown — callers must not fake a skip button.
 *
 * @param {Record<string, EpisodeTimeMarkers>|null|undefined} byEpisodeId
 * @param {string|null|undefined} episodeId
 */
export function markersForEpisode(byEpisodeId, episodeId) {
  if (!episodeId || !byEpisodeId) return null;
  return byEpisodeId[String(episodeId)] || null;
}

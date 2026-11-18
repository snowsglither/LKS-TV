/**
 * Continuer à regarder — uses the same progress maps as the player.
 * One card per series (resume episode), films by title progress.
 * Never invents progress; never shows never-started items.
 * Finished films are dropped; finished episodes promote the next episode.
 */

import { cleanEpisodeTitle } from './displayMeta.js';
import {
  matchesPreferredLanguage,
  migratePreferredLanguage,
  normalizeLanguageTag
} from './languages.js';
import { workIdOf, workDedupeKey } from './workIdentity.js';

/** Completed if progress ≥ this (configurable per prefs). */
export const DEFAULT_COMPLETED_THRESHOLD = 0.92;

function pickStream(streams, preferred = 'edition:vf') {
  if (!streams?.length) return null;
  const pref = migratePreferredLanguage(preferred);
  const tagOf = (v) => normalizeLanguageTag(v.languageTag || v.language || '');
  return (
    streams.find((v) => matchesPreferredLanguage(tagOf(v), pref) && v.confidence !== 'UNKNOWN') ||
    streams.find((v) => matchesPreferredLanguage(tagOf(v), pref)) ||
    streams.find((v) => v.confidence === 'KNOWN') ||
    streams[0]
  );
}

function sortedEpisodes(title) {
  return [...(title.episodes || [])].sort(
    (a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber
  );
}

function episodeCandidate(ep, fraction, activity, preferred, isNext = false) {
  const streams = (ep.versions || []).map((v) => v.stream).filter(Boolean);
  const stream = pickStream(streams, preferred) || streams[0];
  if (!stream?.id) return null;
  return {
    episodeId: ep.id,
    season: ep.seasonNumber,
    episode: ep.episodeNumber,
    title: cleanEpisodeTitle(ep.title, ep.seasonNumber, ep.episodeNumber),
    fraction,
    streamId: stream.id,
    durationMinutes: ep.durationMinutes || null,
    activity: activity || fraction,
    isNext: !!isNext
  };
}

/**
 * @param {object} title LogicalTitle
 * @param {object} prefs
 * @returns {{ episodeId: string, season: number, episode: number, title: string, fraction: number, streamId: string|null, durationMinutes: number|null, activity: number, isNext?: boolean }|null}
 */
export function resumeEpisodeForSeries(title, prefs) {
  const epProg = prefs.progressByEpisodeId || {};
  const activity = prefs.continueActivityById || {};
  const threshold = Number(prefs.continueCompletedThreshold ?? DEFAULT_COMPLETED_THRESHOLD);
  const preferred = prefs.preferredLanguage || 'VF';
  const episodes = sortedEpisodes(title);
  let best = null;

  // 1) In-progress episode (real progress, not finished)
  for (const ep of episodes) {
    const fraction = Number(epProg[ep.id] || 0);
    if (!(fraction > 0.02) || fraction >= threshold) continue;
    const act = Number(activity[`ep:${ep.id}`] || activity[title.id] || 0);
    const cand = episodeCandidate(ep, fraction, act || fraction, preferred, false);
    if (!cand) continue;
    if (
      !best ||
      cand.activity > best.activity ||
      (cand.activity === best.activity && cand.fraction > best.fraction)
    ) {
      best = cand;
    }
  }
  if (best) return best;

  // 2) Previous episode finished → offer the next one (one card per series)
  let lastCompletedIdx = -1;
  for (let i = 0; i < episodes.length; i++) {
    const fraction = Number(epProg[episodes[i].id] || 0);
    if (fraction >= threshold) lastCompletedIdx = i;
  }
  if (lastCompletedIdx >= 0 && lastCompletedIdx + 1 < episodes.length) {
    const next = episodes[lastCompletedIdx + 1];
    const nextFrac = Number(epProg[next.id] || 0);
    if (nextFrac < threshold) {
      const prev = episodes[lastCompletedIdx];
      const act = Number(
        activity[`ep:${next.id}`] ||
          activity[`ep:${prev.id}`] ||
          activity[title.id] ||
          Date.now()
      );
      return episodeCandidate(
        next,
        nextFrac > 0.02 ? nextFrac : 0,
        act,
        preferred,
        nextFrac <= 0.02
      );
    }
  }

  return null;
}

/**
 * Build continue-watching cards for a filtered title list (already visibility-filtered).
 * @returns {Array<object>} UI-ish cards (not full catalog dump)
 */
export function buildContinueWatching(filteredTitles, prefs, toUiItem, limit = 24) {
  const dismissed = new Set(prefs.dismissedContinueIds || []);
  const itemProg = prefs.progressByItemId || {};
  const activity = prefs.continueActivityById || {};
  const snap = prefs.continueResumeByTitleId || {};
  const threshold = Number(prefs.continueCompletedThreshold ?? DEFAULT_COMPLETED_THRESHOLD);
  const cards = [];

  for (const t of filteredTitles) {
    if (dismissed.has(t.id)) continue;

    const workKey = workIdOf(t) || workDedupeKey(t) || t.id;
    const pushFilmLike = (fraction, streamId, act) => {
      if (!(fraction > 0.02) || fraction >= threshold) return;
      const base = toUiItem(t, fraction);
      cards.push({
        ...base,
        logicalWorkId: workKey,
        progressFraction: fraction,
        resumeStreamId: streamId || snap[t.id]?.streamId || base.selectedVersionId || null,
        remainingMinutes:
          t.durationMinutes && fraction > 0
            ? Math.max(1, Math.round(t.durationMinutes * (1 - fraction)))
            : null,
        _activity: Number(act || activity[t.id] || fraction)
      });
    };

    if (t.type === 'SERIES') {
      const hasEpisodes = (t.episodes || []).length > 0;
      // Series shell without episode list → title progress + resume snapshot.
      if (!hasEpisodes) {
        const stored = snap[t.id];
        const fraction = Number(itemProg[t.id] || stored?.fraction || 0);
        if (!(fraction > 0.02) || fraction >= threshold) continue;
        const base = toUiItem(t, fraction);
        const season = stored?.season;
        const episode = stored?.episode;
        cards.push({
          ...base,
          logicalWorkId: workKey,
          progressFraction: fraction,
          resumeEpisodeId: stored?.episodeId || null,
          resumeStreamId: stored?.streamId || base.selectedVersionId || null,
          resumeLabel:
            season != null && episode != null
              ? `S${season} · E${episode}`
              : 'Reprendre',
          resumeEpisodeTitle: stored?.episodeTitle || '',
          remainingMinutes: null,
          _activity: Number(activity[t.id] || fraction)
        });
        continue;
      }

      const resume = resumeEpisodeForSeries(t, prefs);
      const stored = snap[t.id];
      const storedFrac = Number(stored?.fraction || 0);
      const liveTitleFrac = Number(itemProg[t.id] || 0);
      // Drop stale snap when live title progress collapsed below threshold
      // (failed re-open / tiny unconfirmed leftovers must not keep the card forever).
      const snapStale =
        !!stored &&
        !resume &&
        liveTitleFrac > 0 &&
        liveTitleFrac <= 0.02 &&
        storedFrac > 0.02;
      const storedUsable =
        stored &&
        stored.streamId &&
        storedFrac > 0.02 &&
        storedFrac < threshold &&
        !snapStale;

      if (!resume && !storedUsable) continue;

      const useFraction = resume
        ? Number(resume.fraction || 0)
        : storedFrac;
      // Next-after-complete may be 0; in-progress / snap must be in (0.02, threshold)
      if (!resume?.isNext && (!(useFraction > 0.02) || useFraction >= threshold)) continue;

      const season = resume?.season ?? stored?.season;
      const episode = resume?.episode ?? stored?.episode;
      const streamId = resume?.streamId || stored?.streamId || null;
      const epTitle = resume?.title || stored?.episodeTitle || '';
      const displayFrac = resume?.isNext ? 0 : useFraction;
      const base = toUiItem(t, displayFrac);
      cards.push({
        ...base,
        logicalWorkId: workKey,
        progressFraction: displayFrac,
        resumeEpisodeId: resume?.episodeId || stored?.episodeId || null,
        resumeStreamId: streamId,
        resumeLabel: resume?.isNext
          ? season != null && episode != null
            ? `Suivant · S${season} · E${episode}`
            : 'Épisode suivant'
          : season != null && episode != null
            ? `S${season} · E${episode}`
            : 'Reprendre',
        resumeEpisodeTitle: epTitle,
        remainingMinutes:
          !resume?.isNext && resume?.durationMinutes && useFraction > 0
            ? Math.max(1, Math.round(resume.durationMinutes * (1 - useFraction)))
            : null,
        _activity: Number(
          resume?.activity ||
            activity[`ep:${resume?.episodeId || stored?.episodeId}`] ||
            activity[t.id] ||
            useFraction ||
            1
        )
      });
      continue;
    }

    // Films — completed (≥ threshold) leave the row
    const fraction = Number(itemProg[t.id] || snap[t.id]?.fraction || 0);
    pushFilmLike(fraction, snap[t.id]?.streamId, activity[t.id]);
  }

  // One Continuer card per logical work (all language editions share progress)
  const byWork = new Map();
  for (const card of cards) {
    const wid =
      card.logicalWorkId ||
      workIdOf({ id: card.id, logicalWorkId: card.logicalWorkId }) ||
      workDedupeKey({ id: card.id, canonicalTitle: card.title, type: card.type }) ||
      card.id;
    const prev = byWork.get(wid);
    if (!prev || (card._activity || 0) > (prev._activity || 0)) {
      byWork.set(wid, { ...card, logicalWorkId: wid });
    }
  }
  const unique = [...byWork.values()];
  unique.sort((a, b) => (b._activity || 0) - (a._activity || 0));
  return unique.slice(0, limit).map(({ _activity, ...rest }) => ({
    ...rest,
    continueActivity: _activity
  }));
}

export function touchContinueActivity(prefs, { contentId, episodeId }) {
  const map = { ...(prefs.continueActivityById || {}) };
  const now = Date.now();
  if (contentId) map[String(contentId)] = now;
  if (episodeId) map[`ep:${episodeId}`] = now;
  prefs.continueActivityById = map;
}

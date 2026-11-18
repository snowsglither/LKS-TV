package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.LogicalEpisode
import com.lkstv.app.domain.iptv.LogicalTitle

object ContinueWatching {
    const val DEFAULT_COMPLETED_THRESHOLD = 0.92f

    data class ResumeEpisode(
        val episodeId: String,
        val season: Int,
        val episode: Int,
        val title: String,
        val fraction: Float,
        val streamId: String?,
        val durationMinutes: Int?,
        val activity: Long,
        val isNext: Boolean = false
    )

    private fun sortedEpisodes(title: LogicalTitle): List<LogicalEpisode> =
        title.episodes.sortedWith(compareBy({ it.seasonNumber }, { it.episodeNumber }))

    private fun candidate(
        ep: LogicalEpisode,
        fraction: Float,
        activity: Long,
        preferredTag: String,
        isNext: Boolean
    ): ResumeEpisode? {
        val chosen = CatalogMergePolicy.selectPreferredEpisodeVersion(ep.versions, preferredTag)
            ?: ep.versions.firstOrNull()
        val stream = chosen?.stream ?: return null
        return ResumeEpisode(
            episodeId = ep.id,
            season = ep.seasonNumber,
            episode = ep.episodeNumber,
            title = ep.title,
            fraction = fraction,
            streamId = stream.id,
            durationMinutes = null,
            activity = activity,
            isNext = isNext
        )
    }

    fun resumeEpisodeForSeries(title: LogicalTitle, prefs: ProfilePreferences): ResumeEpisode? {
        val threshold = prefs.continueCompletedThreshold
        val preferredTag = prefs.preferredAudioTag()
        val episodes = sortedEpisodes(title)
        var best: ResumeEpisode? = null

        for (ep in episodes) {
            val fraction = prefs.progressByEpisodeId[ep.id] ?: 0f
            if (fraction <= 0.02f || fraction >= threshold) continue
            val act = prefs.continueActivityById["ep:${ep.id}"]
                ?: prefs.continueActivityById[title.id]
                ?: (fraction * 1_000_000).toLong()
            val cand = candidate(ep, fraction, act, preferredTag, isNext = false) ?: continue
            if (best == null || cand.activity > best.activity ||
                (cand.activity == best.activity && cand.fraction > best.fraction)
            ) {
                best = cand
            }
        }
        if (best != null) return best

        var lastCompletedIdx = -1
        for (i in episodes.indices) {
            val fraction = prefs.progressByEpisodeId[episodes[i].id] ?: 0f
            if (fraction >= threshold) lastCompletedIdx = i
        }
        if (lastCompletedIdx >= 0 && lastCompletedIdx + 1 < episodes.size) {
            val next = episodes[lastCompletedIdx + 1]
            val nextFrac = prefs.progressByEpisodeId[next.id] ?: 0f
            if (nextFrac < threshold) {
                val prev = episodes[lastCompletedIdx]
                val act = prefs.continueActivityById["ep:${next.id}"]
                    ?: prefs.continueActivityById["ep:${prev.id}"]
                    ?: prefs.continueActivityById[title.id]
                    ?: System.currentTimeMillis()
                return candidate(
                    next,
                    if (nextFrac > 0.02f) nextFrac else 0f,
                    act,
                    preferredTag,
                    isNext = nextFrac <= 0.02f
                )
            }
        }
        return null
    }

    fun build(
        titles: List<LogicalTitle>,
        prefs: ProfilePreferences,
        toItem: (LogicalTitle, Float) -> CatalogItem,
        limit: Int = 24
    ): List<CatalogItem> {
        val threshold = prefs.continueCompletedThreshold
        val snap = prefs.continueResumeByTitleId
        val cards = ArrayList<Pair<Long, CatalogItem>>()
        for (t in titles) {
            if (t.id in prefs.dismissedContinueIds) continue
            if (t.type == ContentType.SERIES) {
                // Series shell without episodes → title progress + resume snapshot
                if (t.episodes.isEmpty()) {
                    val stored = snap[t.id]
                    val fraction = prefs.progressByItemId[t.id] ?: stored?.fraction ?: 0f
                    if (fraction <= 0.02f || fraction >= threshold) continue
                    val act = prefs.continueActivityById[t.id] ?: (fraction * 1_000_000).toLong()
                    val label = when {
                        stored?.season != null && stored.episode != null ->
                            "S${stored.season} · E${stored.episode}"
                        else -> "Reprendre"
                    }
                    cards += act to toItem(t, fraction).copy(
                        resumeStreamId = stored?.streamId,
                        resumeEpisodeId = stored?.episodeId,
                        resumeLabel = label,
                        continueActivity = act
                    )
                    continue
                }

                val resume = resumeEpisodeForSeries(t, prefs)
                val stored = snap[t.id]
                val storedFrac = stored?.fraction ?: 0f
                val liveTitleFrac = prefs.progressByItemId[t.id] ?: 0f
                val snapStale = resume == null &&
                    stored != null &&
                    liveTitleFrac > 0f &&
                    liveTitleFrac <= 0.02f &&
                    storedFrac > 0.02f
                val storedUsable = stored != null &&
                    !stored.streamId.isNullOrBlank() &&
                    storedFrac > 0.02f &&
                    storedFrac < threshold &&
                    !snapStale
                if (resume == null && !storedUsable) continue

                val useFraction = resume?.fraction ?: storedFrac
                if (resume?.isNext != true && (useFraction <= 0.02f || useFraction >= threshold)) continue

                val season = resume?.season ?: stored?.season
                val episode = resume?.episode ?: stored?.episode
                val streamId = resume?.streamId ?: stored?.streamId
                val displayFrac = if (resume?.isNext == true) 0f else useFraction
                val activity = resume?.activity
                    ?: prefs.continueActivityById["ep:${resume?.episodeId ?: stored?.episodeId}"]
                    ?: prefs.continueActivityById[t.id]
                    ?: (useFraction * 1_000_000).toLong().coerceAtLeast(1L)
                val label = when {
                    resume?.isNext == true && season != null && episode != null ->
                        "Suivant · S$season · E$episode"
                    resume?.isNext == true -> "Épisode suivant"
                    season != null && episode != null -> "S$season · E$episode"
                    else -> "Reprendre"
                }
                val item = toItem(t, displayFrac).copy(
                    progressFraction = displayFrac,
                    resumeLabel = label,
                    resumeStreamId = streamId,
                    resumeEpisodeId = resume?.episodeId ?: stored?.episodeId,
                    continueActivity = activity
                )
                cards += activity to item
            } else {
                val fraction = prefs.progressByItemId[t.id] ?: snap[t.id]?.fraction ?: 0f
                if (fraction <= 0.02f || fraction >= threshold) continue
                val act = prefs.continueActivityById[t.id] ?: (fraction * 1_000_000).toLong()
                val item = toItem(t, fraction).copy(
                    resumeStreamId = snap[t.id]?.streamId,
                    continueActivity = act
                )
                cards += act to item
            }
        }
        // One Continuer card per logical work across language editions
        val workIds = WorkIdentity.assignLogicalWorkIds(
            com.lkstv.app.domain.iptv.UnifiedCatalog(titles = titles)
        )
        val byWork = LinkedHashMap<String, Pair<Long, CatalogItem>>()
        for ((act, item) in cards) {
            val wid = workIds[item.id] ?: "id:${item.id}"
            val prev = byWork[wid]
            if (prev == null || act > prev.first) {
                byWork[wid] = act to item
            }
        }
        return byWork.values.sortedByDescending { it.first }.take(limit).map { it.second }
    }
}

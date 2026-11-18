package com.lkstv.app.domain

/**
 * Per-episode playback helpers — profile-scoped; never invents progress.
 */
object EpisodeProgress {
    const val COMPLETED_THRESHOLD = 0.92f
    const val STARTED_THRESHOLD = 0.02f
    const val RESUME_MARGIN_MS = 4_000L

    enum class WatchState { NONE, IN_PROGRESS, COMPLETED }

    fun watchState(
        fraction: Float,
        threshold: Float = COMPLETED_THRESHOLD
    ): WatchState {
        if (fraction <= STARTED_THRESHOLD) return WatchState.NONE
        if (fraction >= threshold) return WatchState.COMPLETED
        return WatchState.IN_PROGRESS
    }

    fun episodeKey(
        episodeId: String?,
        sourceId: String? = null,
        seriesProviderId: String? = null,
        season: Int? = null,
        episode: Int? = null
    ): String {
        if (!episodeId.isNullOrBlank()) return episodeId
        val src = sourceId?.takeIf { it.isNotBlank() } ?: "src"
        val series = seriesProviderId?.takeIf { it.isNotBlank() } ?: "series"
        return "ep:$src:$series:${season ?: 0}:${episode ?: 0}"
    }

    fun resumePositionMs(
        positionMs: Long,
        durationMs: Long,
        fraction: Float,
        marginMs: Long = RESUME_MARGIN_MS
    ): Long {
        var pos = positionMs
        if (pos <= 0L && durationMs > 0L && fraction > STARTED_THRESHOLD) {
            pos = (fraction * durationMs).toLong()
        }
        if (pos <= 0L) return 0L
        val capped = if (durationMs > 0L) minOf(pos, (durationMs - 1_000L).coerceAtLeast(0L)) else pos
        return (capped - marginMs).coerceAtLeast(0L)
    }
}

data class EpisodePlaybackState(
    val key: String,
    val episodeId: String,
    val seriesId: String? = null,
    val sourceId: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val streamId: String? = null,
    val fraction: Float = 0f,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val updatedAt: Long = 0L
)

package com.lkstv.app.domain

/**
 * Centralized back-stack for Android TV destinations.
 * Opening context is explicit — never invent Live TV / Series from stale state.
 */
class NavStack(private val maxDepth: Int = 32) {
    private val frames = ArrayDeque<AppDestination>()

    fun clear(root: AppDestination = AppDestination.Hub) {
        frames.clear()
        frames.addLast(root)
    }

    fun peek(): AppDestination? = frames.lastOrNull()

    fun depth(): Int = frames.size

    fun push(dest: AppDestination) {
        val top = frames.lastOrNull()
        if (top != null && sameLogical(top, dest)) {
            frames.removeLast()
            frames.addLast(dest)
            return
        }
        frames.addLast(dest)
        while (frames.size > maxDepth) frames.removeFirst()
    }

    fun pop(): AppDestination {
        if (frames.size > 1) frames.removeLast()
        return frames.lastOrNull() ?: AppDestination.Hub
    }

    private fun sameLogical(a: AppDestination, b: AppDestination): Boolean {
        if (a::class != b::class) return false
        return when {
            a is AppDestination.FilmDetail && b is AppDestination.FilmDetail -> a.itemId == b.itemId
            a is AppDestination.SeriesDetail && b is AppDestination.SeriesDetail -> a.itemId == b.itemId
            a is AppDestination.Section && b is AppDestination.Section -> a.section == b.section
            a is AppDestination.Player && b is AppDestination.Player -> a.playbackRef == b.playbackRef
            else -> a == b
        }
    }
}

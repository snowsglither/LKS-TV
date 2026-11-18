package com.lkstv.app

import com.lkstv.app.domain.AppDestination
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.NavStack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NavStackTest {
    @Test
    fun filmsDetailPlayerBackRestoresDetailThenFilms() {
        val stack = NavStack()
        stack.clear(AppDestination.Hub)
        stack.push(AppDestination.Section(HubSection.FILMS))
        stack.push(AppDestination.FilmDetail("film-1"))
        stack.push(
            AppDestination.Player(
                title = "Film",
                playbackRef = "ref",
                returnDestination = AppDestination.FilmDetail("film-1")
            )
        )
        assertTrue(stack.peek() is AppDestination.Player)
        stack.pop()
        assertEquals("film-1", (stack.peek() as AppDestination.FilmDetail).itemId)
        stack.pop()
        assertEquals(HubSection.FILMS, (stack.peek() as AppDestination.Section).section)
    }

    @Test
    fun searchDetailBackKeepsSearchOnStack() {
        val stack = NavStack()
        stack.clear(AppDestination.Search)
        stack.push(AppDestination.SeriesDetail("s1"))
        stack.pop()
        assertEquals(AppDestination.Search, stack.peek())
    }
}

package com.lkstv.app

import com.lkstv.app.domain.AppDestination
import com.lkstv.app.domain.HubSection
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PlayerReturnDestinationTest {

    @Test
    fun player_from_series_detail_returns_to_series_detail_not_live() {
        val back = AppDestination.SeriesDetail("ser1")
        val player = AppDestination.Player(
            title = "Episode",
            playbackRef = "lks-xtream://x",
            returnToLive = false,
            returnDestination = back
        )
        val resolved = player.returnDestination
            ?: if (player.returnToLive) AppDestination.LiveTv else AppDestination.Hub
        assertEquals(back, resolved)
        assertFalse(resolved is AppDestination.LiveTv)
    }

    @Test
    fun player_from_films_section_returns_to_films() {
        val back = AppDestination.Section(HubSection.FILMS)
        val player = AppDestination.Player("Film", "url", false, back)
        assertEquals(back, player.returnDestination)
    }

    @Test
    fun player_from_live_returns_to_live() {
        val player = AppDestination.Player(
            "Channel",
            "url",
            returnToLive = true,
            returnDestination = AppDestination.LiveTv
        )
        assertEquals(AppDestination.LiveTv, player.returnDestination)
    }
}

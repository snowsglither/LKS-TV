package com.lkstv.app.iptv

import com.lkstv.app.data.iptv.xtream.XtreamJsonParser
import com.lkstv.app.domain.iptv.IptvException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class XtreamJsonParserTest {

    @Test
    fun parsesActiveAccount() {
        val json = """{"user_info":{"auth":1,"status":"Active","username":"demo"}}"""
        val info = XtreamJsonParser.parseAccount(json)
        assertTrue(info.isActive)
        assertEquals("Active", info.status)
    }

    @Test(expected = IptvException.Auth::class)
    fun rejectsBadCredentialsWithoutLoggingSecret() {
        val json = """{"user_info":{"auth":0,"status":"Disabled"}}"""
        XtreamJsonParser.parseAccount(json)
    }

    @Test
    fun parsesCategoriesAndStreams() {
        val cats = XtreamJsonParser.parseCategories(
            """[{"category_id":"1","category_name":"Films"},{"category_id":"2","category_name":"Kids"}]"""
        )
        assertEquals(2, cats.size)
        val streams = XtreamJsonParser.parseStreams(
            """[{"stream_id":"9","name":"Demo Movie","category_id":"1","tmdb_id":"550","year":"2020"}]"""
        )
        assertEquals("9", streams.first().streamId)
        assertEquals("550", streams.first().tmdbId)
    }

    @Test
    fun parsesSeriesEpisodesObject() {
        val json = """
            {"episodes":{"1":[{"id":"e1","episode_num":1,"title":"Pilot"},{"id":"e2","episode_num":2,"title":"Next"}]}}
        """.trimIndent()
        val eps = XtreamJsonParser.parseSeriesInfoEpisodes(json)
        assertEquals(2, eps.size)
        assertEquals(1, eps.first().season)
    }
}

package com.lkstv.app

import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.FakeCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FakeCatalogTest {

    @Test
    fun catalogContainsFilmsAndSeries() {
        assertTrue(FakeCatalog.films().isNotEmpty())
        assertTrue(FakeCatalog.series().isNotEmpty())
        assertEquals(2, FakeCatalog.profiles.size)
    }

    @Test
    fun rowsAreNonEmptyForFilms() {
        val rows = FakeCatalog.buildRows(ContentType.FILM)
        assertTrue(rows.isNotEmpty())
        assertTrue(rows.all { it.items.isNotEmpty() })
    }

    @Test
    fun seriesHaveSeasonsAndEpisodes() {
        val series = FakeCatalog.require("series_aurora")
        assertTrue(series.seasons.isNotEmpty())
        assertTrue(series.seasons.first().episodes.isNotEmpty())
    }
}

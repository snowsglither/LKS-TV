package com.lkstv.app

import com.lkstv.app.ui.screens.episodeSpecificSynopsis
import com.lkstv.app.ui.screens.userFacingRating
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DetailPresentationTest {

    @Test
    fun userFacingRating_hidesTechnicalMergeLabels() {
        assertNull(userFacingRating(""))
        assertNull(userFacingRating("Source"))
        assertNull(userFacingRating("Multi-versions"))
        assertNull(userFacingRating("Fusion fiable"))
        assertEquals("16+", userFacingRating("16+"))
        assertEquals("7.8", userFacingRating("7.8"))
    }

    @Test
    fun episodeSynopsis_skipsSeriesPlotDuplicate() {
        val series = "Une famille mafieuse à Londres."
        assertEquals("", episodeSpecificSynopsis(series, series))
        assertEquals("", episodeSpecificSynopsis("  $series  ", series))
        assertEquals("Harry rencontre Conrad.", episodeSpecificSynopsis("Harry rencontre Conrad.", series))
        assertEquals("", episodeSpecificSynopsis("", series))
    }
}

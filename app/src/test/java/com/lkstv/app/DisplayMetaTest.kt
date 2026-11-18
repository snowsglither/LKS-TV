package com.lkstv.app

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.StreamRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DisplayMetaTest {

    @Test
    fun versionLabels_areDistinctWhenLanguageUnknown() {
        val a = stream("a", "Cross S01 1080p")
        val b = stream("b", "Cross S01 720p")
        val la = DisplayMeta.versionLabel(a, 0, 2, "Series FR")
        val lb = DisplayMeta.versionLabel(b, 1, 2, "Series FR")
        assertFalse(la == lb)
        assertFalse(la == "Langue inconnue")
        assertFalse(lb == "Langue inconnue")
    }

    @Test
    fun detectLang_fromPrefixes() {
        val (lang, conf) = DisplayMeta.detectLang("[VF] Cross", "")
        assertEquals(AudioLanguage.VF, lang)
        assertTrue(conf == LanguageConfidence.KNOWN || conf == LanguageConfidence.ASSUMED)
    }

    @Test
    fun detectLanguageTag_internationalAndEditions() {
        assertEquals("nl", DisplayMeta.detectLanguageTag("Serie (NL)", "").tag)
        assertEquals("ar", DisplayMeta.detectLanguageTag("Film [ARA]", "").tag)
        assertEquals("edition:multi", DisplayMeta.detectLanguageTag("Film MULTI", "").tag)
        assertEquals("ja", DisplayMeta.detectLanguageTag("Anime [JPN]", "").tag)
    }

    @Test
    fun cleanEpisodeTitle_stripsTechnicalPrefix() {
        assertEquals("Pilote", DisplayMeta.cleanEpisodeTitle("S01E01 - Pilote", 1, 1))
        assertEquals("Épisode 2", DisplayMeta.cleanEpisodeTitle("S01E02", 1, 2))
    }

    private fun stream(id: String, raw: String) = StreamRef(
        id = id,
        sourceId = IptvSourceId("s"),
        providerStreamId = id,
        playbackUrl = "http://example.com/$id",
        groupId = "g",
        language = AudioLanguage.UNKNOWN,
        languageConfidence = LanguageConfidence.UNKNOWN,
        rawTitle = raw
    )
}

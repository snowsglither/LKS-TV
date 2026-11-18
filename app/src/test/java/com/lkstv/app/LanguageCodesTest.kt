package com.lkstv.app

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.StreamRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LanguageCodesTest {

    @Test
    fun normalize_twoAndThreeLetterAliases() {
        assertEquals("fr", LanguageCodes.normalize("FR"))
        assertEquals("fr", LanguageCodes.normalize("FRA"))
        assertEquals("fr", LanguageCodes.normalize("FRE"))
        assertEquals("nl", LanguageCodes.normalize("NL"))
        assertEquals("nl", LanguageCodes.normalize("NLD"))
        assertEquals("nl", LanguageCodes.normalize("DUT"))
        assertEquals("en", LanguageCodes.normalize("ENG"))
        assertEquals("de", LanguageCodes.normalize("GER"))
        assertEquals("de", LanguageCodes.normalize("DEU"))
        assertEquals("ar", LanguageCodes.normalize("ARA"))
        assertEquals("tr", LanguageCodes.normalize("TUR"))
        assertEquals("pt", LanguageCodes.normalize("POR"))
        assertEquals("es", LanguageCodes.normalize("SPA"))
        assertEquals("it", LanguageCodes.normalize("ITA"))
        assertEquals("ja", LanguageCodes.normalize("JPN"))
        assertEquals("ko", LanguageCodes.normalize("KOR"))
        assertEquals("zh", LanguageCodes.normalize("CHI"))
        assertEquals("zh-Hant", LanguageCodes.normalize("zh-Hant"))
        assertEquals("pt-BR", LanguageCodes.normalize("pt-BR"))
    }

    @Test
    fun editions_areNotIsoLanguages() {
        assertEquals("edition:vf", LanguageCodes.normalize("VF"))
        assertEquals("edition:vo", LanguageCodes.normalize("VO"))
        assertEquals("edition:multi", LanguageCodes.normalize("MULTI"))
        assertTrue(LanguageCodes.isEdition("edition:vostfr"))
        assertFalse(LanguageCodes.isEdition("fr"))
    }

    @Test
    fun displayNames_french() {
        assertEquals("Néerlandais", LanguageCodes.displayName("NL"))
        assertEquals("Français", LanguageCodes.displayName("FR"))
        assertEquals("Anglais", LanguageCodes.displayName("EN"))
        assertEquals("Arabe", LanguageCodes.displayName("AR"))
        assertEquals("Turc", LanguageCodes.displayName("TR"))
        assertEquals("Portugais (Brésil)", LanguageCodes.displayName("PT-BR"))
        assertEquals("Chinois traditionnel", LanguageCodes.displayName("zh-Hant"))
        assertEquals("VF", LanguageCodes.displayName("edition:vf"))
        assertEquals("Multi", LanguageCodes.displayName("MULTI"))
        assertEquals("Langue non renseignée", LanguageCodes.displayName("", useful = true))
        assertEquals("", LanguageCodes.displayName("", useful = false))
    }

    @Test
    fun rareLanguage_usesLocaleNotAllowlist() {
        val name = LanguageCodes.displayName("eu") // Basque
        assertTrue(name.isNotBlank())
        assertFalse(name.equals("UNKNOWN", ignoreCase = true))
        assertFalse(name.equals("Langue inconnue", ignoreCase = true))
    }

    @Test
    fun ambiguousIptvPrefixes_areNotLanguages() {
        assertEquals("", LanguageCodes.normalize("GB"))
        assertEquals("", LanguageCodes.normalize("AL"))
        assertEquals("", LanguageCodes.normalize("EX"))
        assertEquals("", LanguageCodes.normalize("GR"))
        assertEquals("", LanguageCodes.detect("GB - The Day of the Jackal (2024)").tag)
        assertEquals("", LanguageCodes.detect("AL - Serie XYZ").tag)
        assertEquals("en", LanguageCodes.detect("EN - The Day of the Jackal (2024)").tag)
        assertEquals("Édition GB", run {
            val tech = DisplayMeta.technicalEditionKey("GB - The Day of the Jackal (2024)")
            if (tech.isNotBlank()) "Édition $tech" else ""
        })
    }

    @Test
    fun episodeTitles_doNotRepeatSeriesBlob() {
        val cleaned = DisplayMeta.cleanEpisodeTitle(
            "EN - The Day of the Jackal (2024) - S01E01 - Episode 1",
            1,
            1,
            "EN - The Day of the Jackal (2024)"
        )
        assertEquals("Épisode 1", cleaned)
        assertEquals("1. Épisode 1", DisplayMeta.formatEpisodeListLabel(cleaned, 1))
        assertEquals(
            "The Day of the Jackal (2024) — S1:E1",
            DisplayMeta.formatPlayerSeriesTitle("EN - The Day of the Jackal (2024)", 1, 1)
        )
        assertEquals(
            "Chacal (2024) — S1:E8",
            DisplayMeta.formatPlayerSeriesTitle("Chacal (2024) (GB)", 1, 8)
        )
    }

    @Test
    fun detect_titleTokens() {
        assertEquals("edition:vf", LanguageCodes.detect("[VF] Film").tag)
        assertEquals("edition:multi", LanguageCodes.detect("Film MULTI 1080p").tag)
        assertEquals("nl", LanguageCodes.detect("Serie (NL)").tag)
        assertEquals("ar", LanguageCodes.detect("Film [ARA]").tag)
        assertEquals("ja", LanguageCodes.detect("Anime [JPN]").tag)
        assertEquals("tr", LanguageCodes.detect("Dizi [TUR]").tag)
        assertEquals("pt", LanguageCodes.detect("Filme [POR]").tag)
        assertEquals("en", LanguageCodes.detect("Movie [ENG]").tag)
    }

    @Test
    fun selectPreferred_fallsBackCleanly() {
        val vf = stream("1", "Film VF", "edition:vf", AudioLanguage.VF)
        val en = stream("2", "Film ENG", "en", AudioLanguage.EN)
        val chosen = CatalogMergePolicy.selectPreferredVariant(listOf(en, vf), "edition:vf")
        assertEquals("1", chosen?.id)
        val fallback = CatalogMergePolicy.selectPreferredVariant(listOf(en), "edition:vf")
        assertEquals("2", fallback?.id)
    }

    @Test
    fun versionLabel_noUnknownSpam() {
        val s = stream("x", "Cross S01 1080p MKV", "", AudioLanguage.UNKNOWN)
        val label = DisplayMeta.versionLabel(s, 0, 3, "Action")
        assertFalse(label.contains("UNKNOWN", ignoreCase = true))
        assertFalse(label.contains("Langue inconnue", ignoreCase = true))
        assertTrue(label.contains("1080P") || label.contains("Version") || label.contains("v1") || label.contains("Action"))
    }

    @Test
    fun groupNl_doesNotForceAudioWithoutTitleEvidence() {
        // Category (NL) alone is assumed at most — detect with useGroup still ok as ASSUMED
        val d = LanguageCodes.detect("Generic Title", "Films (NL)", useGroup = true)
        assertTrue(d.tag == "nl" || d.tag.isEmpty())
        if (d.tag == "nl") assertEquals(LanguageConfidence.ASSUMED, d.confidence)
    }

    private fun stream(
        id: String,
        raw: String,
        tag: String,
        lang: AudioLanguage
    ) = StreamRef(
        id = id,
        sourceId = IptvSourceId("s"),
        providerStreamId = id,
        playbackUrl = "http://example.com/$id",
        groupId = "g",
        language = lang,
        languageConfidence = if (tag.isBlank()) LanguageConfidence.UNKNOWN else LanguageConfidence.KNOWN,
        rawTitle = raw,
        languageTag = tag
    )
}

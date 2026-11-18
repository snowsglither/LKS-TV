package com.lkstv.app.iptv

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.MatchKey
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.StreamRef
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogMergePolicyTest {

    @Test
    fun doesNotMergeAmbiguousSameTitle() {
        val a = CatalogMergePolicy.IncomingTitle(
            type = ContentType.FILM,
            title = "Same Title",
            matchKey = CatalogMergePolicy.newLocalMatchKey(IptvSourceId("s1"), "1"),
            variants = listOf(stream("s1", "1"))
        )
        val b = CatalogMergePolicy.IncomingTitle(
            type = ContentType.FILM,
            title = "Same Title",
            matchKey = CatalogMergePolicy.newLocalMatchKey(IptvSourceId("s2"), "9"),
            variants = listOf(stream("s2", "9"))
        )
        val merged = CatalogMergePolicy.merge(listOf(a, b))
        assertEquals(2, merged.size)
        assertFalse(CatalogMergePolicy.wouldAutoMerge(a.matchKey, b.matchKey))
    }

    @Test
    fun mergesOnTrustedExternalKey() {
        val key = CatalogMergePolicy.externalMatchKey("tmdb:550")
        val a = CatalogMergePolicy.IncomingTitle(
            type = ContentType.FILM,
            title = "Film VF",
            matchKey = key,
            variants = listOf(stream("s1", "1", AudioLanguage.VF))
        )
        val b = CatalogMergePolicy.IncomingTitle(
            type = ContentType.FILM,
            title = "Film EN",
            matchKey = key,
            variants = listOf(stream("s2", "2", AudioLanguage.EN))
        )
        val merged = CatalogMergePolicy.merge(listOf(a, b))
        assertEquals(1, merged.size)
        assertEquals(2, merged.first().variants.size)
        assertTrue(CatalogMergePolicy.wouldAutoMerge(a.matchKey, b.matchKey))
    }

    @Test
    fun prefersVfWhenSelectingVariant() {
        val variants = listOf(
            stream("s1", "en", AudioLanguage.EN),
            stream("s1", "vf", AudioLanguage.VF)
        )
        val chosen = CatalogMergePolicy.selectPreferredVariant(variants, AudioLanguage.VF)
        assertEquals(AudioLanguage.VF, chosen?.language)
    }

    @Test
    fun explicitKeysAreTrusted() {
        val key = MatchKey(MatchKeyType.EXPLICIT, "link-1")
        assertTrue(
            CatalogMergePolicy.wouldAutoMerge(key, MatchKey(MatchKeyType.EXPLICIT, "link-1"))
        )
    }

    @Test
    fun mergesSeriesEditionsOnTitleYear() {
        val key = CatalogMergePolicy.seriesTitleYearKey("FR - Demo Series (2024)", 2024)!!
        val a = CatalogMergePolicy.IncomingTitle(
            type = ContentType.SERIES,
            title = "FR - Demo Series (2024)",
            year = 2024,
            matchKey = key
        )
        val b = CatalogMergePolicy.IncomingTitle(
            type = ContentType.SERIES,
            title = "ES - Demo Series (2024)",
            year = 2024,
            matchKey = CatalogMergePolicy.seriesTitleYearKey("ES - Demo Series (2024)", 2024)!!
        )
        val merged = CatalogMergePolicy.merge(listOf(a, b))
        assertEquals(1, merged.size)
        assertEquals(MatchKeyType.TITLE_YEAR, merged.first().matchKey.type)
        assertTrue(CatalogMergePolicy.wouldAutoMerge(a.matchKey, b.matchKey))
    }

    @Test
    fun refusesTitleYearWithoutYearOrShortTitle() {
        assertEquals(null, CatalogMergePolicy.seriesTitleYearKey("FR - Demo Series", null))
        assertEquals(null, CatalogMergePolicy.seriesTitleYearKey("AB", 2024))
    }

    private fun stream(
        source: String,
        id: String,
        lang: AudioLanguage = AudioLanguage.UNKNOWN
    ) = StreamRef(
        id = "$source-$id",
        sourceId = IptvSourceId(source),
        providerStreamId = id,
        playbackUrl = "http://example.invalid/$id",
        groupId = "$source::g",
        language = lang,
        languageConfidence = if (lang == AudioLanguage.UNKNOWN) LanguageConfidence.UNKNOWN
        else LanguageConfidence.KNOWN
    )
}

package com.lkstv.app

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.CatalogPresenter
import com.lkstv.app.domain.CatalogScreenStatus
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.HomeRowId
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.SectionGroupConfig
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.StreamRef
import com.lkstv.app.domain.iptv.UnifiedCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogPresenterTest {

    private val source = IptvSourceId("src1")
    private val groupKids = IptvGroup(
        id = "src1::Jeunesse",
        sourceId = source,
        providerGroupId = "Jeunesse",
        name = "Jeunesse",
        kind = ProviderCategoryKind.VOD
    )
    private val groupFilms = IptvGroup(
        id = "src1::Films",
        sourceId = source,
        providerGroupId = "Films",
        name = "Films",
        kind = ProviderCategoryKind.VOD
    )

    private fun stream(id: String, groupId: String, lang: AudioLanguage = AudioLanguage.VF) = StreamRef(
        id = id,
        sourceId = source,
        providerStreamId = id,
        playbackUrl = "http://example.invalid/$id",
        groupId = groupId,
        language = lang,
        languageConfidence = if (lang == AudioLanguage.UNKNOWN) LanguageConfidence.UNKNOWN
        else LanguageConfidence.KNOWN,
        rawTitle = id
    )

    private fun catalog(): UnifiedCatalog {
        val local = CatalogMergePolicy.newLocalMatchKey(source, "a")
        val ext = CatalogMergePolicy.externalMatchKey("tmdb:1")
        val filmA = LogicalTitle(
            id = "logical:local:a",
            type = ContentType.FILM,
            canonicalTitle = "Alpha",
            year = 2024,
            matchKey = local,
            variants = listOf(stream("a", groupFilms.id, AudioLanguage.VF)),
            singleSourceOnly = true
        )
        val filmB = LogicalTitle(
            id = "logical:ext:tmdb:1",
            type = ContentType.FILM,
            canonicalTitle = "Beta",
            year = 2022,
            matchKey = ext,
            variants = listOf(
                stream("b-vf", groupFilms.id, AudioLanguage.VF),
                stream("b-en", groupKids.id, AudioLanguage.EN)
            ),
            singleSourceOnly = false
        )
        val kidsOnly = LogicalTitle(
            id = "logical:local:k",
            type = ContentType.FILM,
            canonicalTitle = "Kids Show",
            year = 2021,
            matchKey = CatalogMergePolicy.newLocalMatchKey(source, "k"),
            variants = listOf(stream("k", groupKids.id, AudioLanguage.UNKNOWN)),
            singleSourceOnly = true
        )
        return UnifiedCatalog(
            groups = listOf(groupFilms, groupKids),
            titles = listOf(filmA, filmB, kidsOnly),
            generatedAtEpochMs = 1L
        )
    }

    @Test
    fun emptyWithoutSources() {
        val status = CatalogPresenter.status(false, UnifiedCatalog(), false, null)
        assertEquals(CatalogScreenStatus.EMPTY_NO_SOURCES, status)
    }

    @Test
    fun disabledSourcesStillShowPersistedCatalogAsReadyIfTitlesExist() {
        val status = CatalogPresenter.status(false, catalog(), false, null)
        assertEquals(CatalogScreenStatus.READY, status)
    }

    private fun filmsAllow(vararg ids: String) = ProfilePreferences(
        visibleRowIds = listOf(HomeRowId.LIBRARY_SYNCED, HomeRowId.NEW_RELEASES),
        preferredLanguage = AudioLanguage.VF,
        sectionGroupPrefs = mapOf(
            CatalogSectionKey.FILMS to SectionGroupConfig(
                configured = true,
                selectedGroupIds = ids.toSet()
            )
        )
    )

    @Test
    fun allowlistFiltersRowsButKeepsMultiGroupTitle() {
        val prefs = filmsAllow(groupFilms.id)
        val rows = CatalogPresenter.buildRows(catalog(), ContentType.FILM, prefs)
        val all = rows.flatMap { it.items }.distinctBy { it.id }
        assertTrue(all.any { it.title == "Alpha" })
        assertTrue(all.any { it.title == "Beta" }) // still visible via Films group
        assertFalse(all.any { it.title == "Kids Show" })
        assertFalse(rows.any { it.key.contains("Jeunesse") })
    }

    @Test
    fun unconfiguredSectionShowsNothing() {
        val prefs = ProfilePreferences(preferredLanguage = AudioLanguage.VF)
        assertTrue(CatalogPresenter.visibleTitles(catalog(), ContentType.FILM, prefs).isEmpty())
    }

    @Test
    fun prefersVfAndFlagsUnknownLanguage() {
        val prefs = filmsAllow(groupFilms.id, groupKids.id)
        val kids = CatalogPresenter.visibleTitles(catalog(), ContentType.FILM, prefs)
            .first { it.title == "Kids Show" }
        assertTrue(kids.hasUnknownLanguageVersion)
        val beta = CatalogPresenter.visibleTitles(catalog(), ContentType.FILM, prefs)
            .first { it.title == "Beta" }
        assertEquals("b-vf", beta.selectedVersionId)
        assertTrue(beta.trustedMerge)
        assertEquals(MatchKeyType.PROVIDER_EXTERNAL, catalog().titles.first { it.id == beta.id }.matchKey.type)
    }

    @Test
    fun unfeedableRowsNeverInventContent() {
        val prefs = filmsAllow(groupFilms.id, groupKids.id).copy(
            visibleRowIds = listOf(
                HomeRowId.MONTHLY_PICKS,
                HomeRowId.TOP_OF_MONTH,
                HomeRowId.RECOMMENDATIONS,
                HomeRowId.LIBRARY_SYNCED
            )
        )
        val rows = CatalogPresenter.buildRows(catalog(), ContentType.FILM, prefs)
        assertFalse(rows.any { it.key == HomeRowId.MONTHLY_PICKS.key })
        assertTrue(rows.any { it.key == HomeRowId.LIBRARY_SYNCED.key })
    }
}

package com.lkstv.app

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.CatalogSearch
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.SearchFilter
import com.lkstv.app.domain.SectionGroupConfig
import com.lkstv.app.domain.WorkIdentity
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKey
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.StreamRef
import com.lkstv.app.domain.iptv.UnifiedCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogSearchTest {

    @Test
    fun normalize_stripsAccentsPossessivesAndCase() {
        assertEquals("cafe noir", CatalogSearch.normalize("Café NOIR"))
        assertEquals("oeuf", CatalogSearch.normalize("Œuf"))
        assertEquals("tyler perry finding joy", CatalogSearch.normalize("Tyler Perry's Finding Joy"))
    }

    @Test
    fun compound_spidermanEqualsSpiderMan() {
        assertEquals(
            CatalogSearch.compact("spider-man"),
            CatalogSearch.compact("spiderman")
        )
        assertEquals(
            CatalogSearch.Score.EXACT_COMPACT,
            CatalogSearch.scoreTitle(
                CatalogSearch.normalize("spiderman"),
                CatalogSearch.normalize("Spider-Man"),
                compactTitle = CatalogSearch.compact("Spider-Man")
            )
        )
    }

    @Test
    fun ranking_rejectsShortPrefixFalsePositives() {
        val superEcran = CatalogSearch.scoreTitle(
            CatalogSearch.normalize("supernatural"),
            CatalogSearch.normalize("CAFR - SUPER ECRAN 1")
        )
        val perry = CatalogSearch.scoreTitle(
            CatalogSearch.normalize("spiderman"),
            CatalogSearch.normalize("Tyler Perry's Finding Joy (2025)")
        )
        assertEquals(CatalogSearch.Score.REJECT, superEcran)
        assertEquals(CatalogSearch.Score.REJECT, perry)

        val exact = CatalogSearch.scoreTitle("supernatural", "supernatural")
        val fuzzy = CatalogSearch.scoreTitle("matrx", "matrix revolutions")
        assertTrue(exact < fuzzy)
        assertTrue(fuzzy < CatalogSearch.Score.REJECT)
    }

    @Test
    fun aliases_moneyHeistFindsCasaDePapel() {
        val score = CatalogSearch.scoreTitle(
            CatalogSearch.normalize("money heist"),
            CatalogSearch.normalize("FR - La Casa de Papel"),
            altNorm = CatalogSearch.normalize("money heist la casa de papel")
        )
        assertTrue(score <= CatalogSearch.Score.EXACT_ALIAS)
    }

    @Test
    fun search_respectsHiddenGroupsAndFilter() {
        val source = IptvSourceId("s1")
        val vod = IptvGroup("s1::vod", source, "vod", "Films", ProviderCategoryKind.VOD)
        val live = IptvGroup("s1::live", source, "live", "TV", ProviderCategoryKind.LIVE)
        val kids = IptvGroup("s1::kids", source, "kids", "Kids", ProviderCategoryKind.VOD)
        val titles = listOf(
            title("t1", "Matrix", ContentType.FILM, "s1::vod"),
            title("t2", "Matrix Reloaded", ContentType.FILM, "s1::kids"),
            title("t3", "News 24", ContentType.FILM, "s1::live"),
            title("t4", "Aurora", ContentType.SERIES, "s1::vod")
        )
        val index = CatalogSearch.buildIndex(
            UnifiedCatalog(groups = listOf(vod, live, kids), titles = titles, generatedAtEpochMs = 1)
        )
        val prefs = ProfilePreferences(
            hiddenGroupIds = setOf("s1::kids"),
            sectionGroupPrefs = mapOf(
                CatalogSectionKey.FILMS to SectionGroupConfig(
                    configured = true,
                    selectedGroupIds = setOf("s1::vod", "s1::kids")
                ),
                CatalogSectionKey.TV to SectionGroupConfig(
                    configured = true,
                    selectedGroupIds = setOf("s1::live")
                ),
                CatalogSectionKey.SERIES to SectionGroupConfig(
                    configured = true,
                    selectedGroupIds = setOf("s1::vod")
                )
            )
        )
        val page = CatalogSearch.search(
            index, "matrix", SearchFilter.FILMS, prefs, AudioLanguage.VF
        )
        assertEquals(1, page.total)
        assertEquals("Matrix", page.hits.single().item.title)

        val tv = CatalogSearch.search(index, "news", SearchFilter.TV, prefs, AudioLanguage.VF)
        assertEquals(1, tv.total)
        assertTrue(tv.hits.single().isLive)
    }

    @Test
    fun search_dedupesTitleYearEditions() {
        val source = IptvSourceId("s1")
        val vod = IptvGroup("s1::vod", source, "vod", "Films", ProviderCategoryKind.VOD)
        val key = MatchKey(MatchKeyType.TITLE_YEAR, "series:demoseries:2024")
        val titles = listOf(
            title("a", "FR - Demo Series (2024)", ContentType.SERIES, "s1::vod", key),
            title("b", "ES - Demo Series (2024)", ContentType.SERIES, "s1::vod", key)
        )
        val index = CatalogSearch.buildIndex(
            UnifiedCatalog(groups = listOf(vod), titles = titles, generatedAtEpochMs = 1)
        )
        val prefs = openPrefs("s1::vod")
        val page = CatalogSearch.search(index, "demo series", SearchFilter.SERIES, prefs, AudioLanguage.VF)
        assertEquals(1, page.total)
    }

    @Test
    fun search_100k_completesUnderBudget() {
        val source = IptvSourceId("load")
        val groups = (0 until 50).map {
            IptvGroup("load::cat$it", source, "cat$it", "Cat $it", ProviderCategoryKind.VOD)
        }
        val titles = ArrayList<LogicalTitle>(100_000)
        for (i in 0 until 100_000) {
            titles.add(title("t$i", "Title $i", ContentType.FILM, "load::cat${i % 50}"))
        }
        titles[42] = title("needle", "Café Étoile", ContentType.FILM, "load::cat1")
        val catalog = UnifiedCatalog(groups, titles, generatedAtEpochMs = 2)
        val tIndex = System.currentTimeMillis()
        val index = CatalogSearch.buildIndex(catalog)
        val indexMs = System.currentTimeMillis() - tIndex
        assertEquals(100_000, index.size)
        assertTrue("index $indexMs ms", indexMs < 15_000)

        val prefs = openPrefs(*groups.map { it.id }.toTypedArray())
        val tSearch = System.currentTimeMillis()
        val page = CatalogSearch.search(
            index, "cafe etoile", SearchFilter.ALL, prefs, AudioLanguage.VF
        )
        val searchMs = System.currentTimeMillis() - tSearch
        assertEquals(1, page.total)
        assertEquals("Café Étoile", page.hits.single().item.title)
        assertTrue("search $searchMs ms", searchMs < 3_000)
    }

    @Test
    fun emptyQuery_returnsNothing() {
        val source = IptvSourceId("s1")
        val vod = IptvGroup("s1::vod", source, "vod", "Films", ProviderCategoryKind.VOD)
        val index = CatalogSearch.buildIndex(
            UnifiedCatalog(
                groups = listOf(vod),
                titles = listOf(title("t1", "Matrix", ContentType.FILM, "s1::vod")),
                generatedAtEpochMs = 1
            )
        )
        val page = CatalogSearch.search(index, "   ", SearchFilter.ALL, openPrefs("s1::vod"), AudioLanguage.VF)
        assertEquals(0, page.total)
    }

    @Test
    fun workIdentity_jackalAndChacalShareWork_not1997Film() {
        val series = IptvGroup("s1::series", IptvSourceId("s1"), "series", "Séries", ProviderCategoryKind.SERIES)
        val films = IptvGroup("s1::vod", IptvSourceId("s1"), "vod", "Films", ProviderCategoryKind.VOD)
        val en = title("jackal-en", "EN - The Day of the Jackal (2024)", ContentType.SERIES, series.id)
            .copy(year = 2024)
        val fr = title("jackal-fr", "FR - Le Chacal (2024)", ContentType.SERIES, series.id)
            .copy(year = 2024)
        val film1997 = title("jackal-1997", "The Jackal (1997)", ContentType.FILM, films.id)
            .copy(year = 1997)
        val catalog = UnifiedCatalog(
            groups = listOf(series, films),
            titles = listOf(en, fr, film1997),
            generatedAtEpochMs = 1L
        )
        val workIds = WorkIdentity.assignLogicalWorkIds(catalog)
        assertEquals(workIds[en.id], workIds[fr.id])
        assertNotEquals(workIds[en.id], workIds[film1997.id])

        val prefs = openPrefs(series.id, films.id)
        val index = CatalogSearch.buildIndex(catalog)
        val jackal = CatalogSearch.search(index, "jackal", SearchFilter.SERIES, prefs, AudioLanguage.VF)
        val chacal = CatalogSearch.search(index, "chacal", SearchFilter.SERIES, prefs, AudioLanguage.VF)
        assertEquals(1, jackal.total)
        assertEquals(1, chacal.total)
        assertEquals(jackal.hits.first().item.id, chacal.hits.first().item.id)
    }

    private fun openPrefs(vararg groupIds: String) = ProfilePreferences(
        sectionGroupPrefs = mapOf(
            CatalogSectionKey.FILMS to SectionGroupConfig(true, groupIds.toSet()),
            CatalogSectionKey.SERIES to SectionGroupConfig(true, groupIds.toSet()),
            CatalogSectionKey.TV to SectionGroupConfig(true, groupIds.toSet())
        )
    )

    private fun title(
        id: String,
        name: String,
        type: ContentType,
        groupId: String,
        matchKey: MatchKey = MatchKey(MatchKeyType.SOURCE_LOCAL, id)
    ): LogicalTitle =
        LogicalTitle(
            id = id,
            type = type,
            canonicalTitle = name,
            year = 2021,
            synopsis = "",
            genres = listOf("Action"),
            matchKey = matchKey,
            variants = listOf(
                StreamRef(
                    id = "$id::v",
                    sourceId = IptvSourceId("s1"),
                    providerStreamId = id,
                    playbackUrl = "http://example.com/$id",
                    groupId = groupId,
                    language = AudioLanguage.VF,
                    languageConfidence = LanguageConfidence.KNOWN,
                    rawTitle = name
                )
            )
        )
}

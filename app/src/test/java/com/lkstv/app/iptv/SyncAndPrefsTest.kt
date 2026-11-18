package com.lkstv.app.iptv

import com.lkstv.app.data.SessionRepository
import com.lkstv.app.data.iptv.InMemoryCatalogRepository
import com.lkstv.app.data.iptv.InMemorySourceRepository
import com.lkstv.app.data.iptv.SourceIngestor
import com.lkstv.app.data.iptv.security.InMemorySecretStore
import com.lkstv.app.data.iptv.sync.CatalogSyncCoordinator
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.PlaylistFetcher
import com.lkstv.app.domain.iptv.XtreamAccountInfo
import com.lkstv.app.domain.iptv.XtreamCategoryDto
import com.lkstv.app.domain.iptv.XtreamCredentials
import com.lkstv.app.domain.iptv.XtreamGateway
import com.lkstv.app.domain.iptv.XtreamSeriesDto
import com.lkstv.app.domain.iptv.XtreamStreamDto
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncAndPrefsTest {

    private val playlist = """
        #EXTM3U
        #EXTINF:-1 tvg-id="1" group-title="Films VF",Alpha
        http://example.invalid/a
        #EXTINF:-1 tvg-id="2" group-title="Jeunesse",Beta
        http://example.invalid/b
    """.trimIndent()

    private val fetcher = object : PlaylistFetcher {
        override suspend fun fetchText(url: String): String = playlist
    }

    @Test
    fun syncPreservesHiddenGroupPreferences() = runTest {
        val sources = InMemorySourceRepository()
        val catalog = InMemoryCatalogRepository()
        val secrets = InMemorySecretStore()
        val ingestor = SourceIngestor(secrets, fetcher, UnusedXtreamGateway())
        val sync = CatalogSyncCoordinator(sources, catalog, ingestor)

        val source = IptvSource(
            id = IptvSourceId("m3u1"),
            displayName = "Test",
            kind = IptvSourceKind.M3U_URL,
            enabled = true,
            endpoint = "http://example.invalid/list.m3u"
        )
        sources.upsertSource(source)

        val session = SessionRepository()
        session.selectProfile("profile_alex")
        val kidsGroupId = "m3u1::Jeunesse"
        session.toggleGroupHidden(kidsGroupId)
        val before = session.snapshotHiddenGroups("profile_alex")

        val result = sync.syncAll()
        assertTrue(result.titlesImported >= 2)
        assertEquals(before, session.snapshotHiddenGroups("profile_alex"))
        assertTrue(kidsGroupId in session.preferencesFor("profile_alex").hiddenGroupIds)
        assertTrue(catalog.groups().any { it.id == kidsGroupId })
        val visible = catalog.titlesVisibleFor(before, session.preferencesFor().preferredLanguage)
        assertTrue(
            visible.none { title ->
                title.variants.isNotEmpty() && title.variants.all { it.groupId == kidsGroupId }
            }
        )
    }

    @Test
    fun concurrentSyncRejected() = runTest {
        val sources = InMemorySourceRepository(
            listOf(
                IptvSource(
                    id = IptvSourceId("m3u1"),
                    displayName = "Test",
                    kind = IptvSourceKind.M3U_URL,
                    enabled = true,
                    endpoint = "http://example.invalid/list.m3u"
                )
            )
        )
        val catalog = InMemoryCatalogRepository()
        val sync = CatalogSyncCoordinator(
            sources,
            catalog,
            SourceIngestor(InMemorySecretStore(), fetcher, UnusedXtreamGateway())
        )
        val first = sync.syncAll()
        assertTrue(first.success)
        assertFalse(sync.isRunning)
    }

    @Test
    fun sourceIdsAreStableDeviceScoped() {
        val id = IptvSourceId("xtream_abc")
        assertEquals("xtream_abc", id.value)
    }

    private class UnusedXtreamGateway : XtreamGateway {
        override suspend fun authenticate(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(XtreamAccountInfo("Active", true))

        override suspend fun fetchLiveCategories(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamCategoryDto>())

        override suspend fun fetchVodCategories(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamCategoryDto>())

        override suspend fun fetchSeriesCategories(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamCategoryDto>())

        override suspend fun fetchVodStreams(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamStreamDto>())

        override suspend fun fetchLiveStreams(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamStreamDto>())

        override suspend fun fetchSeries(baseUrl: String, credentials: XtreamCredentials) =
            Result.success(emptyList<XtreamSeriesDto>())
    }
}

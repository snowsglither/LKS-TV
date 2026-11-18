package com.lkstv.app.iptv

import com.lkstv.app.data.iptv.InMemoryCatalogRepository
import com.lkstv.app.data.iptv.InMemorySourceRepository
import com.lkstv.app.data.iptv.m3u.M3uParser
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.UnifiedCatalog
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoMutualExclusionTest {

    @Test
    fun m3uWithoutEntriesIsRejected() {
        try {
            M3uParser.parse("#EXTM3U\n# comment only\n", IptvSourceId("x"))
            throw AssertionError("expected parse failure")
        } catch (e: Exception) {
            assertTrue(e.message!!.contains("entrée") || e.message!!.contains("invalide") || e.message!!.contains("vide"))
        }
    }

    @Test
    fun realSourceDoesNotAutoFillDemoCatalog() = runBlocking {
        val sources = InMemorySourceRepository()
        val catalog = InMemoryCatalogRepository(UnifiedCatalog())
        sources.upsertSource(
            IptvSource(
                id = IptvSourceId("m3u_1"),
                displayName = "Real",
                kind = IptvSourceKind.M3U_URL,
                enabled = true,
                endpoint = "https://example.com/list.m3u"
            )
        )
        // Catalog stays empty until validated sync — no DEMO_SHOWCASE injection.
        assertEquals(0, catalog.getCatalog().titles.size)
        assertTrue(sources.getSources().none { it.displayName.contains("DEMO", ignoreCase = true) })
    }
}

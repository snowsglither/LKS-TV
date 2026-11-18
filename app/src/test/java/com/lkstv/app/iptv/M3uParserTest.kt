package com.lkstv.app.iptv

import com.lkstv.app.data.iptv.m3u.M3uParser
import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.MatchKeyType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class M3uParserTest {

    private val sample = """
        #EXTM3U
        #EXTINF:-1 tvg-id="42" group-title="Films VF",Movie One [VF]
        http://example.invalid/one.ts
        #EXTINF:-1 tvg-id="tt999" group-title="Movies EN",Movie Two [EN]
        http://example.invalid/two.ts
    """.trimIndent()

    @Test
    fun parsesEntriesAndGroups() {
        val result = M3uParser.parse(sample, IptvSourceId("src1"))
        assertEquals(2, result.entries.size)
        assertEquals(2, result.groups.size)
        assertTrue(result.groups.any { it.name == "Films VF" })
        assertTrue(result.groups.all { it.sourceId.value == "src1" })
        assertTrue(result.groups.all { it.providerGroupId.isNotBlank() })
    }

    @Test
    fun localMatchWhenNoExternalId() {
        val result = M3uParser.parse(sample, IptvSourceId("src1"))
        val first = result.incoming.first { it.title.contains("Movie One") }
        assertEquals(MatchKeyType.SOURCE_LOCAL, first.matchKey.type)
    }

    @Test(expected = IptvException.Parse::class)
    fun rejectsEmptyPlaylist() {
        M3uParser.parse("", IptvSourceId("src1"))
    }
}

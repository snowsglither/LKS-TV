package com.lkstv.app.iptv

import com.lkstv.app.data.iptv.CategoryNormalizer
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CategoryNormalizerTest {

    @Test
    fun normalizesWhitespaceAndStableId() {
        val group = CategoryNormalizer.toGroup(
            sourceId = IptvSourceId("a"),
            providerGroupId = "12",
            rawName = "  Films   VF  ",
            hint = ProviderCategoryKind.VOD
        )
        assertEquals("Films VF", group.name)
        assertEquals("a::12", group.id)
        assertEquals("12", group.providerGroupId)
        assertEquals(ProviderCategoryKind.VOD, group.kind)
    }

    @Test
    fun infersSeriesKindFromName() {
        assertEquals(ProviderCategoryKind.SERIES, CategoryNormalizer.inferKind("Series FR"))
        assertEquals(ProviderCategoryKind.SERIES, CategoryNormalizer.inferKind("Séries FR"))
    }

    @Test
    fun blankBecomesSansCategorie() {
        val group = CategoryNormalizer.toGroup(IptvSourceId("x"), "", "   ")
        assertTrue(group.name.contains("catégorie", ignoreCase = true) || group.name == "Sans catégorie")
    }
}

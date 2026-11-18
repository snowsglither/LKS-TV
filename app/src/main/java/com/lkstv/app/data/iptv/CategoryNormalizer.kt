package com.lkstv.app.data.iptv

import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.ProviderCategoryKind

/**
 * Preserves provider folder/category names while producing stable LKS group ids.
 */
object CategoryNormalizer {

    fun normalizeName(raw: String): String =
        raw.trim()
            .replace(Regex("""\s+"""), " ")
            .ifBlank { "Sans catégorie" }

    fun inferKind(name: String, hint: ProviderCategoryKind = ProviderCategoryKind.UNKNOWN): ProviderCategoryKind {
        if (hint != ProviderCategoryKind.UNKNOWN) return hint
        val n = normalizeAscii(name)
        return when {
            listOf("film", "movie", "vod", "cinema").any { it in n } -> ProviderCategoryKind.VOD
            listOf("serie", "series", "show", "tv show").any { it in n } -> ProviderCategoryKind.SERIES
            listOf("live", "tv", "chaine", "sport").any { it in n } -> ProviderCategoryKind.LIVE
            else -> ProviderCategoryKind.UNKNOWN
        }
    }

    private fun normalizeAscii(raw: String): String =
        java.text.Normalizer.normalize(raw.lowercase(), java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")

    fun toGroup(
        sourceId: IptvSourceId,
        providerGroupId: String,
        rawName: String,
        hint: ProviderCategoryKind = ProviderCategoryKind.UNKNOWN
    ): IptvGroup {
        val name = normalizeName(rawName)
        return IptvGroup(
            id = IptvGroup.stableId(sourceId, providerGroupId.trim().ifBlank { name }),
            sourceId = sourceId,
            providerGroupId = providerGroupId.trim().ifBlank { name },
            name = name,
            kind = inferKind(name, hint)
        )
    }
}

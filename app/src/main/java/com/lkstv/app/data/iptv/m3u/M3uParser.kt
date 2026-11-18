package com.lkstv.app.data.iptv.m3u

import com.lkstv.app.data.iptv.CategoryNormalizer
import com.lkstv.app.data.iptv.LanguageTagger
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.StreamRef

data class M3uEntry(
    val title: String,
    val url: String,
    val groupTitle: String,
    val tvgId: String? = null,
    val tvgName: String? = null,
    val attributes: Map<String, String> = emptyMap()
)

data class M3uParseResult(
    val entries: List<M3uEntry>,
    val groups: List<IptvGroup>,
    val incoming: List<CatalogMergePolicy.IncomingTitle>
)

object M3uParser {

    private val attrRegex = Regex("""([\w-]+)="([^"]*)"""")

    fun parse(playlistText: String, sourceId: IptvSourceId): M3uParseResult {
        val lines = playlistText.lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .toList()
        if (lines.isEmpty()) {
            throw IptvException.Parse("Playlist M3U vide")
        }
        if (!lines.first().startsWith("#EXTM3U", ignoreCase = true) &&
            lines.none { it.startsWith("#EXTINF", ignoreCase = true) }
        ) {
            throw IptvException.Parse("Format M3U invalide (EXTM3U/EXTINF manquant)")
        }

        val entries = mutableListOf<M3uEntry>()
        var i = 0
        while (i < lines.size) {
            val line = lines[i]
            if (line.startsWith("#EXTINF", ignoreCase = true)) {
                val comma = line.indexOf(',')
                val meta = if (comma >= 0) line.substring(0, comma) else line
                val title = if (comma >= 0) line.substring(comma + 1).trim() else "Sans titre"
                val attrs = parseAttrs(meta)
                val url = lines.getOrNull(i + 1)?.takeUnless { it.startsWith("#") }
                    ?: throw IptvException.Parse("Entrée EXTINF sans URL: $title")
                entries += M3uEntry(
                    title = title,
                    url = url,
                    groupTitle = attrs["group-title"] ?: "Sans catégorie",
                    tvgId = attrs["tvg-id"],
                    tvgName = attrs["tvg-name"],
                    attributes = attrs
                )
                i += 2
            } else {
                i += 1
            }
        }
        if (entries.isEmpty()) {
            throw IptvException.Parse("Playlist M3U sans entrée exploitable (#EXTINF + URL)")
        }

        val groupsByProvider = linkedMapOf<String, IptvGroup>()
        val incoming = mutableListOf<CatalogMergePolicy.IncomingTitle>()

        entries.forEachIndexed { index, entry ->
            val providerGroupId = entry.groupTitle
            val group = groupsByProvider.getOrPut(providerGroupId) {
                CategoryNormalizer.toGroup(
                    sourceId = sourceId,
                    providerGroupId = providerGroupId,
                    rawName = entry.groupTitle,
                    hint = inferKindFromGroup(entry.groupTitle)
                )
            }
            val tagged = LanguageTagger.detect(entry.title, entry.groupTitle)
            val providerStreamId = entry.tvgId?.takeIf { it.isNotBlank() } ?: "m3u-$index"
            val stream = StreamRef(
                id = "${sourceId.value}::stream::$providerStreamId",
                sourceId = sourceId,
                providerStreamId = providerStreamId,
                playbackUrl = entry.url,
                groupId = group.id,
                language = tagged.language,
                languageConfidence = tagged.confidence,
                rawTitle = entry.title,
                languageTag = tagged.languageTag
            )
            val external = entry.attributes["tmdb-id"]
                ?: entry.attributes["tvg-logo"]?.takeIf { false } // never use logo as match
            val matchKey = when {
                !entry.tvgId.isNullOrBlank() && looksLikeExternalId(entry.tvgId) ->
                    CatalogMergePolicy.externalMatchKey(entry.tvgId)
                !external.isNullOrBlank() -> CatalogMergePolicy.externalMatchKey(external)
                else -> CatalogMergePolicy.newLocalMatchKey(sourceId, providerStreamId)
            }
            val logo = entry.attributes["tvg-logo"]?.takeIf { it.startsWith("http", ignoreCase = true) }
            incoming += CatalogMergePolicy.IncomingTitle(
                type = contentTypeFor(group.kind),
                title = entry.title,
                matchKey = matchKey,
                variants = listOf(stream),
                posterUrl = logo,
                backdropUrl = logo
            )
        }

        return M3uParseResult(
            entries = entries,
            groups = groupsByProvider.values.toList(),
            incoming = incoming
        )
    }

    private fun parseAttrs(meta: String): Map<String, String> =
        attrRegex.findAll(meta).associate { it.groupValues[1].lowercase() to it.groupValues[2] }

    private fun inferKindFromGroup(name: String): ProviderCategoryKind =
        CategoryNormalizer.inferKind(name)

    private fun contentTypeFor(kind: ProviderCategoryKind): ContentType = when (kind) {
        ProviderCategoryKind.SERIES -> ContentType.SERIES
        else -> ContentType.FILM
    }

    private fun looksLikeExternalId(value: String): Boolean =
        value.matches(Regex("""(?i)(tt\d{5,}|\d{3,})"""))
}

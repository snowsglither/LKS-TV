package com.lkstv.app.domain.iptv

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.LanguageConfidence
import java.util.UUID

/**
 * Builds a unified catalog.
 *
 * Merge rule (product): never fuse two titles on name similarity alone.
 * Cross-source merge only when a trusted [MatchKey] matches
 * ([MatchKeyType.EXPLICIT] or [MatchKeyType.PROVIDER_EXTERNAL] with same value).
 */
object CatalogMergePolicy {

    data class IncomingTitle(
        val type: ContentType,
        val title: String,
        val year: Int? = null,
        val synopsis: String = "",
        val genres: List<String> = emptyList(),
        val matchKey: MatchKey,
        val variants: List<StreamRef> = emptyList(),
        val episodes: List<LogicalEpisode> = emptyList(),
        val posterUrl: String? = null,
        val backdropUrl: String? = null
    )

    fun merge(incoming: List<IncomingTitle>): List<LogicalTitle> {
        val buckets = linkedMapOf<String, MutableList<IncomingTitle>>()
        for (item in incoming) {
            val key = bucketKey(item.matchKey)
            buckets.getOrPut(key) { mutableListOf() }.add(item)
        }
        return buckets.values.map { group -> collapseBucket(group) }
    }

    /**
     * Ambiguous titles with only SOURCE_LOCAL keys stay separate even if titles equal.
     */
    fun wouldAutoMerge(a: MatchKey, b: MatchKey): Boolean {
        if (a.type == MatchKeyType.SOURCE_LOCAL || b.type == MatchKeyType.SOURCE_LOCAL) return false
        if (a.type != b.type) return false
        return a.value.equals(b.value, ignoreCase = true)
    }

    /**
     * Cautious series identity from normalized title + year when no TMDB/IMDB id exists.
     * Returns null when too short / no year — caller must keep SOURCE_LOCAL.
     */
    fun seriesTitleYearKey(rawTitle: String, year: Int?): MatchKey? {
        val y = year ?: return null
        if (y < 1900 || y > 2100) return null
        val norm = DisplayMeta.normalizeSeriesTitleKey(rawTitle) ?: return null
        return MatchKey(MatchKeyType.TITLE_YEAR, "series:$norm:$y")
    }

    fun selectPreferredVariant(
        variants: List<StreamRef>,
        preferred: AudioLanguage
    ): StreamRef? = selectPreferredVariant(variants, LanguageCodes.fromAudioLanguage(preferred))

    fun selectPreferredVariant(
        variants: List<StreamRef>,
        preferredTag: String
    ): StreamRef? {
        if (variants.isEmpty()) return null
        fun tagOf(s: StreamRef) = LanguageCodes.normalize(
            s.languageTag.ifBlank { LanguageCodes.fromAudioLanguage(s.language) }
        )
        variants.firstOrNull {
            LanguageCodes.matchesPreferred(tagOf(it), preferredTag) &&
                it.languageConfidence != LanguageConfidence.UNKNOWN
        }?.let { return it }
        variants.firstOrNull { LanguageCodes.matchesPreferred(tagOf(it), preferredTag) }?.let { return it }
        variants.firstOrNull { it.languageConfidence == LanguageConfidence.KNOWN }?.let { return it }
        return variants.first()
    }

    fun selectPreferredEpisodeVersion(
        versions: List<EpisodeVersion>,
        preferred: AudioLanguage
    ): EpisodeVersion? = selectPreferredEpisodeVersion(versions, LanguageCodes.fromAudioLanguage(preferred))

    fun selectPreferredEpisodeVersion(
        versions: List<EpisodeVersion>,
        preferredTag: String
    ): EpisodeVersion? {
        val streams = versions.map { it.stream }
        val chosen = selectPreferredVariant(streams, preferredTag) ?: return versions.firstOrNull()
        return versions.firstOrNull { it.stream.id == chosen.id } ?: versions.firstOrNull()
    }

    private fun bucketKey(key: MatchKey): String = when (key.type) {
        MatchKeyType.SOURCE_LOCAL -> "local:${key.value}"
        MatchKeyType.EXPLICIT -> "explicit:${key.value.lowercase()}"
        MatchKeyType.PROVIDER_EXTERNAL -> "ext:${key.value.lowercase()}"
        MatchKeyType.TITLE_YEAR -> "title_year:${key.value.lowercase()}"
    }

    private fun collapseBucket(group: List<IncomingTitle>): LogicalTitle {
        val primary = group.first()
        val crossMerged = group.size > 1 &&
            primary.matchKey.type != MatchKeyType.SOURCE_LOCAL
        val id = if (crossMerged) {
            "logical:${primary.matchKey.type.name.lowercase()}:${primary.matchKey.value.lowercase()}"
        } else {
            "logical:${primary.matchKey.value}"
        }
        return LogicalTitle(
            id = id,
            type = primary.type,
            canonicalTitle = primary.title,
            year = group.mapNotNull { it.year }.firstOrNull(),
            synopsis = group.map { it.synopsis }.firstOrNull { it.isNotBlank() }.orEmpty(),
            genres = group.flatMap { it.genres }.distinct(),
            matchKey = primary.matchKey,
            variants = group.flatMap { it.variants }.distinctBy { it.id },
            episodes = mergeEpisodes(group.flatMap { it.episodes }),
            singleSourceOnly = !crossMerged,
            posterUrl = group.mapNotNull { it.posterUrl }.firstOrNull { it.isNotBlank() },
            backdropUrl = group.mapNotNull { it.backdropUrl }.firstOrNull { it.isNotBlank() }
                ?: group.mapNotNull { it.posterUrl }.firstOrNull { it.isNotBlank() }
        )
    }

    private fun mergeEpisodes(episodes: List<LogicalEpisode>): List<LogicalEpisode> {
        val map = linkedMapOf<String, MutableList<EpisodeVersion>>()
        val titles = mutableMapOf<String, String>()
        val synopses = mutableMapOf<String, String>()
        val durations = mutableMapOf<String, Int?>()
        val thumbs = mutableMapOf<String, String?>()
        for (ep in episodes) {
            val key = "${ep.seasonNumber}:${ep.episodeNumber}"
            titles.putIfAbsent(key, ep.title)
            if (ep.synopsis.isNotBlank()) synopses.putIfAbsent(key, ep.synopsis)
            if (ep.durationMinutes != null && ep.durationMinutes > 0) {
                durations.putIfAbsent(key, ep.durationMinutes)
            }
            if (!ep.thumbUrl.isNullOrBlank()) thumbs.putIfAbsent(key, ep.thumbUrl)
            map.getOrPut(key) { mutableListOf() }.addAll(ep.versions)
        }
        return map.map { (key, versions) ->
            val (season, number) = key.split(":").map { it.toInt() }
            LogicalEpisode(
                id = "ep:$key",
                seasonNumber = season,
                episodeNumber = number,
                title = titles[key].orEmpty(),
                versions = versions.distinctBy { it.stream.id },
                synopsis = synopses[key].orEmpty(),
                durationMinutes = durations[key],
                thumbUrl = thumbs[key]
            )
        }.sortedWith(compareBy({ it.seasonNumber }, { it.episodeNumber }))
    }

    fun newLocalMatchKey(sourceId: IptvSourceId, providerId: String): MatchKey =
        MatchKey(MatchKeyType.SOURCE_LOCAL, "${sourceId.value}::$providerId")

    fun externalMatchKey(tmdbOrImdb: String): MatchKey =
        MatchKey(MatchKeyType.PROVIDER_EXTERNAL, tmdbOrImdb.trim())

    fun explicitMatchKey(token: String = UUID.randomUUID().toString()): MatchKey =
        MatchKey(MatchKeyType.EXPLICIT, token)
}

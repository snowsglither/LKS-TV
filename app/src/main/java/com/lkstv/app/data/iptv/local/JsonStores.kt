package com.lkstv.app.data.iptv.local

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.LanguageConfidence
import com.lkstv.app.domain.iptv.EpisodeVersion
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.LogicalEpisode
import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKey
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.StreamRef
import com.lkstv.app.domain.iptv.UnifiedCatalog
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class SourceEntity(
    val id: String,
    val displayName: String,
    val kind: String,
    val enabled: Boolean,
    val endpoint: String = "",
    val localPath: String = "",
    val usernameHint: String = "",
    val lastSyncEpochMs: Long? = null,
    val lastError: String? = null
)

@Serializable
data class CatalogSnapshot(
    val generatedAtEpochMs: Long = 0L,
    val groups: List<GroupEntity> = emptyList(),
    val titles: List<TitleEntity> = emptyList()
)

@Serializable
data class GroupEntity(
    val id: String,
    val sourceId: String,
    val providerGroupId: String,
    val name: String,
    val kind: String
)

@Serializable
data class TitleEntity(
    val id: String,
    val type: String,
    val canonicalTitle: String,
    val year: Int? = null,
    val synopsis: String = "",
    val genres: List<String> = emptyList(),
    val matchType: String,
    val matchValue: String,
    val singleSourceOnly: Boolean = true,
    val variants: List<StreamEntity> = emptyList(),
    val episodes: List<EpisodeEntity> = emptyList()
)

@Serializable
data class StreamEntity(
    val id: String,
    val sourceId: String,
    val providerStreamId: String,
    val playbackUrl: String,
    val groupId: String,
    val language: String,
    val languageConfidence: String,
    val containerExtension: String? = null,
    val rawTitle: String = "",
    val languageTag: String = ""
)

@Serializable
data class EpisodeEntity(
    val id: String,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val title: String,
    val versions: List<EpisodeVersionEntity> = emptyList(),
    val synopsis: String = "",
    val durationMinutes: Int? = null,
    val thumbUrl: String? = null
)

@Serializable
data class EpisodeVersionEntity(
    val stream: StreamEntity,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val episodeTitle: String = ""
)

class JsonSourceStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    fun read(): List<IptvSource> {
        if (!file.exists()) return emptyList()
        return json.decodeFromString<List<SourceEntity>>(file.readText()).map { it.toDomain() }
    }

    fun write(sources: List<IptvSource>) {
        file.parentFile?.mkdirs()
        file.writeText(json.encodeToString(sources.map { it.toEntity() }))
    }
}

class JsonCatalogStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = false }

    fun read(): UnifiedCatalog {
        if (!file.exists()) return UnifiedCatalog()
        return json.decodeFromString<CatalogSnapshot>(file.readText()).toDomain()
    }

    fun write(catalog: UnifiedCatalog) {
        file.parentFile?.mkdirs()
        file.writeText(json.encodeToString(catalog.toSnapshot()))
    }
}

private fun IptvSource.toEntity() = SourceEntity(
    id = id.value,
    displayName = displayName,
    kind = kind.name,
    enabled = enabled,
    endpoint = endpoint,
    localPath = localPath,
    usernameHint = usernameHint,
    lastSyncEpochMs = lastSyncEpochMs,
    lastError = lastError
)

private fun SourceEntity.toDomain() = IptvSource(
    id = IptvSourceId(id),
    displayName = displayName,
    kind = IptvSourceKind.valueOf(kind),
    enabled = enabled,
    endpoint = endpoint,
    localPath = localPath,
    usernameHint = usernameHint,
    lastSyncEpochMs = lastSyncEpochMs,
    lastError = lastError
)

private fun UnifiedCatalog.toSnapshot() = CatalogSnapshot(
    generatedAtEpochMs = generatedAtEpochMs,
    groups = groups.map {
        GroupEntity(it.id, it.sourceId.value, it.providerGroupId, it.name, it.kind.name)
    },
    titles = titles.map { title ->
        TitleEntity(
            id = title.id,
            type = title.type.name,
            canonicalTitle = title.canonicalTitle,
            year = title.year,
            synopsis = title.synopsis,
            genres = title.genres,
            matchType = title.matchKey.type.name,
            matchValue = title.matchKey.value,
            singleSourceOnly = title.singleSourceOnly,
            variants = title.variants.map { it.toEntity() },
            episodes = title.episodes.map { ep ->
                EpisodeEntity(
                    id = ep.id,
                    seasonNumber = ep.seasonNumber,
                    episodeNumber = ep.episodeNumber,
                    title = ep.title,
                    versions = ep.versions.map { ver ->
                        EpisodeVersionEntity(
                            stream = ver.stream.toEntity(),
                            seasonNumber = ver.seasonNumber,
                            episodeNumber = ver.episodeNumber,
                            episodeTitle = ver.episodeTitle
                        )
                    },
                    synopsis = ep.synopsis,
                    durationMinutes = ep.durationMinutes,
                    thumbUrl = ep.thumbUrl
                )
            }
        )
    }
)

private fun CatalogSnapshot.toDomain() = UnifiedCatalog(
    generatedAtEpochMs = generatedAtEpochMs,
    groups = groups.map {
        IptvGroup(
            id = it.id,
            sourceId = IptvSourceId(it.sourceId),
            providerGroupId = it.providerGroupId,
            name = it.name,
            kind = runCatching { ProviderCategoryKind.valueOf(it.kind) }.getOrDefault(ProviderCategoryKind.UNKNOWN)
        )
    },
    titles = titles.map { t ->
        LogicalTitle(
            id = t.id,
            type = ContentType.valueOf(t.type),
            canonicalTitle = t.canonicalTitle,
            year = t.year,
            synopsis = t.synopsis,
            genres = t.genres,
            matchKey = MatchKey(MatchKeyType.valueOf(t.matchType), t.matchValue),
            variants = t.variants.map { it.toDomain() },
            episodes = t.episodes.map { ep ->
                LogicalEpisode(
                    id = ep.id,
                    seasonNumber = ep.seasonNumber,
                    episodeNumber = ep.episodeNumber,
                    title = ep.title,
                    versions = ep.versions.map { ver ->
                        EpisodeVersion(
                            stream = ver.stream.toDomain(),
                            seasonNumber = ver.seasonNumber,
                            episodeNumber = ver.episodeNumber,
                            episodeTitle = ver.episodeTitle
                        )
                    },
                    synopsis = ep.synopsis,
                    durationMinutes = ep.durationMinutes,
                    thumbUrl = ep.thumbUrl
                )
            },
            singleSourceOnly = t.singleSourceOnly
        )
    }
)

private fun StreamRef.toEntity() = StreamEntity(
    id = id,
    sourceId = sourceId.value,
    providerStreamId = providerStreamId,
    playbackUrl = playbackUrl,
    groupId = groupId,
    language = language.name,
    languageConfidence = languageConfidence.name,
    containerExtension = containerExtension,
    rawTitle = rawTitle,
    languageTag = languageTag
)

private fun StreamEntity.toDomain() = StreamRef(
    id = id,
    sourceId = IptvSourceId(sourceId),
    providerStreamId = providerStreamId,
    playbackUrl = playbackUrl,
    groupId = groupId,
    language = runCatching { AudioLanguage.valueOf(language) }.getOrDefault(AudioLanguage.UNKNOWN),
    languageConfidence = runCatching { LanguageConfidence.valueOf(languageConfidence) }
        .getOrDefault(LanguageConfidence.UNKNOWN),
    containerExtension = containerExtension,
    rawTitle = rawTitle,
    languageTag = languageTag
)

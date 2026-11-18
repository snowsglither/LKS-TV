package com.lkstv.app.data

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.ContinueResumeSnapshot
import com.lkstv.app.domain.EpisodePlaybackState
import com.lkstv.app.domain.HomeRowId
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.SectionGroupConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

@Serializable
data class SectionGroupPrefsEntity(
    val configured: Boolean = false,
    val selectedGroupIds: List<String> = emptyList()
)

@Serializable
data class ContinueResumeEntity(
    val episodeId: String? = null,
    val streamId: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val episodeTitle: String = "",
    val fraction: Float = 0f,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L
)

@Serializable
data class EpisodePlaybackEntity(
    val key: String = "",
    val episodeId: String = "",
    val seriesId: String? = null,
    val sourceId: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val streamId: String? = null,
    val fraction: Float = 0f,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val updatedAt: Long = 0L
)

@Serializable
data class PrefsEntity(
    val visibleRowIds: List<String> = HomeRowId.defaultVisible.map { it.name },
    val hiddenGroupIds: List<String> = emptyList(),
    val hiddenItemIds: List<String> = emptyList(),
    val favoriteIds: List<String> = emptyList(),
    val watchLaterIds: List<String> = emptyList(),
    val dismissedContinueIds: List<String> = emptyList(),
    val reduceMotion: Boolean = false,
    val preferredLanguage: String = AudioLanguage.VF.name,
    val preferredAudioLanguage: String = "edition:vf",
    val preferredEpisodeLanguage: String = "",
    val preferredSubtitleLanguage: String = "fr",
    val interfaceLanguage: String = "fr",
    val progressByItemId: Map<String, Float> = emptyMap(),
    val progressByEpisodeId: Map<String, Float> = emptyMap(),
    val episodePlaybackById: Map<String, EpisodePlaybackEntity> = emptyMap(),
    val progressByLogicalEpisodeId: Map<String, Float> = emptyMap(),
    val lastEditionByWorkId: Map<String, String> = emptyMap(),
    val continueActivityById: Map<String, Long> = emptyMap(),
    val continueResumeByTitleId: Map<String, ContinueResumeEntity> = emptyMap(),
    val continueCompletedThreshold: Float = 0.92f,
    val livePreviewEnabled: Boolean = true,
    val lastLiveChannelId: String? = null,
    val autoplayNextEpisode: Boolean = true,
    val sectionGroupPrefs: Map<String, SectionGroupPrefsEntity> = emptyMap()
)

@Serializable
data class PrefsFile(
    val activeProfileId: String? = null,
    val byProfile: Map<String, PrefsEntity> = emptyMap()
)

class ProfilePreferencesStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    fun read(): PrefsFile {
        if (!file.exists()) return PrefsFile()
        return runCatching { json.decodeFromString<PrefsFile>(file.readText()) }
            .getOrElse { PrefsFile() }
    }

    fun write(data: PrefsFile) {
        file.parentFile?.mkdirs()
        file.writeText(json.encodeToString(data))
    }
}

fun PrefsEntity.toDomain(): ProfilePreferences = ProfilePreferences(
    visibleRowIds = visibleRowIds.mapNotNull { name ->
        runCatching { HomeRowId.valueOf(name) }.getOrNull()
    }.ifEmpty { HomeRowId.defaultVisible },
    hiddenGroupIds = hiddenGroupIds.toSet(),
    hiddenItemIds = hiddenItemIds.toSet(),
    favoriteIds = favoriteIds.toSet(),
    watchLaterIds = watchLaterIds.toSet(),
    dismissedContinueIds = dismissedContinueIds.toSet(),
    reduceMotion = reduceMotion,
    preferredLanguage = runCatching { AudioLanguage.valueOf(preferredLanguage) }
        .getOrDefault(AudioLanguage.VF),
    preferredAudioLanguage = preferredAudioLanguage.ifBlank {
        LanguageCodes.migratePreferred(preferredLanguage)
    },
    preferredEpisodeLanguage = preferredEpisodeLanguage,
    preferredSubtitleLanguage = preferredSubtitleLanguage.ifBlank { "fr" },
    interfaceLanguage = interfaceLanguage.ifBlank { "fr" },
    progressByItemId = progressByItemId.filterKeys { !it.contains("logical:demo:") },
    progressByEpisodeId = progressByEpisodeId.filterKeys { !it.startsWith("demo:") }.let { epMap ->
        val merged = epMap.toMutableMap()
        episodePlaybackById.forEach { (k, v) ->
            if (v.fraction > 0f) merged.putIfAbsent(k, v.fraction)
        }
        merged
    },
    progressByLogicalEpisodeId = progressByLogicalEpisodeId,
    lastEditionByWorkId = lastEditionByWorkId,
    episodePlaybackById = run {
        val fromStore = episodePlaybackById.mapValues { (k, v) ->
            EpisodePlaybackState(
                key = v.key.ifBlank { k },
                episodeId = v.episodeId.ifBlank { k },
                seriesId = v.seriesId,
                sourceId = v.sourceId,
                season = v.season,
                episode = v.episode,
                streamId = v.streamId,
                fraction = v.fraction,
                positionMs = v.positionMs,
                durationMs = v.durationMs,
                updatedAt = v.updatedAt
            )
        }.toMutableMap()
        // Migrate fraction-only episode rows
        progressByEpisodeId.forEach { (k, frac) ->
            if (frac > 0f && !fromStore.containsKey(k) && !k.startsWith("demo:")) {
                fromStore[k] = EpisodePlaybackState(key = k, episodeId = k, fraction = frac)
            }
        }
        fromStore
    },
    continueActivityById = continueActivityById.filterKeys {
        !it.contains("logical:demo:") && !it.startsWith("ep:demo:")
    },
    continueResumeByTitleId = continueResumeByTitleId
        .filterKeys { !it.contains("logical:demo:") }
        .mapValues { (_, v) ->
            ContinueResumeSnapshot(
                episodeId = v.episodeId,
                streamId = v.streamId,
                season = v.season,
                episode = v.episode,
                episodeTitle = v.episodeTitle,
                fraction = v.fraction,
                positionMs = v.positionMs,
                durationMs = v.durationMs
            )
        },
    continueCompletedThreshold = continueCompletedThreshold,
    livePreviewEnabled = livePreviewEnabled,
    lastLiveChannelId = lastLiveChannelId,
    autoplayNextEpisode = autoplayNextEpisode,
    sectionGroupPrefs = sectionGroupPrefs.mapNotNull { (key, ent) ->
        val section = CatalogSectionKey.entries.find { it.storageKey == key } ?: return@mapNotNull null
        section to SectionGroupConfig(
            configured = ent.configured,
            selectedGroupIds = ent.selectedGroupIds.toSet()
        )
    }.toMap()
)

fun ProfilePreferences.toEntity(): PrefsEntity = PrefsEntity(
    visibleRowIds = visibleRowIds.map { it.name },
    hiddenGroupIds = hiddenGroupIds.toList(),
    hiddenItemIds = hiddenItemIds.toList(),
    favoriteIds = favoriteIds.toList(),
    watchLaterIds = watchLaterIds.toList(),
    dismissedContinueIds = dismissedContinueIds.toList(),
    reduceMotion = reduceMotion,
    preferredLanguage = preferredLanguage.name,
    preferredAudioLanguage = preferredAudioLanguage.ifBlank {
        LanguageCodes.fromAudioLanguage(preferredLanguage)
    },
    preferredEpisodeLanguage = preferredEpisodeLanguage,
    preferredSubtitleLanguage = preferredSubtitleLanguage,
    interfaceLanguage = interfaceLanguage,
    progressByItemId = progressByItemId,
    progressByEpisodeId = progressByEpisodeId,
    progressByLogicalEpisodeId = progressByLogicalEpisodeId,
    lastEditionByWorkId = lastEditionByWorkId,
    episodePlaybackById = episodePlaybackById.mapValues { (k, v) ->
        EpisodePlaybackEntity(
            key = v.key.ifBlank { k },
            episodeId = v.episodeId.ifBlank { k },
            seriesId = v.seriesId,
            sourceId = v.sourceId,
            season = v.season,
            episode = v.episode,
            streamId = v.streamId,
            fraction = v.fraction,
            positionMs = v.positionMs,
            durationMs = v.durationMs,
            updatedAt = v.updatedAt
        )
    },
    continueActivityById = continueActivityById,
    continueResumeByTitleId = continueResumeByTitleId.mapValues { (_, v) ->
        ContinueResumeEntity(
            episodeId = v.episodeId,
            streamId = v.streamId,
            season = v.season,
            episode = v.episode,
            episodeTitle = v.episodeTitle,
            fraction = v.fraction,
            positionMs = v.positionMs,
            durationMs = v.durationMs
        )
    },
    continueCompletedThreshold = continueCompletedThreshold,
    livePreviewEnabled = livePreviewEnabled,
    lastLiveChannelId = lastLiveChannelId,
    autoplayNextEpisode = autoplayNextEpisode,
    sectionGroupPrefs = sectionGroupPrefs.mapKeys { it.key.storageKey }.mapValues { (_, v) ->
        SectionGroupPrefsEntity(
            configured = v.configured,
            selectedGroupIds = v.selectedGroupIds.toList()
        )
    }
)

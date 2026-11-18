package com.lkstv.app.domain

enum class ContentType { FILM, SERIES }

enum class HubSection(
    val title: String,
    val subtitle: String
) {
    LIVE_TV("TV en direct", "Chaînes & zapping"),
    FILMS("Films", "Catalogue cinématique"),
    SERIES("Séries", "Saisons & épisodes"),
    EPG("Guide EPG", "Programme TV"),
    LIBRARY("Bibliothèque", "Favoris & listes"),
    SETTINGS("Paramètres", "Sources & sync")
}

/**
 * Configurable static rows. [feedable]=false means we never invent content for them.
 */
enum class HomeRowId(
    val key: String,
    val label: String,
    val feedable: Boolean
) {
    CONTINUE_WATCHING("row_continue", "Continuer à regarder", true),
    NEW_RELEASES("row_new", "Nouveautés", true),
    LIBRARY_SYNCED("row_all", "Catalogue synchronisé", true),
    MONTHLY_PICKS("row_monthly", "Sélection du mois", false),
    TOP_OF_MONTH("row_top", "Top du mois", false),
    RECOMMENDATIONS("row_reco", "Recommandations", false);

    companion object {
        val defaultVisible: List<HomeRowId> = listOf(
            CONTINUE_WATCHING,
            NEW_RELEASES,
            LIBRARY_SYNCED
        )
    }
}

data class Profile(
    val id: String,
    val name: String,
    val avatarColor: Long
)

enum class AudioLanguage { VF, VO, EN, NL, OTHER, UNKNOWN }

enum class LanguageConfidence { KNOWN, ASSUMED, UNKNOWN }

data class ProviderGroup(
    val id: String,
    val name: String,
    val sourceLabel: String,
    val sourceId: String = "",
    val providerGroupId: String = id
)

/** One EPG channel row — only real provider data. */
data class EpgChannelRow(
    val channelId: String,
    val title: String,
    val hasEpg: Boolean,
    val currentTitle: String? = null,
    val currentDescription: String? = null,
    val nextTitle: String? = null
)

/** IPTV edition / language alternative for the same logical episode or film. */
data class EditionLanguageOption(
    val tag: String,
    val label: String,
    val playbackUrl: String,
    val episodeId: String? = null,
    val editionTitleId: String,
    val requiresNewStream: Boolean = true,
    val selected: Boolean = false
)

data class VersionOption(
    val id: String,
    val label: String,
    val language: AudioLanguage,
    val confidence: LanguageConfidence,
    val groupId: String,
    val playbackUrl: String = "",
    /** BCP-47 or edition:* — empty when unidentified. */
    val languageTag: String = "",
    val languageLabel: String = ""
)

data class CatalogItem(
    val id: String,
    val title: String,
    val synopsis: String,
    val genres: List<String>,
    val year: Int,
    val durationMinutes: Int?,
    val type: ContentType,
    val posterColor: Long,
    val backdropColor: Long,
    val posterUrl: String? = null,
    val backdropUrl: String? = null,
    val ratingLabel: String,
    val progressFraction: Float = 0f,
    val relatedIds: List<String> = emptyList(),
    val sequelIds: List<String> = emptyList(),
    val seasons: List<Season> = emptyList(),
    /** Primary group for legacy filters; prefer [groupIds]. */
    val providerGroupId: String = "",
    val groupIds: Set<String> = emptySet(),
    val versions: List<VersionOption> = emptyList(),
    val selectedVersionId: String? = null,
    val hasUnknownLanguageVersion: Boolean = false,
    val trustedMerge: Boolean = false,
    /** Continuer à regarder — label Sx Ex when series. */
    val resumeLabel: String? = null,
    val resumeStreamId: String? = null,
    val resumeEpisodeId: String? = null,
    val remainingMinutes: Int? = null,
    val continueActivity: Long = 0L
)

/** Snapshot resume target when episode lists are sparse in presentation. */
data class ContinueResumeSnapshot(
    val episodeId: String? = null,
    val streamId: String? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val episodeTitle: String = "",
    val fraction: Float = 0f,
    val positionMs: Long = 0L,
    val durationMs: Long = 0L
)

data class Season(
    val number: Int,
    val title: String,
    val episodes: List<Episode>
)

data class Episode(
    val id: String,
    val number: Int,
    val title: String,
    val synopsis: String,
    val durationMinutes: Int,
    val progressFraction: Float = 0f,
    val versions: List<VersionOption> = emptyList(),
    val selectedVersionId: String? = null,
    /** Absolute resume position when known (confirmed playback). */
    val positionMs: Long = 0L,
    val durationMs: Long = 0L,
    val thumbUrl: String? = null,
    val seasonNumber: Int = 1
) {
    val watchState: EpisodeProgress.WatchState
        get() = EpisodeProgress.watchState(progressFraction)
}

data class HomeRow(
    val key: String,
    val label: String,
    val items: List<CatalogItem>,
    val showsProgress: Boolean = false
)

data class ProfilePreferences(
    val visibleRowIds: List<HomeRowId> = HomeRowId.defaultVisible,
    val hiddenGroupIds: Set<String> = emptySet(),
    val hiddenItemIds: Set<String> = emptySet(),
    val favoriteIds: Set<String> = emptySet(),
    val watchLaterIds: Set<String> = emptySet(),
    val dismissedContinueIds: Set<String> = emptySet(),
    val reduceMotion: Boolean = false,
    val preferredLanguage: AudioLanguage = AudioLanguage.VF,
    /** BCP-47 / edition:* preferred audio (takes precedence when non-blank). */
    val preferredAudioLanguage: String = "edition:vf",
    /** Last selected series edition language for subsequent episodes. */
    val preferredEpisodeLanguage: String = "",
    val preferredSubtitleLanguage: String = "fr",
    val interfaceLanguage: String = "fr",
    /** Real playback progress only — never invent for IPTV import. */
    val progressByItemId: Map<String, Float> = emptyMap(),
    val progressByEpisodeId: Map<String, Float> = emptyMap(),
    val episodePlaybackById: Map<String, EpisodePlaybackState> = emptyMap(),
    /** Shared progress across language editions: lep:workId:S:E */
    val progressByLogicalEpisodeId: Map<String, Float> = emptyMap(),
    /** Last opened edition title id per logical work. */
    val lastEditionByWorkId: Map<String, String> = emptyMap(),
    val continueActivityById: Map<String, Long> = emptyMap(),
    val continueResumeByTitleId: Map<String, ContinueResumeSnapshot> = emptyMap(),
    val continueCompletedThreshold: Float = ContinueWatching.DEFAULT_COMPLETED_THRESHOLD,
    val livePreviewEnabled: Boolean = true,
    val lastLiveChannelId: String? = null,
    val autoplayNextEpisode: Boolean = true,
    /**
     * Per-section IPTV group allowlist (TASK-005).
     * Unconfigured section → empty catalogue until first-visit setup.
     */
    val sectionGroupPrefs: Map<CatalogSectionKey, SectionGroupConfig> = emptyMap()
) {
    fun preferredAudioTag(): String =
        preferredAudioLanguage.ifBlank { LanguageCodes.fromAudioLanguage(preferredLanguage) }
            .ifBlank { "edition:vf" }
}

enum class CatalogScreenEmptyReason {
    NONE,
    NEEDS_GROUP_SETUP,
    NO_GROUPS_SELECTED
}

sealed interface AppDestination {
    data object Splash : AppDestination
    data object Profiles : AppDestination
    data object Hub : AppDestination
    data object Search : AppDestination
    data object LiveTv : AppDestination
    data class Section(val section: HubSection) : AppDestination
    data class FilmDetail(val itemId: String) : AppDestination
    data class SeriesDetail(val itemId: String) : AppDestination
    data class GroupSetup(
        val section: CatalogSectionKey,
        val manage: Boolean
    ) : AppDestination
    data class Player(
        val title: String,
        val playbackRef: String,
        val returnToLive: Boolean = false,
        /** Exact screen to restore on Back — never invent Live TV by default. */
        val returnDestination: AppDestination? = null,
        val contentId: String? = null,
        val episodeId: String? = null,
        val season: Int? = null,
        val episode: Int? = null,
        val logicalWorkId: String? = null,
        val editionLanguages: List<EditionLanguageOption> = emptyList(),
        /** Forced resume after edition switch (ms); null = use stored progress. */
        val forceResumeMs: Long? = null
    ) : AppDestination
}

enum class CatalogScreenStatus {
    READY,
    EMPTY_NO_SOURCES,
    EMPTY_NO_CONTENT,
    LOADING,
    ERROR
}

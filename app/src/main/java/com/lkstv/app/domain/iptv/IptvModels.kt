package com.lkstv.app.domain.iptv

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.LanguageConfidence

/** Device-scoped source identity (never a secret). */
@JvmInline
value class IptvSourceId(val value: String)

enum class IptvSourceKind {
    XTREAM,
    M3U_URL,
    M3U_FILE
}

enum class ProviderCategoryKind {
    LIVE,
    VOD,
    SERIES,
    UNKNOWN
}

enum class MatchKeyType {
    /** Explicit operator / user link — reversible and trusted. */
    EXPLICIT,
    /** Shared external id from provider metadata (e.g. tmdb/imdb) when present. */
    PROVIDER_EXTERNAL,
    /**
     * Cautious series merge when year is known and normalized title is unambiguous.
     * Never used for films or when title/year is missing/ambiguous.
     */
    TITLE_YEAR,
    /** Single-source identity — not a cross-source merge. */
    SOURCE_LOCAL
}

/**
 * Trusted match key. Title similarity alone must never produce a merge key.
 */
data class MatchKey(
    val type: MatchKeyType,
    val value: String
)

data class IptvSource(
    val id: IptvSourceId,
    val displayName: String,
    val kind: IptvSourceKind,
    val enabled: Boolean = true,
    /** Base server URL (Xtream) or playlist URL (M3U_URL). Never a password. */
    val endpoint: String = "",
    /** Local playlist path for M3U_FILE. */
    val localPath: String = "",
    /** Non-secret username hint for UI (may be empty). Password lives only in SecretStore. */
    val usernameHint: String = "",
    val lastSyncEpochMs: Long? = null,
    val lastError: String? = null
)

data class IptvGroup(
    val id: String,
    val sourceId: IptvSourceId,
    val providerGroupId: String,
    val name: String,
    val kind: ProviderCategoryKind
) {
    companion object {
        fun stableId(sourceId: IptvSourceId, providerGroupId: String): String =
            "${sourceId.value}::$providerGroupId"
    }
}

data class StreamRef(
    val id: String,
    val sourceId: IptvSourceId,
    val providerStreamId: String,
    val playbackUrl: String,
    val groupId: String,
    val language: AudioLanguage,
    val languageConfidence: LanguageConfidence,
    /** BCP-47 or edition:* tag — empty when unidentified. */
    val languageTag: String = "",
    val containerExtension: String? = null,
    val rawTitle: String = ""
)

data class EpisodeVersion(
    val stream: StreamRef,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val episodeTitle: String = ""
)

data class LogicalEpisode(
    val id: String,
    val seasonNumber: Int,
    val episodeNumber: Int,
    val title: String,
    val versions: List<EpisodeVersion>,
    val synopsis: String = "",
    val durationMinutes: Int? = null,
    val thumbUrl: String? = null
)

data class LogicalTitle(
    val id: String,
    val type: ContentType,
    val canonicalTitle: String,
    val year: Int? = null,
    val synopsis: String = "",
    val genres: List<String> = emptyList(),
    val matchKey: MatchKey,
    /** VOD / film / live channel variants. Series episode streams live under [episodes]. */
    val variants: List<StreamRef> = emptyList(),
    val episodes: List<LogicalEpisode> = emptyList(),
    /** True when this logical item was never cross-merged. */
    val singleSourceOnly: Boolean = true,
    /** Provider artwork URL when available (Xtream stream_icon / cover, M3U tvg-logo). */
    val posterUrl: String? = null,
    val backdropUrl: String? = null
)

data class UnifiedCatalog(
    val groups: List<IptvGroup> = emptyList(),
    val titles: List<LogicalTitle> = emptyList(),
    val generatedAtEpochMs: Long = 0L
)

data class XtreamCredentials(
    val username: String,
    val password: String
)

sealed class IptvException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class Network(message: String, cause: Throwable? = null) : IptvException(message, cause)
    class Auth(message: String) : IptvException(message)
    class Parse(message: String, cause: Throwable? = null) : IptvException(message, cause)
    class Validation(message: String) : IptvException(message)
    class Cancelled : IptvException("Synchronisation annulée")
}

enum class SyncPhase {
    IDLE,
    VALIDATING,
    FETCHING,
    NORMALIZING,
    MERGING,
    PERSISTING,
    COMPLETED,
    FAILED,
    CANCELLED
}

data class SyncProgress(
    val phase: SyncPhase = SyncPhase.IDLE,
    val fraction: Float = 0f,
    val message: String = "",
    val currentSourceId: String? = null,
    val errorMessage: String? = null
)

data class SyncResult(
    val success: Boolean,
    val sourcesProcessed: Int,
    val titlesImported: Int,
    val groupsImported: Int,
    val errors: List<String> = emptyList(),
    val cancelled: Boolean = false
)

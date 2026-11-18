package com.lkstv.app.domain.iptv

import com.lkstv.app.domain.AudioLanguage
import kotlinx.coroutines.flow.StateFlow

interface SecretStore {
    fun putXtreamCredentials(sourceId: IptvSourceId, credentials: XtreamCredentials)
    fun getXtreamCredentials(sourceId: IptvSourceId): XtreamCredentials?
    fun deleteXtreamCredentials(sourceId: IptvSourceId)
    fun clearAll()
}

interface SourceRepository {
    fun observeSources(): StateFlow<List<IptvSource>>
    fun getSources(): List<IptvSource>
    fun getSource(id: IptvSourceId): IptvSource?
    suspend fun upsertSource(source: IptvSource)
    suspend fun setEnabled(id: IptvSourceId, enabled: Boolean)
    suspend fun removeSource(id: IptvSourceId)
    suspend fun markSyncResult(id: IptvSourceId, epochMs: Long, error: String?)
}

interface CatalogRepository {
    fun observeCatalog(): StateFlow<UnifiedCatalog>
    fun getCatalog(): UnifiedCatalog
    suspend fun replaceCatalog(catalog: UnifiedCatalog)
    fun groups(): List<IptvGroup>
    fun titlesVisibleFor(
        hiddenGroupIds: Set<String>,
        preferredLanguage: AudioLanguage
    ): List<LogicalTitle>
}

fun interface PlaylistFetcher {
    suspend fun fetchText(url: String): String
}

interface XtreamGateway {
    suspend fun authenticate(baseUrl: String, credentials: XtreamCredentials): Result<XtreamAccountInfo>
    suspend fun fetchLiveCategories(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamCategoryDto>>
    suspend fun fetchVodCategories(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamCategoryDto>>
    suspend fun fetchSeriesCategories(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamCategoryDto>>
    suspend fun fetchVodStreams(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamStreamDto>>
    suspend fun fetchLiveStreams(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamStreamDto>>
    suspend fun fetchSeries(baseUrl: String, credentials: XtreamCredentials): Result<List<XtreamSeriesDto>>
}

data class XtreamAccountInfo(
    val status: String,
    val isActive: Boolean
)

data class XtreamCategoryDto(
    val categoryId: String,
    val categoryName: String
)

data class XtreamStreamDto(
    val streamId: String,
    val name: String,
    val categoryId: String,
    val containerExtension: String? = null,
    val tmdbId: String? = null,
    val plot: String? = null,
    val genre: String? = null,
    val year: String? = null,
    val streamIcon: String? = null
)

data class XtreamSeriesDto(
    val seriesId: String,
    val name: String,
    val categoryId: String,
    val tmdbId: String? = null,
    val plot: String? = null,
    val genre: String? = null,
    val year: String? = null,
    val cover: String? = null,
    val backdrop: String? = null,
    val episodes: List<XtreamEpisodeDto> = emptyList()
)

data class XtreamEpisodeDto(
    val id: String,
    val season: Int,
    val episodeNum: Int,
    val title: String,
    val containerExtension: String? = null,
    val plot: String? = null,
    val durationMinutes: Int? = null,
    val thumbUrl: String? = null
)

interface CatalogSyncEngine {
    val progress: StateFlow<SyncProgress>
    val isRunning: Boolean
    suspend fun syncAll(): SyncResult
    fun cancel()
}

/**
 * Hook for a future WorkManager-backed scheduler.
 * TASK-002 ships a no-op / enabler API only — no fake periodic jobs.
 */
interface PeriodicSyncScheduler {
    fun isSupported(): Boolean = false
    fun enqueuePeriodicBestEffort(repeatIntervalHours: Long)
    fun cancelPeriodic()
}

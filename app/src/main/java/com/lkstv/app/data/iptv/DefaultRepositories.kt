package com.lkstv.app.data.iptv

import com.lkstv.app.data.iptv.local.JsonCatalogStore
import com.lkstv.app.data.iptv.local.JsonSourceStore
import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.CatalogRepository
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.SourceRepository
import com.lkstv.app.domain.iptv.UnifiedCatalog
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class DefaultSourceRepository(
    private val store: JsonSourceStore
) : SourceRepository {

    private val mutex = Mutex()
    private val _sources = MutableStateFlow(store.read())
    override fun observeSources(): StateFlow<List<IptvSource>> = _sources.asStateFlow()

    override fun getSources(): List<IptvSource> = _sources.value

    override fun getSource(id: IptvSourceId): IptvSource? =
        _sources.value.firstOrNull { it.id == id }

    override suspend fun upsertSource(source: IptvSource) = mutex.withLock {
        val next = _sources.value.filterNot { it.id == source.id } + source
        persist(next)
    }

    override suspend fun setEnabled(id: IptvSourceId, enabled: Boolean) = mutex.withLock {
        val next = _sources.value.map {
            if (it.id == id) it.copy(enabled = enabled) else it
        }
        persist(next)
    }

    override suspend fun removeSource(id: IptvSourceId) = mutex.withLock {
        persist(_sources.value.filterNot { it.id == id })
    }

    override suspend fun markSyncResult(id: IptvSourceId, epochMs: Long, error: String?) = mutex.withLock {
        val next = _sources.value.map {
            if (it.id == id) it.copy(lastSyncEpochMs = epochMs, lastError = error) else it
        }
        persist(next)
    }

    private fun persist(next: List<IptvSource>) {
        store.write(next)
        _sources.value = next
    }
}

class DefaultCatalogRepository(
    private val store: JsonCatalogStore
) : CatalogRepository {

    private val mutex = Mutex()
    private val _catalog = MutableStateFlow(store.read())
    override fun observeCatalog(): StateFlow<UnifiedCatalog> = _catalog.asStateFlow()

    override fun getCatalog(): UnifiedCatalog = _catalog.value

    override suspend fun replaceCatalog(catalog: UnifiedCatalog) = mutex.withLock {
        store.write(catalog)
        _catalog.value = catalog
    }

    override fun groups(): List<IptvGroup> = _catalog.value.groups

    override fun titlesVisibleFor(
        hiddenGroupIds: Set<String>,
        preferredLanguage: AudioLanguage
    ): List<LogicalTitle> {
        return _catalog.value.titles.mapNotNull { title ->
            val visibleVariants = title.variants.filter { it.groupId !in hiddenGroupIds }
            val visibleEpisodes = title.episodes.mapNotNull { ep ->
                val versions = ep.versions.filter { it.stream.groupId !in hiddenGroupIds }
                if (versions.isEmpty()) null else ep.copy(versions = versions)
            }
            if (visibleVariants.isEmpty() && visibleEpisodes.isEmpty()) return@mapNotNull null
            // Preferred language selection does not drop other versions — it only orders UX later.
            title.copy(
                variants = preferredSort(visibleVariants, preferredLanguage),
                episodes = visibleEpisodes
            )
        }
    }

    private fun preferredSort(
        variants: List<com.lkstv.app.domain.iptv.StreamRef>,
        preferred: AudioLanguage
    ): List<com.lkstv.app.domain.iptv.StreamRef> {
        val preferredTag = LanguageCodes.fromAudioLanguage(preferred)
        return variants.sortedByDescending {
            val tag = it.languageTag.ifBlank { LanguageCodes.fromAudioLanguage(it.language) }
            when {
                LanguageCodes.matchesPreferred(tag, preferredTag) -> 2
                tag.isNotEmpty() || it.language != AudioLanguage.UNKNOWN -> 1
                else -> 0
            }
        }
    }
}

/** In-memory repos for JVM tests. */
class InMemorySourceRepository(
    initial: List<IptvSource> = emptyList()
) : SourceRepository {
    private val _sources = MutableStateFlow(initial)
    override fun observeSources() = _sources.asStateFlow()
    override fun getSources() = _sources.value
    override fun getSource(id: IptvSourceId) = _sources.value.firstOrNull { it.id == id }
    override suspend fun upsertSource(source: IptvSource) {
        _sources.value = _sources.value.filterNot { it.id == source.id } + source
    }
    override suspend fun setEnabled(id: IptvSourceId, enabled: Boolean) {
        _sources.value = _sources.value.map { if (it.id == id) it.copy(enabled = enabled) else it }
    }
    override suspend fun removeSource(id: IptvSourceId) {
        _sources.value = _sources.value.filterNot { it.id == id }
    }
    override suspend fun markSyncResult(id: IptvSourceId, epochMs: Long, error: String?) {
        _sources.value = _sources.value.map {
            if (it.id == id) it.copy(lastSyncEpochMs = epochMs, lastError = error) else it
        }
    }
}

class InMemoryCatalogRepository(
    initial: UnifiedCatalog = UnifiedCatalog()
) : CatalogRepository {
    private val _catalog = MutableStateFlow(initial)
    override fun observeCatalog() = _catalog.asStateFlow()
    override fun getCatalog() = _catalog.value
    override suspend fun replaceCatalog(catalog: UnifiedCatalog) {
        _catalog.value = catalog
    }
    override fun groups() = _catalog.value.groups
    override fun titlesVisibleFor(
        hiddenGroupIds: Set<String>,
        preferredLanguage: AudioLanguage
    ): List<LogicalTitle> {
        return _catalog.value.titles.mapNotNull { title ->
            val visibleVariants = title.variants.filter { v -> v.groupId !in hiddenGroupIds }
            val visibleEpisodes = title.episodes.mapNotNull { ep ->
                val versions = ep.versions.filter { ver -> ver.stream.groupId !in hiddenGroupIds }
                if (versions.isEmpty()) null else ep.copy(versions = versions)
            }
            if (visibleVariants.isEmpty() && visibleEpisodes.isEmpty()) null
            else title.copy(variants = visibleVariants, episodes = visibleEpisodes)
        }
    }
}

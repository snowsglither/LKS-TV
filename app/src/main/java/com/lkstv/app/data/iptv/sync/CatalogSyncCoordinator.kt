package com.lkstv.app.data.iptv.sync

import com.lkstv.app.data.iptv.SourceIngestor
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.CatalogRepository
import com.lkstv.app.domain.iptv.CatalogSyncEngine
import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.PeriodicSyncScheduler
import com.lkstv.app.domain.iptv.SourceRepository
import com.lkstv.app.domain.iptv.SyncPhase
import com.lkstv.app.domain.iptv.SyncProgress
import com.lkstv.app.domain.iptv.SyncResult
import com.lkstv.app.domain.iptv.UnifiedCatalog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.concurrent.atomic.AtomicReference

class CatalogSyncCoordinator(
    private val sources: SourceRepository,
    private val catalog: CatalogRepository,
    private val ingestor: SourceIngestor
) : CatalogSyncEngine {

    private val mutex = Mutex()
    private val runningJob = AtomicReference<Job?>(null)
    private val _progress = MutableStateFlow(SyncProgress())
    override val progress: StateFlow<SyncProgress> = _progress.asStateFlow()

    override val isRunning: Boolean
        get() = runningJob.get()?.isActive == true

    override suspend fun syncAll(): SyncResult = mutex.withLock {
        if (isRunning) {
            return SyncResult(
                success = false,
                sourcesProcessed = 0,
                titlesImported = 0,
                groupsImported = 0,
                errors = listOf("Une synchronisation est déjà en cours")
            )
        }
        coroutineScope {
            val job = coroutineContext[Job]
            runningJob.set(job)
            try {
                doSync()
            } finally {
                runningJob.compareAndSet(job, null)
            }
        }
    }

    override fun cancel() {
        runningJob.get()?.cancel(CancellationException("cancel requested"))
        _progress.value = SyncProgress(
            phase = SyncPhase.CANCELLED,
            fraction = _progress.value.fraction,
            message = "Annulation demandée",
            errorMessage = "Synchronisation annulée"
        )
    }

    private suspend fun doSync(): SyncResult {
        val enabled = sources.getSources().filter { it.enabled }
        if (enabled.isEmpty()) {
            _progress.value = SyncProgress(
                phase = SyncPhase.COMPLETED,
                fraction = 1f,
                message = "Aucune source IPTV activée"
            )
            return SyncResult(true, 0, catalog.getCatalog().titles.size, catalog.getCatalog().groups.size)
        }

        val allGroups = mutableListOf<com.lkstv.app.domain.iptv.IptvGroup>()
        val allIncoming = mutableListOf<CatalogMergePolicy.IncomingTitle>()
        val errors = mutableListOf<String>()
        var processed = 0

        enabled.forEachIndexed { index, source ->
            currentCoroutineContext().ensureActive()
            val base = index.toFloat() / enabled.size
            emit(SyncPhase.VALIDATING, base, "Validation ${source.displayName}", source.id.value)
            try {
                emit(SyncPhase.FETCHING, base + 0.2f / enabled.size, "Import ${source.displayName}", source.id.value)
                val result = ingestor.ingest(source)
                allGroups += result.groups
                allIncoming += result.incoming
                sources.markSyncResult(source.id, System.currentTimeMillis(), null)
                processed++
            } catch (e: CancellationException) {
                emit(SyncPhase.CANCELLED, base, "Annulé", source.id.value, e.message)
                throw e
            } catch (e: Exception) {
                val msg = e.message ?: e::class.java.simpleName
                // Never include credential material; IptvException messages are sanitized by design.
                errors += "${source.displayName}: $msg"
                sources.markSyncResult(source.id, System.currentTimeMillis(), msg)
            }
        }

        currentCoroutineContext().ensureActive()
        emit(SyncPhase.NORMALIZING, 0.85f, "Normalisation des groupes")
        emit(SyncPhase.MERGING, 0.9f, "Fusion catalogue (clés fiables uniquement)")
        val merged = CatalogMergePolicy.merge(allIncoming)
        val unified = UnifiedCatalog(
            groups = allGroups.distinctBy { it.id },
            titles = merged,
            generatedAtEpochMs = System.currentTimeMillis()
        )
        emit(SyncPhase.PERSISTING, 0.96f, "Persistance locale")
        catalog.replaceCatalog(unified)
        emit(
            SyncPhase.COMPLETED,
            1f,
            "Sync terminée — ${merged.size} titres, ${unified.groups.size} groupes" +
                if (errors.isEmpty()) "" else " (${errors.size} erreur(s))"
        )
        return SyncResult(
            success = errors.isEmpty(),
            sourcesProcessed = processed,
            titlesImported = merged.size,
            groupsImported = unified.groups.size,
            errors = errors
        )
    }

    private fun emit(
        phase: SyncPhase,
        fraction: Float,
        message: String,
        sourceId: String? = null,
        error: String? = null
    ) {
        _progress.value = SyncProgress(
            phase = phase,
            fraction = fraction.coerceIn(0f, 1f),
            message = message,
            currentSourceId = sourceId,
            errorMessage = error
        )
    }
}

/**
 * Placeholder for future WorkManager integration — does not schedule anything in TASK-002.
 */
class NoOpPeriodicSyncScheduler : PeriodicSyncScheduler {
    override fun isSupported(): Boolean = false
    override fun enqueuePeriodicBestEffort(repeatIntervalHours: Long) {
        // Intentionally empty: WorkManager wiring belongs to a later task.
    }

    override fun cancelPeriodic() = Unit
}

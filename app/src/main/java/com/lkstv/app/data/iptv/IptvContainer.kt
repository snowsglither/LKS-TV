package com.lkstv.app.data.iptv

import android.content.Context
import com.lkstv.app.data.iptv.local.JsonCatalogStore
import com.lkstv.app.data.iptv.local.JsonSourceStore
import com.lkstv.app.data.iptv.security.AndroidKeystoreSecretStore
import com.lkstv.app.data.iptv.sync.CatalogSyncCoordinator
import com.lkstv.app.data.iptv.sync.NoOpPeriodicSyncScheduler
import com.lkstv.app.data.iptv.xtream.OkHttpXtreamGateway
import com.lkstv.app.domain.iptv.CatalogRepository
import com.lkstv.app.domain.iptv.CatalogSyncEngine
import com.lkstv.app.domain.iptv.PeriodicSyncScheduler
import com.lkstv.app.domain.iptv.SecretStore
import com.lkstv.app.domain.iptv.SourceRepository
import com.lkstv.app.domain.iptv.XtreamGateway
import java.io.File

class IptvContainer(context: Context) {
    private val appContext = context.applicationContext
    private val dataDir = File(appContext.filesDir, "iptv").also { it.mkdirs() }

    val secretStore: SecretStore = AndroidKeystoreSecretStore(appContext)
    val sourceRepository: SourceRepository =
        DefaultSourceRepository(JsonSourceStore(File(dataDir, "sources.json")))
    val catalogRepository: CatalogRepository =
        DefaultCatalogRepository(JsonCatalogStore(File(dataDir, "catalog.json")))
    val playlistFetcher = OkHttpPlaylistFetcher()
    val xtreamGateway: XtreamGateway = OkHttpXtreamGateway()
    val ingestor = SourceIngestor(secretStore, playlistFetcher, xtreamGateway)
    val syncEngine: CatalogSyncEngine =
        CatalogSyncCoordinator(sourceRepository, catalogRepository, ingestor)
    val periodicSyncScheduler: PeriodicSyncScheduler = NoOpPeriodicSyncScheduler()
}

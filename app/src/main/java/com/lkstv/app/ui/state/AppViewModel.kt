package com.lkstv.app.ui.state

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.lkstv.app.data.SessionRepository
import com.lkstv.app.data.iptv.IptvContainer
import com.lkstv.app.domain.AppDestination
import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.CatalogPresenter
import com.lkstv.app.domain.CatalogScreenEmptyReason
import com.lkstv.app.domain.CatalogScreenStatus
import com.lkstv.app.domain.CatalogSearch
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.EditionLanguageOption
import com.lkstv.app.domain.EpgChannelRow
import com.lkstv.app.domain.Episode
import com.lkstv.app.domain.EpisodeProgress
import com.lkstv.app.domain.GroupSelection
import com.lkstv.app.domain.HomeRow
import com.lkstv.app.domain.HomeRowId
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.NavStack
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.ProviderGroup
import com.lkstv.app.domain.LiveCatalog
import com.lkstv.app.domain.LiveChannelRef
import com.lkstv.app.domain.LiveGroupRef
import com.lkstv.app.domain.Recommendations
import com.lkstv.app.domain.SearchFilter
import com.lkstv.app.domain.SearchIndex
import com.lkstv.app.domain.SearchPage
import com.lkstv.app.domain.SelectableGroup
import com.lkstv.app.domain.WorkIdentity
import com.lkstv.app.BuildConfig
import com.lkstv.app.data.iptv.PlaybackResolver
import com.lkstv.app.data.update.AppUpdateChecker
import com.lkstv.app.data.update.UpdateCheckResult
import com.lkstv.app.data.update.UpdateManifest
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.UnifiedCatalog
import com.lkstv.app.domain.iptv.XtreamCredentials
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.UUID

data class AppUiState(
    val destination: AppDestination = AppDestination.Splash,
    val profiles: List<Profile> = emptyList(),
    val updateAvailable: Boolean = false,
    val updateVersionName: String? = null,
    val updateChangelog: String? = null,
    val updateCheckMessage: String? = null,
    val showUpdateDialog: Boolean = false,
    val updateDownloadProgress: Float? = null,
    val updateApkUrl: String? = null,
    val appVersionLabel: String = BuildConfig.VERSION_NAME,
    val activeProfile: Profile? = null,
    val preferences: ProfilePreferences = ProfilePreferences(),
    val providerGroups: List<ProviderGroup> = emptyList(),
    val filmRows: List<HomeRow> = emptyList(),
    val seriesRows: List<HomeRow> = emptyList(),
    val continueWatching: List<CatalogItem> = emptyList(),
    val filmHero: CatalogItem? = null,
    val seriesHero: CatalogItem? = null,
    val filmStatus: CatalogScreenStatus = CatalogScreenStatus.EMPTY_NO_SOURCES,
    val seriesStatus: CatalogScreenStatus = CatalogScreenStatus.EMPTY_NO_SOURCES,
    val selectedItem: CatalogItem? = null,
    val relatedItems: List<CatalogItem> = emptyList(),
    val sequelItems: List<CatalogItem> = emptyList(),
    val selectedSeasonIndex: Int = 0,
    val showCustomizeMenu: Boolean = false,
    val showProfileSwitcher: Boolean = false,
    val isDemoSyncing: Boolean = false,
    val demoSyncMessage: String? = null,
    val syncError: String? = null,
    val libraryFavorites: List<CatalogItem> = emptyList(),
    val libraryWatchLater: List<CatalogItem> = emptyList(),
    val iptvSources: List<IptvSource> = emptyList(),
    val hasEnabledIptvSources: Boolean = false,
    val iptvTitleCount: Int = 0,
    val sourceActionMessage: String? = null,
    val filmsScrollIndex: Int = 0,
    val seriesScrollIndex: Int = 0,
    val searchQuery: String = "",
    val searchFilter: SearchFilter = SearchFilter.ALL,
    val searchPage: SearchPage? = null,
    val searchSuggestions: List<CatalogItem> = emptyList(),
    val searchAccumulated: List<CatalogItem> = emptyList(),
    val liveGroups: List<LiveGroupRef> = emptyList(),
    val liveChannels: List<LiveChannelRef> = emptyList(),
    val liveChannelTotal: Int = 0,
    val liveSelectedGroupId: String = "__all__",
    val liveSelectedChannelId: String? = null,
    val liveHasMore: Boolean = false,
    val filmsGroupEmpty: CatalogScreenEmptyReason = CatalogScreenEmptyReason.NONE,
    val seriesGroupEmpty: CatalogScreenEmptyReason = CatalogScreenEmptyReason.NONE,
    val liveGroupEmpty: CatalogScreenEmptyReason = CatalogScreenEmptyReason.NONE,
    val groupSetupGroups: List<SelectableGroup> = emptyList(),
    val playerUrl: String? = null,
    val playerDiagnostic: String = "",
    val playerError: String? = null,
    val livePreviewUrl: String? = null,
    val livePreviewStatus: String = "",
    val epgDiagnosis: String = "",
    val epgHasData: Boolean = false,
    val epgRows: List<EpgChannelRow> = emptyList()
)

private data class OverlayBits(
    val seasonIndex: Int,
    val customize: Boolean,
    val profileSwitcher: Boolean,
    val syncing: Boolean,
    val syncMessage: String?
)

class AppViewModel(
    private val session: SessionRepository,
    private val iptv: IptvContainer?
) : ViewModel() {

    private val navStack = NavStack()
    private val destination = MutableStateFlow<AppDestination>(AppDestination.Splash)
    private val epgDiagnosis = MutableStateFlow("")
    private val epgHasData = MutableStateFlow(false)
    private val epgRows = MutableStateFlow<List<EpgChannelRow>>(emptyList())

    private fun goTo(dest: AppDestination, push: Boolean = true) {
        if (push) navStack.push(dest) else navStack.clear(dest)
        destination.value = dest
    }
    private val selectedSeasonIndex = MutableStateFlow(0)
    private val showCustomizeMenu = MutableStateFlow(false)
    private val showProfileSwitcher = MutableStateFlow(false)
    private val sourceActionMessage = MutableStateFlow<String?>(null)
    private val selectedVersionOverrides = MutableStateFlow<Map<String, String>>(emptyMap())
    private val filmsScrollIndex = MutableStateFlow(0)
    private val seriesScrollIndex = MutableStateFlow(0)
    private val itemCache = MutableStateFlow<Map<String, CatalogItem>>(emptyMap())
    private val searchQuery = MutableStateFlow("")
    private val searchFilter = MutableStateFlow(SearchFilter.ALL)
    private val searchOffset = MutableStateFlow(0)
    private val searchPage = MutableStateFlow<SearchPage?>(null)
    private val searchSuggestions = MutableStateFlow<List<CatalogItem>>(emptyList())
    private val searchAccumulated = MutableStateFlow<List<CatalogItem>>(emptyList())
    private var searchIndexCache: SearchIndex? = null
    private var searchDebounceJob: Job? = null
    private var searchRequestId = 0
    private val liveSelectedGroupId = MutableStateFlow("__all__")
    private val liveSelectedChannelId = MutableStateFlow<String?>(null)
    private val liveOffset = MutableStateFlow(0)
    private val liveChannels = MutableStateFlow<List<LiveChannelRef>>(emptyList())
    private val liveChannelTotal = MutableStateFlow(0)
    private val playerUrl = MutableStateFlow<String?>(null)
    private val playerDiagnostic = MutableStateFlow("")
    private val playerError = MutableStateFlow<String?>(null)
    private val playerReturnToLive = MutableStateFlow(false)
    private val livePreviewUrl = MutableStateFlow<String?>(null)
    private val livePreviewStatus = MutableStateFlow("")
    private var livePreviewJob: Job? = null
    private val updateAvailable = MutableStateFlow(false)
    private val updateManifest = MutableStateFlow<UpdateManifest?>(null)
    private val updateCheckMessage = MutableStateFlow<String?>(null)
    private val showUpdateDialog = MutableStateFlow(false)
    private val updateDownloadProgress = MutableStateFlow<Float?>(null)

    init {
        viewModelScope.launch {
            delay(2_500)
            checkForUpdate(silent = true)
        }
    }

    private val overlayBits = combine(
        selectedSeasonIndex,
        showCustomizeMenu,
        showProfileSwitcher,
        session.isSyncing,
        session.lastSyncMessage
    ) { season, customize, switcher, syncing, message ->
        OverlayBits(season, customize, switcher, syncing, message)
    }

    private val iptvTick = combine(
        iptv?.sourceRepository?.observeSources() ?: MutableStateFlow(emptyList()),
        iptv?.catalogRepository?.observeCatalog() ?: MutableStateFlow(UnifiedCatalog()),
        combine(sourceActionMessage, session.lastSyncError, selectedVersionOverrides) { a, b, c ->
            Triple(a, b, c)
        }
    ) { sources, catalog, extras ->
        Triple(sources, catalog, extras)
    }

    private data class SearchUiBits(
        val query: String,
        val filter: SearchFilter,
        val page: SearchPage?,
        val suggestions: List<CatalogItem>,
        val accumulated: List<CatalogItem>
    )

    private val searchBits = combine(
        searchQuery,
        searchFilter,
        searchPage,
        searchSuggestions,
        searchAccumulated
    ) { q, f, page, suggestions, accumulated ->
        SearchUiBits(q, f, page, suggestions, accumulated)
    }

    private val liveBits = combine(
        liveSelectedGroupId,
        liveSelectedChannelId,
        liveChannels,
        liveChannelTotal,
        liveOffset
    ) { gid, cid, channels, total, offset ->
        LiveUiBits(gid, cid, channels, total, offset + channels.size < total)
    }

    private data class PlayerUiBits(
        val url: String?,
        val diag: String,
        val err: String?,
        val previewUrl: String?,
        val previewStatus: String
    )

    private val playerBits = combine(
        playerUrl,
        playerDiagnostic,
        playerError,
        livePreviewUrl,
        livePreviewStatus
    ) { url, diag, err, previewUrl, previewStatus ->
        PlayerUiBits(url, diag, err, previewUrl, previewStatus)
    }

    private val sessionTick = combine(
        session.activeProfileId,
        session.prefsVersion,
        session.profilesVersion
    ) { profileId, _, _ -> profileId }

    private val updateBits = combine(
        updateAvailable,
        updateManifest,
        updateCheckMessage,
        showUpdateDialog,
        updateDownloadProgress
    ) { available, manifest, message, dialog, progress ->
        UpdateUiBits(available, manifest, message, dialog, progress)
    }

    private val coreTick = combine(
        destination,
        sessionTick,
        overlayBits,
        iptvTick,
        updateBits
    ) { dest, profileId, bits, iptvBits, updates ->
        CoreTick(dest, profileId, bits, iptvBits, updates)
    }

    private val midTick = combine(coreTick, searchBits, liveBits) { core, search, live ->
        Triple(core, search, live)
    }

    val uiState: StateFlow<AppUiState> = combine(midTick, playerBits) { mid, player ->
        val (core, search, live) = mid
        val dest = core.dest
        val profileId = core.profileId
        val bits = core.bits
        val updates = core.updates
        val (sources, catalog, extras) = core.iptvBits
        val (actionMsg, syncError, versionOverrides) = extras
        val profile = profileId?.let { id -> session.profiles().firstOrNull { it.id == id } }
        val prefs = profileId?.let { session.preferencesFor(it) } ?: ProfilePreferences()
        val sourceLabels = sources.associate { it.id.value to it.displayName }
        val hasEnabled = sources.any { it.enabled }
        val filmRows = CatalogPresenter.buildRows(catalog, ContentType.FILM, prefs, sourceLabels)
        val seriesRows = CatalogPresenter.buildRows(catalog, ContentType.SERIES, prefs, sourceLabels)
        val filmItems = filmRows.flatMap { it.items }.distinctBy { it.id }
        val seriesItems = seriesRows.flatMap { it.items }.distinctBy { it.id }
        val continueWatching = (
            (filmRows.find { it.key == HomeRowId.CONTINUE_WATCHING.key }?.items ?: emptyList()) +
                (seriesRows.find { it.key == HomeRowId.CONTINUE_WATCHING.key }?.items ?: emptyList())
            )
            .sortedByDescending { it.continueActivity }
            .distinctBy { it.id }
            .take(24)
        val allItems = (filmItems + seriesItems).associateBy { it.id }.toMutableMap()
        versionOverrides.forEach { (itemId, versionId) ->
            allItems[itemId]?.let { allItems[itemId] = CatalogPresenter.withSelectedVersion(it, versionId) }
        }
        search.accumulated.forEach { allItems.putIfAbsent(it.id, it) }
        search.page?.hits?.forEach { allItems.putIfAbsent(it.item.id, it.item) }
        itemCache.value = allItems

        maybeRefreshSearchIndex(catalog)

        val filmStatus = CatalogPresenter.status(hasEnabled, catalog, bits.syncing, syncError)
        val groups = catalog.groups.map {
            ProviderGroup(
                id = it.id,
                name = it.name,
                sourceLabel = sourceLabels[it.sourceId.value] ?: it.sourceId.value,
                sourceId = it.sourceId.value,
                providerGroupId = it.providerGroupId
            )
        }
        val liveGroups = LiveCatalog.groups(catalog, prefs)
        val groupSetupGroups = when (dest) {
            is AppDestination.GroupSetup -> GroupSelection.listSelectable(
                catalog,
                dest.section,
                sourceLabels
            )
            else -> emptyList()
        }

        val selected = when (dest) {
            is AppDestination.FilmDetail -> allItems[dest.itemId]
            is AppDestination.SeriesDetail -> allItems[dest.itemId]
            else -> null
        }
        val maxSeason = ((selected?.seasons?.size ?: 1) - 1).coerceAtLeast(0)
        val pUrl = player.url
        val pDiag = player.diag
        val pErr = player.err

        AppUiState(
            destination = dest,
            profiles = session.profiles(),
            updateAvailable = updates.available,
            updateVersionName = updates.manifest?.versionName,
            updateChangelog = updates.manifest?.changelog,
            updateCheckMessage = updates.message,
            showUpdateDialog = updates.dialog,
            updateDownloadProgress = updates.downloadProgress,
            updateApkUrl = updates.manifest?.apkUrl,
            appVersionLabel = BuildConfig.VERSION_NAME,
            activeProfile = profile,
            preferences = prefs,
            providerGroups = groups,
            filmRows = filmRows.map { row ->
                row.copy(items = row.items.map { allItems[it.id] ?: it })
            },
            seriesRows = seriesRows.map { row ->
                row.copy(items = row.items.map { allItems[it.id] ?: it })
            },
            continueWatching = continueWatching.map { allItems[it.id]?.copy(
                progressFraction = it.progressFraction,
                resumeLabel = it.resumeLabel,
                resumeStreamId = it.resumeStreamId,
                resumeEpisodeId = it.resumeEpisodeId,
                remainingMinutes = it.remainingMinutes,
                continueActivity = it.continueActivity
            ) ?: it },
            filmHero = CatalogPresenter.hero(filmItems.map { allItems[it.id] ?: it }),
            seriesHero = CatalogPresenter.hero(seriesItems.map { allItems[it.id] ?: it }),
            filmStatus = filmStatus,
            seriesStatus = filmStatus,
            selectedItem = selected,
            relatedItems = run {
                val sel = selected ?: return@run emptyList()
                val seed = catalog.titles.find { t -> t.id == sel.id } ?: return@run emptyList()
                Recommendations.build(seed, catalog.titles, limit = 12).similar
                    .map { title -> CatalogPresenter.toItem(title, prefs) }
            },
            sequelItems = run {
                val sel = selected ?: return@run emptyList()
                val seed = catalog.titles.find { t -> t.id == sel.id } ?: return@run emptyList()
                Recommendations.build(seed, catalog.titles, limit = 12).saga
                    .map { title -> CatalogPresenter.toItem(title, prefs) }
            },
            selectedSeasonIndex = bits.seasonIndex.coerceIn(0, maxSeason),
            showCustomizeMenu = bits.customize,
            showProfileSwitcher = bits.profileSwitcher,
            isDemoSyncing = bits.syncing,
            demoSyncMessage = bits.syncMessage,
            syncError = syncError,
            libraryFavorites = prefs.favoriteIds.mapNotNull { allItems[it] },
            libraryWatchLater = prefs.watchLaterIds.mapNotNull { allItems[it] },
            iptvSources = sources,
            hasEnabledIptvSources = hasEnabled,
            iptvTitleCount = catalog.titles.size,
            sourceActionMessage = actionMsg,
            filmsScrollIndex = filmsScrollIndex.value,
            seriesScrollIndex = seriesScrollIndex.value,
            searchQuery = search.query,
            searchFilter = search.filter,
            searchPage = search.page,
            searchSuggestions = search.suggestions,
            searchAccumulated = search.accumulated,
            liveGroups = liveGroups,
            liveChannels = live.channels,
            liveChannelTotal = live.total,
            liveSelectedGroupId = live.groupId,
            liveSelectedChannelId = live.channelId,
            liveHasMore = live.hasMore,
            filmsGroupEmpty = GroupSelection.emptyReason(prefs, CatalogSectionKey.FILMS),
            seriesGroupEmpty = GroupSelection.emptyReason(prefs, CatalogSectionKey.SERIES),
            liveGroupEmpty = GroupSelection.emptyReason(prefs, CatalogSectionKey.TV),
            groupSetupGroups = groupSetupGroups,
            playerUrl = pUrl,
            playerDiagnostic = pDiag,
            playerError = pErr,
            livePreviewUrl = player.previewUrl,
            livePreviewStatus = player.previewStatus,
            epgDiagnosis = epgDiagnosis.value,
            epgHasData = epgHasData.value,
            epgRows = epgRows.value
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = AppUiState()
    )

    private data class LiveUiBits(
        val groupId: String,
        val channelId: String?,
        val channels: List<LiveChannelRef>,
        val total: Int,
        val hasMore: Boolean
    )

    private data class UpdateUiBits(
        val available: Boolean,
        val manifest: UpdateManifest?,
        val message: String?,
        val dialog: Boolean,
        val downloadProgress: Float?
    )

    private data class CoreTick(
        val dest: AppDestination,
        val profileId: String?,
        val bits: OverlayBits,
        val iptvBits: Triple<
            List<IptvSource>,
            UnifiedCatalog,
            Triple<String?, String?, Map<String, String>>
            >,
        val updates: UpdateUiBits
    )

    private fun maybeRefreshSearchIndex(catalog: UnifiedCatalog) {
        val cached = searchIndexCache
        if (cached == null || cached.generatedAtEpochMs != catalog.generatedAtEpochMs) {
            viewModelScope.launch(Dispatchers.Default) {
                val index = CatalogSearch.buildIndex(catalog)
                searchIndexCache = index
                val profileId = session.activeProfileId.value
                val prefs = profileId?.let { session.preferencesFor(it) } ?: ProfilePreferences()
                searchSuggestions.value = CatalogSearch.suggestions(
                    index,
                    prefs,
                    prefs.preferredLanguage
                )
            }
        }
    }

    fun finishSplash() {
        destination.value = AppDestination.Profiles
    }

    fun selectProfile(profileId: String) {
        session.selectProfile(profileId)
        showProfileSwitcher.value = false
        goTo(AppDestination.Hub, push = false)
    }

    fun addProfile(name: String = "Nouveau") {
        val created = session.addProfile(name)
        sourceActionMessage.value = "Profil « ${created.name} » créé."
    }

    fun renameActiveProfile(name: String) {
        val id = session.activeProfileId.value ?: return
        session.renameProfile(id, name)
    }

    fun removeProfile(profileId: String) {
        if (!session.removeProfile(profileId)) {
            sourceActionMessage.value = "Impossible de supprimer le dernier profil."
        }
    }

    fun checkForUpdate(silent: Boolean = false) {
        viewModelScope.launch {
            when (val result = AppUpdateChecker.check()) {
                is UpdateCheckResult.Available -> {
                    updateManifest.value = result.manifest
                    updateAvailable.value = true
                    updateCheckMessage.value =
                        "Mise à jour disponible — LKS TV ${result.manifest.versionName}"
                    if (!silent) showUpdateDialog.value = true
                    else showUpdateDialog.value = true
                }
                UpdateCheckResult.UpToDate -> {
                    updateAvailable.value = false
                    updateManifest.value = null
                    updateCheckMessage.value =
                        if (silent) null else "LKS TV est à jour (${BuildConfig.VERSION_NAME})."
                    if (!silent) showUpdateDialog.value = false
                }
                UpdateCheckResult.Disabled -> {
                    updateAvailable.value = false
                    updateCheckMessage.value =
                        if (silent) null
                        else "Mises à jour non configurées (manifest HTTPS manquant)."
                }
                is UpdateCheckResult.Failed -> {
                    updateCheckMessage.value =
                        if (silent) null else "Vérification impossible: ${result.message}"
                }
            }
        }
    }

    fun dismissUpdateDialog() {
        showUpdateDialog.value = false
    }

    fun dismissUpdateMessage() {
        updateCheckMessage.value = null
    }

    fun startUpdateInstall(context: android.content.Context) {
        val manifest = updateManifest.value ?: return
        viewModelScope.launch {
            updateDownloadProgress.value = 0f
            updateCheckMessage.value = "Téléchargement de LKS TV ${manifest.versionName}…"
            when (
                val result = com.lkstv.app.data.update.AppUpdateInstaller.downloadAndVerify(
                    context = context.applicationContext,
                    manifest = manifest,
                    onProgress = { updateDownloadProgress.value = it }
                )
            ) {
                is com.lkstv.app.data.update.UpdateInstallResult.Ready -> {
                    updateDownloadProgress.value = 1f
                    updateCheckMessage.value =
                        "APK vérifié (SHA-256). Confirmation Android requise pour installer."
                    showUpdateDialog.value = false
                    com.lkstv.app.data.update.AppUpdateInstaller.openInstaller(
                        context.applicationContext,
                        result.uri
                    )
                }
                is com.lkstv.app.data.update.UpdateInstallResult.Failed -> {
                    updateDownloadProgress.value = null
                    updateCheckMessage.value = "Mise à jour échouée: ${result.message}"
                }
            }
        }
    }

    fun openSection(section: HubSection) {
        showCustomizeMenu.value = false
        val key = CatalogSectionKey.fromHub(section)
        if (key != null) {
            val catalog = iptv?.catalogRepository?.observeCatalog()?.value ?: UnifiedCatalog()
            val prefs = session.activeProfileId.value?.let { session.preferencesFor(it) }
                ?: ProfilePreferences()
            val hasEnabled = iptv?.sourceRepository?.getSources()?.any { it.enabled } == true
            if (GroupSelection.needsSetup(prefs, catalog, key, hasEnabled)) {
                goTo(AppDestination.GroupSetup(key, manage = false))
                return
            }
        }
        if (section == HubSection.LIVE_TV) {
            goTo(AppDestination.LiveTv)
            refreshLiveChannels(reset = true)
            return
        }
        if (section == HubSection.EPG) {
            goTo(AppDestination.Section(HubSection.EPG))
            refreshEpg()
            return
        }
        goTo(AppDestination.Section(section))
    }

    fun refreshEpg() {
        viewModelScope.launch {
            val sources = iptv?.sourceRepository?.getSources()
                ?.filter { it.enabled && it.kind == IptvSourceKind.XTREAM }
                .orEmpty()
            epgRows.value = emptyList()
            epgHasData.value = false
            epgDiagnosis.value = when {
                sources.isEmpty() ->
                    "Aucune source Xtream active. Guide XMLTV indisponible. Aucun programme inventé."
                else ->
                    "Android: get_short_epg souvent vide chez le fournisseur. " +
                        "Grille chronologique XMLTV validée sur web-preview (xmltv.php). " +
                        "Sources: ${sources.joinToString { it.displayName }}. " +
                        "Aucun programme inventé — validation D-pad Compose TV requise pour la grille native."
            }
            // Retrigger UI combine
            destination.value = destination.value
        }
    }

    fun openManageGroups(section: CatalogSectionKey) {
        showCustomizeMenu.value = false
        destination.value = AppDestination.GroupSetup(section, manage = true)
    }

    fun saveGroupSetup(section: CatalogSectionKey, selectedIds: Set<String>) {
        session.saveSectionGroupSelection(section, selectedIds)
        when (section) {
            CatalogSectionKey.TV -> {
                destination.value = AppDestination.LiveTv
                refreshLiveChannels(reset = true)
            }
            CatalogSectionKey.FILMS -> destination.value = AppDestination.Section(HubSection.FILMS)
            CatalogSectionKey.SERIES -> destination.value = AppDestination.Section(HubSection.SERIES)
        }
    }

    fun cancelGroupSetup(manage: Boolean, section: CatalogSectionKey) {
        if (manage) {
            when (section) {
                CatalogSectionKey.TV -> destination.value = AppDestination.LiveTv
                CatalogSectionKey.FILMS -> destination.value = AppDestination.Section(HubSection.FILMS)
                CatalogSectionKey.SERIES -> destination.value = AppDestination.Section(HubSection.SERIES)
            }
        } else {
            destination.value = AppDestination.Hub
        }
    }

    fun selectLiveGroup(groupId: String) {
        liveSelectedGroupId.value = groupId
        liveOffset.value = 0
        refreshLiveChannels(reset = true)
    }

    fun selectLiveChannel(channel: LiveChannelRef) {
        liveSelectedChannelId.value = channel.id
        scheduleLivePreview(channel)
    }

    fun clearLivePreview() {
        livePreviewJob?.cancel()
        livePreviewUrl.value = null
        livePreviewStatus.value = ""
    }

    private fun scheduleLivePreview(channel: LiveChannelRef) {
        livePreviewJob?.cancel()
        livePreviewUrl.value = null
        val prefs = session.activeProfileId.value?.let { session.preferencesFor(it) }
        if (prefs?.livePreviewEnabled == false) {
            livePreviewStatus.value = "Aperçu désactivé"
            return
        }
        livePreviewStatus.value = "Aperçu…"
        livePreviewJob = viewModelScope.launch {
            delay(500)
            livePreviewStatus.value = "Connexion…"
            val container = iptv
            if (container == null) {
                livePreviewStatus.value = "IPTV indisponible"
                return@launch
            }
            val resolver = PlaybackResolver(container.sourceRepository, container.secretStore)
            val result = resolver.resolve(channel.playbackUrl)
            result.fold(
                onSuccess = {
                    livePreviewUrl.value = it.url
                    livePreviewStatus.value = "Aperçu"
                    session.updatePreferences { p ->
                        p.copy(lastLiveChannelId = channel.id)
                    }
                },
                onFailure = {
                    livePreviewUrl.value = null
                    livePreviewStatus.value = it.message ?: "Flux indisponible"
                }
            )
        }
    }

    fun loadMoreLiveChannels() {
        liveOffset.value = liveChannels.value.size
        refreshLiveChannels(reset = false)
    }

    private fun refreshLiveChannels(reset: Boolean) {
        viewModelScope.launch(Dispatchers.Default) {
            val catalog = iptv?.catalogRepository?.observeCatalog()?.value ?: UnifiedCatalog()
            val prefs = session.activeProfileId.value?.let { session.preferencesFor(it) }
                ?: ProfilePreferences()
            val offset = if (reset) 0 else liveOffset.value
            val (page, total) = LiveCatalog.channels(
                catalog,
                prefs,
                liveSelectedGroupId.value,
                offset,
                80
            )
            withContext(Dispatchers.Main) {
                liveChannelTotal.value = total
                liveChannels.value = if (reset) page else liveChannels.value + page
                if (liveSelectedChannelId.value == null ||
                    liveChannels.value.none { it.id == liveSelectedChannelId.value }
                ) {
                    liveSelectedChannelId.value = liveChannels.value.firstOrNull()?.id
                }
            }
        }
    }

    fun playLiveChannel(channel: LiveChannelRef) {
        liveSelectedChannelId.value = channel.id
        openPlayer(
            channel.title,
            channel.playbackUrl,
            returnToLive = true,
            returnDestination = AppDestination.LiveTv
        )
    }

    /** Zap within the currently loaded live channel page (no full catalog reload). */
    fun playAdjacentLiveChannel(delta: Int) {
        val list = liveChannels.value
        if (list.isEmpty()) return
        val curId = liveSelectedChannelId.value
        val idx = list.indexOfFirst { it.id == curId }.takeIf { it >= 0 } ?: 0
        val next = list.getOrNull(idx + delta) ?: return
        playLiveChannel(next)
    }

    fun canZapLive(delta: Int): Boolean {
        val list = liveChannels.value
        val curId = liveSelectedChannelId.value
        val idx = list.indexOfFirst { it.id == curId }
        if (idx < 0) return false
        return list.getOrNull(idx + delta) != null
    }

    fun openPlayerFromItem(item: CatalogItem) {
        val version = item.versions.firstOrNull { it.id == item.selectedVersionId }
            ?: item.versions.firstOrNull()
        val allEpisodes = item.seasons.asSequence().flatMap { season ->
            season.episodes.asSequence().map { it to season.number }
        }
        val resumeEpisode = item.resumeEpisodeId?.let { eid ->
            allEpisodes.firstOrNull { it.first.id == eid }?.first
        } ?: allEpisodes.firstOrNull { (ep, _) ->
            ep.watchState == EpisodeProgress.WatchState.IN_PROGRESS
        }?.first ?: allEpisodes.firstOrNull { (ep, _) ->
            ep.watchState != EpisodeProgress.WatchState.COMPLETED
        }?.first
        val resumeVersion = item.resumeStreamId?.let { sid ->
            allEpisodes
                .flatMap { it.first.versions.asSequence() }
                .firstOrNull { it.id == sid }
                ?: item.versions.firstOrNull { it.id == sid }
        } ?: resumeEpisode?.versions?.firstOrNull { it.id == resumeEpisode.selectedVersionId }
            ?: resumeEpisode?.versions?.firstOrNull()
        val ref = resumeVersion?.playbackUrl
            ?: resumeEpisode?.versions?.firstOrNull()?.playbackUrl
            ?: version?.playbackUrl
        if (ref.isNullOrBlank()) {
            playerError.value = "Aucune URL de lecture pour ce titre"
            return
        }
        val episodeId = resumeEpisode?.id
            ?: allEpisodes.firstOrNull { (ep, _) ->
                ep.versions.any { it.id == resumeVersion?.id }
            }?.first?.id
        val current = destination.value
        val returnDest = when (current) {
            is AppDestination.FilmDetail,
            is AppDestination.SeriesDetail -> current
            is AppDestination.Section -> current
            AppDestination.Search -> AppDestination.Search
            AppDestination.Hub -> AppDestination.Hub
            else -> when (item.type) {
                ContentType.SERIES -> AppDestination.SeriesDetail(item.id)
                ContentType.FILM -> AppDestination.FilmDetail(item.id)
            }
        }
        val seasonNum = resumeEpisode?.let { ep ->
            allEpisodes.firstOrNull { it.first.id == ep.id }?.second ?: ep.seasonNumber
        }
        val playTitle = if (resumeEpisode != null && seasonNum != null) {
            DisplayMeta.formatPlayerSeriesTitle(item.title, seasonNum, resumeEpisode.number)
        } else {
            item.title
        }
        openPlayer(
            title = playTitle,
            playbackRef = ref,
            returnToLive = false,
            returnDestination = returnDest,
            contentId = item.id,
            episodeId = episodeId,
            season = seasonNum,
            episodeNumber = resumeEpisode?.number,
            editionLanguages = resolveEditionLanguages(item, resumeEpisode, ref)
        )
    }

    fun openPlayerFromEpisode(item: CatalogItem, episode: Episode) {
        val preferredTag = session.activeProfileId.value
            ?.let { session.preferencesFor(it).preferredAudioTag() }
            ?: "edition:vf"
        val version = episode.versions.firstOrNull { it.id == episode.selectedVersionId }
            ?: episode.versions.firstOrNull {
                LanguageCodes.matchesPreferred(it.languageTag.ifBlank {
                    LanguageCodes.fromAudioLanguage(it.language)
                }, preferredTag)
            }
            ?: episode.versions.firstOrNull()
        val ref = version?.playbackUrl
        if (ref.isNullOrBlank()) {
            playerError.value = "Épisode indisponible — aucun flux pour E${episode.number}"
            return
        }
        val season = episode.seasonNumber.takeIf { it > 0 }
            ?: item.seasons.firstOrNull { s -> s.episodes.any { it.id == episode.id } }?.number
            ?: 1
        val current = destination.value
        val returnDest = when (current) {
            is AppDestination.SeriesDetail -> current
            else -> AppDestination.SeriesDetail(item.id)
        }
        val editions = resolveEditionLanguages(item, episode, version?.playbackUrl)
        openPlayer(
            title = DisplayMeta.formatPlayerSeriesTitle(item.title, season, episode.number),
            playbackRef = ref,
            returnToLive = false,
            returnDestination = returnDest,
            contentId = item.id,
            episodeId = episode.id,
            season = season,
            episodeNumber = episode.number,
            editionLanguages = editions
        )
    }

    private fun resolveEditionLanguages(
        item: CatalogItem,
        episode: Episode?,
        currentPlaybackUrl: String?
    ): List<EditionLanguageOption> {
        val catalog = iptv?.catalogRepository?.observeCatalog()?.value ?: return emptyList()
        val workIds = WorkIdentity.assignLogicalWorkIds(catalog)
        val workId = workIds[item.id] ?: return emptyList()
        val siblings = catalog.titles.filter {
            it.type == item.type && workIds[it.id] == workId
        }
        if (siblings.size < 2 && (episode?.versions?.size ?: 0) < 2) {
            // Still expose in-episode versions as language options
        }
        val out = LinkedHashMap<String, EditionLanguageOption>()
        if (episode != null) {
            for (ver in episode.versions) {
                val tag = LanguageCodes.normalize(
                    ver.languageTag.ifBlank { LanguageCodes.fromAudioLanguage(ver.language) }
                )
                val key = if (tag.isNotBlank()) "lang:$tag" else "ver:${ver.id}"
                if (out.containsKey(key)) continue
                out[key] = EditionLanguageOption(
                    tag = tag,
                    label = LanguageCodes.displayName(tag, useful = false).ifBlank { ver.label },
                    playbackUrl = ver.playbackUrl,
                    episodeId = episode.id,
                    editionTitleId = item.id,
                    requiresNewStream = ver.playbackUrl != currentPlaybackUrl,
                    selected = ver.playbackUrl == currentPlaybackUrl || ver.id == episode.selectedVersionId
                )
            }
            val season = episode.seasonNumber
            val epNum = episode.number
            for (sib in siblings) {
                if (sib.id == item.id) continue
                val sibEp = sib.episodes.firstOrNull {
                    it.seasonNumber == season && it.episodeNumber == epNum
                } ?: continue
                val stream = sibEp.versions.firstOrNull()?.stream ?: continue
                val detected = DisplayMeta.detectLanguageTag(sib.canonicalTitle)
                val tag = detected.tag.ifBlank {
                    LanguageCodes.normalize(stream.languageTag.orEmpty())
                }
                val tech = DisplayMeta.technicalEditionKey(sib.canonicalTitle)
                val key = when {
                    tag.isNotBlank() -> "lang:$tag"
                    tech.isNotBlank() -> "tech:$tech"
                    else -> "sib:${sib.id}"
                }
                if (out.containsKey(key)) continue
                val label = when {
                    tag.isNotBlank() -> LanguageCodes.displayName(tag, useful = false)
                    tech.isNotBlank() -> "Édition $tech"
                    else -> DisplayMeta.cleanDisplayTitle(sib.canonicalTitle)
                }
                out[key] = EditionLanguageOption(
                    tag = tag,
                    label = label,
                    playbackUrl = stream.playbackUrl,
                    episodeId = sibEp.id,
                    editionTitleId = sib.id,
                    requiresNewStream = true,
                    selected = false
                )
            }
        } else {
            for (sib in siblings) {
                val stream = sib.variants.firstOrNull() ?: continue
                val detected = DisplayMeta.detectLanguageTag(sib.canonicalTitle)
                val tag = detected.tag
                val tech = DisplayMeta.technicalEditionKey(sib.canonicalTitle)
                val key = when {
                    tag.isNotBlank() -> "lang:$tag"
                    tech.isNotBlank() -> "tech:$tech"
                    else -> "sib:${sib.id}"
                }
                if (out.containsKey(key)) continue
                out[key] = EditionLanguageOption(
                    tag = tag,
                    label = when {
                        tag.isNotBlank() -> LanguageCodes.displayName(tag, useful = false)
                        tech.isNotBlank() -> "Édition $tech"
                        else -> "Édition"
                    },
                    playbackUrl = stream.playbackUrl,
                    episodeId = null,
                    editionTitleId = sib.id,
                    requiresNewStream = stream.playbackUrl != currentPlaybackUrl,
                    selected = sib.id == item.id
                )
            }
        }
        return out.values.toList()
    }

    fun switchPlayerEdition(option: EditionLanguageOption, positionMs: Long) {
        val dest = destination.value as? AppDestination.Player ?: return
        if (option.playbackUrl.isBlank()) {
            playerError.value = "Cette langue n’est pas disponible"
            return
        }
        if (option.playbackUrl == dest.playbackRef) return
        if (positionMs > 2_000L && !dest.contentId.isNullOrBlank()) {
            val dur = 0L
            val frac = 0.05f // preserve session; absolute seek via forceResumeMs
            session.savePlaybackProgress(
                contentId = option.editionTitleId.ifBlank { dest.contentId },
                episodeId = option.episodeId ?: dest.episodeId,
                fraction = frac.coerceAtLeast(0.03f),
                streamId = option.playbackUrl,
                positionMs = positionMs,
                durationMs = dur
            )
        }
        val tag = option.tag
        if (tag.isNotBlank()) {
            session.updatePreferences { prefs ->
                prefs.copy(
                    preferredEpisodeLanguage = tag,
                    lastEditionByWorkId = if (dest.logicalWorkId != null) {
                        prefs.lastEditionByWorkId + (dest.logicalWorkId to option.editionTitleId)
                    } else prefs.lastEditionByWorkId
                )
            }
        }
        openPlayer(
            title = dest.title,
            playbackRef = option.playbackUrl,
            returnToLive = false,
            returnDestination = dest.returnDestination,
            contentId = option.editionTitleId.ifBlank { dest.contentId },
            episodeId = option.episodeId ?: dest.episodeId,
            season = dest.season,
            episodeNumber = dest.episode,
            logicalWorkId = dest.logicalWorkId,
            editionLanguages = dest.editionLanguages.map {
                it.copy(selected = it.tag.equals(option.tag, ignoreCase = true))
            },
            forceResumeMs = positionMs.takeIf { it > 2_000L }
        )
    }

    fun openPlayer(
        title: String,
        playbackRef: String,
        returnToLive: Boolean,
        returnDestination: AppDestination? = null,
        contentId: String? = null,
        episodeId: String? = null,
        season: Int? = null,
        episodeNumber: Int? = null,
        logicalWorkId: String? = null,
        editionLanguages: List<EditionLanguageOption> = emptyList(),
        forceResumeMs: Long? = null
    ) {
        playerReturnToLive.value = returnToLive
        playerUrl.value = null
        playerError.value = null
        playerDiagnostic.value = "Résolution…"
        val back = returnDestination
            ?: if (returnToLive) AppDestination.LiveTv
            else when (val cur = destination.value) {
                is AppDestination.Player -> cur.returnDestination
                else -> cur
            }
        val catalog = iptv?.catalogRepository?.observeCatalog()?.value
        val workId = logicalWorkId ?: contentId?.let { id ->
            catalog?.let { WorkIdentity.assignLogicalWorkIds(it)[id] }
        }
        val langs = editionLanguages.ifEmpty {
            contentId?.let { id ->
                itemCache.value[id]?.let { item ->
                    val ep = episodeId?.let { eid ->
                        item.seasons.flatMap { it.episodes }.firstOrNull { it.id == eid }
                    }
                    resolveEditionLanguages(item, ep, playbackRef)
                }
            } ?: emptyList()
        }
        goTo(
            AppDestination.Player(
                title = title,
                playbackRef = playbackRef,
                returnToLive = returnToLive,
                returnDestination = back,
                contentId = contentId,
                episodeId = episodeId,
                season = season,
                episode = episodeNumber,
                logicalWorkId = workId,
                editionLanguages = langs,
                forceResumeMs = forceResumeMs
            )
        )
        viewModelScope.launch {
            val container = iptv
            if (container == null) {
                playerError.value = "Couche IPTV indisponible"
                playerDiagnostic.value = "no-iptv"
                return@launch
            }
            val resolver = PlaybackResolver(container.sourceRepository, container.secretStore)
            val result = resolver.resolve(playbackRef)
            result.fold(
                onSuccess = {
                    playerUrl.value = it.url
                    playerDiagnostic.value = it.diagnosticLabel
                    playerError.value = null
                },
                onFailure = {
                    playerUrl.value = null
                    playerDiagnostic.value = "resolve-failed"
                    playerError.value = it.message ?: "Résolution impossible"
                }
            )
        }
    }

    fun savePlayerProgress(fraction: Float, positionMs: Long = 0L, durationMs: Long = 0L) {
        val dest = destination.value as? AppDestination.Player ?: return
        if (dest.returnToLive || dest.contentId.isNullOrBlank()) return
        if (fraction <= 0.02f) return
        session.savePlaybackProgress(
            contentId = dest.contentId,
            episodeId = dest.episodeId,
            fraction = fraction,
            streamId = dest.playbackRef,
            positionMs = positionMs,
            durationMs = durationMs
        )
    }

    fun resumePositionMsFor(
        contentId: String?,
        episodeId: String?,
        forceResumeMs: Long? = null
    ): Long {
        if (forceResumeMs != null && forceResumeMs > 2_000L) return forceResumeMs
        val prefs = session.activeProfileId.value
            ?.let { session.preferencesFor(it) }
            ?: return 0L
        if (!episodeId.isNullOrBlank()) {
            val play = prefs.episodePlaybackById[episodeId]
            if (play != null) {
                return EpisodeProgress.resumePositionMs(
                    play.positionMs,
                    play.durationMs,
                    play.fraction
                )
            }
            val frac = prefs.progressByEpisodeId[episodeId] ?: 0f
            return EpisodeProgress.resumePositionMs(0L, 0L, frac)
        }
        if (!contentId.isNullOrBlank()) {
            val snap = prefs.continueResumeByTitleId[contentId] ?: return 0L
            return EpisodeProgress.resumePositionMs(snap.positionMs, snap.durationMs, snap.fraction)
        }
        return 0L
    }

    fun retryPlayer() {
        val dest = destination.value
        if (dest is AppDestination.Player) {
            openPlayer(
                dest.title,
                dest.playbackRef,
                dest.returnToLive,
                dest.returnDestination,
                dest.contentId,
                dest.episodeId,
                dest.season,
                dest.episode,
                dest.logicalWorkId,
                dest.editionLanguages,
                dest.forceResumeMs
            )
        }
    }

    fun dismissContinue(itemId: String) {
        session.dismissContinue(itemId)
    }

    fun openSearch() {
        showCustomizeMenu.value = false
        goTo(AppDestination.Search)
        scheduleSearch(immediate = true)
    }

    fun setSearchQuery(query: String) {
        searchQuery.value = query
        searchOffset.value = 0
        scheduleSearch(immediate = false)
    }

    fun setSearchFilter(filter: SearchFilter) {
        searchFilter.value = filter
        searchOffset.value = 0
        scheduleSearch(immediate = true)
    }

    fun submitSearch() {
        val q = searchQuery.value.trim()
        if (q.isNotEmpty()) session.rememberSearch(q)
        scheduleSearch(immediate = true)
    }

    fun applyRecentSearch(query: String) {
        searchQuery.value = query
        searchOffset.value = 0
        session.rememberSearch(query)
        scheduleSearch(immediate = true)
    }

    fun clearRecentSearch(query: String?) {
        session.clearRecentSearch(query)
    }

    fun loadMoreSearch() {
        val page = searchPage.value ?: return
        if (page.offset + page.hits.size >= page.total) return
        searchOffset.value = page.offset + page.hits.size
        scheduleSearch(immediate = true, append = true)
    }

    private fun scheduleSearch(immediate: Boolean, append: Boolean = false) {
        searchDebounceJob?.cancel()
        val req = ++searchRequestId
        searchDebounceJob = viewModelScope.launch {
            if (!immediate) delay(220)
            if (req != searchRequestId) return@launch
            runSearch(req, append)
        }
    }

    private suspend fun ensureSearchIndex(): SearchIndex {
        val catalog = iptv?.catalogRepository?.observeCatalog()?.value ?: UnifiedCatalog()
        val cached = searchIndexCache
        if (cached != null && cached.generatedAtEpochMs == catalog.generatedAtEpochMs) {
            return cached
        }
        return withContext(Dispatchers.Default) {
            CatalogSearch.buildIndex(catalog).also { searchIndexCache = it }
        }
    }

    private suspend fun runSearch(req: Int, append: Boolean) {
        val index = ensureSearchIndex()
        if (req != searchRequestId) return
        val prefs = session.activeProfileId.value
            ?.let { session.preferencesFor(it) }
            ?: ProfilePreferences()
        val q = searchQuery.value
        val filter = searchFilter.value
        val offset = if (append) searchOffset.value else 0
        if (!append) searchOffset.value = 0
        val page = withContext(Dispatchers.Default) {
            CatalogSearch.search(
                index = index,
                query = q,
                filter = filter,
                prefs = prefs,
                preferred = prefs.preferredLanguage,
                offset = offset,
                limit = 48
            )
        }
        if (req != searchRequestId) return
        if (append && searchPage.value != null) {
            val prev = searchPage.value!!
            searchAccumulated.value = searchAccumulated.value + page.hits.map { it.item }
            searchPage.value = page.copy(
                hits = prev.hits + page.hits,
                offset = 0
            )
        } else {
            searchAccumulated.value = page.hits.map { it.item }
            searchPage.value = page
        }
        searchSuggestions.value = CatalogSearch.suggestions(index, prefs, prefs.preferredLanguage)
    }

    fun cachedItem(id: String?): CatalogItem? =
        id?.let { itemCache.value[it] }

    fun openItem(item: CatalogItem) {
        showCustomizeMenu.value = false
        val dest = when (item.type) {
            ContentType.FILM -> AppDestination.FilmDetail(item.id)
            ContentType.SERIES -> {
                selectedSeasonIndex.value = 0
                AppDestination.SeriesDetail(item.id)
            }
        }
        goTo(dest)
    }

    fun selectSeason(index: Int) {
        selectedSeasonIndex.value = index
    }

    fun selectVersion(itemId: String, versionId: String) {
        selectedVersionOverrides.value = selectedVersionOverrides.value + (itemId to versionId)
    }

    fun saveFilmsScroll(index: Int) {
        filmsScrollIndex.value = index
    }

    fun saveSeriesScroll(index: Int) {
        seriesScrollIndex.value = index
    }

    fun navigateBack() {
        showCustomizeMenu.value = false
        showProfileSwitcher.value = false
        when (val dest = destination.value) {
            AppDestination.Splash, AppDestination.Profiles -> return
            AppDestination.Hub -> {
                session.clearProfile()
                goTo(AppDestination.Profiles, push = false)
                return
            }
            is AppDestination.GroupSetup -> {
                cancelGroupSetup(dest.manage, dest.section)
                return
            }
            is AppDestination.Player -> {
                playerUrl.value = null
                clearLivePreview()
                val back = dest.returnDestination ?: navStack.pop().takeIf { it !is AppDestination.Player }
                goTo(
                    back
                        ?: if (dest.returnToLive || playerReturnToLive.value) AppDestination.LiveTv
                        else AppDestination.Hub,
                    push = false
                )
                return
            }
            else -> Unit
        }
        val prev = navStack.pop()
        destination.value = prev
    }

    fun openCustomizeMenu() {
        showCustomizeMenu.value = true
    }

    fun closeCustomizeMenu() {
        showCustomizeMenu.value = false
    }

    fun openProfileSwitcher() {
        showCustomizeMenu.value = false
        showProfileSwitcher.value = false
        session.clearProfile()
        destination.value = AppDestination.Profiles
    }

    fun closeProfileSwitcher() {
        showProfileSwitcher.value = false
    }

    fun toggleFavorite(itemId: String) = session.toggleFavorite(itemId)
    fun toggleWatchLater(itemId: String) = session.toggleWatchLater(itemId)
    fun toggleGroupHidden(groupId: String) = session.toggleGroupHidden(groupId)
    fun toggleRowVisible(rowId: HomeRowId) = session.toggleRowVisible(rowId)
    fun moveRow(rowId: HomeRowId, up: Boolean) = session.moveRow(rowId, up)
    fun toggleHiddenItem(itemId: String) = session.toggleHiddenItem(itemId)
    fun setReduceMotion(enabled: Boolean) = session.setReduceMotion(enabled)
    fun setPreferredLanguage(language: AudioLanguage) = session.setPreferredLanguage(language)
    fun setPreferredAudioLanguage(tag: String) = session.setPreferredAudioLanguage(tag)
    fun setPreferredSubtitleLanguage(tag: String) = session.setPreferredSubtitleLanguage(tag)
    fun setInterfaceLanguage(tag: String) = session.setInterfaceLanguage(tag)

    fun runDemoRefresh() {
        viewModelScope.launch {
            session.runRefresh(
                sourceRepository = iptv?.sourceRepository,
                syncEngine = iptv?.syncEngine
            )
            val catalog = iptv?.catalogRepository?.observeCatalog()?.value
            if (catalog != null) {
                session.pruneSectionGroups(catalog.groups.map { it.id }.toSet())
                if (catalog.titles.isNotEmpty()) {
                    afterSuccessfulSyncPrune()
                }
            }
            if (destination.value is AppDestination.LiveTv ||
                destination.value is AppDestination.GroupSetup
            ) {
                refreshLiveChannels(reset = true)
            }
        }
    }

    fun cancelSync() {
        iptv?.syncEngine?.cancel()
    }

    fun dismissDemoMessage() = session.dismissSyncMessage()
    fun dismissSourceActionMessage() {
        sourceActionMessage.value = null
    }

    fun toggleSourceEnabled(sourceId: String) {
        val container = iptv ?: return
        viewModelScope.launch {
            val source = container.sourceRepository.getSource(IptvSourceId(sourceId)) ?: return@launch
            container.sourceRepository.setEnabled(source.id, !source.enabled)
            sourceActionMessage.value =
                if (!source.enabled) "Source activée: ${source.displayName}"
                else "Source désactivée: ${source.displayName}"
        }
    }

    fun removeSource(sourceId: String) {
        val container = iptv ?: return
        viewModelScope.launch {
            container.secretStore.deleteXtreamCredentials(IptvSourceId(sourceId))
            container.sourceRepository.removeSource(IptvSourceId(sourceId))
            val remaining = container.sourceRepository.getSources()
            val hasReal = remaining.any { it.enabled }
            sourceActionMessage.value = if (!hasReal && remaining.isEmpty()) {
                "Source supprimée. Aucune source IPTV restante — le catalogue réel n’est pas " +
                    "remplacé automatiquement par la démo. Réimportez une source ou (web) rechargez DEMO_SHOWCASE."
            } else {
                "Source supprimée (secrets effacés du coffre)."
            }
        }
    }

    fun importBundledSamplePlaylist(context: android.content.Context) {
        val container = iptv ?: return
        viewModelScope.launch {
            try {
                val out = java.io.File(context.cacheDir, "sample_playlist.m3u")
                context.assets.open("sample_playlist.m3u").use { input ->
                    out.outputStream().use { input.copyTo(it) }
                }
                val source = com.lkstv.app.domain.iptv.IptvSource(
                    id = IptvSourceId("m3u_sample_local"),
                    displayName = "Sample M3U (local)",
                    kind = IptvSourceKind.M3U_FILE,
                    enabled = true,
                    localPath = out.absolutePath
                )
                container.sourceRepository.upsertSource(source)
                sourceActionMessage.value =
                    "Playlist d'exemple importée. Lancez Actualiser pour synchroniser."
            } catch (e: Exception) {
                sourceActionMessage.value = "Import sample impossible: ${e.message}"
            }
        }
    }

    fun addXtreamSource(
        displayName: String,
        serverUrl: String,
        username: String,
        password: String
    ) {
        val container = iptv ?: return
        viewModelScope.launch {
            if (serverUrl.isBlank() || username.isBlank() || password.isBlank()) {
                sourceActionMessage.value = "URL, identifiant et mot de passe requis"
                return@launch
            }
            val id = IptvSourceId("xtream_" + UUID.randomUUID().toString().take(8))
            val source = com.lkstv.app.domain.iptv.IptvSource(
                id = id,
                displayName = displayName.ifBlank { "Xtream" },
                kind = IptvSourceKind.XTREAM,
                enabled = true,
                endpoint = serverUrl.trim().trimEnd('/'),
                usernameHint = username.take(2) + "•••"
            )
            container.secretStore.putXtreamCredentials(id, XtreamCredentials(username, password))
            val validation = container.ingestor.validate(source)
            if (validation.isFailure) {
                container.secretStore.deleteXtreamCredentials(id)
                sourceActionMessage.value =
                    "Source Xtream refusée — ${validation.exceptionOrNull()?.message ?: "auth échouée"}"
                return@launch
            }
            container.sourceRepository.upsertSource(source)
            onRealSourceValidated()
            sourceActionMessage.value =
                "Source Xtream validée — catalogue démo désactivé. Lancez Actualiser."
        }
    }

    fun addM3uUrlSource(displayName: String, playlistUrl: String) {
        val container = iptv ?: return
        viewModelScope.launch {
            val url = playlistUrl.trim()
            if (url.isBlank()) {
                sourceActionMessage.value = "URL M3U requise"
                return@launch
            }
            if (url.contains("localhost", ignoreCase = true) ||
                url.contains("127.0.0.1")
            ) {
                sourceActionMessage.value =
                    "URL localhost refusée — l’APK doit être autonome (pas de web-preview)."
                return@launch
            }
            val id = IptvSourceId("m3u_url_" + UUID.randomUUID().toString().take(8))
            val source = com.lkstv.app.domain.iptv.IptvSource(
                id = id,
                displayName = displayName.ifBlank { "M3U URL" },
                kind = IptvSourceKind.M3U_URL,
                enabled = true,
                endpoint = url
            )
            val validation = container.ingestor.validate(source)
            if (validation.isFailure) {
                sourceActionMessage.value =
                    "M3U invalide — ${validation.exceptionOrNull()?.message ?: "playlist non exploitable"}"
                return@launch
            }
            container.sourceRepository.upsertSource(source)
            onRealSourceValidated()
            sourceActionMessage.value =
                "Source M3U validée — catalogue démo désactivé. Lancez Actualiser."
        }
    }

    /**
     * Real IPTV validated: clear stale empty/demo catalog so UI never mixes fictive titles.
     * Does not wipe profile prefs; orphans are pruned after next successful sync.
     */
    private suspend fun onRealSourceValidated() {
        val container = iptv ?: return
        val catalog = container.catalogRepository.getCatalog()
        // If catalog is empty or tiny leftover, replace with empty until sync.
        if (catalog.titles.isEmpty() || catalog.titles.size < 3) {
            container.catalogRepository.replaceCatalog(UnifiedCatalog())
        }
    }

    fun afterSuccessfulSyncPrune() {
        val catalog = iptv?.catalogRepository?.getCatalog() ?: return
        session.pruneOrphanLibraryRefs(catalog.titles.map { it.id }.toSet())
    }

    companion object {
        fun factory(session: SessionRepository, iptv: IptvContainer?): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return AppViewModel(session, iptv) as T
                }
            }
    }
}

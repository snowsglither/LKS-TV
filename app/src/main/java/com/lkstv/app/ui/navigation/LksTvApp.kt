package com.lkstv.app.ui.navigation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.lkstv.app.domain.AppDestination
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.GroupSelection
import com.lkstv.app.ui.screens.CatalogSectionScreen
import com.lkstv.app.ui.screens.CustomizeMenuOverlay
import com.lkstv.app.ui.screens.DemoSyncBanner
import com.lkstv.app.ui.screens.EpgSectionScreen
import com.lkstv.app.ui.screens.FilmDetailScreen
import com.lkstv.app.ui.screens.GroupSetupScreen
import com.lkstv.app.ui.screens.HubScreen
import com.lkstv.app.ui.screens.LibrarySectionScreen
import com.lkstv.app.ui.screens.LiveTvScreen
import com.lkstv.app.ui.screens.PlaceholderSectionScreen
import com.lkstv.app.ui.screens.PlayerScreen
import com.lkstv.app.ui.screens.ProfileSwitcherOverlay
import com.lkstv.app.ui.screens.ProfilesScreen
import com.lkstv.app.ui.screens.SearchScreen
import com.lkstv.app.ui.screens.SeriesDetailScreen
import com.lkstv.app.ui.screens.SettingsSectionScreen
import com.lkstv.app.ui.screens.SplashScreen
import com.lkstv.app.ui.screens.UpdateAvailableDialog
import com.lkstv.app.ui.state.AppUiState
import com.lkstv.app.ui.state.AppViewModel

@Composable
fun LksTvApp(
    state: AppUiState,
    viewModel: AppViewModel
) {
    val context = LocalContext.current
    val refreshLabel = if (state.hasEnabledIptvSources) "Actualiser" else "Actualiser · local"
    // PlayerScreen owns its own BackHandler (panels → leave with returnDestination).
    val canSystemBack = state.destination !is AppDestination.Splash &&
        state.destination !is AppDestination.Profiles &&
        state.destination !is AppDestination.Player &&
        !state.showCustomizeMenu &&
        !state.showProfileSwitcher

    BackHandler(enabled = canSystemBack) {
        viewModel.navigateBack()
    }

    Box(Modifier.fillMaxSize()) {
        when (val dest = state.destination) {
            AppDestination.Splash -> SplashScreen(
                reduceMotion = state.preferences.reduceMotion,
                onFinished = viewModel::finishSplash
            )

            AppDestination.Profiles -> ProfilesScreen(
                profiles = state.profiles,
                activeProfileId = state.activeProfile?.id,
                onSelect = viewModel::selectProfile,
                onAddProfile = { viewModel.addProfile("Nouveau") },
                onManageProfiles = { viewModel.addProfile("Nouveau") }
            )

            AppDestination.Hub -> HubScreen(
                profile = state.activeProfile,
                syncing = state.isDemoSyncing,
                refreshLabel = refreshLabel,
                continueWatching = state.continueWatching,
                onOpenSection = viewModel::openSection,
                onBack = viewModel::navigateBack,
                onRefresh = viewModel::runDemoRefresh,
                onProfile = viewModel::openProfileSwitcher,
                onMenu = viewModel::openCustomizeMenu,
                onSearch = viewModel::openSearch,
                onOpenContinue = viewModel::openItem,
                onDismissContinue = viewModel::dismissContinue
            )

            AppDestination.Search -> SearchScreen(
                profile = state.activeProfile,
                query = state.searchQuery,
                filter = state.searchFilter,
                page = state.searchPage,
                suggestions = state.searchSuggestions,
                onQueryChange = viewModel::setSearchQuery,
                onSubmit = viewModel::submitSearch,
                onFilter = viewModel::setSearchFilter,
                onBack = viewModel::navigateBack,
                onOpenItem = viewModel::openItem,
                onLoadMore = viewModel::loadMoreSearch
            )

            AppDestination.LiveTv -> LiveTvScreen(
                profile = state.activeProfile,
                groups = state.liveGroups,
                channels = state.liveChannels,
                channelTotal = state.liveChannelTotal,
                selectedGroupId = state.liveSelectedGroupId,
                selectedChannelId = state.liveSelectedChannelId,
                hasMore = state.liveHasMore,
                groupEmpty = state.liveGroupEmpty,
                previewUrl = state.livePreviewUrl,
                previewStatus = state.livePreviewStatus,
                onBack = viewModel::navigateBack,
                onSelectGroup = viewModel::selectLiveGroup,
                onSelectChannel = viewModel::selectLiveChannel,
                onPlay = viewModel::playLiveChannel,
                onLoadMore = viewModel::loadMoreLiveChannels,
                onManageGroups = { viewModel.openManageGroups(CatalogSectionKey.TV) },
                onToggleFavorite = viewModel::toggleFavorite,
                onDisposePreview = viewModel::clearLivePreview
            )

            is AppDestination.GroupSetup -> GroupSetupScreen(
                section = dest.section,
                manage = dest.manage,
                profile = state.activeProfile,
                groups = state.groupSetupGroups,
                initialSelected = GroupSelection.config(state.preferences, dest.section).selectedGroupIds,
                onSave = { ids -> viewModel.saveGroupSetup(dest.section, ids) },
                onCancel = { viewModel.cancelGroupSetup(dest.manage, dest.section) }
            )

            is AppDestination.Player -> {
                val resumeMs = viewModel.resumePositionMsFor(
                    contentId = dest.contentId,
                    episodeId = dest.episodeId,
                    forceResumeMs = dest.forceResumeMs
                )
                val seriesItem = viewModel.cachedItem(dest.contentId)
                    ?.takeIf { it.type == ContentType.SERIES && !dest.returnToLive }
                PlayerScreen(
                    title = dest.title,
                    playUrl = state.playerUrl,
                    diagnosticLabel = state.playerDiagnostic,
                    errorMessage = state.playerError,
                    isLive = dest.returnToLive,
                    preferredAudioLanguage = state.preferences.preferredAudioTag(),
                    preferredSubtitleLanguage = state.preferences.preferredSubtitleLanguage,
                    initialPositionMs = resumeMs,
                    editionLanguages = dest.editionLanguages,
                    onSwitchEdition = { opt, posMs -> viewModel.switchPlayerEdition(opt, posMs) },
                    seriesSeasons = seriesItem?.seasons.orEmpty(),
                    seriesSynopsis = seriesItem?.synopsis.orEmpty(),
                    currentSeason = dest.season,
                    currentEpisode = dest.episode,
                    onPlayEpisode = seriesItem?.let { item ->
                        { episode -> viewModel.openPlayerFromEpisode(item, episode) }
                    },
                    onBack = viewModel::navigateBack,
                    onRetry = viewModel::retryPlayer,
                    onPrevious = if (dest.returnToLive && viewModel.canZapLive(-1)) {
                        { viewModel.playAdjacentLiveChannel(-1) }
                    } else null,
                    onNext = if (dest.returnToLive && viewModel.canZapLive(1)) {
                        { viewModel.playAdjacentLiveChannel(1) }
                    } else null,
                    onProgress = viewModel::savePlayerProgress
                )
            }

            is AppDestination.Section -> when (dest.section) {
                HubSection.FILMS -> CatalogSectionScreen(
                    section = HubSection.FILMS,
                    profile = state.activeProfile,
                    syncing = state.isDemoSyncing,
                    status = state.filmStatus,
                    syncError = state.syncError,
                    hero = state.filmHero,
                    rows = state.filmRows,
                    initialScrollIndex = state.filmsScrollIndex,
                    refreshLabel = refreshLabel,
                    groupEmpty = state.filmsGroupEmpty,
                    onBack = viewModel::navigateBack,
                    onRefresh = viewModel::runDemoRefresh,
                    onProfile = viewModel::openProfileSwitcher,
                    onMenu = viewModel::openCustomizeMenu,
                    onSearch = viewModel::openSearch,
                    onOpenItem = viewModel::openItem,
                    onScrollIndexChanged = viewModel::saveFilmsScroll,
                    onManageGroups = { viewModel.openManageGroups(CatalogSectionKey.FILMS) }
                )

                HubSection.SERIES -> CatalogSectionScreen(
                    section = HubSection.SERIES,
                    profile = state.activeProfile,
                    syncing = state.isDemoSyncing,
                    status = state.seriesStatus,
                    syncError = state.syncError,
                    hero = state.seriesHero,
                    rows = state.seriesRows,
                    initialScrollIndex = state.seriesScrollIndex,
                    refreshLabel = refreshLabel,
                    groupEmpty = state.seriesGroupEmpty,
                    onBack = viewModel::navigateBack,
                    onRefresh = viewModel::runDemoRefresh,
                    onProfile = viewModel::openProfileSwitcher,
                    onMenu = viewModel::openCustomizeMenu,
                    onSearch = viewModel::openSearch,
                    onOpenItem = viewModel::openItem,
                    onScrollIndexChanged = viewModel::saveSeriesScroll,
                    onManageGroups = { viewModel.openManageGroups(CatalogSectionKey.SERIES) }
                )

                HubSection.LIVE_TV -> {
                    // Routed via AppDestination.LiveTv from openSection
                }

                HubSection.EPG -> EpgSectionScreen(
                    profile = state.activeProfile,
                    diagnosis = state.epgDiagnosis,
                    hasData = state.epgHasData,
                    rows = state.epgRows,
                    onBack = viewModel::navigateBack,
                    onRefresh = viewModel::refreshEpg,
                    onOpenLive = { viewModel.openSection(HubSection.LIVE_TV) },
                    onProfile = viewModel::openProfileSwitcher,
                    onMenu = viewModel::openCustomizeMenu
                )

                HubSection.LIBRARY -> LibrarySectionScreen(
                    profile = state.activeProfile,
                    syncing = state.isDemoSyncing,
                    favorites = state.libraryFavorites,
                    watchLater = state.libraryWatchLater,
                    onBack = viewModel::navigateBack,
                    onRefresh = viewModel::runDemoRefresh,
                    onProfile = viewModel::openProfileSwitcher,
                    onMenu = viewModel::openCustomizeMenu,
                    onOpenItem = viewModel::openItem,
                    refreshLabel = refreshLabel
                )

                HubSection.SETTINGS -> SettingsSectionScreen(
                    profile = state.activeProfile,
                    syncing = state.isDemoSyncing,
                    reduceMotion = state.preferences.reduceMotion,
                    preferredAudioLanguage = state.preferences.preferredAudioTag(),
                    preferredSubtitleLanguage = state.preferences.preferredSubtitleLanguage,
                    interfaceLanguage = state.preferences.interfaceLanguage,
                    sources = state.iptvSources,
                    iptvTitleCount = state.iptvTitleCount,
                    sourceActionMessage = state.sourceActionMessage,
                    refreshLabel = refreshLabel,
                    appVersionLabel = state.appVersionLabel,
                    updateCheckMessage = state.updateCheckMessage,
                    onBack = viewModel::navigateBack,
                    onRefresh = viewModel::runDemoRefresh,
                    onProfile = viewModel::openProfileSwitcher,
                    onMenu = viewModel::openCustomizeMenu,
                    onReduceMotionChange = viewModel::setReduceMotion,
                    onPreferredAudioLanguage = viewModel::setPreferredAudioLanguage,
                    onPreferredSubtitleLanguage = viewModel::setPreferredSubtitleLanguage,
                    onInterfaceLanguage = viewModel::setInterfaceLanguage,
                    onToggleSource = viewModel::toggleSourceEnabled,
                    onRemoveSource = viewModel::removeSource,
                    onImportSample = {
                        viewModel.importBundledSamplePlaylist(context.applicationContext)
                    },
                    onAddXtream = viewModel::addXtreamSource,
                    onAddM3uUrl = viewModel::addM3uUrlSource,
                    onDismissSourceMessage = viewModel::dismissSourceActionMessage,
                    onCancelSync = viewModel::cancelSync,
                    onCheckUpdate = { viewModel.checkForUpdate(silent = false) },
                    onManageGroups = viewModel::openManageGroups
                )
            }

            is AppDestination.FilmDetail -> {
                val item = state.selectedItem
                if (item != null && item.type == ContentType.FILM) {
                    FilmDetailScreen(
                        item = item,
                        profile = state.activeProfile,
                        syncing = state.isDemoSyncing,
                        isFavorite = item.id in state.preferences.favoriteIds,
                        isWatchLater = item.id in state.preferences.watchLaterIds,
                        related = state.relatedItems,
                        sequels = state.sequelItems,
                        onBack = viewModel::navigateBack,
                        onRefresh = viewModel::runDemoRefresh,
                        onProfile = viewModel::openProfileSwitcher,
                        onMenu = viewModel::openCustomizeMenu,
                        onToggleFavorite = { viewModel.toggleFavorite(item.id) },
                        onToggleWatchLater = { viewModel.toggleWatchLater(item.id) },
                        onOpenItem = viewModel::openItem,
                        onHideItem = {
                            viewModel.toggleHiddenItem(item.id)
                            viewModel.navigateBack()
                        },
                        onSelectVersion = { viewModel.selectVersion(item.id, it) },
                        onPlay = { viewModel.openPlayerFromItem(item) }
                    )
                }
            }

            is AppDestination.SeriesDetail -> {
                val item = state.selectedItem
                if (item != null && item.type == ContentType.SERIES) {
                    SeriesDetailScreen(
                        item = item,
                        profile = state.activeProfile,
                        syncing = state.isDemoSyncing,
                        isFavorite = item.id in state.preferences.favoriteIds,
                        isWatchLater = item.id in state.preferences.watchLaterIds,
                        selectedSeasonIndex = state.selectedSeasonIndex,
                        onSelectSeason = viewModel::selectSeason,
                        onBack = viewModel::navigateBack,
                        onRefresh = viewModel::runDemoRefresh,
                        onProfile = viewModel::openProfileSwitcher,
                        onMenu = viewModel::openCustomizeMenu,
                        onToggleFavorite = { viewModel.toggleFavorite(item.id) },
                        onToggleWatchLater = { viewModel.toggleWatchLater(item.id) },
                        onHideItem = {
                            viewModel.toggleHiddenItem(item.id)
                            viewModel.navigateBack()
                        },
                        onSelectVersion = { viewModel.selectVersion(item.id, it) },
                        onPlay = { viewModel.openPlayerFromItem(item) },
                        onPlayEpisode = { episode -> viewModel.openPlayerFromEpisode(item, episode) }
                    )
                }
            }
        }

        if (state.showCustomizeMenu && state.activeProfile != null) {
            CustomizeMenuOverlay(
                preferences = state.preferences,
                groups = state.providerGroups,
                onClose = viewModel::closeCustomizeMenu,
                onToggleGroup = viewModel::toggleGroupHidden,
                onToggleRow = viewModel::toggleRowVisible,
                onMoveRow = viewModel::moveRow,
                onUnhideItem = viewModel::toggleHiddenItem,
                onManageGroups = { section ->
                    viewModel.closeCustomizeMenu()
                    viewModel.openManageGroups(section)
                }
            )
        }

        if (state.showProfileSwitcher) {
            ProfileSwitcherOverlay(
                profiles = state.profiles,
                activeProfileId = state.activeProfile?.id,
                onSelect = viewModel::selectProfile,
                onClose = viewModel::closeProfileSwitcher
            )
        }

        state.demoSyncMessage?.let { message ->
            DemoSyncBanner(message = message, onDismiss = viewModel::dismissDemoMessage)
        }

        if (state.showUpdateDialog && state.updateAvailable && state.updateVersionName != null) {
            UpdateAvailableDialog(
                versionName = state.updateVersionName,
                changelog = state.updateChangelog,
                downloadProgress = state.updateDownloadProgress,
                onUpdate = { viewModel.startUpdateInstall(context) },
                onLater = viewModel::dismissUpdateDialog,
                onChangelog = {
                    // Changelog already shown in dialog body when present.
                }
            )
        }
    }
}

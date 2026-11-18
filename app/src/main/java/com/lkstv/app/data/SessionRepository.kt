package com.lkstv.app.data

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.EpisodePlaybackState
import com.lkstv.app.domain.EpisodeProgress
import com.lkstv.app.domain.FakeCatalog
import com.lkstv.app.domain.GroupSelection
import com.lkstv.app.domain.HomeRowId
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.SectionGroupConfig
import com.lkstv.app.domain.iptv.CatalogSyncEngine
import com.lkstv.app.domain.iptv.SourceRepository
import com.lkstv.app.domain.iptv.SyncPhase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Profile session. Preferences are persisted when a [ProfilePreferencesStore] is provided.
 * Profiles persist via [ProfileStore] (same applicationId → survives APK updates).
 */
class SessionRepository(
    private val store: ProfilePreferencesStore? = null,
    private val profileStore: ProfileStore? = null
) {

    private val preferences = mutableMapOf<String, ProfilePreferences>()
    private var profilesList: MutableList<Profile> =
        (profileStore?.read() ?: FakeCatalog.profiles).toMutableList()
    private var activeId: String? = null

    private val _activeProfileId = MutableStateFlow<String?>(null)
    val activeProfileId: StateFlow<String?> = _activeProfileId.asStateFlow()

    private val _profilesVersion = MutableStateFlow(0)
    val profilesVersion: StateFlow<Int> = _profilesVersion.asStateFlow()

    private val _prefsVersion = MutableStateFlow(0)
    val prefsVersion: StateFlow<Int> = _prefsVersion.asStateFlow()

    private val _lastSyncMessage = MutableStateFlow<String?>(null)
    val lastSyncMessage: StateFlow<String?> = _lastSyncMessage.asStateFlow()

    private val _isSyncing = MutableStateFlow(false)
    val isSyncing: StateFlow<Boolean> = _isSyncing.asStateFlow()

    private val _lastSyncError = MutableStateFlow<String?>(null)
    val lastSyncError: StateFlow<String?> = _lastSyncError.asStateFlow()

    val lastDemoSyncMessage: StateFlow<String?> get() = lastSyncMessage
    val isDemoSyncing: StateFlow<Boolean> get() = isSyncing

    init {
        val file = store?.read()
        if (file != null) {
            // Prefs persist per profile; active profile is never auto-restored on cold start.
            file.byProfile.forEach { (id, entity) -> preferences[id] = entity.toDomain() }
        }
        activeId = null
        _activeProfileId.value = null
        // Ensure every known profile has prefs; never wipe existing progress.
        profilesList.forEach { profile ->
            preferences.getOrPut(profile.id) {
                when (profile.id) {
                    "profile_sam" -> ProfilePreferences(
                        visibleRowIds = HomeRowId.defaultVisible,
                        preferredLanguage = AudioLanguage.VF,
                        hiddenGroupIds = setOf("grp_kids")
                    )
                    else -> ProfilePreferences()
                }
            }
        }
        persist()
        persistProfiles()
    }

    fun profiles(): List<Profile> = profilesList.toList()

    fun activeProfile(): Profile? =
        _activeProfileId.value?.let { id -> profilesList.firstOrNull { it.id == id } }

    fun selectProfile(profileId: String) {
        require(profilesList.any { it.id == profileId }) { "Profil inconnu" }
        activeId = profileId
        _activeProfileId.value = profileId
        persist()
        bump()
    }

    fun addProfile(name: String, avatarColor: Long = 0xFFE50914): Profile {
        val clean = name.trim().ifBlank { "Profil" }
        val id = "profile_" + System.currentTimeMillis().toString(36)
        val profile = Profile(id = id, name = clean.take(24), avatarColor = avatarColor)
        profilesList += profile
        preferences.getOrPut(id) { ProfilePreferences() }
        persistProfiles()
        persist()
        _profilesVersion.value = _profilesVersion.value + 1
        bump()
        return profile
    }

    fun renameProfile(profileId: String, name: String): Profile? {
        val idx = profilesList.indexOfFirst { it.id == profileId }
        if (idx < 0) return null
        val clean = name.trim().ifBlank { profilesList[idx].name }.take(24)
        val updated = profilesList[idx].copy(name = clean)
        profilesList[idx] = updated
        persistProfiles()
        _profilesVersion.value = _profilesVersion.value + 1
        bump()
        return updated
    }

    fun removeProfile(profileId: String): Boolean {
        if (profilesList.size <= 1) return false
        if (profilesList.none { it.id == profileId }) return false
        profilesList.removeAll { it.id == profileId }
        // Keep prefs orphan for recovery; do not delete progress automatically.
        if (activeId == profileId) clearProfile()
        persistProfiles()
        persist()
        _profilesVersion.value = _profilesVersion.value + 1
        bump()
        return true
    }

    /**
     * Drop continue/favorites that reference titles no longer in the catalog
     * (e.g. leftover DEMO_SHOWCASE seeds). Never clears real progress for present titles.
     */
    fun pruneOrphanLibraryRefs(existingTitleIds: Set<String>) {
        if (existingTitleIds.isEmpty()) return
        for (pid in preferences.keys.toList()) {
            val prefs = preferencesFor(pid)
            preferences[pid] = prefs.copy(
                favoriteIds = prefs.favoriteIds.filter { it in existingTitleIds }.toSet(),
                watchLaterIds = prefs.watchLaterIds.filter { it in existingTitleIds }.toSet(),
                progressByItemId = prefs.progressByItemId.filterKeys { it in existingTitleIds },
                continueResumeByTitleId = prefs.continueResumeByTitleId.filterKeys { it in existingTitleIds },
                continueActivityById = prefs.continueActivityById.filterKeys { key ->
                    key.startsWith("ep:") || key in existingTitleIds
                },
                dismissedContinueIds = prefs.dismissedContinueIds.filter { it in existingTitleIds }.toSet()
            )
        }
        persist()
        bump()
    }

    private fun persistProfiles() {
        profileStore?.write(profilesList)
    }

    fun clearProfile() {
        activeId = null
        _activeProfileId.value = null
        persist()
        bump()
    }

    fun preferencesFor(profileId: String = requireActiveId()): ProfilePreferences =
        preferences.getOrPut(profileId) { ProfilePreferences() }

    fun updatePreferences(
        profileId: String = requireActiveId(),
        transform: (ProfilePreferences) -> ProfilePreferences
    ) {
        preferences[profileId] = transform(preferencesFor(profileId))
        persist()
        bump()
    }

    fun toggleFavorite(itemId: String) = updatePreferences { prefs ->
        val next = prefs.favoriteIds.toMutableSet()
        if (!next.add(itemId)) next.remove(itemId)
        prefs.copy(favoriteIds = next)
    }

    fun toggleWatchLater(itemId: String) = updatePreferences { prefs ->
        val next = prefs.watchLaterIds.toMutableSet()
        if (!next.add(itemId)) next.remove(itemId)
        prefs.copy(watchLaterIds = next)
    }

    fun toggleGroupHidden(groupId: String) = updatePreferences { prefs ->
        val next = prefs.hiddenGroupIds.toMutableSet()
        if (!next.add(groupId)) next.remove(groupId)
        prefs.copy(hiddenGroupIds = next)
    }

    fun saveSectionGroupSelection(
        section: CatalogSectionKey,
        selectedGroupIds: Set<String>
    ) = updatePreferences { prefs ->
        val map = prefs.sectionGroupPrefs.toMutableMap()
        map[section] = SectionGroupConfig(
            configured = true,
            selectedGroupIds = selectedGroupIds
        )
        prefs.copy(sectionGroupPrefs = map)
    }

    fun pruneSectionGroups(existingGroupIds: Set<String>) {
        for (pid in preferences.keys.toList()) {
            preferences[pid] = GroupSelection.prune(
                preferencesFor(pid),
                existingGroupIds
            )
        }
        persist()
        bump()
    }

    fun toggleRowVisible(rowId: HomeRowId) = updatePreferences { prefs ->
        val visible = prefs.visibleRowIds.toMutableList()
        if (visible.contains(rowId)) {
            if (visible.size > 1) visible.remove(rowId)
        } else {
            visible.add(rowId)
        }
        // Keep declaration order of enum for stability
        prefs.copy(visibleRowIds = HomeRowId.entries.filter { it in visible })
    }

    fun moveRow(rowId: HomeRowId, up: Boolean) = updatePreferences { prefs ->
        val list = prefs.visibleRowIds.toMutableList()
        val index = list.indexOf(rowId)
        if (index < 0) return@updatePreferences prefs
        val target = if (up) index - 1 else index + 1
        if (target !in list.indices) return@updatePreferences prefs
        list[index] = list[target].also { list[target] = list[index] }
        prefs.copy(visibleRowIds = list)
    }

    fun dismissContinue(itemId: String) = updatePreferences { prefs ->
        prefs.copy(dismissedContinueIds = prefs.dismissedContinueIds + itemId)
    }

    fun savePlaybackProgress(
        contentId: String?,
        episodeId: String?,
        fraction: Float,
        streamId: String? = null,
        season: Int? = null,
        episode: Int? = null,
        episodeTitle: String = "",
        positionMs: Long = 0L,
        durationMs: Long = 0L,
        sourceId: String? = null
    ) = updatePreferences { prefs ->
        val f = fraction.coerceIn(0f, 0.999f)
        val now = System.currentTimeMillis()
        var next = prefs
        // Tiny / unconfirmed leftovers must not keep a stale continue snapshot.
        if (!contentId.isNullOrBlank() && f <= 0.02f) {
            return@updatePreferences next.copy(
                continueResumeByTitleId = next.continueResumeByTitleId - contentId
            )
        }
        val epKey = EpisodeProgress.episodeKey(
            episodeId = episodeId,
            sourceId = sourceId,
            season = season,
            episode = episode
        ).takeIf { !episodeId.isNullOrBlank() || (season != null && episode != null) }
        if (!epKey.isNullOrBlank()) {
            val playback = EpisodePlaybackState(
                key = epKey,
                episodeId = episodeId ?: epKey,
                seriesId = contentId,
                sourceId = sourceId,
                season = season,
                episode = episode,
                streamId = streamId,
                fraction = f,
                positionMs = positionMs,
                durationMs = durationMs,
                updatedAt = now
            )
            next = next.copy(
                progressByEpisodeId = next.progressByEpisodeId + (epKey to f),
                episodePlaybackById = next.episodePlaybackById + (epKey to playback),
                continueActivityById = next.continueActivityById + ("ep:$epKey" to now)
            )
        }
        if (!contentId.isNullOrBlank()) {
            next = next.copy(
                progressByItemId = next.progressByItemId + (contentId to f),
                continueActivityById = next.continueActivityById + (contentId to now),
                dismissedContinueIds = next.dismissedContinueIds - contentId
            )
            if (episodeId.isNullOrBlank() && f >= next.continueCompletedThreshold) {
                next = next.copy(
                    continueResumeByTitleId = next.continueResumeByTitleId - contentId
                )
            } else if (f > 0.02f && f < next.continueCompletedThreshold) {
                next = next.copy(
                    continueResumeByTitleId = next.continueResumeByTitleId + (
                        contentId to com.lkstv.app.domain.ContinueResumeSnapshot(
                            episodeId = episodeId,
                            streamId = streamId,
                            season = season,
                            episode = episode,
                            episodeTitle = episodeTitle,
                            fraction = f,
                            positionMs = positionMs,
                            durationMs = durationMs
                        )
                    )
                )
            }
        }
        next
    }

    fun setLivePreviewEnabled(enabled: Boolean) = updatePreferences {
        it.copy(livePreviewEnabled = enabled)
    }

    fun toggleHiddenItem(itemId: String) = updatePreferences { prefs ->
        val next = prefs.hiddenItemIds.toMutableSet()
        if (!next.add(itemId)) next.remove(itemId)
        prefs.copy(hiddenItemIds = next)
    }

    fun setReduceMotion(enabled: Boolean) = updatePreferences { it.copy(reduceMotion = enabled) }

    fun setPreferredLanguage(language: AudioLanguage) =
        updatePreferences {
            it.copy(
                preferredLanguage = language,
                preferredAudioLanguage = LanguageCodes.fromAudioLanguage(language)
                    .ifBlank { it.preferredAudioLanguage }
            )
        }

    fun setPreferredAudioLanguage(tag: String) = updatePreferences {
        val norm = LanguageCodes.normalize(tag).ifBlank { LanguageCodes.migratePreferred(tag) }
        it.copy(
            preferredAudioLanguage = norm,
            preferredLanguage = LanguageCodes.toAudioLanguage(norm)
        )
    }

    fun setPreferredSubtitleLanguage(tag: String) = updatePreferences {
        it.copy(preferredSubtitleLanguage = LanguageCodes.normalize(tag).ifBlank { "fr" })
    }

    fun setInterfaceLanguage(tag: String) = updatePreferences {
        it.copy(interfaceLanguage = LanguageCodes.normalize(tag).ifBlank { "fr" })
    }

    /** TASK-013: search history removed — no-ops kept for call-site safety. */
    fun rememberSearch(query: String) = Unit

    fun clearRecentSearch(query: String?) = Unit

    suspend fun runRefresh(
        sourceRepository: SourceRepository? = null,
        syncEngine: CatalogSyncEngine? = null
    ) {
        if (_isSyncing.value) return
        val enabled = sourceRepository?.getSources()?.count { it.enabled } ?: 0
        if (enabled > 0 && syncEngine != null) {
            _isSyncing.value = true
            _lastSyncError.value = null
            _lastSyncMessage.value = "Synchronisation IPTV… ($enabled source(s))"
            try {
                val result = syncEngine.syncAll()
                val progress = syncEngine.progress.value
                when {
                    result.cancelled || progress.phase == SyncPhase.CANCELLED -> {
                        _lastSyncMessage.value =
                            "Synchronisation annulée — préférences profil inchangées."
                    }
                    result.errors.isNotEmpty() -> {
                        _lastSyncError.value = result.errors.joinToString(" · ")
                        _lastSyncMessage.value =
                            "Sync partielle: ${result.titlesImported} titres, ${result.errors.size} erreur(s). " +
                                "Préférences profil préservées."
                    }
                    else -> {
                        _lastSyncError.value = null
                        _lastSyncMessage.value =
                            "Sync OK — ${result.titlesImported} titres, ${result.groupsImported} groupes. " +
                                "Masquages profil conservés."
                    }
                }
            } catch (e: Exception) {
                _lastSyncError.value = e.message ?: "erreur"
                _lastSyncMessage.value =
                    "Échec sync: ${e.message ?: "erreur"} — préférences profil intactes."
            } finally {
                _isSyncing.value = false
                bump()
            }
        } else {
            runNoSourceRefresh()
        }
    }

    suspend fun runDemoRefresh() = runNoSourceRefresh()

    private fun runNoSourceRefresh() {
        if (_isSyncing.value) return
        _isSyncing.value = true
        _lastSyncError.value = null
        _lastSyncMessage.value =
            "Aucune source IPTV activée. Ajoutez une source dans Paramètres, puis Actualiser."
        _isSyncing.value = false
        bump()
    }

    fun dismissDemoMessage() {
        _lastSyncMessage.value = null
    }

    fun dismissSyncMessage() = dismissDemoMessage()

    fun clearSyncError() {
        _lastSyncError.value = null
    }

    fun snapshotHiddenGroups(profileId: String): Set<String> =
        preferencesFor(profileId).hiddenGroupIds.toSet()

    private fun requireActiveId(): String =
        _activeProfileId.value ?: error("No active profile")

    private fun persist() {
        val s = store ?: return
        s.write(
            PrefsFile(
                activeProfileId = activeId,
                byProfile = preferences.mapValues { it.value.toEntity() }
            )
        )
    }

    private fun bump() {
        _prefsVersion.update { it + 1 }
    }
}

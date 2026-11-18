package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.StreamRef
import com.lkstv.app.domain.iptv.UnifiedCatalog
import kotlin.math.absoluteValue

/**
 * Maps [UnifiedCatalog] → UI models with profile filters.
 * Never invents popularity / editorial rankings.
 */
object CatalogPresenter {

    fun status(
        hasEnabledSources: Boolean,
        catalog: UnifiedCatalog,
        syncing: Boolean,
        syncError: String?
    ): CatalogScreenStatus = when {
        syncing -> CatalogScreenStatus.LOADING
        !syncError.isNullOrBlank() && catalog.titles.isEmpty() -> CatalogScreenStatus.ERROR
        !hasEnabledSources && catalog.titles.isEmpty() -> CatalogScreenStatus.EMPTY_NO_SOURCES
        catalog.titles.isEmpty() -> CatalogScreenStatus.EMPTY_NO_CONTENT
        else -> CatalogScreenStatus.READY
    }

    fun visibleTitles(
        catalog: UnifiedCatalog,
        type: ContentType,
        prefs: ProfilePreferences
    ): List<CatalogItem> {
        val section = CatalogSectionKey.fromContentType(type)
        return catalog.titles
            .filter { it.type == type }
            .map { toItem(it, prefs) }
            .filter { isVisible(it, prefs, section) }
    }

    fun toItem(title: LogicalTitle, prefs: ProfilePreferences): CatalogItem {
        val baseProgress = when (title.type) {
            ContentType.SERIES -> {
                ContinueWatching.resumeEpisodeForSeries(title, prefs)?.fraction
                    ?: prefs.progressByItemId[title.id]
                    ?: 0f
            }
            else -> prefs.progressByItemId[title.id] ?: 0f
        }
        val item = toItem(title, prefs.preferredAudioTag(), baseProgress)
        if (title.type != ContentType.SERIES) return item
        val epProg = prefs.progressByEpisodeId
        val epPlay = prefs.episodePlaybackById
        return item.copy(
            seasons = item.seasons.map { season ->
                season.copy(
                    episodes = season.episodes.map { ep ->
                        val play = epPlay[ep.id]
                        val frac = epProg[ep.id] ?: play?.fraction ?: 0f
                        ep.copy(
                            progressFraction = frac,
                            positionMs = play?.positionMs ?: 0L,
                            durationMs = play?.durationMs ?: 0L
                        )
                    }
                )
            }
        )
    }

    fun buildRows(
        catalog: UnifiedCatalog,
        type: ContentType,
        prefs: ProfilePreferences,
        sourceLabels: Map<String, String> = emptyMap()
    ): List<HomeRow> {
        val items = visibleTitles(catalog, type, prefs)
        if (items.isEmpty()) return emptyList()

        val rows = mutableListOf<HomeRow>()
        val orderedVisible = listOf(HomeRowId.CONTINUE_WATCHING) +
            prefs.visibleRowIds.filter { it != HomeRowId.CONTINUE_WATCHING }
        for (rowId in orderedVisible) {
            when (rowId) {
                HomeRowId.CONTINUE_WATCHING -> {
                    // Ignore section allowlist so in-progress films/series still appear
                    // when the section catalogue is empty or unconfigured.
                    val rawTitles = catalog.titles.filter { it.type == type && it.id !in prefs.hiddenItemIds }
                    val cont = ContinueWatching.build(
                        rawTitles,
                        prefs,
                        { title, frac -> toItem(title, prefs.preferredAudioTag(), frac) },
                        limit = 24
                    )
                    if (cont.isNotEmpty()) {
                        rows.add(
                            0,
                            HomeRow(rowId.key, rowId.label, cont, showsProgress = true)
                        )
                    }
                }
                HomeRowId.NEW_RELEASES -> {
                    val news = items.filter { it.year > 0 }.sortedByDescending { it.year }.take(24)
                    if (news.isNotEmpty()) {
                        rows += HomeRow(rowId.key, rowId.label, news)
                    }
                }
                HomeRowId.LIBRARY_SYNCED -> {
                    rows += HomeRow(rowId.key, rowId.label, items.take(48))
                }
                HomeRowId.MONTHLY_PICKS,
                HomeRowId.TOP_OF_MONTH,
                HomeRowId.RECOMMENDATIONS -> {
                    // Unfeedable: never invent rankings / recommendations.
                }
            }
        }

        val section = CatalogSectionKey.fromContentType(type)
        val allowed = GroupSelection.allowedGroupIds(prefs, section)
        val groups = catalog.groups.filter { group ->
            group.id !in prefs.hiddenGroupIds &&
                group.id in allowed &&
                groupMatchesType(group, type)
        }
        var groupRows = 0
        for (group in groups.sortedBy { it.name }) {
            if (groupRows >= 60) break
            val inGroup = items.asSequence().filter { group.id in it.groupIds }.take(48).toList()
            if (inGroup.isNotEmpty()) {
                val label = sourceLabels[group.sourceId.value]?.let { src -> "${group.name} · $src" }
                    ?: group.name
                rows += HomeRow(key = "group:${group.id}", label = label, items = inGroup)
                groupRows += 1
            }
        }
        return rows
    }

    fun hero(items: List<CatalogItem>): CatalogItem? =
        items.firstOrNull { it.progressFraction > 0f }
            ?: items.maxByOrNull { it.year }
            ?: items.firstOrNull()

    fun isVisible(
        item: CatalogItem,
        prefs: ProfilePreferences,
        section: CatalogSectionKey = CatalogSectionKey.fromContentType(item.type)
    ): Boolean {
        if (item.id in prefs.hiddenItemIds) return false
        val gids = if (item.groupIds.isNotEmpty()) item.groupIds
        else if (item.providerGroupId.isNotBlank()) setOf(item.providerGroupId)
        else emptySet()
        return GroupSelection.titleAllowed(gids, prefs, section)
    }

    fun toItem(
        title: LogicalTitle,
        preferred: AudioLanguage,
        progress: Float = 0f,
        selectedVersionId: String? = null,
        groupNames: Map<String, String> = emptyMap()
    ): CatalogItem = toItem(
        title,
        LanguageCodes.fromAudioLanguage(preferred),
        progress,
        selectedVersionId,
        groupNames
    )

    fun toItem(
        title: LogicalTitle,
        preferredTag: String,
        progress: Float = 0f,
        selectedVersionId: String? = null,
        groupNames: Map<String, String> = emptyMap()
    ): CatalogItem {
        val versions = title.variants.mapIndexed { index, stream ->
            stream.toVersionOption(index, title.variants.size, groupNames[stream.groupId].orEmpty())
        }
        val selected = selectedVersionId
            ?: CatalogMergePolicy.selectPreferredVariant(title.variants, preferredTag)?.id
            ?: versions.firstOrNull()?.id
        val colors = colorsFor(title.id)
        val seasons = title.episodes
            .groupBy { it.seasonNumber }
            .toSortedMap()
            .map { (seasonNum, eps) ->
                Season(
                    number = seasonNum,
                    title = "Saison $seasonNum",
                    episodes = eps.sortedBy { it.episodeNumber }.map { ep ->
                        val epVersions = ep.versions.mapIndexed { index, ver ->
                            ver.stream.toVersionOption(
                                index,
                                ep.versions.size,
                                groupNames[ver.stream.groupId].orEmpty()
                            )
                        }
                        val epSelected = CatalogMergePolicy
                            .selectPreferredEpisodeVersion(ep.versions, preferredTag)
                            ?.stream?.id
                            ?: epVersions.firstOrNull()?.id
                        Episode(
                            id = ep.id,
                            number = ep.episodeNumber,
                            title = DisplayMeta.cleanEpisodeTitle(
                                ep.title,
                                seasonNum,
                                ep.episodeNumber,
                                title.canonicalTitle
                            ),
                            synopsis = ep.synopsis,
                            durationMinutes = ep.durationMinutes ?: 0,
                            progressFraction = 0f, // filled by toItem(prefs) overload when available
                            versions = epVersions,
                            selectedVersionId = epSelected,
                            thumbUrl = ep.thumbUrl,
                            seasonNumber = seasonNum
                        )
                    }
                )
            }
        val groupIds = (title.variants.map { it.groupId } +
            title.episodes.flatMap { ep -> ep.versions.map { it.stream.groupId } }).toSet()
        return CatalogItem(
            id = title.id,
            title = DisplayMeta.cleanDisplayTitle(title.canonicalTitle),
            synopsis = title.synopsis.ifBlank { "Aucune synopsis fournie par la source." },
            genres = title.genres,
            year = title.year ?: 0,
            durationMinutes = null,
            type = title.type,
            posterColor = colors.first,
            backdropColor = colors.second,
            posterUrl = title.posterUrl,
            backdropUrl = title.backdropUrl,
            // Never invent age/TMDB ratings — only real provider values (empty until enriched).
            ratingLabel = "",
            progressFraction = progress,
            seasons = seasons,
            providerGroupId = groupIds.firstOrNull().orEmpty(),
            groupIds = groupIds,
            versions = versions,
            selectedVersionId = selected,
            hasUnknownLanguageVersion = versions.any {
                it.languageTag.isBlank() &&
                    (it.language == AudioLanguage.UNKNOWN || it.confidence == LanguageConfidence.UNKNOWN)
            },
            trustedMerge = (title.matchKey.type == MatchKeyType.PROVIDER_EXTERNAL ||
                title.matchKey.type == MatchKeyType.TITLE_YEAR ||
                title.matchKey.type == MatchKeyType.EXPLICIT) && !title.singleSourceOnly
        )
    }

    fun withSelectedVersion(item: CatalogItem, versionId: String): CatalogItem =
        item.copy(selectedVersionId = versionId)

    private fun StreamRef.toVersionOption(
        index: Int = 0,
        total: Int = 1,
        groupName: String = ""
    ): VersionOption {
        val detected = if (languageTag.isBlank() && language == AudioLanguage.UNKNOWN) {
            LanguageCodes.detect(rawTitle, groupName)
        } else {
            LanguageCodes.Detection(
                tag = languageTag.ifBlank { LanguageCodes.fromAudioLanguage(language) },
                confidence = languageConfidence
            )
        }
        val resolvedLang = LanguageCodes.toAudioLanguage(detected.tag).takeIf { it != AudioLanguage.UNKNOWN }
            ?: language
        val labeled = copy(
            language = resolvedLang,
            languageConfidence = detected.confidence,
            languageTag = detected.tag
        )
        return VersionOption(
            id = id,
            label = DisplayMeta.versionLabel(labeled, index, total, groupName),
            language = resolvedLang,
            confidence = detected.confidence,
            groupId = groupId,
            playbackUrl = playbackUrl,
            languageTag = detected.tag,
            languageLabel = LanguageCodes.displayName(detected.tag, useful = false)
        )
    }

    private fun LogicalTitle.trustedMergeLabel(): Boolean =
        matchKey.type != MatchKeyType.SOURCE_LOCAL && !singleSourceOnly

    private fun groupMatchesType(group: IptvGroup, type: ContentType): Boolean = when (type) {
        ContentType.FILM -> group.kind == ProviderCategoryKind.VOD ||
            group.kind == ProviderCategoryKind.UNKNOWN
        ContentType.SERIES -> group.kind == ProviderCategoryKind.SERIES ||
            group.kind == ProviderCategoryKind.UNKNOWN
    }

    private fun colorsFor(id: String): Pair<Long, Long> {
        val h = id.hashCode().absoluteValue
        val poster = 0xFF101820L or ((h % 0x5F5F5F).toLong() shl 0)
        val backdrop = 0xFF080C12L or (((h / 3) % 0x3F3F3F).toLong())
        return poster to backdrop
    }
}

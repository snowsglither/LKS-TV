package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.UnifiedCatalog

enum class CatalogSectionKey(val storageKey: String) {
    TV("tv"),
    FILMS("films"),
    SERIES("series");

    companion object {
        fun fromHub(section: HubSection): CatalogSectionKey? = when (section) {
            HubSection.LIVE_TV -> TV
            HubSection.FILMS -> FILMS
            HubSection.SERIES -> SERIES
            else -> null
        }

        fun fromContentType(type: ContentType): CatalogSectionKey = when (type) {
            ContentType.FILM -> FILMS
            ContentType.SERIES -> SERIES
        }
    }
}

data class SectionGroupConfig(
    val configured: Boolean = false,
    val selectedGroupIds: Set<String> = emptySet()
)

data class SelectableGroup(
    val id: String,
    val name: String,
    val kind: ProviderCategoryKind,
    val sourceId: String,
    val sourceLabel: String,
    val count: Int
)

object GroupSelection {

    fun config(prefs: ProfilePreferences, section: CatalogSectionKey): SectionGroupConfig =
        prefs.sectionGroupPrefs[section] ?: SectionGroupConfig()

    fun isConfigured(prefs: ProfilePreferences, section: CatalogSectionKey): Boolean =
        config(prefs, section).configured

    fun allowedGroupIds(prefs: ProfilePreferences, section: CatalogSectionKey): Set<String> {
        val cfg = config(prefs, section)
        if (!cfg.configured) return emptySet()
        return cfg.selectedGroupIds - prefs.hiddenGroupIds
    }

    fun needsSetup(
        prefs: ProfilePreferences,
        catalog: UnifiedCatalog,
        section: CatalogSectionKey,
        hasEnabledSources: Boolean
    ): Boolean {
        if (!hasEnabledSources) return false
        if (catalog.groups.isEmpty()) return false
        if (listSelectable(catalog, section).isEmpty()) return false
        return !isConfigured(prefs, section)
    }

    fun listSelectable(
        catalog: UnifiedCatalog,
        section: CatalogSectionKey,
        sourceLabels: Map<String, String> = emptyMap()
    ): List<SelectableGroup> {
        val kindOk: (IptvGroup) -> Boolean = when (section) {
            CatalogSectionKey.TV -> { g ->
                g.kind == ProviderCategoryKind.LIVE || g.kind == ProviderCategoryKind.UNKNOWN
            }
            CatalogSectionKey.FILMS -> { g ->
                g.kind == ProviderCategoryKind.VOD || g.kind == ProviderCategoryKind.UNKNOWN
            }
            CatalogSectionKey.SERIES -> { g ->
                g.kind == ProviderCategoryKind.SERIES || g.kind == ProviderCategoryKind.UNKNOWN
            }
        }
        val liveGroupIds = catalog.groups
            .filter { it.kind == ProviderCategoryKind.LIVE }
            .map { it.id }
            .toSet()
        val counts = HashMap<String, Int>()
        for (t in catalog.titles) {
            when (section) {
                CatalogSectionKey.FILMS -> if (t.type != ContentType.FILM) continue
                CatalogSectionKey.SERIES -> if (t.type != ContentType.SERIES) continue
                CatalogSectionKey.TV -> {
                    val gids = t.variants.map { it.groupId }.toSet()
                    if (gids.isEmpty() || liveGroupIds.isEmpty() || !gids.all { it in liveGroupIds }) continue
                }
            }
            val gids = t.variants.map { it.groupId } +
                t.episodes.flatMap { ep -> ep.versions.map { it.stream.groupId } }
            for (gid in gids) {
                if (gid.isNotBlank()) counts[gid] = (counts[gid] ?: 0) + 1
            }
        }
        return catalog.groups
            .asSequence()
            .filter(kindOk)
            .map { g ->
                SelectableGroup(
                    id = g.id,
                    name = g.name,
                    kind = g.kind,
                    sourceId = g.sourceId.value,
                    sourceLabel = sourceLabels[g.sourceId.value] ?: g.sourceId.value,
                    count = counts[g.id] ?: 0
                )
            }
            .filter { it.count > 0 || it.kind != ProviderCategoryKind.UNKNOWN }
            .sortedWith(compareBy({ it.sourceLabel }, { it.name }))
            .toList()
    }

    fun titleAllowed(
        groupIds: Set<String>,
        prefs: ProfilePreferences,
        section: CatalogSectionKey
    ): Boolean {
        if (groupIds.isEmpty()) return false
        if (!isConfigured(prefs, section)) return false
        val allowed = allowedGroupIds(prefs, section)
        return groupIds.any { it in allowed }
    }

    fun emptyReason(prefs: ProfilePreferences, section: CatalogSectionKey): CatalogScreenEmptyReason {
        if (!isConfigured(prefs, section)) return CatalogScreenEmptyReason.NEEDS_GROUP_SETUP
        if (allowedGroupIds(prefs, section).isEmpty()) return CatalogScreenEmptyReason.NO_GROUPS_SELECTED
        return CatalogScreenEmptyReason.NONE
    }

    fun prune(prefs: ProfilePreferences, existingGroupIds: Set<String>): ProfilePreferences {
        val next = prefs.sectionGroupPrefs.toMutableMap()
        for (key in CatalogSectionKey.entries) {
            val cfg = next[key] ?: SectionGroupConfig()
            next[key] = cfg.copy(
                selectedGroupIds = cfg.selectedGroupIds.filter { it in existingGroupIds }.toSet()
            )
        }
        return prefs.copy(sectionGroupPrefs = next)
    }

    fun setupTitle(section: CatalogSectionKey): String = when (section) {
        CatalogSectionKey.TV -> "Personnaliser mes chaînes"
        CatalogSectionKey.FILMS -> "Personnaliser mes films"
        CatalogSectionKey.SERIES -> "Personnaliser mes séries"
    }

    fun setupDescription(section: CatalogSectionKey): String = when (section) {
        CatalogSectionKey.TV ->
            "Choisissez les groupes TV à afficher pour ce profil. Tout est décoché par défaut."
        CatalogSectionKey.FILMS ->
            "Choisissez les catégories de films visibles pour ce profil."
        CatalogSectionKey.SERIES ->
            "Choisissez les catégories de séries visibles pour ce profil."
    }
}

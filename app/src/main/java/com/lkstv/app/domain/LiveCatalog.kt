package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.UnifiedCatalog

data class LiveGroupRef(
    val id: String,
    val name: String,
    val count: Int
)

data class LiveChannelRef(
    val id: String,
    val title: String,
    val logoUrl: String?,
    val streamId: String?,
    val playbackUrl: String,
    val groupId: String?,
    val isFavorite: Boolean
)

object LiveCatalog {

    fun groups(catalog: UnifiedCatalog, prefs: ProfilePreferences): List<LiveGroupRef> {
        val allowed = GroupSelection.allowedGroupIds(prefs, CatalogSectionKey.TV)
        if (!GroupSelection.isConfigured(prefs, CatalogSectionKey.TV) || allowed.isEmpty()) {
            return emptyList()
        }
        val hiddenItems = prefs.hiddenItemIds
        val counts = HashMap<String, Int>()
        var total = 0
        for (t in catalog.titles) {
            if (!isLive(t, catalog) || t.id in hiddenItems) continue
            val gids = t.variants.map { it.groupId }.toSet()
            if (gids.none { it in allowed }) continue
            total += 1
            for (gid in gids) {
                if (gid !in allowed) continue
                counts[gid] = (counts[gid] ?: 0) + 1
            }
        }
        val out = ArrayList<LiveGroupRef>()
        out += LiveGroupRef(
            "__favorites__",
            "Favoris",
            prefs.favoriteIds.count { id ->
                catalog.titles.any { it.id == id && isLive(it, catalog) && channelAllowed(it, allowed) }
            }
        )
        out += LiveGroupRef("__all__", "Toutes les chaînes", total)
        for (g in catalog.groups) {
            if (g.kind != ProviderCategoryKind.LIVE && g.kind != ProviderCategoryKind.UNKNOWN) continue
            if (g.id !in allowed) continue
            val c = counts[g.id] ?: 0
            if (c > 0) out += LiveGroupRef(g.id, g.name, c)
        }
        return out
    }

    fun channels(
        catalog: UnifiedCatalog,
        prefs: ProfilePreferences,
        groupId: String,
        offset: Int,
        limit: Int
    ): Pair<List<LiveChannelRef>, Int> {
        val allowed = GroupSelection.allowedGroupIds(prefs, CatalogSectionKey.TV)
        if (!GroupSelection.isConfigured(prefs, CatalogSectionKey.TV) || allowed.isEmpty()) {
            return emptyList<LiveChannelRef>() to 0
        }
        if (groupId != "__all__" && groupId != "__favorites__" && groupId !in allowed) {
            return emptyList<LiveChannelRef>() to 0
        }
        val matched = ArrayList<LiveChannelRef>()
        for (t in catalog.titles) {
            if (!isLive(t, catalog) || t.id in prefs.hiddenItemIds) continue
            if (!channelAllowed(t, allowed)) continue
            val gids = t.variants.map { it.groupId }.toSet()
            when (groupId) {
                "__favorites__" -> if (t.id !in prefs.favoriteIds) continue
                "__all__" -> Unit
                else -> if (groupId !in gids) continue
            }
            val v = t.variants.firstOrNull { it.groupId in allowed } ?: t.variants.firstOrNull() ?: continue
            matched += LiveChannelRef(
                id = t.id,
                title = DisplayMeta.cleanDisplayTitle(t.canonicalTitle),
                logoUrl = t.posterUrl,
                streamId = v.id,
                playbackUrl = v.playbackUrl,
                groupId = v.groupId,
                isFavorite = t.id in prefs.favoriteIds
            )
        }
        matched.sortBy { it.title.lowercase() }
        val total = matched.size
        val end = (offset + limit).coerceAtMost(total)
        val page = if (offset >= total) emptyList() else matched.subList(offset, end)
        return page to total
    }

    private fun channelAllowed(t: LogicalTitle, allowed: Set<String>): Boolean {
        val gids = t.variants.map { it.groupId }.toSet()
        return gids.any { it in allowed }
    }

    private fun isLive(t: LogicalTitle, catalog: UnifiedCatalog): Boolean {
        if (t.type == ContentType.SERIES) return false
        val liveIds = catalog.groups.filter { it.kind == ProviderCategoryKind.LIVE }.map { it.id }.toSet()
        if (liveIds.isEmpty()) return false
        val gids = t.variants.map { it.groupId }.toSet()
        return gids.isNotEmpty() && gids.all { it in liveIds }
    }
}

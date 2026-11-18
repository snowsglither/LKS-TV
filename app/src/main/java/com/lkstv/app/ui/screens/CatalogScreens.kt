package com.lkstv.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.CatalogScreenEmptyReason
import com.lkstv.app.domain.CatalogScreenStatus
import com.lkstv.app.domain.HomeRow
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.components.CinematicHero
import com.lkstv.app.ui.components.PosterCard
import com.lkstv.app.ui.components.SectionScaffold
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import kotlinx.coroutines.flow.distinctUntilChanged

@Composable
fun CatalogSectionScreen(
    section: HubSection,
    profile: Profile?,
    syncing: Boolean,
    status: CatalogScreenStatus,
    syncError: String?,
    hero: CatalogItem?,
    rows: List<HomeRow>,
    initialScrollIndex: Int = 0,
    refreshLabel: String = "Actualiser",
    groupEmpty: CatalogScreenEmptyReason = CatalogScreenEmptyReason.NONE,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onSearch: (() -> Unit)? = null,
    onOpenItem: (CatalogItem) -> Unit,
    onScrollIndexChanged: (Int) -> Unit = {},
    onManageGroups: () -> Unit = {}
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = initialScrollIndex.coerceAtLeast(0)
    )
    LaunchedEffect(listState) {
        snapshotFlow { listState.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { onScrollIndexChanged(it) }
    }

    SectionScaffold(
        title = section.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        onSearch = onSearch,
        refreshLabel = refreshLabel,
        contentPadding = PaddingValues(0.dp)
    ) {
        when {
            status == CatalogScreenStatus.LOADING -> StatusMessage(
                title = "Synchronisation…",
                body = "Import des sources IPTV en cours."
            )
            status == CatalogScreenStatus.EMPTY_NO_SOURCES -> StatusMessage(
                title = "Aucune source IPTV",
                body = "Ajoutez une source dans Paramètres (sample M3U ou Xtream), puis Actualiser. " +
                    "Aucun film fictif n’est affiché."
            )
            status == CatalogScreenStatus.ERROR -> StatusMessage(
                title = "Erreur de synchronisation",
                body = syncError ?: "Échec d’import. Réessayez Actualiser.",
                accent = true
            )
            groupEmpty == CatalogScreenEmptyReason.NEEDS_GROUP_SETUP ||
                groupEmpty == CatalogScreenEmptyReason.NO_GROUPS_SELECTED -> {
                Column(Modifier.padding(48.dp)) {
                    StatusMessage(
                        title = if (groupEmpty == CatalogScreenEmptyReason.NEEDS_GROUP_SETUP)
                            "Choisissez vos groupes"
                        else
                            "Aucun groupe sélectionné",
                        body = if (groupEmpty == CatalogScreenEmptyReason.NEEDS_GROUP_SETUP)
                            "Personnalisez les catégories visibles pour ce profil."
                        else
                            "Le catalogue n’affiche rien tant qu’aucun groupe n’est coché."
                    )
                    Spacer(Modifier.height(16.dp))
                    TvActionChip(
                        label = "Choisir mes groupes",
                        contentDescription = "Choisir mes groupes",
                        onClick = onManageGroups,
                        accent = true
                    )
                    Spacer(Modifier.height(12.dp))
                    TvActionChip(
                        label = "Gérer mes groupes",
                        contentDescription = "Gérer mes groupes",
                        onClick = onManageGroups
                    )
                }
            }
            status == CatalogScreenStatus.EMPTY_NO_CONTENT -> StatusMessage(
                title = "Catalogue vide",
                body = "Les sources n’ont renvoyé aucun ${section.title.lowercase()}."
            )
            else -> {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 48.dp)
                ) {
                    item {
                        TvActionChip(
                            label = "Gérer mes groupes",
                            contentDescription = "Gérer mes groupes",
                            onClick = onManageGroups,
                            modifier = Modifier.padding(horizontal = 40.dp, vertical = 4.dp)
                        )
                        if (hero != null) {
                            CinematicHero(
                                item = hero,
                                onOpen = { onOpenItem(hero) },
                                modifier = Modifier.padding(horizontal = 40.dp)
                            )
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    items(rows, key = { it.key }) { row ->
                        CatalogRow(
                            title = row.label,
                            items = row.items,
                            showProgress = row.showsProgress,
                            onOpenItem = onOpenItem
                        )
                        Spacer(Modifier.height(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusMessage(title: String, body: String, accent: Boolean = false) {
    Column(Modifier.padding(horizontal = 48.dp, vertical = 28.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, color = Mist)
        Spacer(Modifier.height(10.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyLarge,
            color = if (accent) GoldAccent else MistMuted
        )
    }
}

@Composable
fun CatalogRow(
    title: String,
    items: List<CatalogItem>,
    onOpenItem: (CatalogItem) -> Unit,
    showProgress: Boolean = false
) {
    Column(Modifier.fillMaxWidth()) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = Mist,
            modifier = Modifier.padding(horizontal = 48.dp, vertical = 8.dp)
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 40.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            items(items, key = { it.id }) { item ->
                PosterCard(
                    item = item,
                    onClick = { onOpenItem(item) },
                    showProgress = showProgress
                )
            }
        }
    }
}

@Composable
fun PlaceholderSectionScreen(
    section: HubSection,
    profile: Profile?,
    syncing: Boolean,
    message: String,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onSearch: (() -> Unit)? = null,
    refreshLabel: String = "Actualiser",
    extra: @Composable (() -> Unit)? = null
) {
    SectionScaffold(
        title = section.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        onSearch = onSearch,
        refreshLabel = refreshLabel
    ) {
        Column(Modifier.padding(horizontal = 48.dp)) {
            Text(section.subtitle, style = MaterialTheme.typography.headlineMedium, color = Mist)
            Spacer(Modifier.height(12.dp))
            Text(message, style = MaterialTheme.typography.bodyLarge, color = MistMuted)
            Text(
                text = "Section préparée pour une future mission.",
                style = MaterialTheme.typography.bodyMedium,
                color = GoldAccent,
                modifier = Modifier.padding(top = 16.dp)
            )
            extra?.invoke()
        }
    }
}

@Composable
fun LibrarySectionScreen(
    profile: Profile?,
    syncing: Boolean,
    favorites: List<CatalogItem>,
    watchLater: List<CatalogItem>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onOpenItem: (CatalogItem) -> Unit,
    refreshLabel: String = "Actualiser"
) {
    SectionScaffold(
        title = HubSection.LIBRARY.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        refreshLabel = refreshLabel,
        contentPadding = PaddingValues(0.dp)
    ) {
        LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) {
            item {
                Text(
                    text = "Listes du profil actif (persistées).",
                    color = MistMuted,
                    modifier = Modifier.padding(horizontal = 48.dp, vertical = 8.dp)
                )
            }
            item {
                CatalogRow("Favoris", favorites, onOpenItem)
                Spacer(Modifier.height(20.dp))
            }
            item {
                CatalogRow("À regarder plus tard", watchLater, onOpenItem)
            }
            if (favorites.isEmpty() && watchLater.isEmpty()) {
                item {
                    Text(
                        text = "Aucune liste pour ce profil.",
                        color = MistMuted,
                        modifier = Modifier.padding(48.dp)
                    )
                }
            }
        }
    }
}

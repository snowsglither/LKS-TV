package com.lkstv.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.components.PosterCard
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.FocusGlow
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian
import com.lkstv.app.ui.theme.ObsidianElevated

private data class SideItem(
    val section: HubSection?,
    val label: String,
    val blurb: String,
    val search: Boolean = false
)

private val SideItems = listOf(
    SideItem(null, "Accueil", "Votre espace"),
    SideItem(HubSection.FILMS, "Films", "Cinéma"),
    SideItem(HubSection.SERIES, "Séries", "Épisodes"),
    SideItem(HubSection.LIVE_TV, "TV", "En direct"),
    SideItem(null, "Recherche", "Explorer", search = true),
    SideItem(HubSection.SETTINGS, "Réglages", "Votre expérience")
)

/**
 * Accueil V2 — rail latéral D-pad + hero + Continuer (pas de cartes géantes).
 */
@Composable
fun HubScreen(
    profile: Profile?,
    syncing: Boolean,
    continueWatching: List<CatalogItem> = emptyList(),
    onOpenSection: (HubSection) -> Unit,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onSearch: () -> Unit = {},
    onOpenContinue: (CatalogItem) -> Unit = {},
    onDismissContinue: (String) -> Unit = {},
    refreshLabel: String = "Actualiser"
) {
    val hero = continueWatching.firstOrNull()
    Row(
        Modifier
            .fillMaxSize()
            .background(Obsidian)
    ) {
        // Side rail — D-pad friendly vertical list
        Column(
            Modifier
                .width(200.dp)
                .fillMaxHeight()
                .background(
                    Brush.verticalGradient(listOf(Color(0xFF12141B), Color(0xFF090A0E)))
                )
                .padding(vertical = 20.dp, horizontal = 10.dp)
        ) {
            Text(
                "LKS TV",
                color = BrandRed,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
            )
            Text(
                "DÉCOUVRIR",
                color = MistMuted,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
            SideItems.forEach { item ->
                val active = item.section == null && !item.search
                Surface(
                    onClick = {
                        when {
                            item.search -> onSearch()
                            item.section != null -> onOpenSection(item.section)
                            else -> { /* already home */ }
                        }
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                        .semantics { contentDescription = item.label },
                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(11.dp)),
                    scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
                    colors = ClickableSurfaceDefaults.colors(
                        containerColor = if (active) BrandRed.copy(alpha = 0.18f) else Color.Transparent,
                        focusedContainerColor = Mist.copy(alpha = 0.12f)
                    ),
                    border = ClickableSurfaceDefaults.border(
                        focusedBorder = Border(
                            border = BorderStroke(2.dp, FocusGlow),
                            shape = RoundedCornerShape(11.dp)
                        )
                    )
                ) {
                    Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                        Text(item.label, color = Mist, style = MaterialTheme.typography.titleMedium)
                        Text(item.blurb, color = MistMuted, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Spacer(Modifier.weight(1f))
            if (profile != null) {
                Surface(
                    onClick = onProfile,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
                    colors = ClickableSurfaceDefaults.colors(
                        containerColor = ObsidianElevated,
                        focusedContainerColor = Mist.copy(alpha = 0.12f)
                    )
                ) {
                    Row(
                        Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            Modifier
                                .size(34.dp)
                                .background(Color(profile.avatarColor), RoundedCornerShape(9.dp))
                        )
                        Spacer(Modifier.width(10.dp))
                        Column {
                            Text(profile.name, color = Mist, style = MaterialTheme.typography.labelLarge)
                            Text("Profil actif", color = MistMuted, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }

        LazyColumn(
            Modifier
                .weight(1f)
                .fillMaxHeight()
                .padding(horizontal = 28.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "LKS TV",
                        style = MaterialTheme.typography.headlineSmall,
                        color = Mist
                    )
                    Spacer(Modifier.weight(1f))
                    TvActionChip(label = refreshLabel, contentDescription = "Actualiser", onClick = onRefresh)
                    Spacer(Modifier.width(10.dp))
                    TvActionChip(label = "⌕", contentDescription = "Rechercher", onClick = onSearch)
                }
            }
            item {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(280.dp)
                        .background(
                            Brush.horizontalGradient(
                                listOf(Color(0xFF1A0A10), Color(0xFF12151C), Color(0xFF0A0C12))
                            ),
                            RoundedCornerShape(16.dp)
                        )
                        .padding(28.dp)
                ) {
                    Column(Modifier.align(Alignment.BottomStart)) {
                        Text(
                            "À LA UNE",
                            color = BrandRed,
                            style = MaterialTheme.typography.labelMedium
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            hero?.title ?: "Des histoires qui vous captivent.",
                            color = Mist,
                            style = MaterialTheme.typography.headlineLarge
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (hero != null) {
                                listOfNotNull(hero.resumeLabel, hero.year.takeIf { it > 0 }?.toString())
                                    .joinToString(" · ")
                            } else {
                                "Films · Séries · TV en direct"
                            },
                            color = MistMuted,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(Modifier.height(16.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            if (hero != null) {
                                TvActionChip(
                                    label = "▶ Reprendre",
                                    contentDescription = "Reprendre",
                                    onClick = { onOpenContinue(hero) },
                                    accent = true
                                )
                            }
                            TvActionChip(
                                label = "Films",
                                contentDescription = "Films",
                                onClick = { onOpenSection(HubSection.FILMS) }
                            )
                            TvActionChip(
                                label = "Séries",
                                contentDescription = "Séries",
                                onClick = { onOpenSection(HubSection.SERIES) }
                            )
                        }
                    }
                }
            }
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Continuer à regarder",
                        style = MaterialTheme.typography.titleLarge,
                        color = Mist
                    )
                    Text(
                        if (continueWatching.isEmpty()) "Aucun titre commencé"
                        else "Profil · ${profile?.name ?: ""}",
                        style = MaterialTheme.typography.labelMedium,
                        color = MistMuted
                    )
                }
            }
            item {
                if (continueWatching.isEmpty()) {
                    Text(
                        "Regardez un film ou un épisode pour le retrouver ici.",
                        color = MistMuted,
                        style = MaterialTheme.typography.bodyMedium
                    )
                } else {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        items(continueWatching, key = { it.id }) { item ->
                            PosterCard(
                                item = item,
                                onClick = { onOpenContinue(item) },
                                showProgress = true,
                                modifier = Modifier.width(210.dp)
                            )
                        }
                    }
                }
            }
            item {
                Text("Destinations", style = MaterialTheme.typography.titleLarge, color = Mist)
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf(
                        HubSection.LIVE_TV,
                        HubSection.FILMS,
                        HubSection.SERIES,
                        HubSection.SETTINGS
                    ).forEach { section ->
                        TvActionChip(
                            label = section.title,
                            contentDescription = section.title,
                            onClick = { onOpenSection(section) }
                        )
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}

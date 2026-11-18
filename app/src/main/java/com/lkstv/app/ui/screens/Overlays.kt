package com.lkstv.app.ui.screens

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.FakeCatalog
import com.lkstv.app.domain.HomeRowId
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.ProfilePreferences
import com.lkstv.app.domain.ProviderGroup
import com.lkstv.app.ui.components.ProfileAvatarCard
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.ObsidianElevated

@Composable
fun CustomizeMenuOverlay(
    preferences: ProfilePreferences,
    groups: List<ProviderGroup>,
    onClose: () -> Unit,
    onToggleGroup: (String) -> Unit,
    onToggleRow: (HomeRowId) -> Unit,
    onMoveRow: (HomeRowId, Boolean) -> Unit,
    onUnhideItem: (String) -> Unit,
    onManageGroups: (CatalogSectionKey) -> Unit = {}
) {
    BackHandler(onBack = onClose)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.62f)),
        contentAlignment = Alignment.CenterEnd
    ) {
        Column(
            modifier = Modifier
                .fillMaxHeight()
                .width(520.dp)
                .background(ObsidianElevated, RoundedCornerShape(topStart = 18.dp, bottomStart = 18.dp))
                .padding(28.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Personnalisation",
                    style = MaterialTheme.typography.headlineMedium,
                    color = Mist,
                    modifier = Modifier.weight(1f)
                )
                TvActionChip(label = "Fermer", contentDescription = "Fermer le menu", onClick = onClose)
            }
            Text(
                text = "Réglages du profil actif (persistés). Rangées non alimentables restent disponibles à masquer.",
                color = MistMuted,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(18.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    SectionLabel("Groupes visibles (allowlist)")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TvActionChip("TV", "Gérer groupes TV", onClick = {
                            onManageGroups(CatalogSectionKey.TV)
                        })
                        TvActionChip("Films", "Gérer groupes films", onClick = {
                            onManageGroups(CatalogSectionKey.FILMS)
                        })
                        TvActionChip("Séries", "Gérer groupes séries", onClick = {
                            onManageGroups(CatalogSectionKey.SERIES)
                        })
                    }
                }
                item {
                    Spacer(Modifier.height(8.dp))
                    SectionLabel("Masquage ponctuel (legacy)")
                }
                items(groups.take(40), key = { it.id }) { group ->
                    val hidden = group.id in preferences.hiddenGroupIds
                    MenuLine(
                        title = group.name,
                        subtitle = "${group.sourceLabel} · ${if (hidden) "masqué" else "visible"}",
                        actionLabel = if (hidden) "Afficher" else "Masquer",
                        onAction = { onToggleGroup(group.id) }
                    )
                }
                item {
                    Spacer(Modifier.height(8.dp))
                    SectionLabel("Rangées visibles / ordre")
                }
                items(HomeRowId.entries, key = { it.name }) { rowId ->
                    val visible = rowId in preferences.visibleRowIds
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(rowId.label, color = Mist, style = MaterialTheme.typography.titleMedium)
                            Text(
                                text = buildString {
                                    if (!rowId.feedable) append("Non alimentée (pas de faux classement). ")
                                    if (visible) append("Position ${preferences.visibleRowIds.indexOf(rowId) + 1}")
                                    else append("Masquée")
                                },
                                color = MistMuted,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        if (visible) {
                            TvActionChip("↑", "Monter ${rowId.label}", onClick = { onMoveRow(rowId, true) })
                            Spacer(Modifier.width(6.dp))
                            TvActionChip("↓", "Descendre ${rowId.label}", onClick = { onMoveRow(rowId, false) })
                            Spacer(Modifier.width(6.dp))
                        }
                        TvActionChip(
                            label = if (visible) "Masquer" else "Afficher",
                            contentDescription = "Basculer rangée ${rowId.label}",
                            onClick = { onToggleRow(rowId) }
                        )
                    }
                }
                item {
                    Spacer(Modifier.height(8.dp))
                    SectionLabel("Contenus masqués")
                }
                if (preferences.hiddenItemIds.isEmpty()) {
                    item {
                        Text("Aucun titre masqué.", color = MistMuted)
                    }
                } else {
                    items(preferences.hiddenItemIds.toList()) { id ->
                        val title = FakeCatalog.find(id)?.title ?: id
                        MenuLine(
                            title = title,
                            subtitle = id,
                            actionLabel = "Restaurer",
                            onAction = { onUnhideItem(id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileSwitcherOverlay(
    profiles: List<Profile>,
    activeProfileId: String?,
    onSelect: (String) -> Unit,
    onClose: () -> Unit
) {
    BackHandler(onBack = onClose)
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.7f)),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Changer de profil", style = MaterialTheme.typography.headlineLarge, color = Mist)
            Spacer(Modifier.height(8.dp))
            Text("Les préférences restent séparées.", color = MistMuted)
            Spacer(Modifier.height(24.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                profiles.forEach { profile ->
                    ProfileAvatarCard(
                        profile = profile,
                        selected = profile.id == activeProfileId,
                        onClick = { onSelect(profile.id) }
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
            TvActionChip(label = "Annuler", contentDescription = "Fermer", onClick = onClose)
        }
    }
}

@Composable
fun DemoSyncBanner(
    message: String,
    onDismiss: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        contentAlignment = Alignment.BottomCenter
    ) {
        Row(
            modifier = Modifier
                .background(BrandRed.copy(alpha = 0.92f), RoundedCornerShape(14.dp))
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = message,
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f, fill = false)
            )
            Spacer(Modifier.width(16.dp))
            TvActionChip(label = "OK", contentDescription = "Fermer le message démo", onClick = onDismiss)
        }
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(text, color = GoldAccent, style = MaterialTheme.typography.labelLarge)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun MenuLine(
    title: String,
    subtitle: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Mist, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, color = MistMuted, style = MaterialTheme.typography.bodyMedium)
        }
        TvActionChip(actionLabel, actionLabel, onClick = onAction)
    }
}

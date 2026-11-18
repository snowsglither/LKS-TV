package com.lkstv.app.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.EpgChannelRow
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian

@Composable
fun EpgSectionScreen(
    profile: Profile?,
    diagnosis: String,
    hasData: Boolean,
    rows: List<EpgChannelRow>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenLive: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Obsidian)
            .padding(36.dp)
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TvActionChip(label = "Retour", contentDescription = "Retour", onClick = onBack)
            TvActionChip(label = "Profil", contentDescription = "Profil", onClick = onProfile)
            TvActionChip(label = "Menu", contentDescription = "Menu", onClick = onMenu)
            Spacer(Modifier.weight(1f))
            Text(
                profile?.name ?: "Guide TV",
                color = MistMuted,
                style = MaterialTheme.typography.labelLarge
            )
        }
        Spacer(Modifier.height(18.dp))
        Text("Guide TV", color = Mist, style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TvActionChip(label = "Chaînes TV", contentDescription = "Ouvrir TV", onClick = onOpenLive)
            TvActionChip(label = "Actualiser EPG", contentDescription = "Rafraîchir", onClick = onRefresh)
        }
        Spacer(Modifier.height(18.dp))
        if (!hasData) {
            Text(
                "Aucun programme EPG exploitable",
                color = Mist,
                style = MaterialTheme.typography.headlineSmall
            )
            Spacer(Modifier.height(8.dp))
            Text(
                diagnosis.ifBlank {
                    "Le fournisseur n’a fourni aucun guide (short_epg vide / XMLTV inaccessible). Aucun programme inventé."
                },
                color = MistMuted,
                style = MaterialTheme.typography.bodyLarge
            )
        } else {
            Text(
                "${rows.count { it.hasEpg }} / ${rows.size} chaînes avec programmes · données fournisseur uniquement",
                color = MistMuted,
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(Modifier.height(12.dp))
            LazyColumn(
                contentPadding = PaddingValues(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                items(rows, key = { it.channelId }) { row ->
                    Column(Modifier.fillMaxWidth()) {
                        Text(row.title, color = Mist, style = MaterialTheme.typography.titleMedium)
                        if (row.currentTitle != null) {
                            Text(
                                "Maintenant · ${row.currentTitle}",
                                color = Mist,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            if (!row.currentDescription.isNullOrBlank()) {
                                Text(
                                    row.currentDescription,
                                    color = MistMuted,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        } else {
                            Text(
                                "Pas d’émission courante",
                                color = MistMuted,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                        if (row.nextTitle != null) {
                            Text(
                                "Ensuite · ${row.nextTitle}",
                                color = MistMuted,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }
    }
}

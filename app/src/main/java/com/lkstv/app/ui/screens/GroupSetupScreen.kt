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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.CatalogSectionKey
import com.lkstv.app.domain.GroupSelection
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.SelectableGroup
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted

@Composable
fun GroupSetupScreen(
    section: CatalogSectionKey,
    manage: Boolean,
    profile: Profile?,
    groups: List<SelectableGroup>,
    initialSelected: Set<String>,
    onSave: (Set<String>) -> Unit,
    onCancel: () -> Unit
) {
    var query by remember(section, manage) { mutableStateOf("") }
    var selected by remember(section, manage, initialSelected) {
        mutableStateOf(if (manage) initialSelected else emptySet())
    }
    val filtered = remember(groups, query) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) groups
        else groups.filter {
            it.name.lowercase().contains(q) || it.sourceLabel.lowercase().contains(q)
        }
    }
    val filterActive = query.isNotBlank()
    val listState = rememberLazyListState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 40.dp, vertical = 24.dp)
    ) {
        Text(
            text = profile?.name?.uppercase() ?: "PROFIL",
            style = MaterialTheme.typography.labelMedium,
            color = BrandRed
        )
        Text(
            text = GroupSelection.setupTitle(section),
            style = MaterialTheme.typography.headlineLarge,
            color = Mist
        )
        Text(
            text = GroupSelection.setupDescription(section),
            style = MaterialTheme.typography.bodyLarge,
            color = MistMuted,
            modifier = Modifier.padding(top = 6.dp, bottom = 16.dp)
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = if (query.isEmpty()) "Filtre rapide :" else "Filtre : $query",
                color = MistMuted
            )
            listOf("a", "e", "f", "m", "s", "t").forEach { ch ->
                TvActionChip(
                    label = ch.uppercase(),
                    contentDescription = "Filtrer $ch",
                    onClick = { query = ch }
                )
            }
            TvActionChip(
                label = "Effacer",
                contentDescription = "Effacer filtre",
                onClick = { query = "" }
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "${selected.size} sélectionné${if (selected.size == 1) "" else "s"}",
                color = Mist,
                style = MaterialTheme.typography.titleMedium
            )
        }

        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TvActionChip(
                label = if (filterActive) "Tout sélectionner (filtrés)" else "Tout sélectionner",
                contentDescription = "Tout sélectionner",
                onClick = {
                    selected = selected + filtered.map { it.id }.toSet()
                }
            )
            TvActionChip(
                label = if (filterActive) "Tout désélectionner (filtrés)" else "Tout désélectionner",
                contentDescription = "Tout désélectionner",
                onClick = {
                    val drop = filtered.map { it.id }.toSet()
                    selected = selected.filterNot { it in drop }.toSet()
                }
            )
        }

        Spacer(Modifier.height(12.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(filtered, key = { it.id }) { group ->
                val on = group.id in selected
                TvActionChip(
                    label = buildString {
                        append(if (on) "✓ " else "○ ")
                        append(group.name)
                        if (group.sourceLabel.isNotBlank()) append(" · ${group.sourceLabel}")
                        if (group.count > 0) append(" (${group.count})")
                    },
                    contentDescription = group.name,
                    onClick = {
                        selected = if (on) selected - group.id else selected + group.id
                    },
                    modifier = Modifier.fillMaxWidth()
                )
            }
            if (filtered.isEmpty()) {
                item {
                    Text(
                        text = "Aucun groupe pour ce filtre.",
                        color = MistMuted,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "${filtered.size} / ${groups.size} groupes",
                color = MistMuted,
                modifier = Modifier.weight(1f)
            )
            TvActionChip(
                label = if (manage) "Annuler" else "Plus tard",
                contentDescription = "Annuler",
                onClick = onCancel
            )
            TvActionChip(
                label = "Enregistrer et continuer",
                contentDescription = "Enregistrer et continuer",
                onClick = { onSave(selected) },
                accent = true
            )
        }
    }
}

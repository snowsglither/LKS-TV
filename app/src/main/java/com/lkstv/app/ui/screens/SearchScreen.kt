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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.SearchFilter
import com.lkstv.app.domain.SearchHit
import com.lkstv.app.domain.SearchPage
import com.lkstv.app.ui.components.PosterCard
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian
import com.lkstv.app.ui.theme.ObsidianElevated
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color

@Composable
fun SearchScreen(
    profile: Profile?,
    query: String,
    filter: SearchFilter,
    page: SearchPage?,
    suggestions: List<CatalogItem>,
    onQueryChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onFilter: (SearchFilter) -> Unit,
    onBack: () -> Unit,
    onOpenItem: (CatalogItem) -> Unit,
    onLoadMore: () -> Unit
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Obsidian)
            .padding(horizontal = 36.dp, vertical = 18.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TvActionChip(label = "←", contentDescription = "Retour", onClick = onBack)
            Spacer(Modifier.width(16.dp))
            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(ObsidianElevated)
                    .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("⌕", color = MistMuted, style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.width(12.dp))
                BasicTextField(
                    value = query,
                    onValueChange = onQueryChange,
                    singleLine = true,
                    cursorBrush = SolidColor(Mist),
                    textStyle = MaterialTheme.typography.titleLarge.copy(color = Mist),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(focusRequester)
                        .semantics { contentDescription = "Champ de recherche" },
                    decorationBox = { inner ->
                        if (query.isEmpty()) {
                            Text(
                                "Titres, genres, métadonnées…",
                                style = MaterialTheme.typography.titleLarge,
                                color = MistMuted
                            )
                        }
                        inner()
                    }
                )
            }
            if (profile != null) {
                Spacer(Modifier.width(16.dp))
                Text(profile.name, color = MistMuted, style = MaterialTheme.typography.bodyMedium)
            }
        }

        Spacer(Modifier.height(14.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SearchFilter.entries.forEach { f ->
                val label = when (f) {
                    SearchFilter.ALL -> "Tout"
                    SearchFilter.FILMS -> "Films"
                    SearchFilter.SERIES -> "Séries"
                    SearchFilter.TV -> "Chaînes TV"
                }
                TvActionChip(
                    label = label,
                    contentDescription = "Filtre $label",
                    onClick = { onFilter(f) },
                    accent = filter == f
                )
            }
        }

        Spacer(Modifier.height(12.dp))

        val hits = page?.hits.orEmpty()
        val total = page?.total ?: 0
        val showIdle = query.isBlank()

        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 160.dp),
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 40.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (showIdle) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        "Saisissez un titre — catalogue indexé localement. D-pad pour le champ, OK pour valider.",
                        color = MistMuted,
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
                if (suggestions.isNotEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            "Suggestions",
                            color = MistMuted,
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    items(suggestions, key = { it.id }) { item ->
                        PosterCard(item = item, onClick = { onOpenItem(item) })
                    }
                }
            } else {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        text = buildString {
                            append("$total résultat")
                            if (total != 1) append('s')
                            append(" pertinent")
                            if (total != 1) append('s')
                            page?.tookMs?.let { append(" · ${it} ms") }
                        },
                        color = MistMuted,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                if (hits.isEmpty()) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text("Aucun résultat pour cette recherche.", color = MistMuted)
                    }
                } else {
                    val sections = page?.sections
                    if (filter == SearchFilter.ALL && sections != null &&
                        (sections.best.isNotEmpty() || sections.films.isNotEmpty() ||
                            sections.series.isNotEmpty() || sections.tv.isNotEmpty())
                    ) {
                        fun section(title: String, list: List<CatalogItem>) {
                            if (list.isEmpty()) return
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                Text(
                                    title,
                                    color = Mist,
                                    style = MaterialTheme.typography.titleLarge,
                                    modifier = Modifier.padding(top = 8.dp)
                                )
                            }
                            items(list, key = { "sec-$title-${it.id}" }) { item ->
                                PosterCard(item = item, onClick = { onOpenItem(item) })
                            }
                        }
                        section("Meilleure correspondance", sections.best)
                        section("Films", sections.films)
                        section("Séries", sections.series)
                        section("Chaînes TV", sections.tv)
                    } else {
                        items(hits, key = { it.item.id }) { hit ->
                            SearchResultCard(hit = hit, onOpen = onOpenItem)
                        }
                    }
                    if ((page?.offset ?: 0) + hits.size < total) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            TvActionChip(
                                label = "Charger plus (${(page?.offset ?: 0) + hits.size}/$total)",
                                contentDescription = "Charger plus de résultats",
                                onClick = onLoadMore,
                                accent = true
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultCard(hit: SearchHit, onOpen: (CatalogItem) -> Unit) {
    Column {
        PosterCard(item = hit.item, onClick = { onOpen(hit.item) })
        val caption = buildString {
            if (hit.isLive) append("TV")
            if (hit.matchLabel.isNotBlank()) {
                if (isNotEmpty()) append(" · ")
                append(hit.matchLabel)
            }
        }
        if (caption.isNotBlank()) {
            Text(
                text = caption,
                color = GoldAccent,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

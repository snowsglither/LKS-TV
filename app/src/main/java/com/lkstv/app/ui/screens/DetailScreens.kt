package com.lkstv.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import androidx.compose.foundation.BorderStroke
import coil.compose.AsyncImage
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.Episode
import com.lkstv.app.domain.EpisodeProgress
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.components.SectionScaffold
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.ObsidianElevated

private enum class DetailTab { OVERVIEW, EPISODES, DETAILS }

/** Hide technical merge labels — only real age / score tags. */
internal fun userFacingRating(label: String): String? {
    val t = label.trim()
    if (t.isEmpty()) return null
    if (t.equals("Source", true) || t.contains("version", true) || t.contains("Fusion", true)) {
        return null
    }
    return t
}

internal fun episodeSpecificSynopsis(episodeSynopsis: String, seriesSynopsis: String): String {
    val ep = episodeSynopsis.trim()
    if (ep.isEmpty()) return ""
    val series = seriesSynopsis.trim()
    if (series.isNotEmpty() && ep.equals(series, ignoreCase = true)) return ""
    return ep
}

@Composable
fun FilmDetailScreen(
    item: CatalogItem,
    profile: Profile?,
    syncing: Boolean,
    isFavorite: Boolean,
    isWatchLater: Boolean,
    related: List<CatalogItem>,
    sequels: List<CatalogItem>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onToggleFavorite: () -> Unit,
    onToggleWatchLater: () -> Unit,
    onOpenItem: (CatalogItem) -> Unit,
    onHideItem: () -> Unit,
    onSelectVersion: (String) -> Unit = {},
    onPlay: () -> Unit = {}
) {
    var moreOpen by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(DetailTab.OVERVIEW) }
    SectionScaffold(
        title = item.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        contentPadding = PaddingValues(0.dp)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 48.dp)
        ) {
            item {
                DetailHero(
                    item = item,
                    playLabel = if (item.progressFraction > 0.02f && item.progressFraction < 0.92f) {
                        "Reprendre"
                    } else {
                        "Lecture"
                    },
                    isFavorite = isFavorite,
                    isWatchLater = isWatchLater,
                    moreOpen = moreOpen,
                    onPlay = onPlay,
                    onToggleFavorite = onToggleFavorite,
                    onToggleWatchLater = onToggleWatchLater,
                    onToggleMore = { moreOpen = !moreOpen },
                    onHideItem = onHideItem,
                    onSelectVersion = onSelectVersion
                )
            }
            item {
                DetailTabRow(
                    tabs = listOf(DetailTab.OVERVIEW, DetailTab.DETAILS),
                    selected = tab,
                    onSelect = { tab = it },
                    series = false
                )
            }
            when (tab) {
                DetailTab.OVERVIEW -> {
                    item {
                        OverviewBlock(item)
                    }
                    if (sequels.isNotEmpty()) {
                        item {
                            Spacer(Modifier.height(20.dp))
                            CatalogRow("Suites", sequels, onOpenItem)
                        }
                    }
                    if (related.isNotEmpty()) {
                        item {
                            Spacer(Modifier.height(16.dp))
                            CatalogRow("Similaires", related, onOpenItem)
                        }
                    }
                }
                DetailTab.DETAILS -> item { DetailsMetaBlock(item) }
                DetailTab.EPISODES -> Unit
            }
        }
    }
}

@Composable
fun SeriesDetailScreen(
    item: CatalogItem,
    profile: Profile?,
    syncing: Boolean,
    isFavorite: Boolean,
    isWatchLater: Boolean,
    selectedSeasonIndex: Int,
    onSelectSeason: (Int) -> Unit,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onToggleFavorite: () -> Unit,
    onToggleWatchLater: () -> Unit,
    onHideItem: () -> Unit,
    onSelectVersion: (String) -> Unit = {},
    onPlay: () -> Unit = {},
    onPlayEpisode: (Episode) -> Unit = {}
) {
    var moreOpen by remember { mutableStateOf(false) }
    var tab by remember { mutableStateOf(DetailTab.EPISODES) }
    val season = item.seasons.getOrNull(selectedSeasonIndex)
    val resumeEpisode = season?.episodes?.firstOrNull {
        it.watchState == EpisodeProgress.WatchState.IN_PROGRESS
    } ?: season?.episodes?.firstOrNull {
        it.watchState != EpisodeProgress.WatchState.COMPLETED
    }

    SectionScaffold(
        title = item.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        contentPadding = PaddingValues(0.dp)
    ) {
        LazyColumn(contentPadding = PaddingValues(bottom = 48.dp)) {
            item {
                DetailHero(
                    item = item,
                    playLabel = if (resumeEpisode != null) {
                        "Reprendre S${season?.number}:E${resumeEpisode.number}"
                    } else {
                        "Lecture"
                    },
                    isFavorite = isFavorite,
                    isWatchLater = isWatchLater,
                    moreOpen = moreOpen,
                    onPlay = onPlay,
                    onToggleFavorite = onToggleFavorite,
                    onToggleWatchLater = onToggleWatchLater,
                    onToggleMore = { moreOpen = !moreOpen },
                    onHideItem = onHideItem,
                    onSelectVersion = onSelectVersion
                )
            }
            item {
                DetailTabRow(
                    tabs = listOf(DetailTab.OVERVIEW, DetailTab.EPISODES, DetailTab.DETAILS),
                    selected = tab,
                    onSelect = { tab = it },
                    series = true
                )
            }
            when (tab) {
                DetailTab.OVERVIEW -> item { OverviewBlock(item) }
                DetailTab.DETAILS -> item { DetailsMetaBlock(item) }
                DetailTab.EPISODES -> {
                    item {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = "Saisons",
                            style = MaterialTheme.typography.titleMedium,
                            color = MistMuted,
                            modifier = Modifier.padding(horizontal = 48.dp)
                        )
                        Spacer(Modifier.height(10.dp))
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 40.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            itemsIndexed(item.seasons) { index, s ->
                                SeasonCard(
                                    title = s.title,
                                    episodeCount = s.episodes.size,
                                    selected = index == selectedSeasonIndex,
                                    onClick = { onSelectSeason(index) }
                                )
                            }
                        }
                    }
                    if (season != null) {
                        item {
                            Spacer(Modifier.height(18.dp))
                            Text(
                                text = "Épisodes · ${season.title}",
                                style = MaterialTheme.typography.titleLarge,
                                color = Mist,
                                modifier = Modifier.padding(horizontal = 48.dp)
                            )
                            Spacer(Modifier.height(10.dp))
                        }
                        items(season.episodes, key = { it.id }) { episode ->
                            EpisodeRow(
                                episode = episode.copy(seasonNumber = season.number),
                                seriesSynopsis = item.synopsis,
                                backdropColor = item.backdropColor,
                                posterColor = item.posterColor,
                                fallbackThumbUrl = item.backdropUrl ?: item.posterUrl,
                                onPlay = { ep ->
                                    onPlayEpisode(ep.copy(seasonNumber = season.number))
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailTabRow(
    tabs: List<DetailTab>,
    selected: DetailTab,
    onSelect: (DetailTab) -> Unit,
    series: Boolean
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 48.dp, vertical = 18.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        tabs.forEach { t ->
            val label = when (t) {
                DetailTab.OVERVIEW -> "Aperçu"
                DetailTab.EPISODES -> "Épisodes"
                DetailTab.DETAILS -> "Détails"
            }
            RectAction(
                label = label,
                accent = t == selected,
                onClick = { onSelect(t) }
            )
        }
        if (!series) Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun OverviewBlock(item: CatalogItem) {
    Column(Modifier.padding(horizontal = 48.dp, vertical = 4.dp)) {
        Text("Synopsis", style = MaterialTheme.typography.titleMedium, color = MistMuted)
        Spacer(Modifier.height(8.dp))
        Text(
            text = item.synopsis,
            style = MaterialTheme.typography.bodyLarge,
            color = Mist,
            lineHeight = 26.sp
        )
        if (item.versions.isNotEmpty()) {
            Spacer(Modifier.height(20.dp))
            Text("Langues disponibles", style = MaterialTheme.typography.titleMedium, color = MistMuted)
            Spacer(Modifier.height(8.dp))
            Text(
                text = item.versions.joinToString(" · ") { it.label },
                style = MaterialTheme.typography.bodyLarge,
                color = Mist
            )
        }
    }
}

@Composable
private fun DetailsMetaBlock(item: CatalogItem) {
    val rows = buildList {
        if (item.year > 0) add("Année" to item.year.toString())
        item.durationMinutes?.takeIf { it > 0 }?.let { add("Durée" to "$it min") }
        if (item.type == ContentType.SERIES && item.seasons.isNotEmpty()) {
            add("Saisons" to item.seasons.size.toString())
            add("Épisodes" to item.seasons.sumOf { it.episodes.size }.toString())
        }
        userFacingRating(item.ratingLabel)?.let { add("Classification" to it) }
        if (item.genres.isNotEmpty()) add("Genres" to item.genres.joinToString(", "))
        if (item.versions.isNotEmpty()) {
            add("Éditions" to item.versions.joinToString(", ") { it.label })
        }
    }
    Column(Modifier.padding(horizontal = 48.dp, vertical = 8.dp)) {
        if (rows.isEmpty()) {
            Text(
                "Aucune métadonnée supplémentaire fournie par la source.",
                color = MistMuted,
                style = MaterialTheme.typography.bodyLarge
            )
        } else {
            rows.forEach { (k, v) ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    Text(
                        k,
                        color = MistMuted,
                        style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.width(140.dp)
                    )
                    Text(v, color = Mist, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

@Composable
private fun DetailHero(
    item: CatalogItem,
    playLabel: String,
    isFavorite: Boolean,
    isWatchLater: Boolean,
    moreOpen: Boolean,
    onPlay: () -> Unit,
    onToggleFavorite: () -> Unit,
    onToggleWatchLater: () -> Unit,
    onToggleMore: () -> Unit,
    onHideItem: () -> Unit,
    onSelectVersion: (String) -> Unit
) {
    val backdrop = item.backdropUrl?.takeIf { it.isNotBlank() } ?: item.posterUrl
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(520.dp)
            .background(Color(0xFF050507))
    ) {
        if (!backdrop.isNullOrBlank()) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxSize()
                    .align(Alignment.CenterEnd)
            )
        } else {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                Color(0xFF050507),
                                Color(item.backdropColor).copy(alpha = 0.85f),
                                Color(item.posterColor).copy(alpha = 0.55f)
                            )
                        )
                    )
            )
        }
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.horizontalGradient(
                        0f to Color(0xF2050507),
                        0.42f to Color(0xCC050507),
                        0.72f to Color(0x66050507),
                        1f to Color(0x33050507)
                    )
                )
        )
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0x66050507),
                        0.45f to Color.Transparent,
                        1f to Color(0xF2050507)
                    )
                )
        )
        Row(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(horizontal = 48.dp, vertical = 28.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp),
            verticalAlignment = Alignment.Bottom
        ) {
            Box(
                modifier = Modifier
                    .width(220.dp)
                    .height(330.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(item.posterColor))
            ) {
                if (!item.posterUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = item.posterUrl,
                        contentDescription = item.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.title,
                    style = MaterialTheme.typography.displayLarge,
                    color = Mist,
                    fontWeight = FontWeight.ExtraBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(10.dp))
                MetaLine(item)
                Spacer(Modifier.height(12.dp))
                Text(
                    text = item.synopsis,
                    style = MaterialTheme.typography.bodyLarge,
                    color = Mist.copy(alpha = 0.92f),
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth(0.9f)
                )
                Spacer(Modifier.height(16.dp))
                if (item.versions.size > 1) {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(item.versions, key = { it.id }) { version ->
                            RectAction(
                                label = version.label,
                                accent = version.id == item.selectedVersionId,
                                onClick = { onSelectVersion(version.id) }
                            )
                        }
                    }
                    if (item.hasUnknownLanguageVersion) {
                        Text(
                            text = "Certaines éditions ont une langue inconnue.",
                            color = GoldAccent,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    RectAction(label = playLabel, accent = true, onClick = onPlay)
                    RectAction(
                        label = if (isFavorite) "Favoris ✓" else "Favoris",
                        onClick = onToggleFavorite
                    )
                    RectAction(
                        label = if (isWatchLater) "Ma liste ✓" else "Ma liste",
                        onClick = onToggleWatchLater
                    )
                    RectAction(
                        label = if (moreOpen) "Moins" else "Plus…",
                        onClick = onToggleMore
                    )
                }
                if (moreOpen) {
                    Spacer(Modifier.height(10.dp))
                    RectAction(label = "Masquer", onClick = onHideItem)
                }
            }
        }
    }
}

@Composable
private fun MetaLine(item: CatalogItem) {
    val bits = listOfNotNull(
        item.year.takeIf { it > 0 }?.toString(),
        item.durationMinutes?.takeIf { it > 0 }?.let { "$it min" }
            ?: item.seasons.takeIf { it.isNotEmpty() }?.let { "${it.size} saison${if (it.size > 1) "s" else ""}" },
        userFacingRating(item.ratingLabel),
        item.genres.take(3).joinToString(" · ").ifBlank { null }
    )
    if (bits.isEmpty()) return
    Text(
        text = bits.joinToString("  ·  "),
        style = MaterialTheme.typography.bodyLarge,
        color = GoldAccent,
        fontWeight = FontWeight.SemiBold
    )
}

@Composable
fun RectAction(
    label: String,
    onClick: () -> Unit,
    accent: Boolean = false,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(10.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (accent) BrandRed else Color.White.copy(alpha = 0.08f),
            focusedContainerColor = if (accent) Color(0xFFFF2848) else Color.White.copy(alpha = 0.16f),
            contentColor = Color.White,
            focusedContentColor = Color.White
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(
                BorderStroke(1.dp, Color.White.copy(alpha = if (accent) 0.2f else 0.12f)),
                shape = RoundedCornerShape(10.dp)
            ),
            focusedBorder = Border(
                BorderStroke(2.dp, if (accent) Color.White else BrandRed),
                shape = RoundedCornerShape(10.dp)
            )
        )
    ) {
        Text(
            label,
            Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun SeasonCard(
    title: String,
    episodeCount: Int,
    selected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(10.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (selected) BrandRed.copy(alpha = 0.22f) else ObsidianElevated,
            focusedContainerColor = BrandRed.copy(alpha = 0.28f)
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(
                BorderStroke(1.dp, if (selected) BrandRed.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.1f)),
                shape = RoundedCornerShape(10.dp)
            ),
            focusedBorder = Border(
                BorderStroke(2.dp, BrandRed),
                shape = RoundedCornerShape(10.dp)
            )
        )
    ) {
        Column(modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, color = Mist)
            Spacer(Modifier.height(4.dp))
            Text(
                text = "$episodeCount épisodes",
                style = MaterialTheme.typography.bodyMedium,
                color = if (selected) GoldAccent else MistMuted
            )
        }
    }
}

@Composable
private fun EpisodeRow(
    episode: Episode,
    @Suppress("UNUSED_PARAMETER") seriesSynopsis: String,
    backdropColor: Long,
    posterColor: Long,
    fallbackThumbUrl: String? = null,
    onPlay: (Episode) -> Unit
) {
    val watch = episode.watchState
    val thumb = episode.thumbUrl?.takeIf { it.isNotBlank() } ?: fallbackThumbUrl
    val listLabel = DisplayMeta.formatEpisodeListLabel(episode.title, episode.number)

    Surface(
        onClick = { onPlay(episode) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 40.dp, vertical = 4.dp),
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(10.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.White.copy(alpha = 0.04f),
            focusedContainerColor = BrandRed.copy(alpha = 0.18f)
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.015f),
        border = ClickableSurfaceDefaults.border(
            border = Border(
                BorderStroke(1.dp, Color.White.copy(alpha = 0.08f)),
                shape = RoundedCornerShape(10.dp)
            ),
            focusedBorder = Border(
                BorderStroke(2.dp, BrandRed),
                shape = RoundedCornerShape(10.dp)
            )
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .width(160.dp)
                    .height(90.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(Color(backdropColor), Color(posterColor))
                        )
                    ),
                contentAlignment = Alignment.BottomStart
            ) {
                if (!thumb.isNullOrBlank()) {
                    AsyncImage(
                        model = thumb,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                }
                when (watch) {
                    EpisodeProgress.WatchState.COMPLETED -> {
                        Text(
                            text = "Vu",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(6.dp)
                                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 7.dp, vertical = 2.dp)
                        )
                    }
                    EpisodeProgress.WatchState.IN_PROGRESS -> {
                        Box(
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .fillMaxWidth()
                                .height(3.dp)
                                .background(Color.White.copy(alpha = 0.2f))
                        ) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth(episode.progressFraction.coerceIn(0f, 1f))
                                    .height(3.dp)
                                    .background(BrandRed)
                            )
                        }
                    }
                    EpisodeProgress.WatchState.NONE -> Unit
                }
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    text = listLabel,
                    style = MaterialTheme.typography.titleMedium,
                    color = Mist,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (watch == EpisodeProgress.WatchState.IN_PROGRESS) {
                    Spacer(Modifier.height(4.dp))
                    Text("Reprendre", color = BrandRed, style = MaterialTheme.typography.labelLarge)
                }
            }
            if (episode.durationMinutes > 0) {
                Text("${episode.durationMinutes} min", color = MistMuted)
            }
        }
    }
}

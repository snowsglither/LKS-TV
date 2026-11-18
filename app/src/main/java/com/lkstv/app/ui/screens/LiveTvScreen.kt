package com.lkstv.app.ui.screens

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.lkstv.app.domain.CatalogScreenEmptyReason
import com.lkstv.app.domain.LiveChannelRef
import com.lkstv.app.domain.LiveGroupRef
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian
import com.lkstv.app.ui.theme.ObsidianElevated

@Composable
fun LiveTvScreen(
    profile: Profile?,
    groups: List<LiveGroupRef>,
    channels: List<LiveChannelRef>,
    channelTotal: Int,
    selectedGroupId: String,
    selectedChannelId: String?,
    hasMore: Boolean,
    groupEmpty: CatalogScreenEmptyReason = CatalogScreenEmptyReason.NONE,
    previewUrl: String? = null,
    previewStatus: String = "",
    onBack: () -> Unit,
    onSelectGroup: (String) -> Unit,
    onSelectChannel: (LiveChannelRef) -> Unit,
    onPlay: (LiveChannelRef) -> Unit,
    onLoadMore: () -> Unit,
    onManageGroups: () -> Unit = {},
    onToggleFavorite: (String) -> Unit = {},
    onDisposePreview: () -> Unit = {}
) {
    val selected = channels.firstOrNull { it.id == selectedChannelId } ?: channels.firstOrNull()
    Column(
        Modifier
            .fillMaxSize()
            .background(Obsidian)
            .padding(horizontal = 16.dp, vertical = 14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TvActionChip(label = "←", contentDescription = "Retour", onClick = onBack)
            Spacer(Modifier.width(12.dp))
            Text("TV en direct", style = MaterialTheme.typography.headlineMedium, color = Mist)
            Spacer(Modifier.weight(1f))
            TvActionChip(
                label = "Gérer mes groupes",
                contentDescription = "Gérer mes groupes",
                onClick = onManageGroups
            )
            Spacer(Modifier.width(12.dp))
            Text(
                "${channelTotal} chaînes · ${profile?.name ?: ""}",
                color = MistMuted,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        Spacer(Modifier.height(12.dp))
        if (groupEmpty != CatalogScreenEmptyReason.NONE) {
            Column(Modifier.padding(32.dp)) {
                Text(
                    text = if (groupEmpty == CatalogScreenEmptyReason.NEEDS_GROUP_SETUP)
                        "Choisissez vos chaînes"
                    else
                        "Aucun groupe sélectionné",
                    style = MaterialTheme.typography.headlineMedium,
                    color = Mist
                )
                Spacer(Modifier.height(8.dp))
                Text(
                    text = if (groupEmpty == CatalogScreenEmptyReason.NEEDS_GROUP_SETUP)
                        "Sélectionnez les groupes TV visibles pour ce profil."
                    else
                        "Aucune chaîne n’est affichée tant qu’aucun groupe n’est coché.",
                    color = MistMuted
                )
                Spacer(Modifier.height(16.dp))
                TvActionChip(
                    label = "Choisir mes groupes",
                    contentDescription = "Choisir mes groupes",
                    onClick = onManageGroups,
                    accent = true
                )
            }
            return
        }
        Row(
            Modifier
                .fillMaxSize()
                .weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // ~16% groups
            LazyColumn(
                Modifier
                    .weight(0.16f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ObsidianElevated)
                    .padding(6.dp)
            ) {
                items(groups, key = { it.id }) { g ->
                    Surface(
                        onClick = { onSelectGroup(g.id) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = if (g.id == selectedGroupId) BrandRed.copy(alpha = 0.25f) else Color.Transparent,
                            focusedContainerColor = Mist.copy(alpha = 0.15f)
                        ),
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp))
                    ) {
                        Row(
                            Modifier.padding(horizontal = 10.dp, vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                g.name,
                                color = Mist,
                                style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.weight(1f),
                                maxLines = 2
                            )
                            Text(
                                "${g.count}",
                                color = MistMuted,
                                style = MaterialTheme.typography.labelMedium
                            )
                        }
                    }
                }
            }
            // ~27% channels
            LazyColumn(
                Modifier
                    .weight(0.27f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ObsidianElevated)
                    .padding(6.dp)
            ) {
                items(channels, key = { it.id }) { ch ->
                    Surface(
                        onClick = { onSelectChannel(ch) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = if (ch.id == selected?.id) BrandRed.copy(alpha = 0.22f) else Color.Transparent,
                            focusedContainerColor = Mist.copy(alpha = 0.12f)
                        ),
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp))
                    ) {
                        Row(
                            Modifier.padding(9.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (!ch.logoUrl.isNullOrBlank()) {
                                AsyncImage(
                                    model = ch.logoUrl,
                                    contentDescription = null,
                                    modifier = Modifier
                                        .size(34.dp)
                                        .clip(RoundedCornerShape(6.dp)),
                                    contentScale = ContentScale.Fit
                                )
                            } else {
                                Box(
                                    Modifier
                                        .size(34.dp)
                                        .background(Color(0xFF1A1D24), RoundedCornerShape(6.dp))
                                )
                            }
                            Spacer(Modifier.width(10.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    ch.title,
                                    color = Mist,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 1
                                )
                                Text(
                                    "EPG — bientôt",
                                    color = MistMuted,
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                            if (ch.isFavorite) {
                                Text("★", color = GoldAccent, fontSize = 13.sp)
                            }
                        }
                    }
                }
                if (hasMore) {
                    item {
                        TvActionChip(
                            label = "Charger plus",
                            contentDescription = "Charger plus de chaînes",
                            onClick = onLoadMore,
                            modifier = Modifier.padding(8.dp)
                        )
                    }
                }
            }
            // ~57% preview — dominant visual
            Column(
                Modifier
                    .weight(0.57f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ObsidianElevated)
                    .padding(12.dp)
            ) {
                if (selected != null) {
                    LivePreviewPlayer(
                        previewUrl = previewUrl,
                        status = previewStatus,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f)
                            .clip(RoundedCornerShape(12.dp))
                    )
                    DisposableEffect(Unit) {
                        onDispose { onDisposePreview() }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (!selected.logoUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = selected.logoUrl,
                                contentDescription = null,
                                modifier = Modifier
                                    .size(48.dp)
                                    .clip(RoundedCornerShape(10.dp)),
                                contentScale = ContentScale.Fit
                            )
                            Spacer(Modifier.width(12.dp))
                        }
                        Column(Modifier.weight(1f)) {
                            Text(
                                selected.title,
                                color = Mist,
                                style = MaterialTheme.typography.headlineSmall,
                                maxLines = 1
                            )
                            Spacer(Modifier.height(4.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "LIVE",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    modifier = Modifier
                                        .background(BrandRed, RoundedCornerShape(999.dp))
                                        .padding(horizontal = 8.dp, vertical = 2.dp)
                                )
                                Spacer(Modifier.width(10.dp))
                                Text(
                                    previewStatus.ifBlank { "Aperçu · OK = plein écran" },
                                    color = MistMuted,
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        TvActionChip(
                            label = if (selected.isFavorite) "★ Favori" else "☆ Favori",
                            contentDescription = "Favori",
                            onClick = { onToggleFavorite(selected.id) }
                        )
                        TvActionChip(
                            label = "Plein écran",
                            contentDescription = "Lire en plein écran",
                            onClick = { onPlay(selected) },
                            accent = true
                        )
                    }
                } else {
                    Text("Sélectionnez une chaîne", color = MistMuted)
                }
            }
        }
    }
}

@Composable
private fun LivePreviewPlayer(
    previewUrl: String?,
    status: String,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var muted by remember { mutableStateOf(true) }
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            volume = 0f
            playWhenReady = true
            repeatMode = Player.REPEAT_MODE_OFF
        }
    }
    DisposableEffect(player) {
        onDispose { player.release() }
    }
    LaunchedEffect(previewUrl) {
        if (previewUrl.isNullOrBlank()) {
            player.stop()
            player.clearMediaItems()
        } else {
            player.setMediaItem(MediaItem.fromUri(previewUrl))
            player.prepare()
        }
    }
    LaunchedEffect(muted) {
        player.volume = if (muted) 0f else 1f
    }
    Box(modifier.background(Color(0xFF050607))) {
        if (!previewUrl.isNullOrBlank()) {
            AndroidView(
                factory = { ctx ->
                    PlayerView(ctx).apply {
                        useController = false
                        resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                        this.player = player
                        layoutParams = FrameLayout.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT
                        )
                    }
                },
                modifier = Modifier.fillMaxSize(),
                update = { it.player = player }
            )
        }
        Text(
            text = status.ifBlank { if (previewUrl.isNullOrBlank()) "Aperçu…" else "Chargement…" },
            color = Mist,
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(10.dp)
                .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(6.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp)
        )
        Surface(
            onClick = { muted = !muted },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(10.dp),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = Color.Black.copy(alpha = 0.55f),
                focusedContainerColor = BrandRed.copy(alpha = 0.55f)
            ),
            shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp))
        ) {
            Text(
                if (muted) "🔇" else "🔊",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                color = Mist
            )
        }
    }
}

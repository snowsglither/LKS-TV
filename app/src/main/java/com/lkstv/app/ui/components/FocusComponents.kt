package com.lkstv.app.ui.components

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.lkstv.app.domain.CatalogItem
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.FocusGlow
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.ObsidianElevated

@Composable
fun LksTopBar(
    title: String,
    profile: Profile?,
    showBack: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    syncing: Boolean,
    refreshLabel: String = "Actualiser",
    refreshContentDescription: String = "Actualiser le catalogue",
    onSearch: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 36.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showBack) {
            TvActionChip(
                label = "←",
                contentDescription = "Retour",
                onClick = onBack
            )
            Spacer(Modifier.width(16.dp))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = Mist,
            modifier = Modifier.weight(1f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        if (onSearch != null) {
            TvActionChip(
                label = "⌕",
                contentDescription = "Rechercher",
                onClick = onSearch
            )
            Spacer(Modifier.width(10.dp))
        }
        TvActionChip(
            label = if (syncing) "Sync…" else refreshLabel,
            contentDescription = refreshContentDescription,
            onClick = onRefresh
        )
        Spacer(Modifier.width(10.dp))
        TvActionChip(
            label = "Personnaliser",
            contentDescription = "Menu de personnalisation",
            onClick = onMenu
        )
        Spacer(Modifier.width(10.dp))
        if (profile != null) {
            Surface(
                onClick = onProfile,
                modifier = Modifier
                    .size(44.dp)
                    .semantics { contentDescription = "Profil ${profile.name}" },
                shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(8.dp)),
                scale = ClickableSurfaceDefaults.scale(focusedScale = 1.1f),
                colors = ClickableSurfaceDefaults.colors(
                    containerColor = Color(profile.avatarColor),
                    focusedContainerColor = Color(profile.avatarColor)
                ),
                border = ClickableSurfaceDefaults.border(
                    focusedBorder = Border(
                        border = BorderStroke(3.dp, FocusGlow),
                        shape = RoundedCornerShape(8.dp)
                    )
                )
            ) {}
        } else {
            TvActionChip(
                label = "Profil",
                contentDescription = "Changer de profil",
                onClick = onProfile,
                accent = true
            )
        }
    }
}

@Composable
fun TvActionChip(
    label: String,
    contentDescription: String,
    onClick: () -> Unit,
    accent: Boolean = false,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        modifier = modifier.semantics { this.contentDescription = contentDescription },
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(10.dp)),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = if (accent) BrandRed.copy(alpha = 0.22f) else ObsidianElevated,
            focusedContainerColor = if (accent) BrandRed else FocusGlow,
            pressedContainerColor = GoldAccent,
            contentColor = Mist,
            focusedContentColor = if (accent) Color.White else Color.Black
        ),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
        border = ClickableSurfaceDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, BrandRed),
                shape = RoundedCornerShape(10.dp)
            )
        )
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

@Composable
fun PosterCard(
    item: CatalogItem,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    showProgress: Boolean = false
) {
    Surface(
        onClick = onClick,
        modifier = modifier
            .width(190.dp)
            .semantics { contentDescription = item.title },
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(10.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color(item.posterColor),
            focusedContainerColor = Color(item.posterColor),
            pressedContainerColor = Color(item.posterColor)
        ),
        border = ClickableSurfaceDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, FocusGlow),
                shape = RoundedCornerShape(10.dp)
            )
        ),
        glow = ClickableSurfaceDefaults.glow(
            focusedGlow = Glow(
                elevationColor = FocusGlow.copy(alpha = 0.28f),
                elevation = 10.dp
            )
        )
    ) {
        Box(
            modifier = Modifier
                .height(285.dp) // 190 × 1.5 ≈ 2:3
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(item.posterColor), Color.Black.copy(alpha = 0.78f))
                    )
                )
        ) {
            val art = item.posterUrl
            if (!art.isNullOrBlank()) {
                AsyncImage(
                    model = art,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize()
                )
            }
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.82f))
                        )
                    )
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(12.dp),
                verticalArrangement = Arrangement.Bottom
            ) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleMedium,
                    color = Mist,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = item.resumeLabel
                        ?: item.remainingMinutes?.let { "$it min restantes" }
                        ?: item.year.takeIf { it > 0 }?.toString()
                        ?: "",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MistMuted
                )
                if (showProgress && item.progressFraction > 0f) {
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(Color.White.copy(alpha = 0.2f))
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth(item.progressFraction.coerceIn(0f, 1f))
                                .height(4.dp)
                                .background(BrandRed)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun CinematicHero(
    item: CatalogItem,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    actionLabel: String = "Voir la fiche"
) {
    Surface(
        onClick = onOpen,
        modifier = modifier
            .fillMaxWidth()
            .height(380.dp) // ~35% of 1080p TV height; compact billboard
            .semantics { contentDescription = "Bannière ${item.title}" },
        shape = ClickableSurfaceDefaults.shape(shape = RoundedCornerShape(14.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.015f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color(item.backdropColor),
            focusedContainerColor = Color(item.backdropColor)
        ),
        border = ClickableSurfaceDefaults.border(
            focusedBorder = Border(
                border = BorderStroke(2.dp, FocusGlow),
                shape = RoundedCornerShape(14.dp)
            )
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(380.dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(Color(item.backdropColor), Color(item.posterColor), Color.Black)
                    )
                )
        ) {
            Box(
                Modifier
                    .matchParentSize()
                    .background(
                        Brush.verticalGradient(
                            listOf(Color.Transparent, Color.Black.copy(alpha = 0.72f))
                        )
                    )
            )
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(horizontal = 28.dp, vertical = 22.dp)
                    .fillMaxWidth(0.55f)
            ) {
                Text("À la une", style = MaterialTheme.typography.labelLarge, color = GoldAccent)
                Spacer(Modifier.height(6.dp))
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.headlineLarge,
                    color = Mist,
                    maxLines = 2
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = item.synopsis,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MistMuted,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                Spacer(Modifier.height(12.dp))
                Text(
                    text = "$actionLabel · ${item.genres.joinToString(" · ")} · ${item.year}",
                    style = MaterialTheme.typography.labelLarge,
                    color = Mist
                )
            }
        }
    }
}

@Composable
fun ProfileAvatarCard(
    profile: Profile,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(16.dp)
    Surface(
        onClick = onClick,
        modifier = modifier.semantics { contentDescription = "Profil ${profile.name}" },
        shape = ClickableSurfaceDefaults.shape(shape = shape),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = ObsidianElevated,
            focusedContainerColor = Color(profile.avatarColor).copy(alpha = 0.28f)
        ),
        border = ClickableSurfaceDefaults.border(
            border = Border(
                border = BorderStroke(
                    width = if (selected) 2.dp else 1.dp,
                    color = if (selected) GoldAccent else Color.Transparent
                ),
                shape = shape
            ),
            focusedBorder = Border(border = BorderStroke(3.dp, FocusGlow), shape = shape)
        )
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(Color(profile.avatarColor)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = profile.name.take(1),
                    style = MaterialTheme.typography.headlineLarge,
                    color = Color.White
                )
            }
            Spacer(Modifier.height(14.dp))
            Text(profile.name, style = MaterialTheme.typography.titleLarge, color = Mist)
            if (selected) {
                Text("Actif", style = MaterialTheme.typography.bodyMedium, color = GoldAccent)
            }
        }
    }
}

@Composable
fun SectionScaffold(
    title: String,
    profile: Profile?,
    syncing: Boolean,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    refreshLabel: String = "Actualiser",
    onSearch: (() -> Unit)? = null,
    contentPadding: PaddingValues = PaddingValues(bottom = 32.dp),
    content: @Composable () -> Unit
) {
    Column(Modifier.fillMaxWidth()) {
        LksTopBar(
            title = title,
            profile = profile,
            showBack = true,
            onBack = onBack,
            onRefresh = onRefresh,
            onProfile = onProfile,
            onMenu = onMenu,
            syncing = syncing,
            refreshLabel = refreshLabel,
            onSearch = onSearch
        )
        Box(Modifier.padding(contentPadding)) {
            content()
        }
    }
}

package com.lkstv.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Glow
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import com.lkstv.app.domain.Profile
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.FocusGlow
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian

@Composable
fun ProfilesScreen(
    profiles: List<Profile>,
    activeProfileId: String?,
    onSelect: (String) -> Unit,
    onAddProfile: () -> Unit = {},
    onManageProfiles: () -> Unit = onAddProfile
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFF2A1014), Obsidian),
                    radius = 1100f
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "LKS TV",
                color = BrandRed,
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = 4.sp
            )
            Spacer(Modifier.height(18.dp))
            Text("Qui regarde ?", style = MaterialTheme.typography.displayLarge, color = Mist)
            Spacer(Modifier.height(8.dp))
            Text(
                text = "Favoris, groupes, historique et progression restent liés à chaque profil.",
                style = MaterialTheme.typography.bodyLarge,
                color = MistMuted
            )
            Spacer(Modifier.height(40.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                profiles.forEach { profile ->
                    ProfileGateCard(
                        profile = profile,
                        selected = profile.id == activeProfileId,
                        onClick = { onSelect(profile.id) }
                    )
                }
                ProfileAddCard(onClick = onAddProfile)
            }
            Spacer(Modifier.height(36.dp))
            Surface(
                onClick = onManageProfiles,
                shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
                scale = ClickableSurfaceDefaults.scale(focusedScale = 1.05f),
                colors = ClickableSurfaceDefaults.colors(
                    containerColor = Color.White.copy(alpha = 0.06f),
                    focusedContainerColor = Color.White.copy(alpha = 0.12f),
                    contentColor = Mist,
                    focusedContentColor = Color.White
                ),
                border = ClickableSurfaceDefaults.border(
                    focusedBorder = Border(
                        border = BorderStroke(2.dp, FocusGlow),
                        shape = RoundedCornerShape(12.dp)
                    )
                )
            ) {
                Text(
                    "Gérer les profils",
                    Modifier.padding(horizontal = 22.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }
    }
}

@Composable
private fun ProfileAddCard(onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            onClick = onClick,
            modifier = Modifier
                .size(152.dp)
                .semantics { contentDescription = "Ajouter un profil" },
            shape = ClickableSurfaceDefaults.shape(shape = shape),
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = Color(0xFF15171E),
                focusedContainerColor = Color(0xFF1E212A),
                contentColor = MistMuted,
                focusedContentColor = Mist
            ),
            border = ClickableSurfaceDefaults.border(
                border = Border(border = BorderStroke(2.dp, Color(0xFF444444)), shape = shape),
                focusedBorder = Border(border = BorderStroke(2.dp, FocusGlow), shape = shape)
            )
        ) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("+", fontSize = 48.sp, color = MistMuted, fontWeight = FontWeight.Light)
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("Ajouter un profil", style = MaterialTheme.typography.titleLarge, color = Mist)
    }
}

@Composable
private fun ProfileGateCard(
    profile: Profile,
    selected: Boolean,
    onClick: () -> Unit
) {
    val shape = RoundedCornerShape(16.dp)
    val accent = Color(profile.avatarColor)
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Surface(
            onClick = onClick,
            modifier = Modifier
                .size(152.dp)
                .semantics { contentDescription = "Profil ${profile.name}" },
            shape = ClickableSurfaceDefaults.shape(shape = shape),
            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
            colors = ClickableSurfaceDefaults.colors(
                containerColor = Color.Transparent,
                focusedContainerColor = Color.Transparent
            ),
            border = ClickableSurfaceDefaults.border(
                focusedBorder = Border(border = BorderStroke(2.dp, FocusGlow), shape = shape),
                border = if (selected) {
                    Border(border = BorderStroke(1.dp, MistMuted.copy(alpha = 0.5f)), shape = shape)
                } else {
                    Border(border = BorderStroke(0.dp, Color.Transparent), shape = shape)
                }
            ),
            glow = ClickableSurfaceDefaults.glow(
                focusedGlow = Glow(elevationColor = FocusGlow.copy(alpha = 0.28f), elevation = 10.dp)
            )
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Brush.linearGradient(listOf(accent, Color(0xFF14080A)))),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .offset(y = 28.dp)
                        .size(width = 96.dp, height = 58.dp)
                        .background(Color.White.copy(alpha = 0.9f), RoundedCornerShape(50))
                )
                Box(
                    modifier = Modifier
                        .offset(y = (-18).dp)
                        .size(52.dp)
                        .background(Color.White.copy(alpha = 0.92f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = profile.name.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineMedium,
                        color = accent
                    )
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(profile.name, style = MaterialTheme.typography.titleLarge, color = Mist)
    }
}

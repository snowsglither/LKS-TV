package com.lkstv.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian

@Composable
fun UpdateAvailableDialog(
    versionName: String,
    changelog: String?,
    downloadProgress: Float?,
    onUpdate: () -> Unit,
    onLater: () -> Unit,
    onChangelog: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.72f)),
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 640.dp)
                .background(Obsidian, RoundedCornerShape(18.dp))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "Mise à jour disponible — LKS TV $versionName",
                style = MaterialTheme.typography.headlineMedium,
                color = Mist
            )
            Text(
                "Téléchargement HTTPS, vérification SHA-256, puis confirmation Android. " +
                    "Profils, sources et progressions sont conservés (même applicationId).",
                color = MistMuted,
                style = MaterialTheme.typography.bodyMedium
            )
            if (!changelog.isNullOrBlank()) {
                Text(changelog, color = GoldAccent, style = MaterialTheme.typography.bodyMedium)
            }
            if (downloadProgress != null) {
                Text(
                    "Téléchargement ${(downloadProgress * 100).toInt()} %",
                    color = GoldAccent
                )
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(6.dp)
                        .background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(4.dp))
                ) {
                    Box(
                        Modifier
                            .fillMaxWidth(downloadProgress.coerceIn(0f, 1f))
                            .height(6.dp)
                            .background(GoldAccent, RoundedCornerShape(4.dp))
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TvActionChip(
                    label = "Mettre à jour",
                    contentDescription = "Télécharger et installer la mise à jour",
                    onClick = onUpdate,
                    accent = true
                )
                TvActionChip(
                    label = "Plus tard",
                    contentDescription = "Reporter la mise à jour",
                    onClick = onLater
                )
                TvActionChip(
                    label = "Nouveautés",
                    contentDescription = "Afficher le journal des nouveautés",
                    onClick = onChangelog
                )
            }
        }
    }
}

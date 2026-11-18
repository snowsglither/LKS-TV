package com.lkstv.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.domain.HubSection
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.Profile
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.ui.components.SectionScaffold
import com.lkstv.app.ui.components.TvActionChip
import com.lkstv.app.ui.theme.GoldAccent
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted

@Composable
fun SettingsSectionScreen(
    profile: Profile?,
    syncing: Boolean,
    reduceMotion: Boolean,
    preferredAudioLanguage: String,
    preferredSubtitleLanguage: String,
    interfaceLanguage: String,
    sources: List<IptvSource>,
    iptvTitleCount: Int,
    sourceActionMessage: String?,
    refreshLabel: String,
    appVersionLabel: String,
    updateCheckMessage: String?,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onProfile: () -> Unit,
    onMenu: () -> Unit,
    onReduceMotionChange: (Boolean) -> Unit,
    onPreferredAudioLanguage: (String) -> Unit,
    onPreferredSubtitleLanguage: (String) -> Unit,
    onInterfaceLanguage: (String) -> Unit,
    onToggleSource: (String) -> Unit,
    onRemoveSource: (String) -> Unit,
    onImportSample: () -> Unit,
    onAddXtream: (displayName: String, serverUrl: String, username: String, password: String) -> Unit,
    onAddM3uUrl: (displayName: String, playlistUrl: String) -> Unit,
    onDismissSourceMessage: () -> Unit,
    onCancelSync: () -> Unit,
    onCheckUpdate: () -> Unit,
    onManageGroups: (com.lkstv.app.domain.CatalogSectionKey) -> Unit = {}
) {
    var xtreamName by remember { mutableStateOf("") }
    var xtreamUrl by remember { mutableStateOf("") }
    var xtreamUser by remember { mutableStateOf("") }
    var xtreamPass by remember { mutableStateOf("") }
    var m3uName by remember { mutableStateOf("") }
    var m3uUrl by remember { mutableStateOf("") }

    SectionScaffold(
        title = HubSection.SETTINGS.title,
        profile = profile,
        syncing = syncing,
        onBack = onBack,
        onRefresh = onRefresh,
        onProfile = onProfile,
        onMenu = onMenu,
        refreshLabel = refreshLabel,
        contentPadding = PaddingValues(0.dp)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 48.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Text("Sources IPTV (appareil)", style = MaterialTheme.typography.headlineMedium, color = Mist)
                Text(
                    text = "Connexion Xtream / M3U directe depuis la TV. Identifiants en coffre Keystore. " +
                        "Aucune dépendance localhost / web-preview.",
                    color = MistMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "Catalogue unifié: $iptvTitleCount titre(s).",
                    color = GoldAccent,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            item {
                Text("Ajouter Xtream Codes", style = MaterialTheme.typography.titleLarge, color = Mist)
                Spacer(Modifier.height(6.dp))
                SettingsField("Nom", xtreamName) { xtreamName = it }
                SettingsField("URL serveur", xtreamUrl) { xtreamUrl = it }
                SettingsField("Identifiant", xtreamUser) { xtreamUser = it }
                SettingsField("Mot de passe", xtreamPass) { xtreamPass = it }
                Spacer(Modifier.height(8.dp))
                TvActionChip(
                    label = "Valider et enregistrer Xtream",
                    contentDescription = "Ajouter une source Xtream après authentification",
                    onClick = {
                        onAddXtream(xtreamName, xtreamUrl, xtreamUser, xtreamPass)
                        xtreamPass = ""
                    },
                    accent = true
                )
            }
            item {
                Text("Ajouter M3U (URL)", style = MaterialTheme.typography.titleLarge, color = Mist)
                Spacer(Modifier.height(6.dp))
                SettingsField("Nom", m3uName) { m3uName = it }
                SettingsField("URL playlist", m3uUrl) { m3uUrl = it }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    TvActionChip(
                        label = "Valider et enregistrer M3U",
                        contentDescription = "Ajouter une playlist M3U après vérification",
                        onClick = { onAddM3uUrl(m3uName, m3uUrl) },
                        accent = true
                    )
                    TvActionChip(
                        label = "Importer sample M3U",
                        contentDescription = "Importer la playlist d'exemple locale",
                        onClick = onImportSample
                    )
                    if (syncing) {
                        TvActionChip(
                            label = "Annuler sync",
                            contentDescription = "Annuler la synchronisation",
                            onClick = onCancelSync
                        )
                    }
                }
            }
            item {
                Text("Groupes du profil", style = MaterialTheme.typography.titleLarge, color = Mist)
                Text(
                    "Sélection indépendante TV / Films / Séries pour ce profil.",
                    color = MistMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    TvActionChip(
                        label = "Groupes TV",
                        contentDescription = "Gérer groupes TV",
                        onClick = { onManageGroups(com.lkstv.app.domain.CatalogSectionKey.TV) }
                    )
                    TvActionChip(
                        label = "Groupes films",
                        contentDescription = "Gérer groupes films",
                        onClick = { onManageGroups(com.lkstv.app.domain.CatalogSectionKey.FILMS) }
                    )
                    TvActionChip(
                        label = "Groupes séries",
                        contentDescription = "Gérer groupes séries",
                        onClick = { onManageGroups(com.lkstv.app.domain.CatalogSectionKey.SERIES) }
                    )
                }
            }
            if (sourceActionMessage != null) {
                item {
                    Text(sourceActionMessage, color = GoldAccent)
                    TvActionChip("OK", "Fermer le message", onClick = onDismissSourceMessage)
                }
            }
            if (sources.isEmpty()) {
                item {
                    Text(
                        "Aucune source IPTV. Ajoutez Xtream ou M3U (validation réelle requise). " +
                            "Sans source validée, le mode démo UI reste disponible côté web-preview uniquement.",
                        color = MistMuted
                    )
                }
            } else {
                items(sources, key = { it.id.value }) { source ->
                    SourceRow(
                        source = source,
                        onToggle = { onToggleSource(source.id.value) },
                        onRemove = { onRemoveSource(source.id.value) }
                    )
                }
            }
            item {
                Spacer(Modifier.height(16.dp))
                Text("Profil actif", style = MaterialTheme.typography.titleLarge, color = Mist)
                Text(
                    "Audio préféré: ${LanguageCodes.displayName(preferredAudioLanguage)}. " +
                        "Toutes les pistes et versions restent disponibles dans le lecteur.",
                    color = MistMuted
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LanguageCodes.preferredChoices().take(8).forEach { (tag, label) ->
                        TvActionChip(
                            label = label,
                            contentDescription = "Audio $label",
                            onClick = { onPreferredAudioLanguage(tag) },
                            accent = LanguageCodes.normalize(preferredAudioLanguage) ==
                                LanguageCodes.normalize(tag)
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Sous-titres préférés: ${LanguageCodes.displayName(preferredSubtitleLanguage)}",
                    color = MistMuted
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf("fr", "nl", "en", "ar", "tr", "pt", "ja", "de").forEach { tag ->
                        TvActionChip(
                            label = LanguageCodes.displayName(tag, useful = false),
                            contentDescription = "Sous-titres $tag",
                            onClick = { onPreferredSubtitleLanguage(tag) },
                            accent = LanguageCodes.normalize(preferredSubtitleLanguage) == tag
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "Interface: ${LanguageCodes.displayName(interfaceLanguage)}",
                    color = MistMuted
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf("fr", "nl", "en").forEach { tag ->
                        TvActionChip(
                            label = LanguageCodes.displayName(tag, useful = false),
                            contentDescription = "Interface $tag",
                            onClick = { onInterfaceLanguage(tag) },
                            accent = LanguageCodes.normalize(interfaceLanguage) == tag
                        )
                    }
                }
            }
            item {
                Spacer(Modifier.height(12.dp))
                Text("Accessibilité", style = MaterialTheme.typography.titleLarge, color = Mist)
                Spacer(Modifier.height(8.dp))
                TvActionChip(
                    label = if (reduceMotion) "Animations : réduites" else "Animations : normales",
                    contentDescription = "Basculer la réduction de mouvement",
                    onClick = { onReduceMotionChange(!reduceMotion) }
                )
            }
            item {
                Spacer(Modifier.height(16.dp))
                Text("À propos", style = MaterialTheme.typography.titleLarge, color = Mist)
                Text("LKS TV $appVersionLabel", color = MistMuted)
                Text(
                    "Mises à jour via manifeste HTTPS public (jamais de token GitHub dans l’APK).",
                    color = MistMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
                if (updateCheckMessage != null) {
                    Text(updateCheckMessage, color = GoldAccent, modifier = Modifier.padding(top = 6.dp))
                }
                Spacer(Modifier.height(8.dp))
                TvActionChip(
                    label = "Rechercher une mise à jour",
                    contentDescription = "Vérifier s’il existe une nouvelle version",
                    onClick = onCheckUpdate,
                    accent = true
                )
            }
        }
    }
}

@Composable
private fun SettingsField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    Column(Modifier.padding(vertical = 4.dp)) {
        Text(label, color = MistMuted, style = MaterialTheme.typography.bodyMedium)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            cursorBrush = SolidColor(Mist),
            textStyle = MaterialTheme.typography.titleMedium.copy(color = Mist),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
                .background(Color.White.copy(alpha = 0.06f), RoundedCornerShape(10.dp))
                .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(10.dp))
                .padding(horizontal = 14.dp, vertical = 12.dp),
            decorationBox = { inner ->
                if (value.isEmpty()) {
                    Text(label, color = MistMuted.copy(alpha = 0.55f))
                }
                inner()
            }
        )
    }
}

@Composable
private fun SourceRow(
    source: IptvSource,
    onToggle: () -> Unit,
    onRemove: () -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(source.displayName, color = Mist, style = MaterialTheme.typography.titleLarge)
        Text(
            text = "${source.kind} · ${if (source.enabled) "activée" else "désactivée"}" +
                (source.usernameHint.takeIf { it.isNotBlank() }?.let { " · $it" } ?: "") +
                (source.lastError?.let { " · erreur" } ?: ""),
            color = MistMuted,
            style = MaterialTheme.typography.bodyMedium
        )
        if (!source.lastError.isNullOrBlank()) {
            Text(source.lastError, color = GoldAccent, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TvActionChip(
                label = if (source.enabled) "Désactiver" else "Activer",
                contentDescription = "Activer ou désactiver la source",
                onClick = onToggle
            )
            TvActionChip(
                label = "Supprimer",
                contentDescription = "Supprimer la source et ses secrets",
                onClick = onRemove
            )
        }
    }
}

package com.lkstv.app.ui.screens

import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.tv.material3.Border
import androidx.tv.material3.ClickableSurfaceDefaults
import androidx.tv.material3.Surface
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.lkstv.app.domain.DisplayMeta
import com.lkstv.app.domain.EditionLanguageOption
import com.lkstv.app.domain.Episode
import com.lkstv.app.domain.EpisodeProgress
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.Season
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.Mist
import com.lkstv.app.ui.theme.MistMuted
import com.lkstv.app.ui.theme.Obsidian
import kotlinx.coroutines.delay

private val GlassBorder = Color.White.copy(alpha = 0.21f)
private val GlassFill = Color.White.copy(alpha = 0.05f)
private val RailBg = Color.White.copy(alpha = 0.35f)
private val RailLoaded = Color.White.copy(alpha = 0.25f)

private enum class SettingsTab { AUDIO, SUBTITLES, QUALITY, SPEED, INFO }

private data class PlayerTrackOption(
    val type: @C.TrackType Int,
    val groupIndex: Int,
    val trackIndex: Int,
    val label: String,
    val selected: Boolean
)

@Composable
fun PlayerScreen(
    title: String,
    playUrl: String?,
    diagnosticLabel: String,
    errorMessage: String?,
    isLive: Boolean = false,
    preferredAudioLanguage: String = "edition:vf",
    preferredSubtitleLanguage: String = "fr",
    /** Absolute resume position from confirmed prior playback (0 = start). */
    initialPositionMs: Long = 0L,
    editionLanguages: List<EditionLanguageOption> = emptyList(),
    onSwitchEdition: ((EditionLanguageOption, positionMs: Long) -> Unit)? = null,
    /** Series only — empty for films / live. */
    seriesSeasons: List<Season> = emptyList(),
    seriesSynopsis: String = "",
    currentSeason: Int? = null,
    currentEpisode: Int? = null,
    onPlayEpisode: ((Episode) -> Unit)? = null,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    onPrevious: (() -> Unit)? = null,
    onNext: (() -> Unit)? = null,
    onProgress: ((fraction: Float, positionMs: Long, durationMs: Long) -> Unit)? = null
) {
    val context = LocalContext.current
    var status by remember { mutableStateOf(errorMessage ?: "Préparation Media3…") }
    var playingConfirmed by remember { mutableStateOf(false) }
    var buffering by remember { mutableStateOf(false) }
    var positionMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    var bufferedFraction by remember { mutableFloatStateOf(0f) }
    var showControls by remember { mutableStateOf(true) }
    var showSettings by remember { mutableStateOf(false) }
    var showEpisodes by remember { mutableStateOf(false) }
    var settingsTab by remember { mutableStateOf(SettingsTab.AUDIO) }
    var developerMode by remember { mutableStateOf(false) }
    var playbackSpeed by remember { mutableFloatStateOf(1f) }
    var audioCount by remember { mutableStateOf(0) }
    var textCount by remember { mutableStateOf(0) }
    var audioOptions by remember { mutableStateOf<List<PlayerTrackOption>>(emptyList()) }
    var textOptions by remember { mutableStateOf<List<PlayerTrackOption>>(emptyList()) }
    var videoOptions by remember { mutableStateOf<List<PlayerTrackOption>>(emptyList()) }
    var hasError by remember { mutableStateOf(!errorMessage.isNullOrBlank()) }
    var isPlayingUi by remember { mutableStateOf(false) }
    var muted by remember { mutableStateOf(false) }
    var episodeSeasonIndex by remember(currentSeason, seriesSeasons) {
        val idx = seriesSeasons.indexOfFirst { it.number == currentSeason }.takeIf { it >= 0 } ?: 0
        mutableIntStateOf(idx)
    }
    val isSeries = !isLive && seriesSeasons.isNotEmpty() && onPlayEpisode != null

    BackHandler {
        when {
            showEpisodes -> showEpisodes = false
            showSettings -> showSettings = false
            showControls && playingConfirmed -> showControls = false
            else -> onBack()
        }
    }

    val player = remember {
        ExoPlayer.Builder(context)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
            .apply {
                playWhenReady = true
                trackSelectionParameters = trackSelectionParameters
                    .buildUpon()
                    .setPreferredAudioLanguage(
                        preferredAudioLanguage
                            .removePrefix("edition:")
                            .let { if (it == "vf") "fr" else it }
                            .takeIf { it.isNotBlank() && !it.startsWith("vo") && it != "multi" }
                    )
                    .setPreferredTextLanguage(
                        preferredSubtitleLanguage.takeIf { it.isNotBlank() }
                    )
                    .build()
            }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlaybackStateChanged(playbackState: Int) {
                buffering = playbackState == Player.STATE_BUFFERING
                status = when (playbackState) {
                    Player.STATE_BUFFERING -> "Chargement…"
                    Player.STATE_READY -> {
                        playingConfirmed = true
                        hasError = false
                        ""
                    }
                    Player.STATE_ENDED -> "Fin du flux"
                    else -> status
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                isPlayingUi = isPlaying
                if (isPlaying) {
                    playingConfirmed = true
                    hasError = false
                } else if (playingConfirmed && !isLive && onProgress != null) {
                    val dur = player.duration
                    if (dur > 5_000) {
                        val pos = player.currentPosition.coerceAtLeast(0L)
                        onProgress((pos.toFloat() / dur).coerceIn(0f, 0.999f), pos, dur)
                    }
                }
            }

            override fun onTracksChanged(tracks: Tracks) {
                val audio = mutableListOf<PlayerTrackOption>()
                val text = mutableListOf<PlayerTrackOption>()
                val video = mutableListOf<PlayerTrackOption>()
                tracks.groups.forEachIndexed { gi, group ->
                    for (i in 0 until group.length) {
                        val format = group.getTrackFormat(i)
                        val opt = when (group.type) {
                            C.TRACK_TYPE_AUDIO, C.TRACK_TYPE_TEXT -> {
                                val raw = format.language ?: format.label
                                val label = LanguageCodes.displayName(raw, useful = false)
                                    .ifBlank { format.label?.takeIf { it.isNotBlank() } ?: "Piste ${i + 1}" }
                                PlayerTrackOption(group.type, gi, i, label, group.isTrackSelected(i))
                            }
                            C.TRACK_TYPE_VIDEO -> {
                                val h = format.height.takeIf { it > 0 }
                                val br = format.bitrate.takeIf { it > 0 }
                                val label = when {
                                    h != null && br != null -> "${h}p · ${br / 1000} kb/s"
                                    h != null -> "${h}p"
                                    br != null -> "${br / 1000} kb/s"
                                    !format.label.isNullOrBlank() -> format.label!!
                                    else -> "Variante ${i + 1}"
                                }
                                PlayerTrackOption(group.type, gi, i, label, group.isTrackSelected(i))
                            }
                            else -> null
                        } ?: continue
                        when (group.type) {
                            C.TRACK_TYPE_AUDIO -> audio += opt
                            C.TRACK_TYPE_TEXT -> text += opt
                            C.TRACK_TYPE_VIDEO -> video += opt
                        }
                    }
                }
                audioOptions = audio
                textOptions = text
                videoOptions = video
                audioCount = audio.size
                textCount = text.size
            }

            override fun onPlayerError(error: PlaybackException) {
                playingConfirmed = false
                isPlayingUi = false
                hasError = true
                status = when (error.errorCode) {
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
                    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
                    PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
                        "Erreur réseau temporaire. Réessayez."
                    else ->
                        "Lecture impossible sur cet appareil (${error.errorCodeName})."
                }
                showControls = true
            }
        }
        player.addListener(listener)
        onDispose {
            // Only persist when playback was actually confirmed (not a failed open/decode).
            if (!isLive && onProgress != null && playingConfirmed) {
                val dur = player.duration
                if (dur > 5_000) {
                    val pos = player.currentPosition.coerceAtLeast(0L)
                    onProgress((pos.toFloat() / dur).coerceIn(0f, 0.999f), pos, dur)
                }
            }
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(playUrl, initialPositionMs) {
        playingConfirmed = false
        if (playUrl.isNullOrBlank()) {
            status = errorMessage ?: "URL de lecture indisponible"
            hasError = true
            return@LaunchedEffect
        }
        status = "Connexion…"
        hasError = false
        player.setMediaItem(MediaItem.fromUri(playUrl))
        player.prepare()
        if (!isLive && initialPositionMs > 1_000L) {
            // Wait briefly for duration, then seek with margin already applied by caller.
            var waits = 0
            while (waits < 40 && (player.duration <= 0 || player.duration == C.TIME_UNSET)) {
                delay(250)
                waits++
            }
            val dur = player.duration
            if (dur > 5_000 && initialPositionMs < dur - 1_000L) {
                player.seekTo(initialPositionMs.coerceAtLeast(0L))
            }
        }
        delay(18_000)
        if (!playingConfirmed && player.playbackState != Player.STATE_READY) {
            status =
                "Délai 18s — démarrage non confirmé. Format/upstream/fournisseur."
            hasError = true
            player.stop()
            showControls = true
        }
    }

    LaunchedEffect(player, isLive) {
        var lastSaved = 0L
        while (true) {
            positionMs = player.currentPosition.coerceAtLeast(0L)
            durationMs = player.duration.takeIf { it > 0 } ?: C.TIME_UNSET
            bufferedFraction = player.bufferedPercentage.coerceIn(0, 100) / 100f
            if (!isLive &&
                onProgress != null &&
                playingConfirmed &&
                durationMs != C.TIME_UNSET &&
                durationMs > 5_000
            ) {
                val now = System.currentTimeMillis()
                if (now - lastSaved > 5_000) {
                    lastSaved = now
                    onProgress(
                        (positionMs.toFloat() / durationMs).coerceIn(0f, 0.999f),
                        positionMs,
                        durationMs
                    )
                }
            }
            delay(500)
        }
    }

    LaunchedEffect(showControls, playingConfirmed, showSettings, showEpisodes, isPlayingUi) {
        if (showControls && playingConfirmed && isPlayingUi && !showSettings && !showEpisodes && !hasError) {
            delay(3500)
            showControls = false
        }
    }

    val progressFraction =
        if (!isLive && durationMs != C.TIME_UNSET && durationMs > 0) {
            (positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
        } else 0f

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Obsidian)
    ) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    useController = false
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    this.player = player
                    setOnClickListener {
                        showControls = !showControls
                    }
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = { it.player = player }
        )

        // Cinematic top/bottom gradient (V3 art:after + bottom fade)
        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color(0xC2020306),
                        0.28f to Color.Transparent,
                        0.45f to Color.Transparent,
                        0.70f to Color(0x70020306),
                        1f to Color(0xF5050609)
                    )
                )
        )

        if (showControls) {
            Column(Modifier.fillMaxSize()) {
                // —— TOP ——
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 48.dp, vertical = 28.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            onClick = {
                                when {
                                    showSettings -> showSettings = false
                                    else -> onBack()
                                }
                            },
                            modifier = Modifier.size(43.dp),
                            shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(12.dp)),
                            scale = ClickableSurfaceDefaults.scale(focusedScale = 1.06f),
                            colors = ClickableSurfaceDefaults.colors(
                                containerColor = GlassFill,
                                focusedContainerColor = Color.White.copy(alpha = 0.14f),
                                contentColor = Mist,
                                focusedContentColor = Color.White
                            ),
                            border = ClickableSurfaceDefaults.border(
                                border = Border(
                                    border = BorderStroke(1.dp, GlassBorder),
                                    shape = RoundedCornerShape(12.dp)
                                ),
                                focusedBorder = Border(
                                    border = BorderStroke(2.dp, Color.White),
                                    shape = RoundedCornerShape(12.dp)
                                )
                            )
                        ) {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Text("←", color = Mist, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.width(20.dp))
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "LKS TV",
                                    color = Color(0xFFF21B39),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    letterSpacing = 2.sp
                                )
                                Text(
                                    "  / PLAYER",
                                    color = Color(0xFF999999),
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                title,
                                color = Mist,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold,
                                letterSpacing = (-0.5).sp
                            )
                            Text(
                                if (isLive) "Télévision en direct" else if (status.isBlank()) "Lecture" else status,
                                color = Color(0xFFC6C8D1),
                                fontSize = 12.sp
                            )
                        }
                    }
                    if (isLive) {
                        Text(
                            "EN DIRECT",
                            color = Color.White,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.ExtraBold,
                            letterSpacing = 1.5.sp,
                            modifier = Modifier
                                .background(BrandRed, RoundedCornerShape(8.dp))
                                .padding(horizontal = 13.dp, vertical = 9.dp)
                        )
                    }
                }

                Spacer(Modifier.weight(1f))

                // —— CENTER ——
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isLive && onPrevious != null) {
                        SkipColumn(label = "CHAÎNE −", onClick = { showControls = true; onPrevious() })
                    } else if (!isLive) {
                        SkipColumn(label = "−10 SEC", onClick = { showControls = true; player.seekBack() })
                    } else {
                        Spacer(Modifier.width(64.dp))
                    }

                    Spacer(Modifier.width(28.dp))

                    Surface(
                        onClick = {
                            showControls = true
                            when {
                                hasError -> onRetry()
                                player.isPlaying -> player.pause()
                                else -> player.play()
                            }
                        },
                        modifier = Modifier.size(96.dp),
                        shape = ClickableSurfaceDefaults.shape(CircleShape),
                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = if (hasError) Color(0xFF2A2D38) else BrandRed,
                            focusedContainerColor = if (hasError) Color(0xFF3A3D48) else Color(0xFFFF2848),
                            contentColor = Color.White,
                            focusedContentColor = Color.White
                        ),
                        border = ClickableSurfaceDefaults.border(
                            border = Border(
                                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.31f)),
                                shape = CircleShape
                            ),
                            focusedBorder = Border(
                                border = BorderStroke(2.dp, Color.White),
                                shape = CircleShape
                            )
                        )
                    ) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            if (buffering && !playingConfirmed && !hasError) {
                                Canvas(Modifier.size(36.dp)) {
                                    drawArc(
                                        color = Color.White.copy(alpha = 0.25f),
                                        startAngle = 0f,
                                        sweepAngle = 360f,
                                        useCenter = false,
                                        style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                                    )
                                    drawArc(
                                        color = Color.White,
                                        startAngle = -90f,
                                        sweepAngle = 110f,
                                        useCenter = false,
                                        style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
                                    )
                                }
                            } else {
                                Text(
                                    when {
                                        hasError -> "▶"
                                        isPlayingUi && playingConfirmed -> "❚❚"
                                        else -> "▶"
                                    },
                                    color = Color.White,
                                    fontSize = 28.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(Modifier.width(28.dp))

                    if (isLive && onNext != null) {
                        SkipColumn(label = "CHAÎNE +", onClick = { showControls = true; onNext() })
                    } else if (!isLive) {
                        SkipColumn(label = "+10 SEC", onClick = { showControls = true; player.seekForward() })
                    } else {
                        Spacer(Modifier.width(64.dp))
                    }
                }

                Spacer(Modifier.weight(1f))

                // —— BOTTOM ——
                Column(
                    Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                listOf(Color.Transparent, Color(0xBF030408), Color(0xF5030408))
                            )
                        )
                        .padding(start = 48.dp, end = 48.dp, top = 72.dp, bottom = 36.dp)
                ) {
                    if (isLive) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier
                                    .size(9.dp)
                                    .clip(CircleShape)
                                    .background(BrandRed)
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                if (buffering) "EN DIRECT · buffering…" else "EN DIRECT",
                                color = Mist,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(title, color = MistMuted, fontSize = 13.sp)
                        }
                        Spacer(Modifier.height(18.dp))
                    } else {
                        ProgressRail(
                            progress = progressFraction,
                            buffered = bufferedFraction,
                            onSeekFraction = { f ->
                                if (durationMs != C.TIME_UNSET && durationMs > 0) {
                                    player.seekTo((f * durationMs).toLong())
                                    showControls = true
                                }
                            }
                        )
                        Spacer(Modifier.height(4.dp))
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(formatMs(positionMs), color = Color(0xFFC5C6CE), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            Text(
                                if (durationMs == C.TIME_UNSET) "0:00" else formatMs(durationMs),
                                color = Color(0xFFC5C6CE),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(Modifier.height(18.dp))
                    }

                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconChip(
                                label = if (isPlayingUi && playingConfirmed) "❚❚" else "▶",
                                onClick = {
                                    showControls = true
                                    if (hasError) onRetry()
                                    else if (player.isPlaying) player.pause()
                                    else player.play()
                                }
                            )
                            IconChip(
                                label = "♪",
                                dimmed = muted,
                                onClick = {
                                    muted = !muted
                                    player.volume = if (muted) 0f else 1f
                                    showControls = true
                                }
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                title,
                                color = Mist,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.widthIn(max = 360.dp)
                            )
                            Text(
                                if (isLive) " · LIVE" else " · Lecture",
                                color = MistMuted,
                                fontSize = 13.sp
                            )
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (isSeries) {
                                AccentChip(label = "Épisodes", onClick = {
                                    showEpisodes = true
                                    showSettings = false
                                    showControls = true
                                })
                            }
                            if (audioCount > 1) {
                                IconChip(label = "AUD", onClick = {
                                    cycleTrack(player, C.TRACK_TYPE_AUDIO)
                                    showControls = true
                                })
                            }
                            if (textCount > 0) {
                                IconChip(label = "CC", onClick = {
                                    cycleTrack(player, C.TRACK_TYPE_TEXT)
                                    showControls = true
                                })
                            }
                            IconChip(label = "⚙", onClick = {
                                showSettings = !showSettings
                                showEpisodes = false
                                showControls = true
                            })
                            if (hasError && status.contains("réseau", ignoreCase = true)) {
                                AccentChip(label = "Réessayer", onClick = onRetry)
                            }
                        }
                    }
                }
            }

            if (hasError && status.isNotBlank()) {
                Box(
                    Modifier
                        .align(Alignment.Center)
                        .padding(top = 160.dp)
                        .widthIn(max = 460.dp)
                        .fillMaxWidth(0.55f)
                        .background(Color(0xE815171D), RoundedCornerShape(13.dp))
                        .border(1.dp, Color.White.copy(alpha = 0.17f), RoundedCornerShape(13.dp))
                        .padding(15.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "Lecture interrompue",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(5.dp))
                        Text(status, color = Color(0xFFD2D4DA), fontSize = 12.sp)
                    }
                }
            }

            if (showSettings) {
                PlayerSettingsPanel(
                    settingsTab = settingsTab,
                    onTab = { settingsTab = it },
                    onClose = { showSettings = false },
                    isLive = isLive,
                    isSeries = isSeries,
                    editionLanguages = editionLanguages,
                    audioOptions = audioOptions,
                    textOptions = textOptions,
                    videoOptions = videoOptions,
                    playbackSpeed = playbackSpeed,
                    developerMode = developerMode,
                    diagnosticLabel = diagnosticLabel,
                    status = status,
                    preferredAudioLanguage = preferredAudioLanguage,
                    preferredSubtitleLanguage = preferredSubtitleLanguage,
                    onToggleDeveloper = { developerMode = !developerMode },
                    onSelectEdition = { ed ->
                        if (!ed.selected) onSwitchEdition?.invoke(ed, player.currentPosition)
                        showControls = true
                    },
                    onSelectTrack = { opt ->
                        selectTrack(player, opt)
                        showControls = true
                    },
                    onSpeed = { speed ->
                        playbackSpeed = speed
                        player.setPlaybackSpeed(speed)
                        showControls = true
                    }
                )
            }

            if (showEpisodes && isSeries) {
                PlayerEpisodesPanel(
                    seasons = seriesSeasons,
                    seriesSynopsis = seriesSynopsis,
                    seasonIndex = episodeSeasonIndex,
                    onSeasonIndex = { episodeSeasonIndex = it },
                    currentSeason = currentSeason,
                    currentEpisode = currentEpisode,
                    onClose = { showEpisodes = false },
                    onPlayEpisode = { ep ->
                        showEpisodes = false
                        onPlayEpisode?.invoke(ep)
                    }
                )
            }
        }
    }
}

@Composable
private fun PlayerSettingsPanel(
    settingsTab: SettingsTab,
    onTab: (SettingsTab) -> Unit,
    onClose: () -> Unit,
    isLive: Boolean,
    isSeries: Boolean,
    editionLanguages: List<EditionLanguageOption>,
    audioOptions: List<PlayerTrackOption>,
    textOptions: List<PlayerTrackOption>,
    videoOptions: List<PlayerTrackOption>,
    playbackSpeed: Float,
    developerMode: Boolean,
    diagnosticLabel: String,
    status: String,
    preferredAudioLanguage: String,
    preferredSubtitleLanguage: String,
    onToggleDeveloper: () -> Unit,
    onSelectEdition: (EditionLanguageOption) -> Unit,
    onSelectTrack: (PlayerTrackOption) -> Unit,
    onSpeed: (Float) -> Unit
) {
    val tabs = buildList {
        add(SettingsTab.AUDIO)
        add(SettingsTab.SUBTITLES)
        if (!isLive) add(SettingsTab.QUALITY)
        if (!isLive) add(SettingsTab.SPEED)
        if (developerMode) add(SettingsTab.INFO)
    }
    Box(
        Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.CenterEnd
    ) {
        Column(
            Modifier
                .width(400.dp)
                .fillMaxSize(0.88f)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xF20C0D13))
                .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Paramètres", color = Mist, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                IconChip(label = "✕", onClick = onClose)
            }
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(tabs) { tab ->
                    val label = when (tab) {
                        SettingsTab.AUDIO -> "Audio"
                        SettingsTab.SUBTITLES -> "Sous-titres"
                        SettingsTab.QUALITY -> "Qualité"
                        SettingsTab.SPEED -> "Vitesse"
                        SettingsTab.INFO -> "Info"
                    }
                    AccentChip(
                        label = if (settingsTab == tab) "● $label" else label,
                        onClick = { onTab(tab) }
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .height(1.dp)
                    .background(Color.White.copy(alpha = 0.08f))
            )
            LazyColumn(
                Modifier
                    .weight(1f)
                    .padding(16.dp)
            ) {
                when (settingsTab) {
                    SettingsTab.AUDIO -> {
                        if (editionLanguages.isNotEmpty()) {
                            item {
                                Text("ÉDITIONS IPTV", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                Spacer(Modifier.height(8.dp))
                            }
                            items(editionLanguages) { ed ->
                                val suffix = when {
                                    ed.selected -> " · actuel"
                                    ed.requiresNewStream -> " · autre flux"
                                    else -> ""
                                }
                                TvActionChipLike(
                                    label = (if (ed.selected) "● " else "") + ed.label + suffix,
                                    onClick = { onSelectEdition(ed) }
                                )
                                Spacer(Modifier.height(6.dp))
                            }
                            item { Spacer(Modifier.height(12.dp)) }
                        }
                        item {
                            Text("PISTES AUDIO DU MÉDIA", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                        }
                        if (audioOptions.isEmpty()) {
                            item {
                                Text(
                                    if (editionLanguages.isNotEmpty()) {
                                        "Pas de multi-audio dans ce flux — utiliser les éditions ci-dessus."
                                    } else {
                                        "Aucune piste audio détectée."
                                    },
                                    color = MistMuted,
                                    fontSize = 12.sp
                                )
                            }
                        } else {
                            items(audioOptions) { opt ->
                                TvActionChipLike(
                                    label = if (opt.selected) "● ${opt.label}" else opt.label,
                                    onClick = { onSelectTrack(opt) }
                                )
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                    SettingsTab.SUBTITLES -> {
                        item {
                            Text("SOUS-TITRES", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                        }
                        if (textOptions.isEmpty()) {
                            item {
                                Text("Aucun sous-titre détecté dans ce flux.", color = MistMuted, fontSize = 12.sp)
                            }
                        } else {
                            items(textOptions) { opt ->
                                TvActionChipLike(
                                    label = if (opt.selected) "● ${opt.label}" else opt.label,
                                    onClick = { onSelectTrack(opt) }
                                )
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                    SettingsTab.QUALITY -> {
                        item {
                            Text("QUALITÉ (pistes vidéo du flux)", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                        }
                        if (videoOptions.size <= 1) {
                            item {
                                Text(
                                    if (videoOptions.isEmpty()) {
                                        "Aucune variante de qualité exposée par le flux."
                                    } else {
                                        "Une seule piste vidéo · ${videoOptions.first().label}"
                                    },
                                    color = MistMuted,
                                    fontSize = 12.sp
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(
                                    "La résolution affichée ici est celle du flux, pas une qualité inventée.",
                                    color = MistMuted,
                                    fontSize = 11.sp
                                )
                            }
                        } else {
                            items(videoOptions) { opt ->
                                TvActionChipLike(
                                    label = if (opt.selected) "● ${opt.label}" else opt.label,
                                    onClick = { onSelectTrack(opt) }
                                )
                                Spacer(Modifier.height(6.dp))
                            }
                        }
                    }
                    SettingsTab.SPEED -> {
                        item {
                            Text("VITESSE DE LECTURE", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                        }
                        items(listOf(0.75f, 1f, 1.25f, 1.5f, 2f)) { speed ->
                            TvActionChipLike(
                                label = if (playbackSpeed == speed) "● ${speed}×" else "${speed}×",
                                onClick = { onSpeed(speed) }
                            )
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                    SettingsTab.INFO -> {
                        item {
                            Text("DIAGNOSTIC (développeur)", color = MistMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            Text(diagnosticLabel, color = Mist, fontSize = 12.sp)
                            if (status.isNotBlank()) {
                                Spacer(Modifier.height(8.dp))
                                Text(status, color = MistMuted, fontSize = 12.sp)
                            }
                            Spacer(Modifier.height(8.dp))
                            Text(
                                "Profil · audio ${LanguageCodes.displayName(preferredAudioLanguage)} · ST ${LanguageCodes.displayName(preferredSubtitleLanguage)}",
                                color = MistMuted,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
                item {
                    Spacer(Modifier.height(16.dp))
                    TvActionChipLike(
                        label = if (developerMode) "Mode développeur · ON" else "Mode développeur · OFF",
                        onClick = {
                            val enabling = !developerMode
                            onToggleDeveloper()
                            if (enabling) onTab(SettingsTab.INFO)
                            else if (settingsTab == SettingsTab.INFO) onTab(SettingsTab.AUDIO)
                        }
                    )
                }
            }
            Text(
                "LKS TV · Paramètres",
                color = Color(0xFFAAAEBA),
                fontSize = 11.sp,
                modifier = Modifier.padding(16.dp)
            )
        }
    }
}

@Composable
private fun PlayerEpisodesPanel(
    seasons: List<Season>,
    seriesSynopsis: String,
    seasonIndex: Int,
    onSeasonIndex: (Int) -> Unit,
    currentSeason: Int?,
    currentEpisode: Int?,
    onClose: () -> Unit,
    onPlayEpisode: (Episode) -> Unit
) {
    val season = seasons.getOrNull(seasonIndex)
    Box(
        Modifier
            .fillMaxSize()
            .padding(28.dp),
        contentAlignment = Alignment.CenterEnd
    ) {
        Column(
            Modifier
                .width(460.dp)
                .fillMaxSize(0.9f)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xF20C0D13))
                .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Épisodes", color = Mist, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                IconChip(label = "✕", onClick = onClose)
            }
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                itemsIndexed(seasons) { index, s ->
                    AccentChip(
                        label = if (index == seasonIndex) "● ${s.title}" else s.title,
                        onClick = { onSeasonIndex(index) }
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            LazyColumn(
                Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(season?.episodes.orEmpty(), key = { it.id }) { ep ->
                    val active = ep.number == currentEpisode &&
                        (currentSeason == null || season?.number == currentSeason)
                    val watch = ep.watchState
                    Surface(
                        onClick = {
                            onPlayEpisode(ep.copy(seasonNumber = season?.number ?: ep.seasonNumber))
                        },
                        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
                        colors = ClickableSurfaceDefaults.colors(
                            containerColor = if (active) BrandRed.copy(alpha = 0.2f) else Color.White.copy(alpha = 0.05f),
                            focusedContainerColor = BrandRed.copy(alpha = 0.28f)
                        ),
                        border = ClickableSurfaceDefaults.border(
                            focusedBorder = Border(
                                border = BorderStroke(2.dp, BrandRed),
                                shape = RoundedCornerShape(10.dp)
                            )
                        ),
                        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.02f)
                    ) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                Modifier
                                    .width(140.dp)
                                    .height(78.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color.White.copy(alpha = 0.08f))
                            ) {
                                if (!ep.thumbUrl.isNullOrBlank()) {
                                    AsyncImage(
                                        model = ep.thumbUrl,
                                        contentDescription = null,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                                Text(
                                    "E${ep.number}",
                                    color = Mist,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier
                                        .padding(6.dp)
                                        .background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                                if (watch == EpisodeProgress.WatchState.IN_PROGRESS) {
                                    Box(
                                        Modifier
                                            .align(Alignment.BottomCenter)
                                            .fillMaxWidth()
                                            .height(3.dp)
                                            .background(Color.White.copy(alpha = 0.2f))
                                    ) {
                                        Box(
                                            Modifier
                                                .fillMaxWidth(ep.progressFraction.coerceIn(0f, 1f))
                                                .height(3.dp)
                                                .background(BrandRed)
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    DisplayMeta.formatEpisodeListLabel(ep.title, ep.number),
                                    color = Mist,
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val badge = when {
                                    active -> "En cours"
                                    watch == EpisodeProgress.WatchState.IN_PROGRESS -> "Reprendre"
                                    else -> null
                                }
                                if (badge != null) {
                                    Text(badge, color = if (active) BrandRed else MistMuted, fontSize = 11.sp)
                                }
                            }
                            if (ep.durationMinutes > 0) {
                                Text("${ep.durationMinutes} min", color = MistMuted, fontSize = 11.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SkipColumn(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.widthIn(min = 64.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.08f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White.copy(alpha = 0.08f),
            contentColor = Mist,
            focusedContentColor = Color.White
        )
    ) {
        Column(
            Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("↺", fontSize = 22.sp, color = Mist)
            Spacer(Modifier.height(6.dp))
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Mist)
        }
    }
}

@Composable
private fun IconChip(label: String, dimmed: Boolean = false, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.size(43.dp),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(11.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.06f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.Transparent,
            focusedContainerColor = Color.White.copy(alpha = 0.14f),
            contentColor = if (dimmed) MistMuted else Mist,
            focusedContentColor = Color.White
        )
    ) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(label, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AccentChip(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(10.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.06f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = BrandRed,
            focusedContainerColor = Color(0xFFFF2848),
            contentColor = Color.White,
            focusedContentColor = Color.White
        )
    ) {
        Text(
            label,
            Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun ProgressRail(
    progress: Float,
    buffered: Float,
    onSeekFraction: (Float) -> Unit
) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(22.dp)
            .pointerInput(Unit) {
                detectTapGestures { offset ->
                    val w = size.width.toFloat().coerceAtLeast(1f)
                    onSeekFraction((offset.x / w).coerceIn(0f, 1f))
                }
            }
    ) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(6.dp)
                .align(Alignment.Center)
        ) {
            val h = 4.dp.toPx()
            val y = (size.height - h) / 2f
            drawRoundRect(
                color = RailBg,
                topLeft = Offset(0f, y),
                size = Size(size.width, h),
                cornerRadius = CornerRadius(20f, 20f)
            )
            drawRoundRect(
                color = RailLoaded,
                topLeft = Offset(0f, y),
                size = Size(size.width * buffered.coerceIn(0f, 1f), h),
                cornerRadius = CornerRadius(20f, 20f)
            )
            val filledW = size.width * progress.coerceIn(0f, 1f)
            drawRoundRect(
                color = BrandRed,
                topLeft = Offset(0f, y),
                size = Size(filledW, h),
                cornerRadius = CornerRadius(20f, 20f)
            )
            drawCircle(
                color = Color.White,
                radius = 7.dp.toPx(),
                center = Offset(filledW.coerceAtLeast(7.dp.toPx()), size.height / 2f)
            )
        }
    }
}

private fun formatMs(ms: Long): String {
    val total = (ms / 1000).toInt().coerceAtLeast(0)
    val s = total % 60
    val m = (total / 60) % 60
    val h = total / 3600
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun cycleTrack(player: ExoPlayer, type: @C.TrackType Int) {
    val tracks = player.currentTracks
    val groups = tracks.groups.filter { it.type == type && it.length > 0 }
    if (groups.isEmpty()) return
    val params = player.trackSelectionParameters.buildUpon()
    var switched = false
    for (group in groups) {
        for (i in 0 until group.length) {
            if (!group.isTrackSelected(i)) {
                player.trackSelectionParameters = params
                    .clearOverridesOfType(type)
                    .setOverrideForType(
                        androidx.media3.common.TrackSelectionOverride(group.mediaTrackGroup, i)
                    )
                    .build()
                switched = true
                break
            }
        }
        if (switched) break
    }
    if (!switched && groups.isNotEmpty()) {
        player.trackSelectionParameters = params
            .clearOverridesOfType(type)
            .setOverrideForType(
                androidx.media3.common.TrackSelectionOverride(groups[0].mediaTrackGroup, 0)
            )
            .build()
    }
}

private fun selectTrack(player: ExoPlayer, option: PlayerTrackOption) {
    val groups = player.currentTracks.groups
    if (option.groupIndex !in groups.indices) return
    val group = groups[option.groupIndex]
    if (option.trackIndex !in 0 until group.length) return
    player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
        .clearOverridesOfType(option.type)
        .setOverrideForType(
            androidx.media3.common.TrackSelectionOverride(group.mediaTrackGroup, option.trackIndex)
        )
        .build()
}

@Composable
private fun TvActionChipLike(label: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = ClickableSurfaceDefaults.shape(RoundedCornerShape(8.dp)),
        scale = ClickableSurfaceDefaults.scale(focusedScale = 1.04f),
        colors = ClickableSurfaceDefaults.colors(
            containerColor = Color.White.copy(alpha = 0.06f),
            focusedContainerColor = Color.White.copy(alpha = 0.14f),
            contentColor = Mist,
            focusedContentColor = Color.White
        ),
        border = ClickableSurfaceDefaults.border(
            focusedBorder = Border(BorderStroke(1.5.dp, BrandRed))
        )
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            fontSize = 13.sp
        )
    }
}

package com.lkstv.app.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import androidx.tv.material3.Typography

/** TASK-004 tokens — docs/DESIGN_SYSTEM.md */
val Obsidian = Color(0xFF050507)
val ObsidianElevated = Color(0xFF0E1014)
val SurfacePanel = Color(0xFF14181F)
val BrandRed = Color(0xFFE50914)
val BrandRedSoft = Color(0xFFFF2A36)
val GoldAccent = Color(0xFFC9A227)
val Mist = Color(0xFFF5F5F7)
val MistMuted = Color(0xFFA1A1AA)
val FocusGlow = Color(0xFFFFFFFF)

private val LksDarkColors = darkColorScheme(
    primary = BrandRed,
    onPrimary = Color.White,
    secondary = GoldAccent,
    onSecondary = Color.Black,
    background = Obsidian,
    onBackground = Mist,
    surface = ObsidianElevated,
    onSurface = Mist,
    border = MistMuted.copy(alpha = 0.22f)
)

private val LksTypography = Typography(
    displayLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 52.sp,
        letterSpacing = (-0.8).sp,
        color = Mist
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 34.sp,
        letterSpacing = (-0.4).sp,
        color = Mist
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 26.sp,
        color = Mist
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 20.sp,
        color = Mist
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        color = Mist
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        color = Mist
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        color = MistMuted
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        color = Mist
    )
)

@Composable
fun LksTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LksDarkColors,
        typography = LksTypography,
        content = content
    )
}

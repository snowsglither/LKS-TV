package com.lkstv.app.ui.screens

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.lkstv.app.ui.theme.BrandRed
import com.lkstv.app.ui.theme.Mist
import kotlinx.coroutines.delay

/**
 * Cinematic splash: black → logo → subtle pulse/zoom → profiles.
 * Honors [reduceMotion] (short hold, no zoom).
 */
@Composable
fun SplashScreen(
    reduceMotion: Boolean,
    onFinished: () -> Unit
) {
    val alpha = remember { Animatable(0f) }
    val scale = remember { Animatable(if (reduceMotion) 1f else 0.88f) }

    LaunchedEffect(reduceMotion) {
        if (reduceMotion) {
            alpha.snapTo(1f)
            scale.snapTo(1f)
            delay(450)
            onFinished()
        } else {
            delay(180)
            alpha.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
            scale.animateTo(1.08f, tween(900, easing = FastOutSlowInEasing))
            scale.animateTo(1.28f, tween(500, easing = FastOutSlowInEasing))
            alpha.animateTo(0f, tween(320, easing = FastOutSlowInEasing))
            delay(80)
            onFinished()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = "LKS TV",
            style = MaterialTheme.typography.displayLarge,
            color = BrandRed,
            modifier = Modifier
                .alpha(alpha.value)
                .scale(scale.value)
                .padding(24.dp)
        )
        // Subtle white TV wordmark weight via shadow letter not needed — brand red carries logo.
        Text(
            text = "",
            color = Mist,
            modifier = Modifier.alpha(0f)
        )
    }
}

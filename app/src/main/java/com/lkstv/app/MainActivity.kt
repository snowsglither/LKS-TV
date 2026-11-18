package com.lkstv.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Surface
import androidx.tv.material3.SurfaceDefaults
import com.lkstv.app.ui.navigation.LksTvApp
import com.lkstv.app.ui.state.AppViewModel
import com.lkstv.app.ui.theme.LksTvTheme
import com.lkstv.app.ui.theme.Obsidian

class MainActivity : ComponentActivity() {

    private val viewModel: AppViewModel by viewModels {
        val app = application as LksTvApplication
        AppViewModel.factory(app.sessionRepository, app.iptv)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LksTvTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    colors = SurfaceDefaults.colors(containerColor = Obsidian),
                    shape = RectangleShape
                ) {
                    val state by viewModel.uiState.collectAsStateWithLifecycle()
                    LksTvApp(state = state, viewModel = viewModel)
                }
            }
        }
    }
}

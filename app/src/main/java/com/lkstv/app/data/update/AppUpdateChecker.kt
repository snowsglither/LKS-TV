package com.lkstv.app.data.update

import com.lkstv.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Non-blocking update check against a HTTPS JSON manifest (GitHub Releases asset or Pages).
 * Never embeds a GitHub PAT. Private repos require a public update channel.
 */
data class UpdateManifest(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val changelog: String,
    val minSdk: Int = 24
)

sealed class UpdateCheckResult {
    data object UpToDate : UpdateCheckResult()
    data class Available(val manifest: UpdateManifest) : UpdateCheckResult()
    data class Failed(val message: String) : UpdateCheckResult()
    data object Disabled : UpdateCheckResult()
}

object AppUpdateChecker {
    /** Override via BuildConfig or future remote config. Empty = updates disabled until configured. */
    val defaultManifestUrl: String
        get() = BuildConfig.UPDATE_MANIFEST_URL

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .build()

    suspend fun check(
        manifestUrl: String = defaultManifestUrl,
        installedVersionCode: Int = BuildConfig.VERSION_CODE
    ): UpdateCheckResult = withContext(Dispatchers.IO) {
        if (manifestUrl.isBlank()) return@withContext UpdateCheckResult.Disabled
        try {
            val req = Request.Builder().url(manifestUrl).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    return@withContext UpdateCheckResult.Failed("HTTP ${resp.code}")
                }
                val body = resp.body?.string().orEmpty()
                val json = JSONObject(body)
                val remoteCode = json.optInt("versionCode", 0)
                val apkUrl = json.optString("apkUrl")
                val sha = json.optString("sha256")
                if (remoteCode <= 0 || apkUrl.isBlank() || sha.isBlank()) {
                    return@withContext UpdateCheckResult.Failed("Manifest incomplet")
                }
                if (!apkUrl.startsWith("https://", ignoreCase = true)) {
                    return@withContext UpdateCheckResult.Failed("APK URL non HTTPS")
                }
                val manifest = UpdateManifest(
                    versionCode = remoteCode,
                    versionName = json.optString("versionName", remoteCode.toString()),
                    apkUrl = apkUrl,
                    sha256 = sha.lowercase(),
                    changelog = json.optString("changelog", ""),
                    minSdk = json.optInt("minSdk", 24)
                )
                if (manifest.versionCode > installedVersionCode) {
                    UpdateCheckResult.Available(manifest)
                } else {
                    UpdateCheckResult.UpToDate
                }
            }
        } catch (e: Exception) {
            UpdateCheckResult.Failed(e.message ?: "Vérification impossible")
        }
    }
}

package com.lkstv.app.data.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.lkstv.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

sealed class UpdateInstallResult {
    data class Ready(val uri: Uri) : UpdateInstallResult()
    data class Failed(val message: String) : UpdateInstallResult()
}

/**
 * Downloads an APK over HTTPS, verifies SHA-256, then hands off to the system installer.
 * Never silent-installs; never embeds GitHub PATs.
 */
object AppUpdateInstaller {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    suspend fun downloadAndVerify(
        context: Context,
        manifest: UpdateManifest,
        onProgress: (Float) -> Unit = {}
    ): UpdateInstallResult = withContext(Dispatchers.IO) {
        if (!manifest.apkUrl.startsWith("https://", ignoreCase = true)) {
            return@withContext UpdateInstallResult.Failed("URL APK non HTTPS")
        }
        if (manifest.minSdk > Build.VERSION.SDK_INT) {
            return@withContext UpdateInstallResult.Failed(
                "Android trop ancien (minSdk ${manifest.minSdk})"
            )
        }
        val dir = File(context.cacheDir, "updates").also { it.mkdirs() }
        val out = File(dir, "lks-tv-${manifest.versionCode}.apk")
        try {
            val req = Request.Builder().url(manifest.apkUrl).get().build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    return@withContext UpdateInstallResult.Failed("Téléchargement HTTP ${resp.code}")
                }
                val body = resp.body ?: return@withContext UpdateInstallResult.Failed("Corps vide")
                val total = body.contentLength().takeIf { it > 0 } ?: -1L
                body.byteStream().use { input ->
                    out.outputStream().use { output ->
                        val buf = ByteArray(8192)
                        var readTotal = 0L
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            output.write(buf, 0, n)
                            readTotal += n
                            if (total > 0) onProgress((readTotal.toFloat() / total).coerceIn(0f, 1f))
                        }
                    }
                }
            }
            val digest = sha256Hex(out)
            if (!digest.equals(manifest.sha256, ignoreCase = true)) {
                out.delete()
                return@withContext UpdateInstallResult.Failed(
                    "Checksum SHA-256 incorrecte (fichier rejeté)"
                )
            }
            val expectedCert = BuildConfig.UPDATE_EXPECTED_CERT_SHA256
            if (expectedCert.isNotBlank()) {
                val installed = signingCertSha256(context)
                if (installed != null && !installed.equals(expectedCert, ignoreCase = true)) {
                    out.delete()
                    return@withContext UpdateInstallResult.Failed(
                        "Signature installée incompatible avec la clé de mise à jour attendue"
                    )
                }
            }
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                out
            )
            UpdateInstallResult.Ready(uri)
        } catch (e: Exception) {
            out.delete()
            UpdateInstallResult.Failed(e.message ?: "Téléchargement interrompu")
        }
    }

    fun openInstaller(context: Context, apkUri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    }

    private fun sha256Hex(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(8192)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    @Suppress("DEPRECATION")
    private fun signingCertSha256(context: Context): String? {
        return try {
            val pm = context.packageManager
            val info = if (Build.VERSION.SDK_INT >= 28) {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                    .signingInfo?.apkContentsSigners?.firstOrNull()
            } else {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
                    .signatures?.firstOrNull()
            } ?: return null
            val md = MessageDigest.getInstance("SHA-256")
            md.update(info.toByteArray())
            md.digest().joinToString("") { "%02x".format(it) }
        } catch (_: Exception) {
            null
        }
    }
}

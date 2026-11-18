package com.lkstv.app.data.iptv

import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.PlaylistFetcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class OkHttpPlaylistFetcher(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
) : PlaylistFetcher {

    override suspend fun fetchText(url: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(url).get().build()
        try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw IptvException.Network("HTTP ${response.code} en récupérant la playlist M3U")
                }
                response.body?.string().orEmpty()
            }
        } catch (e: IptvException) {
            throw e
        } catch (e: Exception) {
            throw IptvException.Network("Impossible de télécharger la playlist M3U", e)
        }
    }
}

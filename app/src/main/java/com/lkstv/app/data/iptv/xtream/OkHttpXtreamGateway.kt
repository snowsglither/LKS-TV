package com.lkstv.app.data.iptv.xtream

import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.XtreamAccountInfo
import com.lkstv.app.domain.iptv.XtreamCategoryDto
import com.lkstv.app.domain.iptv.XtreamCredentials
import com.lkstv.app.domain.iptv.XtreamEpisodeDto
import com.lkstv.app.domain.iptv.XtreamGateway
import com.lkstv.app.domain.iptv.XtreamSeriesDto
import com.lkstv.app.domain.iptv.XtreamStreamDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class OkHttpXtreamGateway(
    private val client: OkHttpClient = defaultClient()
) : XtreamGateway {

    override suspend fun authenticate(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<XtreamAccountInfo> = runCatching {
        val body = get(baseUrl, credentials, mapOf("action" to null))
        XtreamJsonParser.parseAccount(body)
    }.recoverCatching { mapError(it) }

    override suspend fun fetchLiveCategories(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamCategoryDto>> = fetchList(baseUrl, credentials, "get_live_categories") {
        XtreamJsonParser.parseCategories(it)
    }

    override suspend fun fetchVodCategories(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamCategoryDto>> = fetchList(baseUrl, credentials, "get_vod_categories") {
        XtreamJsonParser.parseCategories(it)
    }

    override suspend fun fetchSeriesCategories(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamCategoryDto>> = fetchList(baseUrl, credentials, "get_series_categories") {
        XtreamJsonParser.parseCategories(it)
    }

    override suspend fun fetchVodStreams(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamStreamDto>> = fetchList(baseUrl, credentials, "get_vod_streams") {
        XtreamJsonParser.parseStreams(it)
    }

    override suspend fun fetchLiveStreams(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamStreamDto>> = fetchList(baseUrl, credentials, "get_live_streams") {
        XtreamJsonParser.parseStreams(it)
    }

    override suspend fun fetchSeries(
        baseUrl: String,
        credentials: XtreamCredentials
    ): Result<List<XtreamSeriesDto>> = fetchList(baseUrl, credentials, "get_series") {
        XtreamJsonParser.parseSeriesList(it)
    }

    suspend fun fetchSeriesEpisodes(
        baseUrl: String,
        credentials: XtreamCredentials,
        seriesId: String
    ): Result<List<XtreamEpisodeDto>> = runCatching {
        val body = get(
            baseUrl,
            credentials,
            mapOf("action" to "get_series_info", "series_id" to seriesId)
        )
        XtreamJsonParser.parseSeriesInfoEpisodes(body)
    }.recoverCatching { mapError(it) }

    private suspend fun <T> fetchList(
        baseUrl: String,
        credentials: XtreamCredentials,
        action: String,
        parse: (String) -> T
    ): Result<T> = runCatching {
        val body = get(baseUrl, credentials, mapOf("action" to action))
        parse(body)
    }.recoverCatching { mapError(it) }

    private suspend fun get(
        baseUrl: String,
        credentials: XtreamCredentials,
        query: Map<String, String?>
    ): String = withContext(Dispatchers.IO) {
        val normalized = baseUrl.trim().trimEnd('/')
        val api = "$normalized/player_api.php".toHttpUrlOrNull()
            ?: throw IptvException.Validation("URL Xtream invalide")
        val builder = api.newBuilder()
            .addQueryParameter("username", credentials.username)
            .addQueryParameter("password", credentials.password)
        query.forEach { (k, v) ->
            if (v != null) builder.addQueryParameter(k, v)
        }
        val request = Request.Builder().url(builder.build()).get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IptvException.Network("HTTP ${response.code} depuis le serveur Xtream")
            }
            response.body?.string().orEmpty()
        }
    }

    private fun mapError(error: Throwable): Nothing {
        when (error) {
            is IptvException -> throw error
            is java.io.IOException -> throw IptvException.Network("Erreur réseau Xtream", error)
            else -> throw IptvException.Network("Échec appel Xtream", error)
        }
    }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .callTimeout(90, TimeUnit.SECONDS)
            .build()
    }
}

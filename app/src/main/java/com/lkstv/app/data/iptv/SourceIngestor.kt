package com.lkstv.app.data.iptv

import com.lkstv.app.data.iptv.m3u.M3uParser
import com.lkstv.app.data.iptv.xtream.OkHttpXtreamGateway
import com.lkstv.app.domain.ContentType
import com.lkstv.app.domain.iptv.CatalogMergePolicy
import com.lkstv.app.domain.iptv.EpisodeVersion
import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.IptvGroup
import com.lkstv.app.domain.iptv.IptvSource
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.LogicalEpisode
import com.lkstv.app.domain.iptv.PlaylistFetcher
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.SecretStore
import com.lkstv.app.domain.iptv.StreamRef
import com.lkstv.app.domain.iptv.XtreamGateway
import java.io.File

data class SourceIngestResult(
    val groups: List<IptvGroup>,
    val incoming: List<CatalogMergePolicy.IncomingTitle>
)

/**
 * Imports categories + streams for one enabled source.
 * Does not touch profile preferences.
 */
class SourceIngestor(
    private val secretStore: SecretStore,
    private val playlistFetcher: PlaylistFetcher,
    private val xtreamGateway: XtreamGateway,
    private val readLocalFile: (String) -> String = { path -> File(path).readText() }
) {

    suspend fun ingest(source: IptvSource): SourceIngestResult {
        if (!source.enabled) return SourceIngestResult(emptyList(), emptyList())
        return when (source.kind) {
            IptvSourceKind.M3U_URL -> ingestM3uText(
                source,
                playlistFetcher.fetchText(source.endpoint)
            )
            IptvSourceKind.M3U_FILE -> {
                if (source.localPath.isBlank()) {
                    throw IptvException.Validation("Chemin M3U local manquant")
                }
                ingestM3uText(source, readLocalFile(source.localPath))
            }
            IptvSourceKind.XTREAM -> ingestXtream(source)
        }
    }

    suspend fun validate(source: IptvSource): Result<Unit> = runCatching {
        when (source.kind) {
            IptvSourceKind.XTREAM -> {
                val creds = secretStore.getXtreamCredentials(source.id)
                    ?: throw IptvException.Auth("Identifiants Xtream absents du coffre")
                xtreamGateway.authenticate(source.endpoint, creds).getOrThrow()
                Unit
            }
            IptvSourceKind.M3U_URL -> {
                val text = playlistFetcher.fetchText(source.endpoint)
                if (text.isBlank()) throw IptvException.Parse("Playlist M3U vide")
                M3uParser.parse(text, source.id)
                Unit
            }
            IptvSourceKind.M3U_FILE -> {
                val text = readLocalFile(source.localPath)
                M3uParser.parse(text, source.id)
                Unit
            }
        }
    }

    private fun ingestM3uText(source: IptvSource, text: String): SourceIngestResult {
        val parsed = M3uParser.parse(text, source.id)
        return SourceIngestResult(parsed.groups, parsed.incoming)
    }

    private suspend fun ingestXtream(source: IptvSource): SourceIngestResult {
        val creds = secretStore.getXtreamCredentials(source.id)
            ?: throw IptvException.Auth("Identifiants Xtream absents du coffre sécurisé")
        xtreamGateway.authenticate(source.endpoint, creds).getOrThrow()

        val groups = mutableListOf<IptvGroup>()
        val incoming = mutableListOf<CatalogMergePolicy.IncomingTitle>()

        val vodCats = xtreamGateway.fetchVodCategories(source.endpoint, creds).getOrElse { emptyList() }
        val seriesCats = xtreamGateway.fetchSeriesCategories(source.endpoint, creds).getOrElse { emptyList() }
        val liveCats = xtreamGateway.fetchLiveCategories(source.endpoint, creds).getOrElse { emptyList() }

        fun addCats(cats: List<com.lkstv.app.domain.iptv.XtreamCategoryDto>, kind: ProviderCategoryKind) {
            cats.forEach { cat ->
                groups += CategoryNormalizer.toGroup(source.id, cat.categoryId, cat.categoryName, kind)
            }
        }
        addCats(vodCats, ProviderCategoryKind.VOD)
        addCats(seriesCats, ProviderCategoryKind.SERIES)
        addCats(liveCats, ProviderCategoryKind.LIVE)

        val groupIndex = groups.associateBy { it.providerGroupId }

        xtreamGateway.fetchVodStreams(source.endpoint, creds).getOrElse { emptyList() }.forEach { stream ->
            val group = groupIndex[stream.categoryId]
                ?: CategoryNormalizer.toGroup(source.id, stream.categoryId.ifBlank { "vod" }, "VOD", ProviderCategoryKind.VOD)
                    .also { groups += it }
            val tagged = LanguageTagger.detect(stream.name, group.name)
            val ref = StreamRef(
                id = "${source.id.value}::vod::${stream.streamId}",
                sourceId = source.id,
                providerStreamId = stream.streamId,
                playbackUrl = XtreamPlaybackRefs.vod(source.id.value, stream.streamId, stream.containerExtension),
                groupId = group.id,
                language = tagged.language,
                languageConfidence = tagged.confidence,
                containerExtension = stream.containerExtension,
                rawTitle = stream.name,
                languageTag = tagged.languageTag
            )
            val matchKey = stream.tmdbId?.takeIf { it.isNotBlank() }?.let {
                CatalogMergePolicy.externalMatchKey("tmdb:$it")
            } ?: CatalogMergePolicy.newLocalMatchKey(source.id, "vod:${stream.streamId}")
            incoming += CatalogMergePolicy.IncomingTitle(
                type = ContentType.FILM,
                title = stream.name,
                year = stream.year?.take(4)?.toIntOrNull(),
                synopsis = stream.plot.orEmpty(),
                genres = stream.genre?.split(',', '|')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty(),
                matchKey = matchKey,
                variants = listOf(ref),
                posterUrl = stream.streamIcon,
                backdropUrl = stream.streamIcon
            )
        }

        xtreamGateway.fetchLiveStreams(source.endpoint, creds).getOrElse { emptyList() }.forEach { stream ->
            val group = groupIndex[stream.categoryId]
                ?: CategoryNormalizer.toGroup(source.id, stream.categoryId.ifBlank { "live" }, "Live", ProviderCategoryKind.LIVE)
                    .also { groups += it }
            val tagged = LanguageTagger.detect(stream.name, group.name)
            val ref = StreamRef(
                id = "${source.id.value}::live::${stream.streamId}",
                sourceId = source.id,
                providerStreamId = stream.streamId,
                playbackUrl = XtreamPlaybackRefs.live(source.id.value, stream.streamId),
                groupId = group.id,
                language = tagged.language,
                languageConfidence = tagged.confidence,
                rawTitle = stream.name,
                languageTag = tagged.languageTag
            )
            incoming += CatalogMergePolicy.IncomingTitle(
                type = ContentType.FILM,
                title = stream.name,
                matchKey = CatalogMergePolicy.newLocalMatchKey(source.id, "live:${stream.streamId}"),
                variants = listOf(ref),
                posterUrl = stream.streamIcon,
                backdropUrl = stream.streamIcon
            )
        }

        val seriesList = xtreamGateway.fetchSeries(source.endpoint, creds).getOrElse { emptyList() }
        for (series in seriesList) {
            val group = groupIndex[series.categoryId]
                ?: CategoryNormalizer.toGroup(source.id, series.categoryId.ifBlank { "series" }, "Séries", ProviderCategoryKind.SERIES)
                    .also { groups += it }
            val episodes = if (xtreamGateway is OkHttpXtreamGateway) {
                xtreamGateway.fetchSeriesEpisodes(source.endpoint, creds, series.seriesId)
                    .getOrElse { emptyList() }
            } else {
                series.episodes
            }
            val logicalEpisodes = episodes.map { ep ->
                val tagged = LanguageTagger.detect(ep.title, group.name)
                val stream = StreamRef(
                    id = "${source.id.value}::series::${series.seriesId}::${ep.id}",
                    sourceId = source.id,
                    providerStreamId = ep.id,
                    playbackUrl = XtreamPlaybackRefs.series(source.id.value, ep.id, ep.containerExtension),
                    groupId = group.id,
                    language = tagged.language,
                    languageConfidence = tagged.confidence,
                    containerExtension = ep.containerExtension,
                    rawTitle = ep.title,
                    languageTag = tagged.languageTag
                )
                LogicalEpisode(
                    id = "ep:${series.seriesId}:${ep.season}:${ep.episodeNum}",
                    seasonNumber = ep.season,
                    episodeNumber = ep.episodeNum,
                    title = ep.title,
                    versions = listOf(
                        EpisodeVersion(
                            stream = stream,
                            seasonNumber = ep.season,
                            episodeNumber = ep.episodeNum,
                            episodeTitle = ep.title
                        )
                    ),
                    synopsis = ep.plot.orEmpty(),
                    durationMinutes = ep.durationMinutes,
                    thumbUrl = ep.thumbUrl ?: series.cover
                )
            }
            val year = series.year?.take(4)?.toIntOrNull()
            val matchKey = series.tmdbId?.takeIf { it.isNotBlank() }?.let {
                CatalogMergePolicy.externalMatchKey("tmdb:$it")
            } ?: CatalogMergePolicy.seriesTitleYearKey(series.name, year)
                ?: CatalogMergePolicy.newLocalMatchKey(source.id, "series:${series.seriesId}")
            incoming += CatalogMergePolicy.IncomingTitle(
                type = ContentType.SERIES,
                title = series.name,
                year = year,
                synopsis = series.plot.orEmpty(),
                genres = series.genre?.split(',', '|')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty(),
                matchKey = matchKey,
                episodes = logicalEpisodes,
                posterUrl = series.cover,
                backdropUrl = series.backdrop ?: series.cover
            )
        }

        return SourceIngestResult(
            groups = groups.distinctBy { it.id },
            incoming = incoming
        )
    }

}

/**
 * Opaque playback refs — credentials are resolved later via [SecretStore], never persisted in catalog JSON.
 */
object XtreamPlaybackRefs {
    fun vod(sourceId: String, streamId: String, ext: String?): String =
        "lks-xtream://$sourceId/vod/$streamId?ext=${(ext ?: "mp4").trimStart('.')}"

    fun live(sourceId: String, streamId: String): String =
        "lks-xtream://$sourceId/live/$streamId"

    fun series(sourceId: String, episodeId: String, ext: String?): String =
        "lks-xtream://$sourceId/series/$episodeId?ext=${(ext ?: "mp4").trimStart('.')}"
}


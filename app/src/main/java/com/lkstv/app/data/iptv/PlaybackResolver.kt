package com.lkstv.app.data.iptv

import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.IptvSourceKind
import com.lkstv.app.domain.iptv.SecretStore
import com.lkstv.app.domain.iptv.SourceRepository
import java.net.URLEncoder

/**
 * Resolves opaque `lks-xtream://` refs or direct HTTP URLs for Media3.
 * Credentials never leave the process; errors are sanitized.
 */
class PlaybackResolver(
    private val sources: SourceRepository,
    private val secrets: SecretStore
) {
    data class Resolved(
        val url: String,
        val isLive: Boolean,
        val kind: String,
        /** Safe for UI / logs — no user/pass. */
        val diagnosticLabel: String
    )

    class ResolveError(message: String) : Exception(message)

    suspend fun resolve(playbackRef: String): Result<Resolved> = runCatching {
        val opaque = parseOpaque(playbackRef)
        if (opaque != null) {
            val source = sources.getSource(IptvSourceId(opaque.sourceId))
                ?: throw ResolveError("Source IPTV introuvable")
            if (source.kind != IptvSourceKind.XTREAM) {
                throw ResolveError("Source non Xtream pour cette référence")
            }
            val creds = secrets.getXtreamCredentials(source.id)
                ?: throw ResolveError("Identifiants absents du coffre")
            val base = source.endpoint.trimEnd('/')
            val u = URLEncoder.encode(creds.username, Charsets.UTF_8.name())
            val p = URLEncoder.encode(creds.password, Charsets.UTF_8.name())
            val id = URLEncoder.encode(opaque.streamId, Charsets.UTF_8.name())
            val url = when (opaque.kind) {
                "live" -> "$base/live/$u/$p/$id.m3u8"
                "series" -> "$base/series/$u/$p/$id.${opaque.ext}"
                else -> "$base/movie/$u/$p/$id.${opaque.ext}"
            }
            Resolved(
                url = url,
                isLive = opaque.kind == "live",
                kind = opaque.kind,
                diagnosticLabel = "xtream/${opaque.kind}/${source.id.value}/*.${opaque.ext}"
            )
        } else if (playbackRef.startsWith("http://") || playbackRef.startsWith("https://")) {
            Resolved(
                url = playbackRef,
                isLive = playbackRef.contains(".m3u8", ignoreCase = true),
                kind = "direct",
                diagnosticLabel = redactHttp(playbackRef)
            )
        } else {
            throw ResolveError("Référence de lecture non supportée")
        }
    }

    private fun parseOpaque(url: String): Opaque? {
        val m = Regex("""^lks-xtream://([^/]+)/(vod|live|series)/([^?]+)(?:\?ext=([^&]+))?""")
            .matchEntire(url) ?: return null
        return Opaque(
            sourceId = m.groupValues[1],
            kind = m.groupValues[2],
            streamId = java.net.URLDecoder.decode(m.groupValues[3], Charsets.UTF_8.name()),
            ext = m.groupValues.getOrNull(4)?.ifBlank { null } ?: "mp4"
        )
    }

    private fun redactHttp(url: String): String = try {
        val u = java.net.URI(url)
        "${u.scheme}://${u.host}${u.path.take(40)}…"
    } catch (_: Exception) {
        "http(s)://…"
    }

    private data class Opaque(
        val sourceId: String,
        val kind: String,
        val streamId: String,
        val ext: String
    )
}

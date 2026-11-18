package com.lkstv.app.data.iptv.xtream

import com.lkstv.app.domain.iptv.IptvException
import com.lkstv.app.domain.iptv.XtreamAccountInfo
import com.lkstv.app.domain.iptv.XtreamCategoryDto
import com.lkstv.app.domain.iptv.XtreamEpisodeDto
import com.lkstv.app.domain.iptv.XtreamSeriesDto
import com.lkstv.app.domain.iptv.XtreamStreamDto
import org.json.JSONArray
import org.json.JSONObject

/**
 * Parses Xtream Codes player_api JSON using org.json (Android/JDK friendly, no secrets logged).
 */
object XtreamJsonParser {

    fun parseAccount(json: String): XtreamAccountInfo {
        val root = JSONObject(json)
        val userInfo = root.optJSONObject("user_info")
            ?: throw IptvException.Parse("Réponse Xtream sans user_info")
        val auth = userInfo.optInt("auth", 0)
        val status = userInfo.optString("status", "unknown")
        if (auth != 1 && !status.equals("Active", ignoreCase = true)) {
            throw IptvException.Auth("Identifiants Xtream refusés (status=$status)")
        }
        return XtreamAccountInfo(status = status, isActive = true)
    }

    fun parseCategories(json: String): List<XtreamCategoryDto> {
        val array = parseArray(json)
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val id = obj.optString("category_id").ifBlank { obj.optString("id") }
                val name = obj.optString("category_name").ifBlank { obj.optString("name") }
                if (id.isNotBlank()) add(XtreamCategoryDto(id, name.ifBlank { id }))
            }
        }
    }

    fun parseStreams(json: String): List<XtreamStreamDto> {
        val array = parseArray(json)
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val id = obj.optString("stream_id").ifBlank { obj.optString("num") }
                if (id.isBlank()) continue
                add(
                    XtreamStreamDto(
                        streamId = id,
                        name = obj.optString("name").ifBlank { "Sans titre" },
                        categoryId = obj.optString("category_id"),
                        containerExtension = obj.optString("container_extension").ifBlank { null },
                        tmdbId = obj.optString("tmdb_id").ifBlank { null },
                        plot = obj.optString("plot").ifBlank { null },
                        genre = obj.optString("genre").ifBlank { null },
                        year = obj.optString("year").ifBlank { obj.optString("releasedate").ifBlank { null } },
                        streamIcon = obj.optString("stream_icon").ifBlank {
                            obj.optString("cover").ifBlank { null }
                        }
                    )
                )
            }
        }
    }

    fun parseSeriesList(json: String): List<XtreamSeriesDto> {
        val array = parseArray(json)
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val id = obj.optString("series_id").ifBlank { obj.optString("num") }
                if (id.isBlank()) continue
                add(
                    XtreamSeriesDto(
                        seriesId = id,
                        name = obj.optString("name").ifBlank { "Sans titre" },
                        categoryId = obj.optString("category_id"),
                        tmdbId = obj.optString("tmdb_id").ifBlank { null },
                        plot = obj.optString("plot").ifBlank { null },
                        genre = obj.optString("genre").ifBlank { null },
                        year = obj.optString("year").ifBlank { null },
                        cover = obj.optString("cover").ifBlank {
                            obj.optString("stream_icon").ifBlank { null }
                        },
                        backdrop = obj.optJSONArray("backdrop_path")?.optString(0)?.ifBlank { null },
                        episodes = emptyList()
                    )
                )
            }
        }
    }

    /**
     * Series info endpoint embeds episodes as object keyed by season number.
     */
    fun parseSeriesInfoEpisodes(json: String): List<XtreamEpisodeDto> {
        val root = JSONObject(json)
        val episodesNode = root.opt("episodes") ?: return emptyList()
        val out = mutableListOf<XtreamEpisodeDto>()
        when (episodesNode) {
            is JSONObject -> {
                val keys = episodesNode.keys()
                while (keys.hasNext()) {
                    val seasonKey = keys.next()
                    val seasonNum = seasonKey.toIntOrNull() ?: continue
                    val arr = episodesNode.optJSONArray(seasonKey) ?: continue
                    for (i in 0 until arr.length()) {
                        val ep = arr.optJSONObject(i) ?: continue
                        val info = ep.optJSONObject("info")
                        out += XtreamEpisodeDto(
                            id = ep.optString("id").ifBlank { ep.optString("episode_num") },
                            season = seasonNum,
                            episodeNum = ep.optInt("episode_num", i + 1),
                            title = ep.optString("title").ifBlank { "Épisode ${i + 1}" },
                            containerExtension = info
                                ?.optString("container_extension")
                                ?.ifBlank { null }
                                ?: ep.optString("container_extension").ifBlank { null },
                            plot = ep.optString("plot").ifBlank {
                                info?.optString("plot").orEmpty()
                            }.ifBlank { null },
                            durationMinutes = parseDurationMinutes(
                                ep.optString("duration").ifBlank {
                                    info?.optString("duration").orEmpty()
                                }
                            ),
                            thumbUrl = info?.optString("movie_image")?.ifBlank { null }
                                ?: ep.optString("movie_image").ifBlank { null }
                        )
                    }
                }
            }
            is JSONArray -> {
                for (i in 0 until episodesNode.length()) {
                    val ep = episodesNode.optJSONObject(i) ?: continue
                    out += XtreamEpisodeDto(
                        id = ep.optString("id"),
                        season = ep.optInt("season", 1),
                        episodeNum = ep.optInt("episode_num", i + 1),
                        title = ep.optString("title")
                    )
                }
            }
        }
        return out
    }

    private fun parseDurationMinutes(raw: String): Int? {
        if (raw.isBlank()) return null
        val digits = raw.filter { it.isDigit() }
        return digits.toIntOrNull()?.takeIf { it > 0 }
    }

    private fun parseArray(json: String): JSONArray {
        val trimmed = json.trim()
        return try {
            when {
                trimmed.startsWith("[") -> JSONArray(trimmed)
                trimmed.startsWith("{") -> {
                    val obj = JSONObject(trimmed)
                    // Some panels wrap lists
                    obj.keys().asSequence().mapNotNull { key ->
                        obj.optJSONArray(key)
                    }.firstOrNull() ?: JSONArray()
                }
                else -> throw IptvException.Parse("JSON Xtream inattendu")
            }
        } catch (e: IptvException) {
            throw e
        } catch (e: Exception) {
            throw IptvException.Parse("Impossible d'analyser la réponse Xtream", e)
        }
    }
}

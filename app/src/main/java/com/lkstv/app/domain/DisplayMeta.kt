package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.StreamRef

/**
 * Display helpers — never invent language; never mutate stored raw titles/ids.
 */
object DisplayMeta {

    private val qualityRe = Regex("""\b(4K|UHD|2160P|1080P|720P|480P|HD|SD|FHD|HDR)\b""", RegexOption.IGNORE_CASE)
    private val codecRe = Regex("""\b(H\.?265|HEVC|H\.?264|AVC|AV1)\b""", RegexOption.IGNORE_CASE)
    private val containerRe = Regex("""\b(MKV|MP4|TS|AVI)\b""", RegexOption.IGNORE_CASE)

    fun detectLang(rawTitle: String, groupName: String = ""): Pair<AudioLanguage, LanguageConfidence> {
        val d = LanguageCodes.detect(rawTitle, groupName)
        return LanguageCodes.toAudioLanguage(d.tag) to d.confidence
    }

    fun detectLanguageTag(rawTitle: String, groupName: String = ""): LanguageCodes.Detection =
        LanguageCodes.detect(rawTitle, groupName)

    fun versionLabel(
        stream: StreamRef,
        index: Int,
        total: Int,
        groupName: String = ""
    ): String {
        var tag = LanguageCodes.normalize(stream.languageTag.ifBlank { null } ?: LanguageCodes.fromAudioLanguage(stream.language))
        var confidence = stream.languageConfidence
        if (tag.isEmpty() || stream.language == AudioLanguage.UNKNOWN) {
            val d = LanguageCodes.detect(stream.rawTitle, groupName)
            tag = d.tag
            confidence = d.confidence
        }
        val parts = mutableListOf<String>()
        if (tag.isNotEmpty()) {
            val name = LanguageCodes.displayName(tag, useful = false)
            if (name.isNotEmpty()) {
                parts += when (confidence) {
                    LanguageConfidence.ASSUMED -> "$name (supposée)"
                    else -> name
                }
            }
        }
        qualityRe.find(stream.rawTitle + " " + groupName)?.value?.uppercase()?.let { parts += it }
        codecRe.find(stream.rawTitle)?.value?.uppercase()?.let { parts += it }
        stream.containerExtension?.takeIf { it.isNotBlank() }?.uppercase()?.let { parts += it }
            ?: containerRe.find(stream.rawTitle)?.value?.uppercase()?.let { parts += it }
        if (groupName.isNotBlank() && parts.size < 3) {
            parts += if (groupName.length > 28) groupName.take(26) + "…" else groupName
        }
        if (parts.isEmpty()) {
            parts += if (total > 1) "Version ${index + 1}" else "Version unique"
        } else if (tag.isEmpty() && total > 1) {
            parts.add(0, "v${index + 1}")
        }
        return parts.joinToString(" · ")
    }

    fun cleanDisplayTitle(raw: String): String {
        var t = raw
        t = t.replace(Regex("""^\[?\s*[A-Za-z]{2,3}\s*]?\s*[-–|:./]\s+"""), "")
        t = t.replace(
            Regex(
                """^\[?\s*(VF|VO|VOSTFR|VOSTNL|VOST|MULTI|TRUEFRENCH|FR|EN|ES|NL|DE|AR|TR|PT|JA|KO|ZH|IT)\s*]?\s*[-–:|.]?\s*""",
                RegexOption.IGNORE_CASE
            ),
            ""
        )
        t = t.replace(
            Regex(
                """\s*[\[(](VF|VO|VOSTFR|VOSTNL|TRUEFRENCH|MULTI|FR|EN|ES|NL|DE|AR|TR|1080P|720P|4K|HD)[\])]?\s*""",
                RegexOption.IGNORE_CASE
            ),
            " "
        )
        t = t.replace(Regex("""\s*[\[(][A-Z]{2,3}[\])]\s*"""), " ")
        t = t.replace(Regex("""\s{2,}"""), " ").trim()
        return t.ifBlank { raw.trim() }
    }

    fun cleanEpisodeTitle(raw: String, season: Int, episode: Int, seriesTitle: String = ""): String {
        val seriesClean = cleanDisplayTitle(seriesTitle)
        var t = cleanDisplayTitle(raw)
        if (seriesClean.isNotBlank()) {
            val esc = Regex.escape(seriesClean)
            t = t.replace(Regex("""^$esc\s*(?:\(\d{4}\))?\s*[-–:|]?\s*""", RegexOption.IGNORE_CASE), "")
            val noYear = seriesClean.replace(Regex("""\s*\(\d{4}\)\s*$"""), "").trim()
            if (noYear.isNotBlank() && noYear != seriesClean) {
                val esc2 = Regex.escape(noYear)
                t = t.replace(Regex("""^$esc2\s*(?:\(\d{4}\))?\s*[-–:|]?\s*""", RegexOption.IGNORE_CASE), "")
            }
        }
        t = t.replace(Regex("""\bS\d{1,2}\s*[xXeE.]\s*\d{1,3}\b\s*[-–:.]?\s*""", RegexOption.IGNORE_CASE), "")
        t = t.replace(
            Regex("""^S?0*$season\s*[xXeE.]\s*0*$episode\s*[-–:.]?\s*""", RegexOption.IGNORE_CASE),
            ""
        )
        t = t.replace(Regex("""^E0*\d+\s*[-–:.]?\s*""", RegexOption.IGNORE_CASE), "")
        t = t.replace(Regex("""^\(\d{4}\)\s*"""), "")
            .replace(Regex("""^[-–:|]\s*"""), "")
            .replace(Regex("""\s{2,}"""), " ")
            .trim()
        if (t.isBlank() ||
            t.matches(Regex("""(?i)episode\s*\d+$""")) ||
            t.matches(Regex("""(?i)épisode\s*\d+$"""))
        ) {
            return "Épisode $episode"
        }
        if (seriesClean.isNotBlank() && t.equals(seriesClean, ignoreCase = true)) {
            return "Épisode $episode"
        }
        val noYear = seriesClean.replace(Regex("""\s*\(\d{4}\)\s*$"""), "").trim()
        if (noYear.isNotBlank() && t.equals(noYear, ignoreCase = true)) {
            return "Épisode $episode"
        }
        return t
    }

    fun formatEpisodeListLabel(cleanTitle: String, episodeNum: Int): String {
        val t = cleanTitle.trim()
        if (t.isBlank() ||
            t.matches(Regex("""(?i)épisode\s*\d+$""")) ||
            t.matches(Regex("""(?i)episode\s*\d+$"""))
        ) {
            return "$episodeNum. Épisode $episodeNum"
        }
        return "$episodeNum. $t"
    }

    fun formatPlayerSeriesTitle(seriesTitle: String, season: Int, episode: Int): String {
        val name = cleanDisplayTitle(seriesTitle).ifBlank { "Série" }
        return "$name — S$season:E$episode"
    }

    /** IPTV prefix that is not a proven language (e.g. GB, AL, EX). */
    fun technicalEditionKey(rawTitle: String): String {
        val m = Regex("""^\s*([A-Za-z]{2,3})\s*[-–|:./]\s+""").find(rawTitle) ?: return ""
        val token = m.groupValues[1]
        if (LanguageCodes.normalize(token).isNotEmpty()) return ""
        return token.uppercase()
    }

    /** Stable series key fragment for cautious TITLE_YEAR merges. Null if ambiguous. */
    fun normalizeSeriesTitleKey(raw: String): String? {
        var t = cleanDisplayTitle(raw)
        repeat(4) {
            val next = t
                .replace(Regex("""\s*[\[(]?(?:19|20)\d{2}[\])]?\s*$"""), "")
                .replace(Regex("""\s*[\[(][A-Z]{2,3}[\])]?\s*$""", RegexOption.IGNORE_CASE), "")
                .replace(Regex("""\s*[-–:|]\s*(VF|VO|VOSTFR|MULTI|TRUEFRENCH)\s*$""", RegexOption.IGNORE_CASE), "")
                .trim()
            if (next == t) return@repeat
            t = next
        }
        t = java.text.Normalizer.normalize(t, java.text.Normalizer.Form.NFD)
            .replace(Regex("""\p{Mn}+"""), "")
            .lowercase()
            .replace(Regex("""[^a-z0-9]+"""), "")
        return t.takeIf { it.length >= 6 }
    }
}

package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.UnifiedCatalog
import java.text.Normalizer

/**
 * Logical work identity — groups multilingual IPTV editions of the same film/series.
 * Merge only via trusted external ids or official alias pairs + compatible year.
 * Never merges on fuzzy title similarity alone.
 */
object WorkIdentity {

    private val iptvPrefix =
        Regex(
            """^(fr|en|es|de|nl|it|pt|ar|tr|ja|ko|zh|pl|ro|hu|cs|sk|se|no|dk|fi|he|hi|th|vi|id|ms|fa|ur|al|gr|bg|ex|ru|ua|cz|sv|vf|vo|vostfr|vostnl|vost|multi|truefrench|4k|uhd|fhd|hd|sd|cafr|us|uk|be|qc|som)\b[\s._:-]*""",
            RegexOption.IGNORE_CASE
        )

    fun normalize(input: String): String {
        var s = Normalizer.normalize(input, Normalizer.Form.NFD)
            .replace(Regex("""\p{Mn}+"""), "")
            .lowercase()
        s = s.replace('&', ' ')
        s = s.replace(Regex("""['\u2019]s\b"""), "")
        s = s.replace(Regex("""['\u2019]"""), "")
        s = s.replace(Regex("""[^a-z0-9]+"""), " ")
        return s.trim().replace(Regex("""\s+"""), " ")
    }

    fun stripIptvPrefixes(normTitle: String): String {
        var t = normTitle.trim()
        repeat(4) {
            val next = t.replace(iptvPrefix, "").trim()
            if (next == t) return@repeat
            t = next
        }
        return t.replace(Regex("""\s+(19|20)\d{2}$"""), "").trim()
    }

    private val trailingNoise =
        Regex(
            """\b(gb|us|uk|ca|au|nz|ie|be|ch|cam|telesync|telecine|hdrip|webrip|web dl|bluray|dvdrip|x264|x265|multi)\b"""
        )

    fun coreTitleKey(rawTitle: String): String {
        var core = stripIptvPrefixes(normalize(DisplayMeta.cleanDisplayTitle(rawTitle)))
        core = core.replace(Regex("""^[a-z]{2}\s+"""), "").trim()
        core = core.replace(Regex("""\b(19|20)\d{2}\b"""), " ").trim()
        core = core.replace(trailingNoise, " ").trim()
        core = core.replace(Regex("""\s+"""), " ").trim()
        return core
    }

    fun extractYear(title: LogicalTitle): Int {
        val y = title.year
        if (y != null && y in 1900..2100) return y
        return Regex("""\b((?:19|20)\d{2})\b""")
            .find(title.canonicalTitle)
            ?.groupValues
            ?.getOrNull(1)
            ?.toIntOrNull()
            ?: 0
    }

    private fun yearsCompatible(a: Int, b: Int): Boolean {
        if (a == 0 || b == 0) return true
        return a == b
    }

    /** Assigns work:<rootId> for each title; returns titleId → workId. */
    fun assignLogicalWorkIds(catalog: UnifiedCatalog): Map<String, String> {
        val titles = catalog.titles
        val parent = HashMap<String, String>(titles.size)
        for (t in titles) parent[t.id] = t.id

        fun find(x: String): String {
            var r = x
            while (parent[r] != r) r = parent[r]!!
            var c = x
            while (c != r) {
                val n = parent[c]!!
                parent[c] = r
                c = n
            }
            return r
        }

        fun union(a: String, b: String) {
            val ra = find(a)
            val rb = find(b)
            if (ra == rb) return
            if (ra < rb) parent[rb] = ra else parent[ra] = rb
        }

        val byExternal = HashMap<String, String>()
        val byTitleYear = HashMap<String, String>()
        val byCoreYear = HashMap<String, MutableList<String>>()
        val byId = titles.associateBy { it.id }

        for (t in titles) {
            val mk = t.matchKey
            when (mk.type) {
                MatchKeyType.PROVIDER_EXTERNAL, MatchKeyType.EXPLICIT -> {
                    val key = if (mk.type == MatchKeyType.EXPLICIT) {
                        "explicit:${mk.value.lowercase()}"
                    } else {
                        mk.value.lowercase()
                    }
                    val prev = byExternal[key]
                    if (prev != null) union(prev, t.id) else byExternal[key] = t.id
                }
                MatchKeyType.TITLE_YEAR -> {
                    val key = mk.value.lowercase()
                    val prev = byTitleYear[key]
                    if (prev != null) union(prev, t.id) else byTitleYear[key] = t.id
                }
                else -> Unit
            }

            val core = coreTitleKey(t.canonicalTitle)
            val year = extractYear(t)
            val type = t.type.name
            if (core.length >= 4) {
                val ck = "$core|${year}|$type"
                val list = byCoreYear.getOrPut(ck) { mutableListOf() }
                for (other in list) union(other, t.id)
                list += t.id
                if (year > 0) {
                    byCoreYear.getOrPut("$core|0|$type") { mutableListOf() }.add(t.id)
                }
            }
        }

        for (t in titles) {
            val core = coreTitleKey(t.canonicalTitle)
            if (core.length < 4) continue
            val year = extractYear(t)
            val type = t.type.name
            val tmdb = t.matchKey.takeIf { it.type == MatchKeyType.PROVIDER_EXTERNAL }?.value
            val aliases = TitleAliases.resolve(core, tmdb)
            for (alias in aliases) {
                val aCore = coreTitleKey(alias)
                if (aCore.isEmpty() || aCore == core) continue
                val candidates = buildList {
                    byCoreYear["$aCore|${year}|$type"]?.let { addAll(it) }
                    if (year > 0) byCoreYear["$aCore|0|$type"]?.let { addAll(it) }
                }
                for (otherId in candidates) {
                    if (otherId == t.id) continue
                    val other = byId[otherId] ?: continue
                    if (other.type != t.type) continue
                    if (!yearsCompatible(year, extractYear(other))) continue
                    union(t.id, otherId)
                }
            }
        }

        val out = HashMap<String, String>(titles.size)
        for (t in titles) {
            out[t.id] = "work:${find(t.id)}"
        }
        return out
    }

    fun workDedupeKey(title: LogicalTitle, workIds: Map<String, String>? = null): String {
        workIds?.get(title.id)?.let { return it }
        val mk = title.matchKey
        if (mk.type == MatchKeyType.PROVIDER_EXTERNAL ||
            mk.type == MatchKeyType.TITLE_YEAR ||
            mk.type == MatchKeyType.EXPLICIT
        ) {
            return "${mk.type.name}:${mk.value.lowercase()}"
        }
        val core = coreTitleKey(title.canonicalTitle)
        val year = extractYear(title)
        if (core.length >= 6 && year > 0) return "soft:${title.type.name}:$core:$year"
        return "id:${title.id}"
    }

    fun logicalEpisodeProgressKey(workId: String, season: Int, episode: Int): String =
        "lep:$workId:$season:$episode"
}

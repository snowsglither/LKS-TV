package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKeyType
import com.lkstv.app.domain.iptv.ProviderCategoryKind
import com.lkstv.app.domain.iptv.UnifiedCatalog
import java.text.Normalizer
import kotlin.math.abs
import kotlin.math.min

enum class SearchFilter {
    ALL, FILMS, SERIES, TV
}

data class SearchHit(
    val item: CatalogItem,
    val score: Int,
    val matchLabel: String,
    val isLive: Boolean
)

data class SearchPage(
    val query: String,
    val filter: SearchFilter,
    val total: Int,
    val offset: Int,
    val limit: Int,
    val hits: List<SearchHit>,
    val tookMs: Long,
    val indexSize: Int,
    val sections: SearchSections = SearchSections()
)

data class SearchSections(
    val best: List<CatalogItem> = emptyList(),
    val films: List<CatalogItem> = emptyList(),
    val series: List<CatalogItem> = emptyList(),
    val tv: List<CatalogItem> = emptyList()
)

data class SearchIndexEntry(
    val id: String,
    val type: ContentType,
    val isLive: Boolean,
    val title: String,
    val titleNorm: String,
    val titleCore: String,
    val titleCompact: String,
    val altNorm: String,
    val metaNorm: String,
    val year: Int,
    val groupIds: Set<String>,
    val dedupeKey: String,
    val titleRef: LogicalTitle
)

data class SearchIndex(
    val generatedAtEpochMs: Long,
    val entries: List<SearchIndexEntry>
) {
    val size: Int get() = entries.size
}

object CatalogSearch {

    object Score {
        const val EXACT = 0
        const val EXACT_COMPACT = 1
        const val EXACT_CORE = 2
        const val EXACT_ALIAS = 5
        const val PREFIX_TITLE = 10
        const val PREFIX_ALIAS = 12
        const val PHRASE_TITLE = 20
        const val TOKENS_STRONG = 25
        const val FUZZY = 45
        const val META = 70
        const val REJECT = 1000
    }

    private val iptvPrefix =
        Regex(
            """^(fr|en|es|de|nl|it|pt|ar|tr|ja|ko|zh|pl|ro|hu|cs|sk|se|no|dk|fi|he|hi|th|vi|id|ms|fa|ur|al|gr|bg|ex|ru|ua|cz|sv|vf|vo|vostfr|vostnl|vost|multi|truefrench|4k|uhd|fhd|hd|sd|cafr|us|uk|be|qc|som)\b[\s._:-]*""",
            RegexOption.IGNORE_CASE
        )
    private val yearToken = Regex("""^(19|20)\d{2}$""")

    fun normalize(input: String): String {
        var s = Normalizer.normalize(input.lowercase(), Normalizer.Form.NFD)
        s = buildString(s.length) {
            for (ch in s) {
                if (Character.getType(ch) != Character.NON_SPACING_MARK.toInt()) {
                    append(
                        when (ch) {
                            'œ' -> "oe"
                            'æ' -> "ae"
                            'ß' -> "ss"
                            else -> ch
                        }
                    )
                }
            }
        }
        s = s.replace("&", " and ")
        s = s.replace(Regex("""['\u2019]s\b"""), "")
        s = s.replace(Regex("""['\u2019]"""), "")
        return s.replace(Regex("[^a-z0-9]+"), " ").trim().replace(Regex("\\s+"), " ")
    }

    fun compact(input: String): String = normalize(input).replace(" ", "")

    fun stripIptvPrefixes(normTitle: String): String {
        var t = normTitle.trim()
        repeat(4) {
            val next = iptvPrefix.replaceFirst(t, "").trim()
            if (next == t) return@repeat
            t = next
        }
        return t.replace(Regex("""\s+(19|20)\d{2}$"""), "").trim()
    }

    fun editDistance(a: String, b: String, max: Int = 2): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        if (abs(a.length - b.length) > max) return max + 1
        val prev = IntArray(b.length + 1) { it }
        val cur = IntArray(b.length + 1)
        for (i in 1..a.length) {
            cur[0] = i
            var rowMin = i
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                cur[j] = min(prev[j] + 1, min(cur[j - 1] + 1, prev[j - 1] + cost))
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                    cur[j] = min(cur[j], prev[j - 2] + cost)
                }
                if (cur[j] < rowMin) rowMin = cur[j]
            }
            if (rowMin > max) return max + 1
            for (j in prev.indices) prev[j] = cur[j]
        }
        return prev[b.length]
    }

    fun scoreTitle(
        queryNorm: String,
        titleNorm: String,
        altNorm: String = "",
        metaNorm: String = "",
        compactTitle: String = ""
    ): Int {
        if (queryNorm.isEmpty()) return Score.REJECT
        val qCompact = queryNorm.replace(" ", "")
        val tCompact = compactTitle.ifEmpty { titleNorm.replace(" ", "") }
        val coreTitle = stripIptvPrefixes(titleNorm)
        val coreAlt = stripIptvPrefixes(altNorm)

        if (titleNorm == queryNorm) return Score.EXACT
        if (tCompact.isNotEmpty() && tCompact == qCompact) return Score.EXACT_COMPACT
        if (coreTitle.isNotEmpty() && coreTitle == queryNorm) return Score.EXACT_CORE
        if (coreTitle.replace(" ", "") == qCompact) return Score.EXACT_COMPACT
        if (altNorm.isNotEmpty() && (altNorm == queryNorm || coreAlt == queryNorm)) return Score.EXACT_ALIAS
        if (altNorm.replace(" ", "") == qCompact) return Score.EXACT_ALIAS
        if (altNorm.isNotEmpty() && phraseIncludes(altNorm, queryNorm)) return Score.EXACT_ALIAS
        if (altNorm.isNotEmpty() && qCompact.length >= 4 && altNorm.replace(" ", "").contains(qCompact)) {
            return Score.EXACT_ALIAS
        }

        if (titleNorm.startsWith(queryNorm) || coreTitle.startsWith(queryNorm)) return Score.PREFIX_TITLE
        if (altNorm.isNotEmpty() &&
            !altNorm.startsWith("$queryNorm ") &&
            (altNorm.startsWith(queryNorm) || coreAlt.startsWith(queryNorm))
        ) {
            return Score.PREFIX_ALIAS
        }

        if (phraseIncludes(titleNorm, queryNorm) || phraseIncludes(coreTitle, queryNorm)) {
            return Score.PHRASE_TITLE
        }

        if (qCompact.length >= 4) {
            if (tCompact == qCompact) return Score.EXACT_COMPACT
            if (tCompact.startsWith(qCompact) || coreTitle.replace(" ", "").startsWith(qCompact)) {
                return Score.PREFIX_TITLE
            }
            if (qCompact.length >= 6 && tCompact.contains(qCompact)) return Score.TOKENS_STRONG
            val aCompact = altNorm.replace(" ", "")
            if (aCompact == qCompact) return Score.EXACT_ALIAS
            if (aCompact.startsWith(qCompact)) return Score.PREFIX_ALIAS
        }

        val qTokens = significantTokens(queryNorm)
        if (qTokens.isEmpty()) return Score.REJECT
        val primaryTokens = (
            significantTokens("$coreTitle $titleNorm") + significantTokens(altNorm)
            ).toSet().toList()

        var exact = 0
        var prefix = 0
        var fuzzy = 0
        var miss = 0
        for (qt in qTokens) {
            when (tokenMatchQuality(qt, primaryTokens)) {
                "exact" -> exact++
                "prefix" -> prefix++
                "fuzzy" -> fuzzy++
                else -> miss++
            }
        }
        if (miss == 0 && fuzzy == 0) return Score.TOKENS_STRONG
        if (miss == 0) return Score.FUZZY

        if (metaNorm.isNotEmpty()) {
            val metaTokens = significantTokens(metaNorm)
            var metaOk = 0
            for (qt in qTokens) {
                if (qt in metaTokens) metaOk++
                else if (qt.length >= 5 && metaTokens.any { it.startsWith(qt) }) metaOk++
            }
            if (metaOk == qTokens.size && qTokens.size >= 2) return Score.META
            if (qTokens.size == 1 && qTokens[0].length >= 6 && qTokens[0] in metaTokens) return Score.META
        }
        return Score.REJECT
    }

    private fun phraseIncludes(hay: String, phrase: String): Boolean {
        if (hay.isEmpty() || phrase.isEmpty()) return false
        if (hay == phrase) return true
        if (hay.startsWith("$phrase ") || hay.endsWith(" $phrase")) return true
        return hay.contains(" $phrase ")
    }

    private fun significantTokens(norm: String): List<String> =
        norm.split(' ').filter { it.length >= 2 && !yearToken.matches(it) }

    private fun tokenMatchQuality(qt: String, hayTokens: List<String>): String? {
        if (qt.length < 2) return null
        if (hayTokens.any { it == qt }) return "exact"
        if (qt.length >= 2 && hayTokens.any { it.startsWith(qt) && it.length - qt.length <= 10 }) {
            return "prefix"
        }
        if (qt.length >= 5) {
            val prefixLen = min(4, qt.length - 1)
            for (t in hayTokens) {
                if (t.length < 5) continue
                if (t.take(prefixLen) != qt.take(prefixLen)) continue
                if (abs(t.length - qt.length) > 1) continue
                if (editDistance(qt, t, 1) <= 1) return "fuzzy"
            }
        }
        return null
    }

    fun buildIndex(catalog: UnifiedCatalog): SearchIndex {
        val liveGroups = catalog.groups
            .filter { it.kind == ProviderCategoryKind.LIVE }
            .map { it.id }
            .toSet()
        val workIds = WorkIdentity.assignLogicalWorkIds(catalog)
        val entries = ArrayList<SearchIndexEntry>(catalog.titles.size)
        for (t in catalog.titles) {
            val groupIds = (
                t.variants.map { it.groupId } +
                    t.episodes.flatMap { ep -> ep.versions.map { it.stream.groupId } }
                ).toSet()
            val isLive = groupIds.isNotEmpty() && groupIds.all { it in liveGroups }
            val titleNorm = normalize(t.canonicalTitle)
            val core = stripIptvPrefixes(titleNorm)
            val tmdbId = t.matchKey.takeIf { it.type == MatchKeyType.PROVIDER_EXTERNAL }?.value
            val aliases = TitleAliases.resolve(core, tmdbId)
            val altNorm = normalize(aliases.joinToString(" "))
            val meta = buildString {
                t.genres.forEach { append(it); append(' ') }
            }
            entries.add(
                SearchIndexEntry(
                    id = t.id,
                    type = t.type,
                    isLive = isLive,
                    title = t.canonicalTitle,
                    titleNorm = titleNorm,
                    titleCore = core,
                    titleCompact = compact(t.canonicalTitle),
                    altNorm = altNorm,
                    metaNorm = normalize(meta),
                    year = t.year ?: 0,
                    groupIds = groupIds,
                    dedupeKey = WorkIdentity.workDedupeKey(t, workIds),
                    titleRef = t
                )
            )
        }
        return SearchIndex(catalog.generatedAtEpochMs, entries)
    }

    private fun yearFromNorm(titleNorm: String, explicitYear: Int?): Int {
        if (explicitYear != null && explicitYear > 1900) return explicitYear
        return Regex("""\b((?:19|20)\d{2})\b""").find(titleNorm)?.groupValues?.get(1)?.toIntOrNull() ?: 0
    }

    private fun dedupeKey(title: LogicalTitle, titleNorm: String): String {
        val mk = title.matchKey
        if (mk.type == MatchKeyType.PROVIDER_EXTERNAL ||
            mk.type == MatchKeyType.TITLE_YEAR ||
            mk.type == MatchKeyType.EXPLICIT
        ) {
            return "${mk.type.name}:${mk.value.lowercase()}"
        }
        var core = stripIptvPrefixes(titleNorm).replace(Regex("""\s+(19|20)\d{2}$"""), "").trim()
        core = core.replace(Regex("""^[a-z]{2}\s+"""), "").trim()
        val year = yearFromNorm(titleNorm, title.year)
        // Soft merge only with year — avoids collapsing remakes that share a short name
        if (core.length >= 6 && year > 0) return "soft:${title.type.name}:$core:$year"
        return "id:${title.id}"
    }

    fun search(
        index: SearchIndex,
        query: String,
        filter: SearchFilter,
        prefs: ProfilePreferences,
        preferred: AudioLanguage,
        offset: Int = 0,
        limit: Int = 48
    ): SearchPage {
        val q = normalize(query)
        val t0 = System.currentTimeMillis()
        if (q.isEmpty() || index.entries.isEmpty()) {
            return SearchPage(q, filter, 0, offset, limit, emptyList(), 0, index.size)
        }
        val scored = ArrayList<Pair<SearchIndexEntry, Int>>(min(4096, index.entries.size))
        for (e in index.entries) {
            if (!typeMatches(e, filter)) continue
            if (e.id in prefs.hiddenItemIds) continue
            if (!searchVisible(e, prefs)) continue
            val score = scoreTitle(q, e.titleNorm, e.altNorm, e.metaNorm, e.titleCompact)
            if (score >= Score.REJECT) continue
            scored.add(e to score)
        }

        val byKey = LinkedHashMap<String, Pair<SearchIndexEntry, Int>>()
        for (row in scored) {
            val key = row.first.dedupeKey
            val prev = byKey[key]
            byKey[key] = if (prev == null) row else prefer(prev, row)
        }
        var unique = byKey.values.toMutableList()
        val hasStrong = unique.any { it.second <= Score.TOKENS_STRONG + 2 }
        if (hasStrong) {
            unique = unique.filter { it.second <= Score.FUZZY }.toMutableList()
        }
        unique.sortWith(compareBy({ it.second }, { -(it.first.year) }, { it.first.title }))

        val total = unique.size
        val end = min(offset + limit, total)
        val hits = ArrayList<SearchHit>(maxOf(0, end - offset))
        var i = offset
        while (i < end) {
            val (e, score) = unique[i]
            val progress = prefs.progressByItemId[e.id] ?: 0f
            val item = CatalogPresenter.toItem(e.titleRef, preferred, progress)
            hits.add(
                SearchHit(
                    item = item,
                    score = score,
                    matchLabel = matchLabel(score),
                    isLive = e.isLive
                )
            )
            i++
        }

        val sections = buildSections(unique, preferred, prefs)
        return SearchPage(
            query = q,
            filter = filter,
            total = total,
            offset = offset,
            limit = limit,
            hits = hits,
            tookMs = System.currentTimeMillis() - t0,
            indexSize = index.size,
            sections = sections
        )
    }

    private fun prefer(
        a: Pair<SearchIndexEntry, Int>,
        b: Pair<SearchIndexEntry, Int>
    ): Pair<SearchIndexEntry, Int> {
        if (a.second != b.second) return if (a.second < b.second) a else b
        val artA = if (a.first.titleRef.posterUrl != null) 1 else 0
        val artB = if (b.first.titleRef.posterUrl != null) 1 else 0
        if (artA != artB) return if (artA > artB) a else b
        return if (a.first.title.length <= b.first.title.length) a else b
    }

    private fun buildSections(
        unique: List<Pair<SearchIndexEntry, Int>>,
        preferred: AudioLanguage,
        prefs: ProfilePreferences
    ): SearchSections {
        fun toItem(e: SearchIndexEntry) =
            CatalogPresenter.toItem(e.titleRef, preferred, prefs.progressByItemId[e.id] ?: 0f)
        val best = unique.filter { it.second <= Score.PREFIX_ALIAS }.take(8).map { toItem(it.first) }
        val films = unique.filter { it.first.type == ContentType.FILM && !it.first.isLive }
            .take(24).map { toItem(it.first) }
        val series = unique.filter { it.first.type == ContentType.SERIES }
            .take(24).map { toItem(it.first) }
        val tv = unique.filter { it.first.isLive }.take(24).map { toItem(it.first) }
        return SearchSections(best, films, series, tv)
    }

    fun suggestions(
        index: SearchIndex,
        prefs: ProfilePreferences,
        preferred: AudioLanguage,
        limit: Int = 12
    ): List<CatalogItem> {
        val out = ArrayList<CatalogItem>(limit)
        for (e in index.entries) {
            if (out.size >= limit) break
            if (e.id in prefs.hiddenItemIds) continue
            if (!searchVisible(e, prefs)) continue
            if (e.year >= 2020 || out.size < 4) {
                out.add(CatalogPresenter.toItem(e.titleRef, preferred))
            }
        }
        return out
    }

    private fun searchVisible(e: SearchIndexEntry, prefs: ProfilePreferences): Boolean {
        val section = when {
            e.isLive -> CatalogSectionKey.TV
            e.type == ContentType.SERIES -> CatalogSectionKey.SERIES
            else -> CatalogSectionKey.FILMS
        }
        return GroupSelection.titleAllowed(e.groupIds, prefs, section)
    }

    private fun typeMatches(e: SearchIndexEntry, filter: SearchFilter): Boolean = when (filter) {
        SearchFilter.ALL -> true
        SearchFilter.FILMS -> e.type == ContentType.FILM && !e.isLive
        SearchFilter.SERIES -> e.type == ContentType.SERIES
        SearchFilter.TV -> e.isLive
    }

    private fun matchLabel(score: Int): String = when {
        score <= Score.TOKENS_STRONG + 2 -> ""
        score <= Score.FUZZY -> "Proche"
        else -> ""
    }
}

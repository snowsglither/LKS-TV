package com.lkstv.app.domain

import com.lkstv.app.domain.iptv.LogicalTitle
import com.lkstv.app.domain.iptv.MatchKeyType
import kotlin.math.abs

/**
 * Deterministic recommendations from catalog metadata only — never invents titles.
 */
object Recommendations {

    data class Buckets(
        val saga: List<LogicalTitle> = emptyList(),
        val similar: List<LogicalTitle> = emptyList(),
        val sameGenre: List<LogicalTitle> = emptyList(),
        val sameCast: List<LogicalTitle> = emptyList()
    )

    private val stop = setOf(
        "the", "a", "an", "le", "la", "les", "un", "une", "des", "de", "du", "et", "and", "of",
        "film", "movie", "serie", "series", "saison", "season", "episode", "vf", "vo", "hd", "fhd", "4k"
    )

    private fun norm(s: String): String =
        s.lowercase()
            .replace(Regex("[^a-z0-9\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()

    private fun tokens(s: String): List<String> =
        norm(s).split(" ").filter { it.length > 2 && it !in stop }

    private fun genreSet(t: LogicalTitle): Set<String> =
        t.genres.map { norm(it) }.filter { it.isNotEmpty() }.toSet()

    private fun jaccard(a: Set<String>, b: Set<String>): Float {
        if (a.isEmpty() || b.isEmpty()) return 0f
        val inter = a.count { it in b }
        return inter.toFloat() / (a.size + b.size - inter)
    }

    private fun phraseOverlap(a: String, b: String): Float {
        val ta = tokens(a)
        val tb = tokens(b).toSet()
        if (ta.size < 2) return 0f
        val hit = ta.count { it in tb }
        return if (hit >= 2) hit.toFloat() / maxOf(ta.size, 2) else 0f
    }

    fun score(seed: LogicalTitle, cand: LogicalTitle): Float {
        if (seed.id == cand.id || seed.type != cand.type) return 0f
        if (seed.matchKey.type == MatchKeyType.PROVIDER_EXTERNAL &&
            cand.matchKey.type == MatchKeyType.PROVIDER_EXTERNAL &&
            seed.matchKey.value.equals(cand.matchKey.value, ignoreCase = true)
        ) return 0f

        val gSeed = genreSet(seed)
        val gCand = genreSet(cand)
        val gScore = jaccard(gSeed, gCand)
        val sharedGenres = gSeed.count { it in gCand }
        val phrase = phraseOverlap(seed.canonicalTitle, cand.canonicalTitle)
        val ySeed = seed.year ?: 0
        val yCand = cand.year ?: 0
        var yearBonus = 0f
        if (ySeed > 0 && yCand > 0) {
            val d = abs(ySeed - yCand)
            yearBonus = when {
                d <= 2 -> 0.15f
                d <= 5 -> 0.08f
                else -> 0f
            }
        }
        val strong = sharedGenres >= 2 ||
            (sharedGenres >= 1 && (phrase >= 0.5f || yearBonus >= 0.08f)) ||
            (phrase >= 0.66f && sharedGenres >= 1)
        if (!strong) return 0f
        val score = gScore * 0.55f + phrase * 0.3f + yearBonus
        return if (score >= 0.22f) score else 0f
    }

    fun build(seed: LogicalTitle, catalog: List<LogicalTitle>, limit: Int = 12): Buckets {
        val scored = catalog.asSequence()
            .filter { it.type == seed.type && it.id != seed.id }
            .map { it to score(seed, it) }
            .filter { it.second > 0f }
            .sortedByDescending { it.second }
            .take(4000)
            .toList()

        val used = mutableSetOf<String>()
        fun take(n: Int, pred: (LogicalTitle, Float) -> Boolean): List<LogicalTitle> {
            val out = ArrayList<LogicalTitle>(n)
            for ((t, s) in scored) {
                if (out.size >= n) break
                if (t.id in used) continue
                if (!pred(t, s)) continue
                used += t.id
                out += t
            }
            return out
        }

        val saga = take(minOf(8, limit)) { t, _ ->
            phraseOverlap(seed.canonicalTitle, t.canonicalTitle) >= 0.5f &&
                (jaccard(genreSet(seed), genreSet(t)) > 0f)
        }
        val sameGenre = take(minOf(8, limit)) { t, _ ->
            genreSet(seed).count { it in genreSet(t) } >= 2
        }
        val similar = take(limit) { _, _ -> true }
        return Buckets(saga = saga, similar = similar, sameGenre = sameGenre, sameCast = emptyList())
    }
}

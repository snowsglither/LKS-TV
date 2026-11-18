package com.lkstv.app.domain

/**
 * Official multilingual aliases for search.
 * Curated + optional local cache — never invents TMDB ids or machine translations.
 */
object TitleAliases {

    private val curated: Map<String, List<String>> = mapOf(
        "the jackal" to listOf(
            "le chacal", "chacal", "jackal", "the day of the jackal", "day of the jackal"
        ),
        "le chacal" to listOf(
            "the jackal", "chacal", "jackal", "the day of the jackal", "day of the jackal"
        ),
        "chacal" to listOf("le chacal", "the jackal", "the day of the jackal", "day of the jackal"),
        "the day of the jackal" to listOf("le chacal", "chacal", "the jackal", "day of the jackal"),
        "day of the jackal" to listOf("the day of the jackal", "le chacal", "chacal"),
        "money heist" to listOf("la casa de papel", "casa de papel", "haus des geldes"),
        "la casa de papel" to listOf("money heist", "casa de papel", "haus des geldes"),
        "casa de papel" to listOf("money heist", "la casa de papel"),
        "supernatural" to listOf("supernatural the anime"),
        "stranger things" to listOf("stranger thing"),
        "spider man" to listOf("spiderman", "amazing spider man"),
        "spiderman" to listOf("spider man", "amazing spider man")
    )

    /** Optional runtime cache: tmdbId → aliases (filled by offline sync, not per keystroke). */
    @Volatile
    var tmdbCache: Map<String, List<String>> = emptyMap()

    /** Optional runtime cache: normalized title → aliases. */
    @Volatile
    var titleCache: Map<String, List<String>> = emptyMap()

    fun resolve(normalizedCoreTitle: String, tmdbId: String? = null): List<String> {
        val out = LinkedHashSet<String>()
        curated[normalizedCoreTitle]?.let { out.addAll(it) }
        titleCache[normalizedCoreTitle]?.let { out.addAll(it) }
        val id = tmdbId?.removePrefix("tmdb:")?.trim().orEmpty()
        if (id.isNotEmpty()) tmdbCache[id]?.let { out.addAll(it) }
        return out.toList()
    }
}

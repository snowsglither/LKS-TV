package com.lkstv.app.domain

object FakeCatalog {

    val profiles = listOf(
        Profile(id = "profile_alex", name = "Alex", avatarColor = 0xFFE50914),
        Profile(id = "profile_sam", name = "Sam", avatarColor = 0xFFC9A227)
    )

    val providerGroups = listOf(
        ProviderGroup("grp_movies", "Films VF", "Démo source A", "demo_a", "movies"),
        ProviderGroup("grp_series", "Séries", "Démo source A", "demo_a", "series"),
        ProviderGroup("grp_kids", "Jeunesse", "Démo source B", "demo_b", "kids"),
        ProviderGroup("grp_docs", "Documentaires", "Démo source B", "demo_b", "docs")
    )

    private fun film(
        id: String,
        title: String,
        synopsis: String,
        genres: List<String>,
        year: Int,
        duration: Int,
        poster: Long,
        backdrop: Long,
        progress: Float = 0f,
        related: List<String> = emptyList(),
        sequels: List<String> = emptyList(),
        group: String = "grp_movies"
    ) = CatalogItem(
        id = id,
        title = title,
        synopsis = synopsis,
        genres = genres,
        year = year,
        durationMinutes = duration,
        type = ContentType.FILM,
        posterColor = poster,
        backdropColor = backdrop,
        ratingLabel = "16+",
        progressFraction = progress,
        relatedIds = related,
        sequelIds = sequels,
        providerGroupId = group
    )

    private fun series(
        id: String,
        title: String,
        synopsis: String,
        genres: List<String>,
        year: Int,
        poster: Long,
        backdrop: Long,
        progress: Float = 0f,
        seasons: List<Season>,
        group: String = "grp_series"
    ) = CatalogItem(
        id = id,
        title = title,
        synopsis = synopsis,
        genres = genres,
        year = year,
        durationMinutes = null,
        type = ContentType.SERIES,
        posterColor = poster,
        backdropColor = backdrop,
        ratingLabel = "12+",
        progressFraction = progress,
        seasons = seasons,
        providerGroupId = group
    )

    val items: List<CatalogItem> = listOf(
        film(
            id = "film_obsidian",
            title = "Obsidian Night",
            synopsis = "Un enquêteur solitaire plonge dans une ville nocturne où chaque reflet cache un secret.",
            genres = listOf("Thriller", "Neo-noir"),
            year = 2024,
            duration = 128,
            poster = 0xFF1B2430,
            backdrop = 0xFF0E151F,
            progress = 0.42f,
            related = listOf("film_goldline", "film_harbor"),
            sequels = listOf("film_obsidian_2")
        ),
        film(
            id = "film_obsidian_2",
            title = "Obsidian Night: Echo",
            synopsis = "Les échos du passé forcent le retour dans les rues d’obsidienne.",
            genres = listOf("Thriller"),
            year = 2025,
            duration = 134,
            poster = 0xFF243447,
            backdrop = 0xFF121A24,
            related = listOf("film_obsidian"),
            sequels = emptyList()
        ),
        film(
            id = "film_goldline",
            title = "Goldline Express",
            synopsis = "Un braquage à grande vitesse sur une ligne ferroviaire mythique.",
            genres = listOf("Action", "Crime"),
            year = 2023,
            duration = 116,
            poster = 0xFF3A2A12,
            backdrop = 0xFF1C1408,
            progress = 0.18f,
            related = listOf("film_harbor", "film_crimson")
        ),
        film(
            id = "film_harbor",
            title = "Harbor Lights",
            synopsis = "Deux destins se croisent dans un port brumeux au bord de l’effondrement.",
            genres = listOf("Drame"),
            year = 2022,
            duration = 109,
            poster = 0xFF16324F,
            backdrop = 0xFF0C1B2B,
            related = listOf("film_velvet")
        ),
        film(
            id = "film_crimson",
            title = "Crimson Protocol",
            synopsis = "Une équipe d’élite doit désamorcer une menace mondiale en moins de 90 minutes.",
            genres = listOf("Action", "Sci-Fi"),
            year = 2025,
            duration = 121,
            poster = 0xFF4A1018,
            backdrop = 0xFF2A0A10
        ),
        film(
            id = "film_velvet",
            title = "Velvet Circuit",
            synopsis = "Dans les coulisses d’un cirque digital, l’illusion devient réalité.",
            genres = listOf("Fantastique"),
            year = 2021,
            duration = 102,
            poster = 0xFF3A1A3A,
            backdrop = 0xFF1C0E1C,
            group = "grp_docs"
        ),
        film(
            id = "film_north",
            title = "Northern Signal",
            synopsis = "Un message radio oublié réveille une base polaire abandonnée.",
            genres = listOf("Horreur", "Mystère"),
            year = 2024,
            duration = 98,
            poster = 0xFF102028,
            backdrop = 0xFF081018
        ),
        film(
            id = "film_kids_orbit",
            title = "Orbit Kids",
            synopsis = "Une troupe d’apprentis astronautes sauve leur station spatiale scolaire.",
            genres = listOf("Famille", "Aventure"),
            year = 2023,
            duration = 91,
            poster = 0xFF1A3A4A,
            backdrop = 0xFF0E222C,
            group = "grp_kids"
        ),
        film(
            id = "film_sable",
            title = "Sable Garden",
            synopsis = "Dans le jardin de sable, les enfants plantent des étoiles.",
            genres = listOf("Jeunesse", "Aventure"),
            year = 2017,
            duration = 95,
            poster = 0xFF1A4028,
            backdrop = 0xFF0C2014,
            group = "grp_kids"
        ),
        film(
            id = "film_midnight",
            title = "Midnight Protocol",
            synopsis = "Un code dormant s’éveille à minuit. Les villes suivent.",
            genres = listOf("Action", "Techno"),
            year = 2022,
            duration = 108,
            poster = 0xFF201848,
            backdrop = 0xFF100C28
        ),
        film(
            id = "film_pacific",
            title = "Pacific Drift",
            synopsis = "Une mer qui n’obéit plus aux marées.",
            genres = listOf("Drame"),
            year = 2025,
            duration = 116,
            poster = 0xFF103848,
            backdrop = 0xFF081C28
        ),
        film(
            id = "film_silent",
            title = "Silent Ballroom",
            synopsis = "Dans un hôtel fermé depuis 40 ans, la musique reprend chaque minuit.",
            genres = listOf("Horreur"),
            year = 2023,
            duration = 97,
            poster = 0xFF281040,
            backdrop = 0xFF140820
        ),
        series(
            id = "series_aurora",
            title = "Aurora Station",
            synopsis = "À bord d’une station orbitale, les alliances changent à chaque rotation.",
            genres = listOf("Sci-Fi", "Drame"),
            year = 2024,
            poster = 0xFF14283A,
            backdrop = 0xFF0A1620,
            progress = 0.55f,
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("s1e1", 1, "Docking", "Premier contact avec la station.", 48, 1f),
                        Episode("s1e2", 2, "Blackout", "Une panne révèle une trahison.", 46, 1f),
                        Episode("s1e3", 3, "Drift", "L’équipage dérive hors couverture.", 51, 0.35f)
                    )
                ),
                Season(
                    number = 2,
                    title = "Saison 2",
                    episodes = listOf(
                        Episode("s2e1", 1, "Reentry", "Le retour sur Terre n’est pas sûr.", 49, 0f),
                        Episode("s2e2", 2, "Mirror", "Un jumeau orbital apparaît.", 47, 0f)
                    )
                )
            )
        ),
        series(
            id = "series_quartz",
            title = "Quartz City",
            synopsis = "Dans une métropole de verre, un juge doit choisir entre loi et loyauté.",
            genres = listOf("Crime", "Drame"),
            year = 2023,
            poster = 0xFF2A2438,
            backdrop = 0xFF14101E,
            progress = 0.22f,
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("qc1e1", 1, "Verdict", "Un procès sans témoins.", 54, 1f),
                        Episode("qc1e2", 2, "Shatter", "La ville se fissure.", 52, 0.6f),
                        Episode("qc1e3", 3, "Refraction", "Les preuves se multiplient.", 55, 0f)
                    )
                )
            )
        ),
        series(
            id = "series_ember",
            title = "Ember House",
            synopsis = "Une famille garde un feu ancestral qui attire des visiteurs impossibles.",
            genres = listOf("Fantastique"),
            year = 2022,
            poster = 0xFF3A2010,
            backdrop = 0xFF1C1008,
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("eh1e1", 1, "Kindling", "La flamme s’éveille.", 44, 0f),
                        Episode("eh1e2", 2, "Ash", "Un invité refuse de partir.", 45, 0f)
                    )
                )
            )
        ),
        series(
            id = "series_pixel",
            title = "Pixel Rangers",
            synopsis = "Des héros 8-bit défendent un monde rétro contre la corruption numérique.",
            genres = listOf("Jeunesse", "Aventure"),
            year = 2025,
            poster = 0xFF1A3A28,
            backdrop = 0xFF0E2218,
            group = "grp_kids",
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("pr1e1", 1, "Boot", "Démarrage du monde.", 22, 0.4f),
                        Episode("pr1e2", 2, "Glitch", "Le premier bug.", 22, 0f),
                        Episode("pr1e3", 3, "Patch", "Une mise à jour dangereuse.", 22, 0f)
                    )
                )
            )
        ),
        series(
            id = "series_north",
            title = "North Wire",
            synopsis = "Une journaliste branche un réseau clandestin au-delà du cercle polaire.",
            genres = listOf("Crime"),
            year = 2021,
            poster = 0xFF102838,
            backdrop = 0xFF081420,
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("nw1e1", 1, "Gel", "Première piste gelée.", 52, 0f),
                        Episode("nw1e2", 2, "Câble", "Un signal pirate.", 51, 0f),
                        Episode("nw1e3", 3, "Source", "La source refuse de parler.", 53, 0f)
                    )
                )
            )
        ),
        series(
            id = "series_hollow",
            title = "Hollow Frequency",
            synopsis = "Une radio nocturne diffuse des appels venus d’adresses qui n’existent plus.",
            genres = listOf("Mystère"),
            year = 2019,
            poster = 0xFF241038,
            backdrop = 0xFF120820,
            seasons = listOf(
                Season(
                    number = 1,
                    title = "Saison 1",
                    episodes = listOf(
                        Episode("hf1e1", 1, "Statique", "Le premier appel.", 50, 0f),
                        Episode("hf1e2", 2, "Adresse", "Une rue introuvable.", 49, 0f)
                    )
                ),
                Season(
                    number = 2,
                    title = "Saison 2",
                    episodes = listOf(
                        Episode("hf2e1", 1, "Réponse", "Quelqu’un répond enfin.", 50, 0f)
                    )
                )
            )
        ),
        film(
            id = "film_iron",
            title = "Iron Waltz",
            synopsis = "Un danseur de combat retrouve son frère dans une arène où chaque pas est une arme.",
            genres = listOf("Action", "Drame"),
            year = 2016,
            duration = 124,
            poster = 0xFF3A1810,
            backdrop = 0xFF1C0C08
        ),
        film(
            id = "film_lunar",
            title = "Lunar Archive",
            synopsis = "Les archives de la Lune s’ouvrent. Les souvenirs qui en sortent n’appartiennent à personne.",
            genres = listOf("Science-fiction", "Mystère"),
            year = 2024,
            duration = 111,
            poster = 0xFF141848,
            backdrop = 0xFF0A0C28
        )
    )

    private val byId = items.associateBy { it.id }

    fun require(id: String): CatalogItem = byId.getValue(id)

    fun find(id: String): CatalogItem? = byId[id]

    fun films(): List<CatalogItem> = items.filter { it.type == ContentType.FILM }

    fun series(): List<CatalogItem> = items.filter { it.type == ContentType.SERIES }

    fun relatedOf(item: CatalogItem): List<CatalogItem> =
        item.relatedIds.mapNotNull { byId[it] }

    fun sequelsOf(item: CatalogItem): List<CatalogItem> =
        item.sequelIds.mapNotNull { byId[it] }

    fun buildRows(type: ContentType): List<HomeRow> {
        val pool = items.filter { it.type == type }
        val continueWatching = pool.filter { it.progressFraction > 0f }
        val news = pool.sortedByDescending { it.year }

        // Legacy helper for unit fixtures only — production UI uses CatalogPresenter.
        return listOf(
            HomeRow(HomeRowId.CONTINUE_WATCHING.key, HomeRowId.CONTINUE_WATCHING.label, continueWatching, true),
            HomeRow(HomeRowId.NEW_RELEASES.key, HomeRowId.NEW_RELEASES.label, news),
            HomeRow(HomeRowId.LIBRARY_SYNCED.key, HomeRowId.LIBRARY_SYNCED.label, pool)
        ).filter { it.items.isNotEmpty() }
    }

    fun heroFor(type: ContentType): CatalogItem =
        when (type) {
            ContentType.FILM -> require("film_obsidian")
            ContentType.SERIES -> require("series_aurora")
        }
}

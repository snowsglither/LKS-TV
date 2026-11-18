package com.lkstv.app.domain

import java.util.Locale

/**
 * Universal IPTV language helpers — ISO 639 / BCP 47.
 * Edition markers (VF, VO, MULTI, VOST*) are NOT ISO languages.
 */
object LanguageCodes {

    data class Detection(
        val tag: String,
        val confidence: LanguageConfidence,
        val edition: String? = null,
        val source: String? = null
    )

    private val isoAliases = mapOf(
        "fra" to "fr", "fre" to "fr", "fr" to "fr",
        "nld" to "nl", "dut" to "nl", "nl" to "nl",
        "eng" to "en", "en" to "en",
        "deu" to "de", "ger" to "de", "de" to "de",
        "spa" to "es", "es" to "es",
        "ita" to "it", "it" to "it",
        "por" to "pt", "pt" to "pt",
        "ara" to "ar", "ar" to "ar",
        "tur" to "tr", "tr" to "tr",
        "jpn" to "ja", "ja" to "ja",
        "kor" to "ko", "ko" to "ko",
        "zho" to "zh", "chi" to "zh", "zh" to "zh",
        "rus" to "ru", "ru" to "ru",
        "pol" to "pl", "pl" to "pl",
        "ukr" to "uk", "uk" to "uk",
        "ron" to "ro", "rum" to "ro", "ro" to "ro",
        "hun" to "hu", "hu" to "hu",
        "ces" to "cs", "cze" to "cs", "cs" to "cs",
        "swe" to "sv", "sv" to "sv",
        "nor" to "no", "no" to "no",
        "dan" to "da", "da" to "da",
        "fin" to "fi", "fi" to "fi",
        "ell" to "el", "gre" to "el", "el" to "el",
        "heb" to "he", "he" to "he",
        "hin" to "hi", "hi" to "hi",
        "tha" to "th", "th" to "th",
        "vie" to "vi", "vi" to "vi",
        "ind" to "id", "id" to "id",
        "msa" to "ms", "may" to "ms", "ms" to "ms",
        "bul" to "bg", "bg" to "bg",
        "hrv" to "hr", "hr" to "hr",
        "srp" to "sr", "sr" to "sr",
        "slk" to "sk", "slo" to "sk", "sk" to "sk",
        "cat" to "ca", "ca" to "ca",
        "fas" to "fa", "per" to "fa", "fa" to "fa",
        "urd" to "ur", "ur" to "ur",
        "mul" to "mul", "und" to "und"
    )

    private val frNames = mapOf(
        "fr" to "Français",
        "en" to "Anglais",
        "nl" to "Néerlandais",
        "de" to "Allemand",
        "es" to "Espagnol",
        "it" to "Italien",
        "pt" to "Portugais",
        "pt-BR" to "Portugais (Brésil)",
        "pt-PT" to "Portugais (Portugal)",
        "ar" to "Arabe",
        "tr" to "Turc",
        "ja" to "Japonais",
        "ko" to "Coréen",
        "zh" to "Chinois",
        "zh-Hans" to "Chinois simplifié",
        "zh-Hant" to "Chinois traditionnel",
        "ru" to "Russe",
        "pl" to "Polonais",
        "uk" to "Ukrainien",
        "ro" to "Roumain",
        "hu" to "Hongrois",
        "cs" to "Tchèque",
        "sv" to "Suédois",
        "no" to "Norvégien",
        "da" to "Danois",
        "fi" to "Finnois",
        "el" to "Grec",
        "he" to "Hébreu",
        "hi" to "Hindi",
        "th" to "Thaï",
        "vi" to "Vietnamien",
        "id" to "Indonésien",
        "ms" to "Malais",
        "bg" to "Bulgare",
        "hr" to "Croate",
        "sr" to "Serbe",
        "sk" to "Slovaque",
        "ca" to "Catalan",
        "fa" to "Persan",
        "ur" to "Ourdou",
        "mul" to "Multi-langues"
    )

    private val editionLabels = mapOf(
        "vf" to "VF",
        "vo" to "VO",
        "multi" to "Multi",
        "vostfr" to "VOSTFR",
        "vostnl" to "VOSTNL",
        "vost" to "VOST",
        "truefrench" to "TrueFrench"
    )

    fun normalize(raw: String?): String {
        if (raw.isNullOrBlank()) return ""
        var s = raw.trim().replace('_', '-')
        if (s.startsWith("edition:", ignoreCase = true)) return s.lowercase()
        if (s.matches(Regex("(?i)^(vf|vo|multi|vostfr|vostnl|vost|truefrench)$"))) {
            return "edition:${s.lowercase()}"
        }
        val upper = s.uppercase()
        when (upper) {
            "UNKNOWN", "OTHER" -> return ""
            "VF" -> return "edition:vf"
            "VO" -> return "edition:vo"
            "EN" -> return "en"
            "NL" -> return "nl"
        }
        val lower = s.lowercase()
        val bcp = Regex("^([a-z]{2,3})(?:-([a-z0-9]{2,8}))?(?:-([a-z0-9]{2,8}))?", RegexOption.IGNORE_CASE)
            .find(lower) ?: return isoAliases[lower] ?: ""
        val primaryRaw = bcp.groupValues[1].lowercase()
        // Strict: known alias, or Locale-proven language — never IPTV country/provider codes (GB/AL/EX/GR).
        val primary = isoAliases[primaryRaw]
            ?: provenIsoLanguage(primaryRaw)
            ?: return ""
        if (primary == "und") return ""
        val rest1 = bcp.groupValues.getOrNull(2)?.lowercase().orEmpty()
        if (primary == "zh" && rest1.isNotEmpty()) {
            return when (rest1) {
                "hant", "tw", "hk" -> "zh-Hant"
                "hans", "cn", "sg" -> "zh-Hans"
                else -> "zh"
            }
        }
        if (primary == "pt" && rest1.isNotEmpty()) {
            return when (rest1.uppercase()) {
                "BR" -> "pt-BR"
                "PT" -> "pt-PT"
                else -> "pt"
            }
        }
        if (rest1.length == 2) return "$primary-${rest1.uppercase()}"
        if (rest1 == "hans" || rest1 == "hant") {
            return "$primary-${rest1.replaceFirstChar { it.uppercase() }}"
        }
        return primary
    }

    fun isEdition(tag: String?): Boolean = tag?.startsWith("edition:", ignoreCase = true) == true

    fun editionOf(tag: String?): String? =
        tag?.lowercase()?.removePrefix("edition:")?.takeIf { isEdition(tag) }

    /**
     * Accept only codes Locale recognizes as languages.
     * Rejects ambiguous IPTV prefixes (GB, US, EX, GR, AL…) that are countries/groups, not audio.
     */
    private fun provenIsoLanguage(code: String): String? {
        if (code.length !in 2..3) return null
        // Common IPTV folder / country tokens — never languages without stronger proof.
        val ambiguous = setOf(
            // Country / provider folder tokens frequently used as IPTV title prefixes.
            // Do not list real ISO 639 codes here (e.g. eu=Basque, be=Belarusian, ca=Catalan).
            "gb", "us", "uk", "ex", "al", "gr", "xx", "xf", "tv", "hd", "uhd", "4k",
            "ae", "sa", "qa", "kw", "bh", "om", "ic"
        )
        if (code in ambiguous) return null
        return runCatching {
            val iso3 = Locale(code).isO3Language
            if (iso3.isNullOrBlank()) null else code
        }.getOrNull()
    }

    fun displayName(tag: String?, useful: Boolean = true): String {
        val norm = normalize(tag)
        if (norm.isEmpty()) return if (useful) "Langue non renseignée" else ""
        if (isEdition(norm)) {
            val ed = editionOf(norm) ?: return norm
            return editionLabels[ed] ?: ed.uppercase()
        }
        frNames[norm]?.let { return it }
        val primary = norm.substringBefore('-')
        frNames[primary]?.let { base ->
            if (norm.contains('-')) {
                val region = norm.substringAfter('-')
                return "$base ($region)"
            }
            return base
        }
        // Any ISO language via Locale — no manual allowlist required.
        return runCatching {
            val loc = Locale.forLanguageTag(norm)
            val name = loc.getDisplayLanguage(Locale.FRENCH).trim()
            when {
                name.isBlank() || name.equals(norm, ignoreCase = true) -> norm.uppercase()
                norm.contains('-') -> {
                    val region = loc.getDisplayCountry(Locale.FRENCH).ifBlank {
                        loc.script.takeIf { it.isNotBlank() } ?: norm.substringAfter('-')
                    }
                    if (region.isNotBlank()) "$name ($region)" else name.replaceFirstChar { it.uppercase() }
                }
                else -> name.replaceFirstChar { it.uppercase() }
            }
        }.getOrElse { norm.uppercase() }
    }

    fun matchesPreferred(streamTag: String?, preferred: String?): Boolean {
        val pref = normalize(preferred).ifBlank { preferred?.lowercase().orEmpty() }
        val got = normalize(streamTag)
        if (pref.isEmpty() || pref == "und") return true
        if (got.isEmpty()) return false
        if (pref == got) return true
        if (pref == "edition:vf" || pref == "vf" || pref == "fr" || pref.startsWith("fr-")) {
            return got == "edition:vf" || got == "fr" || got.startsWith("fr-")
        }
        if (pref == "edition:vo" || pref == "vo") {
            return got == "edition:vo" || got.startsWith("edition:vost")
        }
        if (pref == "edition:multi" || pref == "multi" || pref == "mul") {
            return got == "edition:multi" || got == "mul"
        }
        if (isEdition(got)) return false
        return pref.substringBefore('-') == got.substringBefore('-')
    }

    fun migratePreferred(legacy: String?): String {
        if (legacy.isNullOrBlank()) return "edition:vf"
        normalize(legacy).takeIf { it.isNotEmpty() }?.let { return it }
        return when (legacy.uppercase()) {
            "VF" -> "edition:vf"
            "VO" -> "edition:vo"
            "EN" -> "en"
            "NL" -> "nl"
            else -> "edition:vf"
        }
    }

    fun toAudioLanguage(tag: String?): AudioLanguage {
        val norm = normalize(tag)
        if (norm.isEmpty()) return AudioLanguage.UNKNOWN
        if (norm == "edition:vf" || norm == "fr" || norm.startsWith("fr-")) return AudioLanguage.VF
        if (norm == "edition:vo" || norm.startsWith("edition:vost")) return AudioLanguage.VO
        if (norm == "en" || norm.startsWith("en-")) return AudioLanguage.EN
        if (norm == "nl" || norm.startsWith("nl-")) return AudioLanguage.NL
        if (norm == "edition:multi" || norm == "mul") return AudioLanguage.OTHER
        return AudioLanguage.OTHER
    }

    fun fromAudioLanguage(lang: AudioLanguage): String = when (lang) {
        AudioLanguage.VF -> "edition:vf"
        AudioLanguage.VO -> "edition:vo"
        AudioLanguage.EN -> "en"
        AudioLanguage.NL -> "nl"
        AudioLanguage.OTHER -> ""
        AudioLanguage.UNKNOWN -> ""
    }

    fun preferredChoices(): List<Pair<String, String>> = listOf(
        "edition:vf" to "VF (français)",
        "fr" to "Français",
        "edition:vo" to "VO",
        "en" to "Anglais",
        "nl" to "Néerlandais",
        "de" to "Allemand",
        "es" to "Espagnol",
        "it" to "Italien",
        "pt" to "Portugais",
        "pt-BR" to "Portugais (Brésil)",
        "ar" to "Arabe",
        "tr" to "Turc",
        "ja" to "Japonais",
        "ko" to "Coréen",
        "zh-Hans" to "Chinois simplifié",
        "zh-Hant" to "Chinois traditionnel",
        "ru" to "Russe",
        "edition:multi" to "Multi"
    )

    fun detect(title: String, group: String = "", useGroup: Boolean = true): Detection {
        scanEditions(title)?.let {
            return Detection(it.first, LanguageConfidence.KNOWN, editionOf(it.first), "title")
        }
        scanIso(title, LanguageConfidence.KNOWN)?.let {
            return Detection(it.first, it.second, null, "title")
        }
        Regex("""^\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)\s*[-–|:./]\s+""")
            .find(title)?.groupValues?.getOrNull(1)?.let { token ->
                val norm = normalize(token)
                if (norm.isNotEmpty() && !isEdition(norm)) {
                    return Detection(norm, LanguageConfidence.ASSUMED, null, "title-prefix")
                }
            }
        if (useGroup && group.isNotBlank()) {
            scanEditions(group)?.let {
                return Detection(it.first, LanguageConfidence.ASSUMED, editionOf(it.first), "group")
            }
            scanIso(group, LanguageConfidence.ASSUMED)?.let {
                return Detection(it.first, it.second, null, "group")
            }
        }
        return Detection("", LanguageConfidence.UNKNOWN, null, null)
    }

    private fun scanEditions(text: String): Pair<String, LanguageConfidence>? {
        val t = text
        if (Regex("""\bTRUEFRENCH\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:truefrench" to LanguageConfidence.KNOWN
        }
        if (Regex("""\bVOSTFR\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:vostfr" to LanguageConfidence.KNOWN
        }
        if (Regex("""\bVOSTNL\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:vostnl" to LanguageConfidence.KNOWN
        }
        if (Regex("""\bVOST\b""", RegexOption.IGNORE_CASE).containsMatchIn(t) &&
            !Regex("""\bVOSTFR\b""", RegexOption.IGNORE_CASE).containsMatchIn(t) &&
            !Regex("""\bVOSTNL\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)
        ) {
            return "edition:vost" to LanguageConfidence.KNOWN
        }
        if (Regex("""\bMULTI\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:multi" to LanguageConfidence.KNOWN
        }
        if (Regex("""\b(VF|VFF|VFQ|VFI)\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:vf" to LanguageConfidence.KNOWN
        }
        if (Regex("""(?:^|[^A-Za-z0-9])VO(?:[^A-Za-z0-9]|$)""", RegexOption.IGNORE_CASE).containsMatchIn(t) &&
            !Regex("""\bVOST""", RegexOption.IGNORE_CASE).containsMatchIn(t)
        ) {
            return "edition:vo" to LanguageConfidence.KNOWN
        }
        if (Regex("""\bOV\b""", RegexOption.IGNORE_CASE).containsMatchIn(t)) {
            return "edition:vo" to LanguageConfidence.KNOWN
        }
        return null
    }

    private fun scanIso(text: String, confidence: LanguageConfidence): Pair<String, LanguageConfidence>? {
        val skip = setOf(
            "HD", "SD", "UHD", "HDR", "DV", "MKV", "MP4", "TS", "AVC", "AAC", "AC3", "DTS",
            "H264", "H265", "HEVC", "AV1", "XVID", "WEB", "DL", "BLURAY", "REMUX"
        )
        val bracket = Regex("""[\[({]\s*([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})?)\s*[\])}]""")
        for (m in bracket.findAll(text)) {
            val cand = m.groupValues[1]
            if (cand.uppercase() in skip) continue
            val norm = normalize(cand)
            if (norm.isNotEmpty() && !isEdition(norm)) return norm to confidence
        }
        val names = listOf(
            Regex("""français|francais|french""", RegexOption.IGNORE_CASE) to "fr",
            Regex("""english|anglais""", RegexOption.IGNORE_CASE) to "en",
            Regex("""nederland|dutch|néerlandais|neerlandais|flamand""", RegexOption.IGNORE_CASE) to "nl",
            Regex("""deutsch|german|allemand""", RegexOption.IGNORE_CASE) to "de",
            Regex("""español|espanol|spanish|castellano|espagnol""", RegexOption.IGNORE_CASE) to "es",
            Regex("""italiano|italian|italien""", RegexOption.IGNORE_CASE) to "it",
            Regex("""português|portugues|portuguese|portugais""", RegexOption.IGNORE_CASE) to "pt",
            Regex("""arabic|arabe""", RegexOption.IGNORE_CASE) to "ar",
            Regex("""turkish|turc|türkçe|turkce""", RegexOption.IGNORE_CASE) to "tr",
            Regex("""japanese|japonais""", RegexOption.IGNORE_CASE) to "ja",
            Regex("""korean|coréen|coreen""", RegexOption.IGNORE_CASE) to "ko",
            Regex("""chinese|chinois|mandarin""", RegexOption.IGNORE_CASE) to "zh",
            Regex("""russian|russe""", RegexOption.IGNORE_CASE) to "ru",
            Regex("""hindi""", RegexOption.IGNORE_CASE) to "hi"
        )
        for ((re, tag) in names) {
            if (re.containsMatchIn(text)) return tag to confidence
        }
        return null
    }
}

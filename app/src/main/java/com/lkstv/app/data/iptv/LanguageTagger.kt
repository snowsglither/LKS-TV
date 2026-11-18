package com.lkstv.app.data.iptv

import com.lkstv.app.domain.AudioLanguage
import com.lkstv.app.domain.LanguageCodes
import com.lkstv.app.domain.LanguageConfidence

object LanguageTagger {
    data class Result(
        val language: AudioLanguage,
        val confidence: LanguageConfidence,
        val languageTag: String
    )

    fun detect(rawTitle: String, groupName: String = ""): Result {
        val d = LanguageCodes.detect(rawTitle, groupName)
        return Result(
            language = LanguageCodes.toAudioLanguage(d.tag),
            confidence = d.confidence,
            languageTag = d.tag
        )
    }

    /** Backward-compatible Pair API used by older call sites. */
    fun detectPair(rawTitle: String, groupName: String = ""): Pair<AudioLanguage, LanguageConfidence> {
        val r = detect(rawTitle, groupName)
        return r.language to r.confidence
    }
}

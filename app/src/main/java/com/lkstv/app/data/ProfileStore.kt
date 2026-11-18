package com.lkstv.app.data

import com.lkstv.app.domain.FakeCatalog
import com.lkstv.app.domain.Profile
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Persistent profiles on device. Seeds Alex/Sam once; never resets user profiles on update.
 */
class ProfileStore(private val file: File) {
    private val json = Json { ignoreUnknownKeys = true; prettyPrint = true }

    @Serializable
    private data class FileEntity(
        val schemaVersion: Int = 1,
        val profiles: List<ProfileEntity> = emptyList()
    )

    @Serializable
    private data class ProfileEntity(
        val id: String,
        val name: String,
        val avatarColor: Long
    )

    fun read(): List<Profile> {
        if (!file.exists()) {
            val seeded = FakeCatalog.profiles
            write(seeded)
            return seeded
        }
        return runCatching {
            val entity = json.decodeFromString<FileEntity>(file.readText())
            entity.profiles.map { Profile(it.id, it.name, it.avatarColor) }
                .ifEmpty {
                    FakeCatalog.profiles.also { write(it) }
                }
        }.getOrElse {
            FakeCatalog.profiles.also { write(it) }
        }
    }

    fun write(profiles: List<Profile>) {
        file.parentFile?.mkdirs()
        val entity = FileEntity(
            schemaVersion = 1,
            profiles = profiles.map { ProfileEntity(it.id, it.name, it.avatarColor) }
        )
        file.writeText(json.encodeToString(entity))
    }
}

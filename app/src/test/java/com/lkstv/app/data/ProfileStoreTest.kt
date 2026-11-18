package com.lkstv.app.data

import com.lkstv.app.domain.Profile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ProfileStoreTest {
    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun persistsAndReloadsProfiles() {
        val file = tmp.newFile("profiles.json")
        val store = ProfileStore(file)
        val written = listOf(
            Profile("p1", "Ada", 0xFFE50914),
            Profile("p2", "Sam", 0xFF44AADD)
        )
        store.write(written)
        val read = ProfileStore(file).read()
        assertEquals(2, read.size)
        assertEquals("Ada", read[0].name)
        assertEquals("Sam", read[1].name)
    }

    @Test
    fun seedsDefaultsWhenMissing() {
        val file = tmp.newFile("missing-then-seed.json")
        file.delete()
        val store = ProfileStore(file)
        val profiles = store.read()
        assertTrue(profiles.isNotEmpty())
        assertTrue(file.exists())
    }
}

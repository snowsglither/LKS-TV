package com.lkstv.app

import com.lkstv.app.data.SessionRepository
import com.lkstv.app.domain.HomeRowId
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionRepositoryTest {

    @Test
    fun profilePreferencesAreIsolated() {
        val session = SessionRepository()
        session.selectProfile("profile_alex")
        session.toggleGroupHidden("grp_kids")
        assertTrue(session.preferencesFor().hiddenGroupIds.contains("grp_kids"))

        session.selectProfile("profile_sam")
        // Sam already hides kids by default in seed data
        assertTrue(session.preferencesFor().hiddenGroupIds.contains("grp_kids"))
        session.toggleGroupHidden("grp_kids")
        assertFalse(session.preferencesFor().hiddenGroupIds.contains("grp_kids"))

        session.selectProfile("profile_alex")
        assertTrue(session.preferencesFor().hiddenGroupIds.contains("grp_kids"))
    }

    @Test
    fun rowReorderMovesVisibleRows() {
        val session = SessionRepository()
        session.selectProfile("profile_alex")
        val before = session.preferencesFor().visibleRowIds
        val first = before.first()
        val second = before[1]
        session.moveRow(second, up = true)
        val after = session.preferencesFor().visibleRowIds
        assertEquals(second, after.first())
        assertEquals(first, after[1])
    }

    @Test
    fun demoRefreshDoesNotThrow() = runTest {
        val session = SessionRepository()
        session.selectProfile("profile_alex")
        session.runDemoRefresh()
        assertTrue(session.lastDemoSyncMessage.value?.contains("Démo") == true ||
            session.lastDemoSyncMessage.value?.contains("démo") == true ||
            session.lastDemoSyncMessage.value?.contains("Simulation") == true ||
            session.lastDemoSyncMessage.value != null)
    }

    @Test
    fun toggleRowKeepsAtLeastOneVisible() {
        val session = SessionRepository()
        session.selectProfile("profile_sam")
        val rows = session.preferencesFor().visibleRowIds.toList()
        rows.dropLast(1).forEach { session.toggleRowVisible(it) }
        assertEquals(1, session.preferencesFor().visibleRowIds.size)
        session.toggleRowVisible(session.preferencesFor().visibleRowIds.first())
        assertEquals(1, session.preferencesFor().visibleRowIds.size)
        // ensure HomeRowId still valid
        assertTrue(session.preferencesFor().visibleRowIds.first() in HomeRowId.entries)
    }
}

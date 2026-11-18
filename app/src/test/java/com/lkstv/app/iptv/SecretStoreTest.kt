package com.lkstv.app.iptv

import com.lkstv.app.data.iptv.security.InMemorySecretStore
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.XtreamCredentials
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SecretStoreTest {

    @Test
    fun storesAndDeletesCredentialsWithoutExposingInToStringContract() {
        val store = InMemorySecretStore()
        val id = IptvSourceId("xtream_1")
        store.putXtreamCredentials(id, XtreamCredentials("user_demo", "pass_demo"))
        assertEquals("user_demo", store.getXtreamCredentials(id)?.username)
        store.deleteXtreamCredentials(id)
        assertNull(store.getXtreamCredentials(id))
    }
}

package com.lkstv.app.data.iptv.security

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.lkstv.app.domain.iptv.IptvSourceId
import com.lkstv.app.domain.iptv.SecretStore
import com.lkstv.app.domain.iptv.XtreamCredentials

/**
 * Xtream credentials encrypted at rest via AndroidX Security (Android Keystore master key).
 * Never log values from this store.
 */
class AndroidKeystoreSecretStore(
    context: Context
) : SecretStore {

    private val prefs = EncryptedSharedPreferences.create(
        context.applicationContext,
        PREFS_NAME,
        MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    override fun putXtreamCredentials(sourceId: IptvSourceId, credentials: XtreamCredentials) {
        prefs.edit()
            .putString(userKey(sourceId), credentials.username)
            .putString(passKey(sourceId), credentials.password)
            .apply()
    }

    override fun getXtreamCredentials(sourceId: IptvSourceId): XtreamCredentials? {
        val user = prefs.getString(userKey(sourceId), null) ?: return null
        val pass = prefs.getString(passKey(sourceId), null) ?: return null
        return XtreamCredentials(user, pass)
    }

    override fun deleteXtreamCredentials(sourceId: IptvSourceId) {
        prefs.edit()
            .remove(userKey(sourceId))
            .remove(passKey(sourceId))
            .apply()
    }

    override fun clearAll() {
        prefs.edit().clear().apply()
    }

    private fun userKey(id: IptvSourceId) = "xtream.user.${id.value}"
    private fun passKey(id: IptvSourceId) = "xtream.pass.${id.value}"

    companion object {
        private const val PREFS_NAME = "lks_tv_secure_sources"
    }
}

/** JVM / unit-test double — not for production. */
class InMemorySecretStore : SecretStore {
    private val map = mutableMapOf<String, XtreamCredentials>()

    override fun putXtreamCredentials(sourceId: IptvSourceId, credentials: XtreamCredentials) {
        map[sourceId.value] = credentials
    }

    override fun getXtreamCredentials(sourceId: IptvSourceId): XtreamCredentials? = map[sourceId.value]

    override fun deleteXtreamCredentials(sourceId: IptvSourceId) {
        map.remove(sourceId.value)
    }

    override fun clearAll() = map.clear()
}

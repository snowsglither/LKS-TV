package com.lkstv.app

import android.app.Application
import com.lkstv.app.data.ProfilePreferencesStore
import com.lkstv.app.data.ProfileStore
import com.lkstv.app.data.SessionRepository
import com.lkstv.app.data.iptv.IptvContainer
import java.io.File

class LksTvApplication : Application() {
    lateinit var iptv: IptvContainer
        private set

    lateinit var sessionRepository: SessionRepository
        private set

    override fun onCreate() {
        super.onCreate()
        iptv = IptvContainer(this)
        val prefsFile = File(filesDir, "iptv/profile_prefs.json")
        val profilesFile = File(filesDir, "iptv/profiles.json")
        sessionRepository = SessionRepository(
            store = ProfilePreferencesStore(prefsFile),
            profileStore = ProfileStore(profilesFile)
        )
    }
}

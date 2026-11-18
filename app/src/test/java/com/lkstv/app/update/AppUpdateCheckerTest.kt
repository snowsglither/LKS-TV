package com.lkstv.app.update

import com.lkstv.app.data.update.AppUpdateChecker
import com.lkstv.app.data.update.UpdateCheckResult
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AppUpdateCheckerTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun disabledWhenUrlBlank() = runBlocking {
        val result = AppUpdateChecker.check(manifestUrl = "", installedVersionCode = 1)
        assertEquals(UpdateCheckResult.Disabled, result)
    }

    @Test
    fun detectsNewerVersion() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """
                {
                  "versionCode": 5,
                  "versionName": "1.1.0",
                  "apkUrl": "https://cdn.example.com/lks.apk",
                  "sha256": "abc123",
                  "changelog": "Fixes"
                }
                """.trimIndent()
            )
        )
        val result = AppUpdateChecker.check(
            manifestUrl = server.url("/manifest.json").toString(),
            installedVersionCode = 2
        )
        assertTrue(result is UpdateCheckResult.Available)
        val available = result as UpdateCheckResult.Available
        assertEquals(5, available.manifest.versionCode)
        assertEquals("1.1.0", available.manifest.versionName)
    }

    @Test
    fun upToDateWhenSameOrOlder() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """
                {
                  "versionCode": 2,
                  "versionName": "0.3.0",
                  "apkUrl": "https://cdn.example.com/lks.apk",
                  "sha256": "abc123"
                }
                """.trimIndent()
            )
        )
        val result = AppUpdateChecker.check(
            manifestUrl = server.url("/manifest.json").toString(),
            installedVersionCode = 2
        )
        assertEquals(UpdateCheckResult.UpToDate, result)
    }

    @Test
    fun rejectsNonHttpsApkUrl() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """
                {
                  "versionCode": 9,
                  "versionName": "9.0.0",
                  "apkUrl": "http://insecure.example.com/lks.apk",
                  "sha256": "abc123"
                }
                """.trimIndent()
            )
        )
        val result = AppUpdateChecker.check(
            manifestUrl = server.url("/manifest.json").toString(),
            installedVersionCode = 1
        )
        assertTrue(result is UpdateCheckResult.Failed)
    }
}

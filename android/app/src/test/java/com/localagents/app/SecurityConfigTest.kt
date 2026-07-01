package com.localagents.app

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SecurityConfigTest {

    @Test
    fun manifestDoesNotEnableGlobalCleartextAndDeclaresNotifications() {
        val manifest = File("src/main/AndroidManifest.xml").readText()

        assertFalse(manifest.contains("android:usesCleartextTraffic=\"true\""))
        assertTrue(manifest.contains("@xml/network_security_config"))
        assertTrue(manifest.contains("android.permission.POST_NOTIFICATIONS"))
    }

    @Test
    fun networkSecurityConfigKeepsCleartextScoped() {
        val config = File("src/main/res/xml/network_security_config.xml").readText()

        assertTrue(config.contains("<base-config cleartextTrafficPermitted=\"false\""))
        assertTrue(config.contains("10.0.2.2"))
        assertTrue(config.contains("tail033a5f.ts.net"))
    }
}

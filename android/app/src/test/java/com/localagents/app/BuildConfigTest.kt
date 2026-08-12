package com.localagents.app

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Guards on the release build configuration.
 *
 * These are the settings whose breakage is invisible until an upload is rejected or a
 * device misbehaves, so they are pinned where CI can see them.
 */
class BuildConfigTest {

    private val moduleGradle get() = File("build.gradle.kts").readText()
    private val projectGradle get() = File("../build.gradle.kts").readText()
    private val gradleProperties get() = File("../gradle.properties").readText()

    @Test
    fun compileSdkIsSupportedRatherThanSuppressed() {
        // `android.suppressUnsupportedCompileSdk` silences the warning that the Android
        // Gradle Plugin has not been tested against this compileSdk. Muting it hides a
        // genuinely untested combination; the fix is a plugin version that supports it.
        assertFalse(
            "remove android.suppressUnsupportedCompileSdk and upgrade AGP instead",
            gradleProperties.contains("suppressUnsupportedCompileSdk"),
        )

        val agp = Regex("""id\("com\.android\.application"\) version "(\d+)\.(\d+)""")
            .find(projectGradle)
        requireNotNull(agp) { "could not read the Android Gradle Plugin version" }
        val major = agp.groupValues[1].toInt()
        val minor = agp.groupValues[2].toInt()
        // compileSdk 35 is officially supported from AGP 8.6.
        assertTrue("AGP $major.$minor is too old for compileSdk 35", major > 8 || minor >= 6)
    }

    @Test
    fun playStoreTargetSdkRequirementIsMet() {
        assertTrue(moduleGradle.contains("targetSdk = 35"))
        assertTrue(moduleGradle.contains("compileSdk = 35"))
    }

    @Test
    fun releaseBuildIsMinifiedAndCanRefuseDebugSigning() {
        assertTrue(moduleGradle.contains("isMinifyEnabled = true"))
        // A store upload signed with the debug key is rejected by Play, and the
        // fallback makes that failure silent until upload time.
        assertTrue(moduleGradle.contains("requireReleaseSigning"))
    }

    @Test
    fun everyShippedLanguageIsInstalledFromTheBundle() {
        // Without this, Play delivers only the device's current language and the
        // per-app language picker declared by locales_config.xml has nothing to pick.
        assertTrue(moduleGradle.contains("language { enableSplit = false }"))
    }
}

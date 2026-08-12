package com.localagents.app

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Keeps the translated resources honest.
 *
 * A key present in the Turkish source but missing from `values-en` silently falls
 * back to Turkish text inside an otherwise English UI, and a format specifier that
 * drifts between locales throws at runtime rather than at build time — both are the
 * kind of defect that only shows up on a user's device.
 */
class LocalizationTest {

    private val stringPattern = Regex("""<string name="([^"]+)"[^>]*>(.*?)</string>""", RegexOption.DOT_MATCHES_ALL)
    private val formatPattern = Regex("""%(\d+\$[sd])""")

    private fun strings(path: String): Map<String, String> =
        stringPattern.findAll(File(path).readText())
            .associate { it.groupValues[1] to it.groupValues[2] }

    private val turkish get() = strings("src/main/res/values/strings.xml")
    private val english get() = strings("src/main/res/values-en/strings.xml")

    @Test
    fun everyStringIsTranslated() {
        val missing = turkish.keys - english.keys
        val extra = english.keys - turkish.keys

        assertEquals("keys missing from values-en", emptySet<String>(), missing)
        assertEquals("keys in values-en with no source string", emptySet<String>(), extra)
    }

    @Test
    fun formatSpecifiersMatchAcrossLocales() {
        val source = turkish
        english.forEach { (key, value) ->
            val expected = formatPattern.findAll(source.getValue(key)).map { it.value }.toSortedSet()
            val actual = formatPattern.findAll(value).map { it.value }.toSortedSet()
            assertEquals("format specifiers differ for $key", expected, actual)
        }
    }

    @Test
    fun noTranslationIsEmpty() {
        english.forEach { (key, value) ->
            assertTrue("empty translation for $key", value.isNotEmpty())
        }
    }

    @Test
    fun shippedLocalesAreDeclaredForPerAppLanguageSelection() {
        val config = File("src/main/res/xml/locales_config.xml").readText()

        assertTrue(config.contains("""android:name="tr""""))
        assertTrue(config.contains("""android:name="en""""))
        assertTrue(File("src/main/AndroidManifest.xml").readText().contains("@xml/locales_config"))
    }
}

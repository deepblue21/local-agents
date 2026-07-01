package com.localagents.app.net

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class LocalAgentsClientTest {
    @Test
    fun parsesPersistedRunEvent() {
        val event = LocalAgentsClient.parseEvent(
            """{"seq":12,"run_id":"r-1","type":"assistant.delta","payload":{"content":"Merhaba"},"created_at":"2026-06-22T12:00:00Z"}""",
        )

        assertEquals(12, event.seq)
        assertEquals("assistant.delta", event.type)
        assertEquals("Merhaba", event.payload["content"])
    }

    @Test
    fun normalizesTailscaleHostWithoutScheme() {
        assertEquals(
            "http://salih.tail033a5f.ts.net:8787",
            normalizedBaseUrl(" salih.tail033a5f.ts.net:8787/admin?ignored=true "),
        )
    }

    @Test
    fun rejectsIncompleteAndUnsupportedUrlsWithoutThrowing() {
        assertNull(normalizedBaseUrl(""))
        assertNull(normalizedBaseUrl("http://"))
        assertNull(normalizedBaseUrl("https://"))
        assertNull(normalizedBaseUrl("ftp://salih.tail033a5f.ts.net:8787"))
    }

    @Test
    fun buildsEndpointUrlsFromNormalizedBase() {
        assertEquals(
            "http://salih.tail033a5f.ts.net:8787/health",
            endpointUrl("http://salih.tail033a5f.ts.net:8787/", "/health")?.toString(),
        )
    }

    @Test
    fun healthReturnsFalseForIncompleteUrls() = runBlocking {
        assertFalse(LocalAgentsClient().health("http://").ok)
    }

    @Test
    fun pairReportsInvalidUrlBeforeBuildingRequest() {
        val error = assertThrows(ApiException::class.java) {
            runBlocking { LocalAgentsClient().pair("http://", "code", "Phone") }
        }

        assertEquals("Sunucu adresi geçersiz", error.message)
    }
}

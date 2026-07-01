package com.localagents.app

import com.localagents.app.data.ModelOption
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelSelectionTest {
    private val offlineOllama = ModelOption(
        id = "qwen3.6",
        name = "qwen3.6 (çevrimdışı)",
        provider = "ollama",
        capabilities = listOf("unavailable"),
    )
    private val novaAuto = ModelOption(
        id = "auto",
        name = "auto",
        provider = "nova",
        capabilities = listOf("chat", "stream"),
    )

    @Test
    fun offline_selection_moves_to_available_nova_model() {
        assertEquals(novaAuto, selectUsableModel(offlineOllama, listOf(offlineOllama, novaAuto)))
    }

    @Test
    fun available_selection_is_preserved() {
        assertEquals(novaAuto, selectUsableModel(novaAuto, listOf(offlineOllama, novaAuto)))
    }
}

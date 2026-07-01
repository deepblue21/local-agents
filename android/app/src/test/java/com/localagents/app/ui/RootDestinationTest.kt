package com.localagents.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class RootDestinationTest {
    @Test
    fun `loading wins before settings are ready`() {
        assertEquals(RootDestination.LOADING, rootDestination(false, "", true))
    }

    @Test
    fun `first launch shows setup before pairing`() {
        assertEquals(RootDestination.SETUP, rootDestination(true, "", true))
    }

    @Test
    fun `dismissed setup opens pairing without a token`() {
        assertEquals(RootDestination.PAIR, rootDestination(true, "", false))
    }

    @Test
    fun `paired device opens the console`() {
        assertEquals(RootDestination.MAIN, rootDestination(true, "access-token", false))
    }
}

package com.localagents.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test

class AgentActivityIndicatorTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun agentActivityIndicator_is_exposed_for_ui_tests() {
        composeRule.mainClock.autoAdvance = false
        composeRule.setContent { AgentActivityIndicator(diameter = 24.dp) }

        composeRule.onNodeWithContentDescription("agent activity").assertIsDisplayed()
        composeRule.mainClock.advanceTimeBy(650)
        composeRule.onNodeWithContentDescription("agent activity").assertIsDisplayed()
    }

    @Test
    fun agentActivityRow_shows_status_label_and_indicator() {
        composeRule.setContent { AgentActivityRow("agent active") }

        composeRule.onNodeWithText("agent active").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("agent activity").assertIsDisplayed()
    }
}

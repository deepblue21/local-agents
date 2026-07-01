package com.localagents.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.localagents.app.data.SessionContext
import com.localagents.app.ui.theme.LocalAgentsTheme
import org.junit.Rule
import org.junit.Test

class ContextPanelTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun contextPanel_shows_usage_and_enabled_compress_action() {
        composeRule.setContent {
            LocalAgentsTheme {
                ContextPanel(
                    context = SessionContext(
                        tokenEstimate = 8192,
                        maxTokens = 8192,
                        usageRatio = 1.0,
                        usagePercent = 100,
                        messageCount = 8,
                        canCompress = true,
                    ),
                    busy = false,
                    compressing = false,
                    onCompress = {},
                )
            }
        }

        composeRule.onNodeWithText("8.192 / 8.192 token · 100%").assertIsDisplayed()
        composeRule.onNodeWithText("Özetle & sürdür").assertIsEnabled()
    }

    @Test
    fun contextPanel_disables_compress_while_run_is_active() {
        composeRule.setContent {
            LocalAgentsTheme {
                ContextPanel(
                    context = SessionContext(
                        tokenEstimate = 6000,
                        maxTokens = 8192,
                        usageRatio = 0.73,
                        usagePercent = 73,
                        messageCount = 8,
                        canCompress = true,
                    ),
                    busy = true,
                    compressing = false,
                    onCompress = {},
                )
            }
        }

        composeRule.onNodeWithText("Özetle & sürdür").assertIsNotEnabled()
    }
}

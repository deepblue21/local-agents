package com.localagents.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

/**
 * Compose UI testi — StatusChip doğru Türkçe durum etiketini gösteriyor mu?
 * StatusChip `internal`; androidTest kaynak kümesi aynı modülün internal üyelerine erişebilir.
 */
class StatusChipTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun statusChip_running_etiketini_gosterir() {
        composeRule.setContent { StatusChip("running") }
        composeRule.onNodeWithText("çalışıyor").assertIsDisplayed()
    }

    @Test
    fun statusChip_failed_etiketini_gosterir() {
        composeRule.setContent { StatusChip("failed") }
        composeRule.onNodeWithText("başarısız").assertIsDisplayed()
    }
}

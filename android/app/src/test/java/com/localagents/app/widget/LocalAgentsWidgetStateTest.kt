package com.localagents.app.widget

import com.localagents.app.R
import com.localagents.app.data.AgentRun
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class LocalAgentsWidgetStateTest {
    @Test
    fun unpairedSnapshotPromptsPairing() {
        val snapshot = LocalAgentsWidgetSnapshot(paired = false)

        assertEquals("Eşleşme yok", widgetConnectionLabel(strings, snapshot))
        assertEquals("PC companion ile eşleştir", widgetConnectionDetail(strings, snapshot))
        assertEquals("Aç", widgetRunActionLabel(strings, null))
        assertNull(widgetRunActionCommand(null))
    }

    @Test
    fun activeRunningRunExposesPauseAction() {
        val run = run(status = "running", prompt = "Araştır ve kısa rapor hazırla")
        val snapshot = LocalAgentsWidgetSnapshot(
            paired = true,
            online = true,
            activeRun = run,
            latestRun = run,
            defaultModel = "qwen3.6",
            webEnabled = true,
        )

        assertEquals("Çalışıyor", widgetConnectionLabel(strings, snapshot))
        assertEquals("Çalışıyor · qwen3.6", widgetRunTitle(strings, run))
        assertEquals("Duraklat", widgetRunActionLabel(strings, run))
        assertEquals("pause", widgetRunActionCommand(run))
    }

    @Test
    fun pausedRunExposesResumeAction() {
        val run = run(status = "paused")

        assertEquals("Durakladı · qwen3.6", widgetRunTitle(strings, run))
        assertEquals("Devam", widgetRunActionLabel(strings, run))
        assertEquals("resume", widgetRunActionCommand(run))
    }

    @Test
    fun completedRunIsReadOnlyFromWidget() {
        val run = run(status = "completed")

        assertEquals("Tamamlandı · qwen3.6", widgetRunTitle(strings, run))
        assertEquals("Aç", widgetRunActionLabel(strings, run))
        assertNull(widgetRunActionCommand(run))
    }

    @Test
    fun promptIsTrimmedForSmallLayouts() {
        val run = run(prompt = "Bu    metin     gereksiz   boşlukları   temizler ve sonra kısalır")

        assertEquals("Bu metin gereksiz…", widgetPrompt(strings, run, 20))
    }

    @Test
    fun parsesServerTimestamps() {
        assertEquals(
            Instant.parse("2026-06-30T10:00:00Z"),
            parseWidgetInstant("2026-06-30T10:00:00+00:00"),
        )
        assertEquals(
            Instant.parse("2026-06-30T10:00:00Z"),
            parseWidgetInstant("2026-06-30T10:00:00Z"),
        )
        assertNull(parseWidgetInstant("not-a-date"))
    }

    @Test
    fun elapsedLabelCountsFromStartWhileRunning() {
        val run = run(status = "running")
        val start = Instant.parse("2026-06-30T10:00:00Z").toEpochMilli()
        assertEquals("45 sn", widgetRunElapsedLabel(strings, run, start + 45_000))
        assertEquals("2 dk", widgetRunElapsedLabel(strings, run, start + 125_000))
    }

    @Test
    fun elapsedLabelUsesUpdatedTimeForFinishedRun() {
        // run() default: 10:00:00 -> 10:01:00 = 60 sn; now yok sayılır.
        val run = run(status = "completed")
        assertEquals("1 dk", widgetRunElapsedLabel(strings, run, 0L))
    }

    @Test
    fun metaLabelAddsToolCountWhileLive() {
        val run = run(status = "running")
        val start = Instant.parse("2026-06-30T10:00:00Z").toEpochMilli()
        val snapshot = LocalAgentsWidgetSnapshot(
            paired = true,
            online = true,
            activeRun = run,
            latestRun = run,
            activeToolCount = 4,
        )
        assertEquals("2 dk  ·  4 araç", widgetRunMetaLabel(strings, snapshot, run, start + 125_000))
    }

    @Test
    fun metaLabelOmitsToolCountWhenIdle() {
        val run = run(status = "completed")
        val snapshot = LocalAgentsWidgetSnapshot(
            paired = true,
            latestRun = run,
            activeToolCount = 4,
        )
        assertEquals("1 dk", widgetRunMetaLabel(strings, snapshot, run, 0L))
    }

    @Test
    fun rowDotResVariesByStatus() {
        assertEquals(R.drawable.widget_dot_accent, widgetRunDotRes("running"))
        assertEquals(R.drawable.widget_dot_accent, widgetRunDotRes("queued"))
        assertEquals(R.drawable.widget_dot_warning, widgetRunDotRes("paused"))
        assertEquals(R.drawable.widget_dot_success, widgetRunDotRes("completed"))
        assertEquals(R.drawable.widget_dot_danger, widgetRunDotRes("failed"))
        assertEquals(R.drawable.widget_dot_muted, widgetRunDotRes("weird"))
        assertEquals(R.drawable.widget_dot_muted, widgetRunDotRes(null))
    }

    @Test
    fun configSanitizesTapTarget() {
        assertEquals(LocalAgentsWidgetIntents.TARGET_SESSIONS, LocalAgentsWidgetConfig.sanitizeTarget("sessions"))
        assertEquals(LocalAgentsWidgetIntents.TARGET_RUNS, LocalAgentsWidgetConfig.sanitizeTarget("runs"))
        assertEquals(LocalAgentsWidgetIntents.TARGET_NEW_SESSION, LocalAgentsWidgetConfig.sanitizeTarget("new_session"))
        assertEquals(LocalAgentsWidgetIntents.TARGET_SESSIONS, LocalAgentsWidgetConfig.sanitizeTarget("chat"))
        assertEquals(LocalAgentsWidgetIntents.TARGET_SESSIONS, LocalAgentsWidgetConfig.sanitizeTarget("bogus"))
        assertEquals(LocalAgentsWidgetIntents.TARGET_SESSIONS, LocalAgentsWidgetConfig.sanitizeTarget(null))
    }

    @Test
    fun configSanitizesDensity() {
        assertEquals(LocalAgentsWidgetConfig.DENSITY_DETAILED, LocalAgentsWidgetConfig.sanitizeDensity("detailed"))
        assertEquals(LocalAgentsWidgetConfig.DENSITY_COMPACT, LocalAgentsWidgetConfig.sanitizeDensity("compact"))
        assertEquals(LocalAgentsWidgetConfig.DENSITY_DETAILED, LocalAgentsWidgetConfig.sanitizeDensity("bogus"))
        assertEquals(LocalAgentsWidgetConfig.DENSITY_DETAILED, LocalAgentsWidgetConfig.sanitizeDensity(null))
    }

    private val strings = WidgetStringResolver { id, args ->
        when (id) {
            R.string.widget_state_unpaired -> "Eşleşme yok"
            R.string.widget_state_unreachable -> "Ulaşılamıyor"
            R.string.widget_state_paused -> "Durakladı"
            R.string.widget_state_running -> "Çalışıyor"
            R.string.status_online -> "çevrimiçi"
            R.string.widget_state_offline -> "Çevrimdışı"
            R.string.widget_detail_pair -> "PC companion ile eşleştir"
            R.string.widget_model_web -> "${args[0]} · web açık"
            R.string.widget_model_ready -> "${args[0]} hazır"
            R.string.widget_pc_ready -> "PC companion hazır"
            R.string.widget_check_connection -> "Bağlantıyı kontrol et"
            R.string.widget_run_none -> "Aktif çalışma yok"
            R.string.widget_run_queued -> "Sırada · ${args[0]}"
            R.string.widget_run_running -> "Çalışıyor · ${args[0]}"
            R.string.widget_run_paused -> "Durakladı · ${args[0]}"
            R.string.widget_run_completed -> "Tamamlandı · ${args[0]}"
            R.string.widget_run_failed -> "Başarısız · ${args[0]}"
            R.string.widget_run_cancelled -> "İptal edildi · ${args[0]}"
            R.string.action_resume -> "Devam"
            R.string.action_pause -> "Duraklat"
            R.string.widget_action_open -> "Aç"
            R.string.widget_default_prompt -> "Yeni bir görev başlatmak için uygulamayı aç."
            R.string.widget_time_now -> "şimdi"
            R.string.widget_time_minutes -> "${args[0]} dk"
            R.string.widget_time_hours -> "${args[0]} sa"
            R.string.widget_time_days -> "${args[0]} gün"
            R.string.widget_elapsed_seconds -> "${args[0]} sn"
            R.string.widget_tool_count -> "${args[0]} araç"
            else -> error("Missing fake widget string for $id")
        }
    }

    private fun run(
        status: String = "running",
        prompt: String = "Test prompt",
    ) = AgentRun(
        id = "run-1",
        sessionId = "session-1",
        status = status,
        model = "qwen3.6",
        provider = "ollama",
        prompt = prompt,
        createdAt = "2026-06-30T10:00:00Z",
        updatedAt = "2026-06-30T10:01:00Z",
    )
}

package com.localagents.app.ui

import com.localagents.app.formatPairingCode
import com.localagents.app.normalizePairingCode
import com.localagents.app.data.SessionContext
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/**
 * Saf (cihazsız) JVM birim testleri — UiComponents.kt içindeki durum/zaman yardımcıları.
 * statusLabel ve relativeTime `internal` olduğundan aynı modülün test kaynak kümesinden erişilebilir.
 */
class UiLogicTest {

    @Test
    fun statusLabel_bilinen_durumlari_turkceye_cevirir() {
        assertEquals("sırada", statusLabel("queued"))
        assertEquals("çalışıyor", statusLabel("running"))
        assertEquals("duraklatıldı", statusLabel("paused"))
        assertEquals("tamamlandı", statusLabel("completed"))
        assertEquals("başarısız", statusLabel("failed"))
        assertEquals("iptal edildi", statusLabel("cancelled"))
    }

    @Test
    fun statusLabel_bilinmeyeni_aynen_dondurur() {
        assertEquals("nonsense", statusLabel("nonsense"))
    }

    @Test
    fun relativeTime_bos_deger_simdi() {
        assertEquals("şimdi", relativeTime(""))
    }

    @Test
    fun relativeTime_gecersiz_deger_ilk_10_karakter() {
        // Instant.parse başarısız → ilk 10 karakter geri döner.
        assertEquals("2026-06-23", relativeTime("2026-06-23 not-a-timestamp"))
    }

    @Test
    fun relativeTime_birkac_saniye_simdi() {
        val t = Instant.now().minusSeconds(5).toString()
        assertEquals("şimdi", relativeTime(t))
    }

    @Test
    fun relativeTime_dakikalar() {
        val t = Instant.now().minusSeconds(120).toString()
        assertEquals("2 dk önce", relativeTime(t))
    }

    @Test
    fun relativeTime_saatler() {
        val t = Instant.now().minusSeconds(2 * 60 * 60).toString()
        assertEquals("2 sa önce", relativeTime(t))
    }

    @Test
    fun pairingCodeFormatsAndNormalizes() {
        assertEquals("ABCD · EFGH · 2345", formatPairingCode("abcd-efgh 2345"))
        assertEquals("ABCDEFGH2345", normalizePairingCode("abcd · efgh-2345"))
    }

    @Test
    fun contextLabelsFormatTokenUsageAndSummaryState() {
        val raw = SessionContext(
            tokenEstimate = 8192,
            maxTokens = 8192,
            usagePercent = 100,
            messageCount = 6,
        )
        assertEquals("8.192 / 8.192 token · 100%", contextUsageLabel(strings, raw))
        assertEquals("ham geçmiş · 6 mesaj", contextMemoryLabel(strings, raw))

        val summarized = raw.copy(hasSummary = true, summarizedMessageCount = 4)
        assertEquals("özet aktif · 4/6 mesaj", contextMemoryLabel(strings, summarized))
    }

    private val strings = UiStringResolver { id, args ->
        when (id) {
            com.localagents.app.R.string.context_usage_format -> "${args[0]} / ${args[1]} token · ${args[2]}%"
            com.localagents.app.R.string.context_message_count -> "${args[0]} mesaj"
            com.localagents.app.R.string.context_summary_active -> "özet aktif · ${args[0]}/${args[1]}"
            com.localagents.app.R.string.context_raw_history -> "ham geçmiş · ${args[0]}"
            else -> error("Missing fake UI string for $id")
        }
    }
}

package com.localagents.app.widget

import android.content.Context
import androidx.annotation.StringRes
import com.localagents.app.R
import com.localagents.app.data.AgentRun
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

enum class LocalAgentsWidgetSize {
    MINI,
    STATUS,
    STRIP,
    SUMMARY,
    CONTROL,
    FEED,
}

internal data class LocalAgentsWidgetSnapshot(
    val paired: Boolean = false,
    val online: Boolean = false,
    val sessionCount: Int = 0,
    val activeRun: AgentRun? = null,
    val latestRun: AgentRun? = null,
    val activeToolCount: Int = 0,
    val defaultModel: String = "",
    val webEnabled: Boolean = false,
    val updatedAtMillis: Long = System.currentTimeMillis(),
    val errorMessage: String? = null,
)

internal val WidgetActiveStatuses = setOf("queued", "running", "paused")

internal fun interface WidgetStringResolver {
    fun get(@StringRes id: Int, vararg args: Any): String
}

internal fun Context.widgetStrings(): WidgetStringResolver =
    WidgetStringResolver { id, args -> getString(id, *args) }

internal fun widgetConnectionLabel(strings: WidgetStringResolver, snapshot: LocalAgentsWidgetSnapshot): String = when {
    !snapshot.paired -> strings.get(R.string.widget_state_unpaired)
    snapshot.errorMessage != null -> strings.get(R.string.widget_state_unreachable)
    snapshot.activeRun?.status == "paused" -> strings.get(R.string.widget_state_paused)
    snapshot.activeRun?.status in setOf("queued", "running") -> strings.get(R.string.widget_state_running)
    snapshot.online -> strings.get(R.string.status_online).replaceFirstChar { it.uppercase() }
    else -> strings.get(R.string.widget_state_offline)
}

internal fun widgetConnectionDetail(strings: WidgetStringResolver, snapshot: LocalAgentsWidgetSnapshot): String = when {
    !snapshot.paired -> strings.get(R.string.widget_detail_pair)
    snapshot.errorMessage != null -> snapshot.errorMessage
    snapshot.activeRun != null -> widgetRunTitle(strings, snapshot.activeRun)
    snapshot.defaultModel.isNotBlank() && snapshot.webEnabled -> strings.get(R.string.widget_model_web, snapshot.defaultModel)
    snapshot.defaultModel.isNotBlank() -> strings.get(R.string.widget_model_ready, snapshot.defaultModel)
    snapshot.online -> strings.get(R.string.widget_pc_ready)
    else -> strings.get(R.string.widget_check_connection)
}

internal fun widgetRunTitle(strings: WidgetStringResolver, run: AgentRun?): String = when {
    run == null -> strings.get(R.string.widget_run_none)
    run.status == "queued" -> strings.get(R.string.widget_run_queued, run.model)
    run.status == "running" -> strings.get(R.string.widget_run_running, run.model)
    run.status == "paused" -> strings.get(R.string.widget_run_paused, run.model)
    run.status == "completed" -> strings.get(R.string.widget_run_completed, run.model)
    run.status == "failed" -> strings.get(R.string.widget_run_failed, run.model)
    run.status == "cancelled" -> strings.get(R.string.widget_run_cancelled, run.model)
    else -> strings.get(R.string.widget_run_unknown, run.status, run.model)
}

internal fun widgetRunActionLabel(strings: WidgetStringResolver, run: AgentRun?): String = when (run?.status) {
    "paused" -> strings.get(R.string.action_resume)
    "queued", "running" -> strings.get(R.string.action_pause)
    else -> strings.get(R.string.widget_action_open)
}

internal fun widgetRunActionCommand(run: AgentRun?): String? = when (run?.status) {
    "paused" -> "resume"
    "queued", "running" -> "pause"
    else -> null
}

internal fun widgetPrompt(strings: WidgetStringResolver, run: AgentRun?, maxLength: Int): String =
    run?.prompt?.replace(Regex("\\s+"), " ")?.trim()
        ?.truncateWidget(maxLength, strings.get(R.string.widget_truncation_ellipsis))
        ?: strings.get(R.string.widget_default_prompt)

internal fun widgetUpdatedLabel(
    strings: WidgetStringResolver,
    updatedAtMillis: Long,
    nowMillis: Long = System.currentTimeMillis(),
): String {
    val elapsed = Duration.between(
        Instant.ofEpochMilli(updatedAtMillis),
        Instant.ofEpochMilli(nowMillis),
    )
    return when {
        elapsed.seconds < 60 -> strings.get(R.string.widget_time_now)
        elapsed.toMinutes() < 60 -> strings.get(R.string.widget_time_minutes, elapsed.toMinutes())
        elapsed.toHours() < 24 -> strings.get(R.string.widget_time_hours, elapsed.toHours())
        else -> strings.get(R.string.widget_time_days, elapsed.toDays())
    }
}

/** Yalnız etkin çalışmalar (kuyruk/çalışıyor) ilerleme animasyonunu tetikler. */
internal fun widgetRunIsLive(run: AgentRun?): Boolean =
    run?.status in setOf("queued", "running")

/** Liste satırı için duruma göre nokta rengi (drawable). */
internal fun widgetRunDotRes(status: String?): Int = when (status) {
    "running", "queued" -> R.drawable.widget_dot_accent
    "paused" -> R.drawable.widget_dot_warning
    "completed" -> R.drawable.widget_dot_success
    "failed" -> R.drawable.widget_dot_danger
    else -> R.drawable.widget_dot_muted
}

/** Sunucu ISO-8601 zaman damgasını (offset veya 'Z') hoşgörülü biçimde çözer. */
internal fun parseWidgetInstant(value: String): Instant? {
    runCatching { return OffsetDateTime.parse(value).toInstant() }
    runCatching { return Instant.parse(value) }
    return null
}

/** Çalışmanın geçen süresi: canlıysa şimdiye, bittiyse güncellenme anına göre. */
internal fun widgetRunElapsedLabel(
    strings: WidgetStringResolver,
    run: AgentRun?,
    nowMillis: Long = System.currentTimeMillis(),
): String? {
    if (run == null) return null
    val start = parseWidgetInstant(run.createdAt) ?: return null
    val endMillis = when (run.status) {
        "queued", "running", "paused" -> nowMillis
        else -> parseWidgetInstant(run.updatedAt)?.toEpochMilli() ?: nowMillis
    }
    val elapsed = Duration.between(start, Instant.ofEpochMilli(endMillis))
    val safe = if (elapsed.isNegative) Duration.ZERO else elapsed
    return when {
        safe.seconds < 60 -> strings.get(R.string.widget_elapsed_seconds, safe.seconds)
        safe.toMinutes() < 60 -> strings.get(R.string.widget_time_minutes, safe.toMinutes())
        safe.toHours() < 24 -> strings.get(R.string.widget_time_hours, safe.toHours())
        else -> strings.get(R.string.widget_time_days, safe.toDays())
    }
}

/** Çalışma kartı meta satırı: "geçen süre · N araç" (araç yalnız canlıyken). */
internal fun widgetRunMetaLabel(
    strings: WidgetStringResolver,
    snapshot: LocalAgentsWidgetSnapshot,
    run: AgentRun?,
    nowMillis: Long = System.currentTimeMillis(),
): String {
    val parts = mutableListOf<String>()
    widgetRunElapsedLabel(strings, run, nowMillis)?.let { parts.add(it) }
    if (snapshot.activeToolCount > 0 && widgetRunIsLive(run)) {
        parts.add(strings.get(R.string.widget_tool_count, snapshot.activeToolCount))
    }
    return parts.joinToString(strings.get(R.string.widget_meta_separator))
}

private fun String.truncateWidget(maxLength: Int, ellipsis: String): String {
    if (length <= maxLength) return this
    if (maxLength <= ellipsis.length) return ellipsis.take(maxLength)
    val clipped = take(maxLength - ellipsis.length).trimEnd()
    val wordSafe = clipped.substringBeforeLast(" ", clipped)
        .takeIf { it.length >= maxLength / 2 }
        ?: clipped
    return wordSafe + ellipsis
}

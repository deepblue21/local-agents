package com.localagents.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import com.localagents.app.R

internal object LocalAgentsWidgetViews {
    fun loading(context: Context, size: LocalAgentsWidgetSize): RemoteViews =
        base(context, size).apply {
            when (size) {
                LocalAgentsWidgetSize.MINI -> {
                    setTextViewText(R.id.widget_mini_label, "...")
                    setTextViewText(R.id.widget_mini_status, context.getString(R.string.widget_loading))
                }
                LocalAgentsWidgetSize.STATUS -> {
                    setTextViewText(R.id.widget_status_title, context.getString(R.string.app_name))
                    setTextViewText(R.id.widget_status_detail, context.getString(R.string.widget_loading_ellipsis))
                }
                LocalAgentsWidgetSize.STRIP -> {
                    setTextViewText(R.id.widget_status_title, context.getString(R.string.app_name))
                    setTextViewText(R.id.widget_status_detail, context.getString(R.string.widget_loading_ellipsis))
                }
                LocalAgentsWidgetSize.SUMMARY, LocalAgentsWidgetSize.CONTROL -> {
                    setTextViewText(R.id.widget_title, context.getString(R.string.app_name))
                    setTextViewText(R.id.widget_status, context.getString(R.string.widget_loading_ellipsis))
                    setTextViewText(R.id.widget_prompt, context.getString(R.string.widget_loading_detail))
                }
                LocalAgentsWidgetSize.FEED -> {
                    setTextViewText(R.id.widget_title, context.getString(R.string.widget_feed_title))
                    setTextViewText(R.id.widget_feed_empty, context.getString(R.string.widget_loading))
                }
            }
        }

    fun snapshot(
        context: Context,
        size: LocalAgentsWidgetSize,
        snapshot: LocalAgentsWidgetSnapshot,
        appWidgetId: Int = AppWidgetManager.INVALID_APPWIDGET_ID,
    ): RemoteViews =
        when (size) {
            LocalAgentsWidgetSize.MINI -> mini(context, snapshot)
            LocalAgentsWidgetSize.STATUS -> status(context, snapshot)
            LocalAgentsWidgetSize.STRIP -> strip(context, snapshot)
            LocalAgentsWidgetSize.SUMMARY -> summary(context, snapshot, appWidgetId)
            LocalAgentsWidgetSize.CONTROL -> control(context, snapshot, appWidgetId)
            LocalAgentsWidgetSize.FEED -> feed(context, snapshot, appWidgetId)
        }

    private fun base(context: Context, size: LocalAgentsWidgetSize): RemoteViews =
        RemoteViews(context.packageName, size.layoutRes()).apply {
            setOnClickPendingIntent(
                R.id.widget_root,
                LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_SESSIONS),
            )
        }

    /** Kök tıkını, varsa per-widget yapılandırma hedefiyle override eder. */
    private fun RemoteViews.applyConfiguredTap(context: Context, appWidgetId: Int) {
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return
        val target = LocalAgentsWidgetConfig.tapTarget(context, appWidgetId)
        setOnClickPendingIntent(
            R.id.widget_root,
            LocalAgentsWidgetIntents.activityPendingIntent(context, target),
        )
    }

    private fun mini(context: Context, snapshot: LocalAgentsWidgetSnapshot): RemoteViews =
        base(context, LocalAgentsWidgetSize.MINI).apply {
            val strings = context.widgetStrings()
            setTextViewText(R.id.widget_mini_label, if (snapshot.paired) "LA" else context.getString(R.string.widget_short_pair))
            setTextViewText(R.id.widget_mini_status, widgetConnectionLabel(strings, snapshot))
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
        }

    private fun status(context: Context, snapshot: LocalAgentsWidgetSnapshot): RemoteViews =
        base(context, LocalAgentsWidgetSize.STATUS).apply {
            val strings = context.widgetStrings()
            setTextViewText(R.id.widget_status_title, widgetConnectionLabel(strings, snapshot))
            setTextViewText(R.id.widget_status_detail, widgetConnectionDetail(strings, snapshot))
            setTextViewText(R.id.widget_status_meta, widgetUpdatedLabel(strings, snapshot.updatedAtMillis))
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
            setOnClickPendingIntent(R.id.widget_refresh, LocalAgentsWidgetIntents.refreshPendingIntent(context))
            setContentDescription(R.id.widget_refresh, context.getString(R.string.action_refresh))
        }

    private fun summary(context: Context, snapshot: LocalAgentsWidgetSnapshot, appWidgetId: Int): RemoteViews =
        base(context, LocalAgentsWidgetSize.SUMMARY).apply {
            val strings = context.widgetStrings()
            val run = snapshot.latestRun
            setTextViewText(R.id.widget_title, context.getString(R.string.app_name))
            setTextViewText(R.id.widget_status, widgetConnectionLabel(strings, snapshot))
            setTextViewText(R.id.widget_detail, widgetConnectionDetail(strings, snapshot))
            setTextViewText(R.id.widget_metric_primary, context.getString(R.string.widget_metric_sessions, snapshot.sessionCount))
            setTextViewText(R.id.widget_metric_secondary, snapshot.defaultModel.ifBlank { context.getString(R.string.widget_model_waiting) })
            setTextViewText(R.id.widget_run_title, widgetRunTitle(strings, run))
            setTextViewText(R.id.widget_prompt, widgetPrompt(strings, run, 96))
            val compact = LocalAgentsWidgetConfig.isCompact(context, appWidgetId)
            setViewVisibility(R.id.widget_prompt, if (compact) View.GONE else View.VISIBLE)
            val meta = widgetRunMetaLabel(strings, snapshot, run)
            setTextViewText(R.id.widget_run_meta, meta)
            setViewVisibility(R.id.widget_run_meta, if (!compact && meta.isNotBlank()) View.VISIBLE else View.GONE)
            setViewVisibility(R.id.widget_run_progress, if (widgetRunIsLive(snapshot.activeRun)) View.VISIBLE else View.GONE)
            setTextViewText(
                R.id.widget_updated,
                context.getString(R.string.widget_updated_refresh, widgetUpdatedLabel(strings, snapshot.updatedAtMillis)),
            )
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
            setInt(R.id.widget_run_chip, "setBackgroundResource", run?.chipRes() ?: R.drawable.widget_chip_muted)
            setOnClickPendingIntent(R.id.widget_refresh, LocalAgentsWidgetIntents.refreshPendingIntent(context))
            setContentDescription(R.id.widget_refresh, context.getString(R.string.action_refresh))
            setOnClickPendingIntent(R.id.widget_open_chat, LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_CHAT))
            applyConfiguredTap(context, appWidgetId)
        }

    private fun control(context: Context, snapshot: LocalAgentsWidgetSnapshot, appWidgetId: Int): RemoteViews =
        base(context, LocalAgentsWidgetSize.CONTROL).apply {
            val strings = context.widgetStrings()
            val run = snapshot.activeRun ?: snapshot.latestRun
            setTextViewText(R.id.widget_title, context.getString(R.string.app_name))
            setTextViewText(R.id.widget_status, widgetConnectionLabel(strings, snapshot))
            setTextViewText(R.id.widget_detail, widgetConnectionDetail(strings, snapshot))
            setTextViewText(R.id.widget_metric_primary, context.getString(R.string.widget_metric_sessions, snapshot.sessionCount))
            setTextViewText(
                R.id.widget_metric_secondary,
                context.getString(if (snapshot.webEnabled) R.string.widget_web_enabled else R.string.widget_web_disabled),
            )
            setTextViewText(R.id.widget_run_title, widgetRunTitle(strings, run))
            setTextViewText(R.id.widget_prompt, widgetPrompt(strings, run, 148))
            val compact = LocalAgentsWidgetConfig.isCompact(context, appWidgetId)
            setViewVisibility(R.id.widget_prompt, if (compact) View.GONE else View.VISIBLE)
            val meta = widgetRunMetaLabel(strings, snapshot, run)
            setTextViewText(R.id.widget_run_meta, meta)
            setViewVisibility(R.id.widget_run_meta, if (!compact && meta.isNotBlank()) View.VISIBLE else View.GONE)
            setViewVisibility(R.id.widget_run_progress, if (widgetRunIsLive(snapshot.activeRun)) View.VISIBLE else View.GONE)
            setTextViewText(
                R.id.widget_updated,
                context.getString(R.string.widget_updated_latest, widgetUpdatedLabel(strings, snapshot.updatedAtMillis)),
            )
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
            setInt(R.id.widget_run_chip, "setBackgroundResource", run?.chipRes() ?: R.drawable.widget_chip_muted)
            setOnClickPendingIntent(R.id.widget_refresh, LocalAgentsWidgetIntents.refreshPendingIntent(context))
            setContentDescription(R.id.widget_refresh, context.getString(R.string.action_refresh))
            setOnClickPendingIntent(R.id.widget_open_chat, LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_CHAT))
            setOnClickPendingIntent(R.id.widget_new_session, LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_NEW_SESSION))
            setOnClickPendingIntent(R.id.widget_open_runs, LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_RUNS))

            val command = widgetRunActionCommand(snapshot.activeRun)
            if (command != null && snapshot.activeRun != null) {
                setViewVisibility(R.id.widget_run_action, View.VISIBLE)
                setTextViewText(R.id.widget_run_action, widgetRunActionLabel(strings, snapshot.activeRun))
                setOnClickPendingIntent(
                    R.id.widget_run_action,
                    LocalAgentsWidgetIntents.commandPendingIntent(context, snapshot.activeRun.id, command),
                )
                setViewVisibility(R.id.widget_stop_run, View.VISIBLE)
                setOnClickPendingIntent(
                    R.id.widget_stop_run,
                    LocalAgentsWidgetIntents.commandPendingIntent(context, snapshot.activeRun.id, "cancel"),
                )
            } else {
                if (snapshot.paired && snapshot.latestRun != null) {
                    setViewVisibility(R.id.widget_run_action, View.VISIBLE)
                    setTextViewText(R.id.widget_run_action, strings.get(R.string.widget_action_rerun))
                    setOnClickPendingIntent(
                        R.id.widget_run_action,
                        LocalAgentsWidgetIntents.quickRunPendingIntent(context),
                    )
                } else {
                    setViewVisibility(R.id.widget_run_action, View.GONE)
                }
                setViewVisibility(R.id.widget_stop_run, View.GONE)
            }
            applyConfiguredTap(context, appWidgetId)
        }

    private fun strip(context: Context, snapshot: LocalAgentsWidgetSnapshot): RemoteViews =
        base(context, LocalAgentsWidgetSize.STRIP).apply {
            val strings = context.widgetStrings()
            setTextViewText(R.id.widget_status_title, widgetConnectionLabel(strings, snapshot))
            setTextViewText(R.id.widget_status_detail, widgetConnectionDetail(strings, snapshot))
            setTextViewText(
                R.id.widget_metric_primary,
                context.getString(R.string.widget_metric_sessions, snapshot.sessionCount),
            )
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
            setOnClickPendingIntent(R.id.widget_refresh, LocalAgentsWidgetIntents.refreshPendingIntent(context))
            setContentDescription(R.id.widget_refresh, context.getString(R.string.action_refresh))
            setOnClickPendingIntent(
                R.id.widget_open_chat,
                LocalAgentsWidgetIntents.activityPendingIntent(context, LocalAgentsWidgetIntents.TARGET_NEW_SESSION),
            )
        }

    private fun feed(context: Context, snapshot: LocalAgentsWidgetSnapshot, appWidgetId: Int): RemoteViews =
        base(context, LocalAgentsWidgetSize.FEED).apply {
            setTextViewText(R.id.widget_title, context.getString(R.string.widget_feed_title))
            setInt(R.id.widget_dot, "setBackgroundResource", snapshot.dotRes())
            setTextViewText(
                R.id.widget_feed_empty,
                context.getString(
                    if (snapshot.paired) R.string.widget_feed_empty else R.string.widget_feed_unpaired,
                ),
            )
            setOnClickPendingIntent(R.id.widget_refresh, LocalAgentsWidgetIntents.refreshPendingIntent(context))
            setContentDescription(R.id.widget_refresh, context.getString(R.string.action_refresh))
            val serviceIntent = Intent(context, LocalAgentsWidgetFeedService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            setRemoteAdapter(R.id.widget_feed_list, serviceIntent)
            setEmptyView(R.id.widget_feed_list, R.id.widget_feed_empty)
            setPendingIntentTemplate(
                R.id.widget_feed_list,
                LocalAgentsWidgetIntents.feedTemplatePendingIntent(context),
            )
            applyConfiguredTap(context, appWidgetId)
        }

    private fun LocalAgentsWidgetSize.layoutRes(): Int = when (this) {
        LocalAgentsWidgetSize.MINI -> R.layout.widget_agent_1x1
        LocalAgentsWidgetSize.STATUS -> R.layout.widget_agent_2x1
        LocalAgentsWidgetSize.STRIP -> R.layout.widget_agent_4x1
        LocalAgentsWidgetSize.SUMMARY -> R.layout.widget_agent_2x2
        LocalAgentsWidgetSize.CONTROL -> R.layout.widget_agent_4x2
        LocalAgentsWidgetSize.FEED -> R.layout.widget_agent_2x3
    }

    private fun LocalAgentsWidgetSnapshot.dotRes(): Int = when {
        !paired -> R.drawable.widget_dot_muted
        errorMessage != null -> R.drawable.widget_dot_danger
        activeRun?.status == "paused" -> R.drawable.widget_dot_warning
        activeRun?.status in setOf("queued", "running") -> R.drawable.widget_dot_accent
        online -> R.drawable.widget_dot_success
        else -> R.drawable.widget_dot_danger
    }

    private fun com.localagents.app.data.AgentRun.chipRes(): Int = when (status) {
        "running", "queued" -> R.drawable.widget_chip_accent
        "paused" -> R.drawable.widget_chip_warning
        "completed" -> R.drawable.widget_chip_success
        "failed" -> R.drawable.widget_chip_danger
        else -> R.drawable.widget_chip_muted
    }
}

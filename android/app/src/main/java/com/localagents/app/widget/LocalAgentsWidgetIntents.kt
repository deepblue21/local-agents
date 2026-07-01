package com.localagents.app.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.localagents.app.MainActivity

internal object LocalAgentsWidgetIntents {
    const val ACTION_REFRESH = "com.localagents.app.widget.REFRESH"
    const val ACTION_COMMAND = "com.localagents.app.widget.COMMAND"
    const val ACTION_QUICK_RUN = "com.localagents.app.widget.QUICK_RUN"
    const val EXTRA_LAUNCH_TARGET = "com.localagents.app.widget.LAUNCH_TARGET"
    const val EXTRA_RUN_ID = "com.localagents.app.widget.RUN_ID"
    const val EXTRA_COMMAND = "com.localagents.app.widget.COMMAND_VALUE"
    const val EXTRA_SESSION_ID = "com.localagents.app.widget.SESSION_ID"

    const val TARGET_SESSIONS = "sessions"
    const val TARGET_CHAT = "chat"
    const val TARGET_RUNS = "runs"
    const val TARGET_SETTINGS = "settings"
    const val TARGET_NEW_SESSION = "new_session"
    const val TARGET_OPEN_SESSION = "open_session"

    fun activityIntent(context: Context, target: String): Intent =
        Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_LAUNCH_TARGET, target)
        }

    fun activityPendingIntent(context: Context, target: String): PendingIntent =
        PendingIntent.getActivity(
            context,
            target.hashCode(),
            activityIntent(context, target),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun refreshPendingIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            ACTION_REFRESH.hashCode(),
            Intent(context, LocalAgentsWidgetActionReceiver::class.java).apply {
                action = ACTION_REFRESH
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun quickRunPendingIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            ACTION_QUICK_RUN.hashCode(),
            Intent(context, LocalAgentsWidgetActionReceiver::class.java).apply {
                action = ACTION_QUICK_RUN
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun feedTemplatePendingIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context,
            "feed_template".hashCode(),
            activityIntent(context, TARGET_OPEN_SESSION),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )

    fun commandPendingIntent(context: Context, runId: String, command: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            "$runId:$command".hashCode(),
            Intent(context, LocalAgentsWidgetActionReceiver::class.java).apply {
                action = ACTION_COMMAND
                putExtra(EXTRA_RUN_ID, runId)
                putExtra(EXTRA_COMMAND, command)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    fun launchTarget(intent: Intent?): String? =
        intent?.getStringExtra(EXTRA_LAUNCH_TARGET)?.takeIf {
            it in setOf(
                TARGET_SESSIONS, TARGET_CHAT, TARGET_RUNS, TARGET_SETTINGS,
                TARGET_NEW_SESSION, TARGET_OPEN_SESSION,
            )
        }

    fun sessionId(intent: Intent?): String? =
        intent?.getStringExtra(EXTRA_SESSION_ID)?.takeIf { it.isNotBlank() }
}

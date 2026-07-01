package com.localagents.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.localagents.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal object LocalAgentsWidgetUpdater {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun update(context: Context, size: LocalAgentsWidgetSize, widgetIds: IntArray) {
        if (widgetIds.isEmpty()) return
        val appContext = context.applicationContext
        val manager = AppWidgetManager.getInstance(appContext)
        widgetIds.forEach { id ->
            manager.updateAppWidget(id, LocalAgentsWidgetViews.loading(appContext, size))
        }
        scope.launch { updateNow(appContext, size, widgetIds) }
    }

    fun updateAll(context: Context) {
        val appContext = context.applicationContext
        scope.launch { updateAllNow(appContext) }
    }

    suspend fun updateAllNow(context: Context) {
        val appContext = context.applicationContext
        LocalAgentsWidgetSize.entries.forEach { size ->
            val ids = appWidgetIds(appContext, size)
            if (ids.isNotEmpty()) updateNow(appContext, size, ids)
        }
    }

    private suspend fun updateNow(context: Context, size: LocalAgentsWidgetSize, widgetIds: IntArray) {
        val manager = AppWidgetManager.getInstance(context)
        val snapshot = runCatching { LocalAgentsWidgetRepository(context).snapshot() }
            .getOrElse {
                LocalAgentsWidgetSnapshot(
                    paired = true,
                    online = false,
                    errorMessage = it.message ?: context.getString(R.string.widget_error_refresh_failed),
                )
            }
        widgetIds.forEach { id ->
            manager.updateAppWidget(id, LocalAgentsWidgetViews.snapshot(context, size, snapshot, id))
            if (size == LocalAgentsWidgetSize.FEED) {
                manager.notifyAppWidgetViewDataChanged(id, R.id.widget_feed_list)
            }
        }
        LocalAgentsWidgetRefreshScheduler.sync(context, snapshot.activeRun != null)
    }

    private fun appWidgetIds(context: Context, size: LocalAgentsWidgetSize): IntArray =
        AppWidgetManager.getInstance(context).getAppWidgetIds(
            ComponentName(context, size.providerClass()),
        )

    private fun LocalAgentsWidgetSize.providerClass(): Class<*> = when (this) {
        LocalAgentsWidgetSize.MINI -> LocalAgentsMiniWidgetProvider::class.java
        LocalAgentsWidgetSize.STATUS -> LocalAgentsStatusWidgetProvider::class.java
        LocalAgentsWidgetSize.STRIP -> LocalAgentsStripWidgetProvider::class.java
        LocalAgentsWidgetSize.SUMMARY -> LocalAgentsSummaryWidgetProvider::class.java
        LocalAgentsWidgetSize.CONTROL -> LocalAgentsControlWidgetProvider::class.java
        LocalAgentsWidgetSize.FEED -> LocalAgentsFeedWidgetProvider::class.java
    }
}

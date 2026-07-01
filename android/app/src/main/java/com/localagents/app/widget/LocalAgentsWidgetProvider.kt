package com.localagents.app.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

abstract class LocalAgentsWidgetProvider(
    private val size: LocalAgentsWidgetSize,
) : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        LocalAgentsWidgetUpdater.update(context, size, appWidgetIds)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { LocalAgentsWidgetConfig.clear(context, it) }
    }
}

class LocalAgentsMiniWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.MINI)

class LocalAgentsStatusWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.STATUS)

class LocalAgentsSummaryWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.SUMMARY)

class LocalAgentsControlWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.CONTROL)

class LocalAgentsStripWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.STRIP)

class LocalAgentsFeedWidgetProvider : LocalAgentsWidgetProvider(LocalAgentsWidgetSize.FEED)

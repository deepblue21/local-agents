package com.localagents.app.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.localagents.app.R
import com.localagents.app.data.AgentRun
import kotlinx.coroutines.runBlocking

/**
 * 2x3 akış widget'ının kaydırılabilir liste sağlayıcısı. Liste verisini binder
 * iş parçacığında [LocalAgentsWidgetRepository.recentRuns] ile çeker (RemoteViewsFactory
 * senkron çalışmaya izin verir). Satır tıkları, provider'ın kurduğu pending intent
 * şablonuyla birleşir.
 */
class LocalAgentsWidgetFeedService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        LocalAgentsWidgetFeedFactory(applicationContext)
}

private class LocalAgentsWidgetFeedFactory(
    private val context: Context,
) : RemoteViewsService.RemoteViewsFactory {
    private val strings = context.widgetStrings()

    @Volatile
    private var items: List<AgentRun> = emptyList()

    override fun onCreate() {}

    override fun onDataSetChanged() {
        items = runCatching {
            runBlocking { LocalAgentsWidgetRepository(context).recentRuns() }
        }.getOrDefault(emptyList())
    }

    override fun onDestroy() {
        items = emptyList()
    }

    override fun getCount(): Int = items.size

    override fun getViewAt(position: Int): RemoteViews {
        val run = items.getOrNull(position)
            ?: return RemoteViews(context.packageName, R.layout.widget_run_row)
        return RemoteViews(context.packageName, R.layout.widget_run_row).apply {
            setInt(R.id.widget_row_dot, "setBackgroundResource", widgetRunDotRes(run.status))
            setTextViewText(R.id.widget_row_title, widgetRunTitle(strings, run))
            setTextViewText(R.id.widget_row_prompt, widgetPrompt(strings, run, 64))
            setTextViewText(R.id.widget_row_time, widgetRunElapsedLabel(strings, run).orEmpty())
            setOnClickFillInIntent(
                R.id.widget_row_root,
                Intent()
                    .putExtra(LocalAgentsWidgetIntents.EXTRA_RUN_ID, run.id)
                    .putExtra(LocalAgentsWidgetIntents.EXTRA_SESSION_ID, run.sessionId),
            )
        }
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long =
        items.getOrNull(position)?.id?.hashCode()?.toLong() ?: position.toLong()

    override fun hasStableIds(): Boolean = true
}

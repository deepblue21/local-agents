package com.localagents.app.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class LocalAgentsWidgetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        val appContext = context.applicationContext
        scope.launch {
            try {
                when (intent.action) {
                    LocalAgentsWidgetIntents.ACTION_COMMAND -> {
                        val runId = intent.getStringExtra(LocalAgentsWidgetIntents.EXTRA_RUN_ID).orEmpty()
                        val command = intent.getStringExtra(LocalAgentsWidgetIntents.EXTRA_COMMAND).orEmpty()
                        if (runId.isNotBlank() && command.isWidgetCommand()) {
                            runCatching {
                                LocalAgentsWidgetRepository(appContext).command(runId, command)
                            }
                        }
                        LocalAgentsWidgetUpdater.updateAllNow(appContext)
                    }
                    LocalAgentsWidgetIntents.ACTION_QUICK_RUN -> {
                        runCatching {
                            LocalAgentsWidgetRepository(appContext).rerunLast()
                        }
                        LocalAgentsWidgetUpdater.updateAllNow(appContext)
                    }
                    LocalAgentsWidgetIntents.ACTION_REFRESH -> {
                        LocalAgentsWidgetUpdater.updateAllNow(appContext)
                    }
                }
            } finally {
                pending.finish()
            }
        }
    }

    private fun String.isWidgetCommand(): Boolean =
        this in setOf("pause", "resume", "cancel")

    private companion object {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }
}

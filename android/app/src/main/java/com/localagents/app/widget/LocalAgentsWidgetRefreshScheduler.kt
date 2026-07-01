package com.localagents.app.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.SystemClock

/**
 * Aktif bir çalışma varken widget'ları sık (~45 sn) yenileyen, hafif ve bağımlılıksız
 * zamanlayıcı. AlarmManager'ın inexact `set()` çağrısı kullanılır: uyandırma yok,
 * özel izin yok. Her yenileme [sync] çağırır; çalışma sürdükçe alarm kendini yeniden
 * kurar, çalışma bittiğinde iptal eder. Boştayken sistemin 30 dk'lik periyodu geçerli.
 */
internal object LocalAgentsWidgetRefreshScheduler {
    private const val ACTIVE_INTERVAL_MS = 45_000L
    private const val REQUEST_CODE = 0x4C41 // 'LA'

    fun sync(context: Context, hasActiveRun: Boolean) {
        val appContext = context.applicationContext
        val alarm = appContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pending = pendingIntent(appContext)
        if (hasActiveRun) {
            alarm.set(
                AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + ACTIVE_INTERVAL_MS,
                pending,
            )
        } else {
            alarm.cancel(pending)
        }
    }

    private fun pendingIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, LocalAgentsWidgetActionReceiver::class.java).apply {
                action = LocalAgentsWidgetIntents.ACTION_REFRESH
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
}

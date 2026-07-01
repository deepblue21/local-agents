package com.localagents.app.widget

import android.content.Context

/**
 * Per-appWidgetId yapılandırma deposu (SharedPreferences). Şimdilik tek ayar:
 * widget'a dokununca açılacak hedef ekran. Geçersiz/eksik değerler güvenli
 * varsayılana (Oturumlar) düşer.
 */
internal object LocalAgentsWidgetConfig {
    private const val PREFS = "local_agents_widget_config"
    private const val KEY_TAP = "tap_target_"
    private const val KEY_DENSITY = "density_"

    const val DENSITY_DETAILED = "detailed"
    const val DENSITY_COMPACT = "compact"

    private val VALID_TARGETS = setOf(
        LocalAgentsWidgetIntents.TARGET_SESSIONS,
        LocalAgentsWidgetIntents.TARGET_RUNS,
        LocalAgentsWidgetIntents.TARGET_NEW_SESSION,
    )

    private val VALID_DENSITIES = setOf(DENSITY_DETAILED, DENSITY_COMPACT)

    /** Saf doğrulama: yalnız izinli hedefler; aksi halde Oturumlar. */
    fun sanitizeTarget(value: String?): String =
        value?.takeIf { it in VALID_TARGETS } ?: LocalAgentsWidgetIntents.TARGET_SESSIONS

    fun tapTarget(context: Context, appWidgetId: Int): String =
        sanitizeTarget(prefs(context).getString(KEY_TAP + appWidgetId, null))

    fun setTapTarget(context: Context, appWidgetId: Int, target: String) {
        prefs(context).edit().putString(KEY_TAP + appWidgetId, sanitizeTarget(target)).apply()
    }

    /** Saf doğrulama: yalnız izinli yoğunluklar; aksi halde Detaylı. */
    fun sanitizeDensity(value: String?): String =
        value?.takeIf { it in VALID_DENSITIES } ?: DENSITY_DETAILED

    fun density(context: Context, appWidgetId: Int): String =
        sanitizeDensity(prefs(context).getString(KEY_DENSITY + appWidgetId, null))

    fun isCompact(context: Context, appWidgetId: Int): Boolean =
        appWidgetId != android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID &&
            density(context, appWidgetId) == DENSITY_COMPACT

    fun setDensity(context: Context, appWidgetId: Int, value: String) {
        prefs(context).edit().putString(KEY_DENSITY + appWidgetId, sanitizeDensity(value)).apply()
    }

    fun clear(context: Context, appWidgetId: Int) {
        prefs(context).edit()
            .remove(KEY_TAP + appWidgetId)
            .remove(KEY_DENSITY + appWidgetId)
            .apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}

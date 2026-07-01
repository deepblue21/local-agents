package com.localagents.app.widget

import android.content.Context
import com.localagents.app.R
import com.localagents.app.data.AgentRun
import com.localagents.app.data.ConnectionSettings
import com.localagents.app.data.SecureSettingsStore
import com.localagents.app.net.ApiException
import com.localagents.app.net.LocalAgentsClient
import kotlinx.coroutines.withTimeout

internal class LocalAgentsWidgetRepository(
    context: Context,
    private val client: LocalAgentsClient = LocalAgentsClient(),
) {
    private val appContext = context.applicationContext
    private val store = SecureSettingsStore(appContext)

    suspend fun snapshot(): LocalAgentsWidgetSnapshot = withTimeout(WIDGET_TIMEOUT_MS) {
        var settings = store.load()
        if (settings.accessToken.isBlank() || settings.baseUrl.isBlank()) {
            return@withTimeout LocalAgentsWidgetSnapshot(paired = false)
        }

        val health = client.health(settings.baseUrl)
        runCatching {
            val sessions = withAuth(settings) { token ->
                client.listSessions(settings.baseUrl, token)
            }.also { settings = it.first }.second
            val runs = withAuth(settings) { token ->
                client.listRuns(settings.baseUrl, token)
            }.also { settings = it.first }.second
            val models = withAuth(settings) { token ->
                client.listModels(settings.baseUrl, token)
            }.also { settings = it.first }.second
            val activeRun = runs.firstOrNull { it.status in WidgetActiveStatuses }
            val latestRun = activeRun ?: runs.firstOrNull()
            val usableModel = models.firstOrNull { "unavailable" !in it.capabilities } ?: models.firstOrNull()
            val activeToolCount = activeRun?.let { active ->
                sessions.firstOrNull { it.id == active.sessionId }?.toolCount
            } ?: 0
            LocalAgentsWidgetSnapshot(
                paired = true,
                online = health.ok,
                sessionCount = sessions.size,
                activeRun = activeRun,
                latestRun = latestRun,
                activeToolCount = activeToolCount,
                defaultModel = health.defaultModel.ifBlank { usableModel?.name.orEmpty() },
                webEnabled = health.webEnabled,
            )
        }.getOrElse { error ->
            LocalAgentsWidgetSnapshot(
                paired = true,
                online = health.ok,
                defaultModel = health.defaultModel,
                webEnabled = health.webEnabled,
                errorMessage = friendlyWidgetError(error),
            )
        }
    }

    suspend fun command(runId: String, command: String) = withTimeout(WIDGET_TIMEOUT_MS) {
        var settings = store.load()
        if (settings.accessToken.isBlank() || settings.baseUrl.isBlank()) return@withTimeout
        withAuth(settings) { token ->
            client.command(settings.baseUrl, token, runId, command)
        }.also { settings = it.first }
    }

    /** Son çalışmanın istemini, eşleşen ya da uygun ilk modelle yeniden başlatır. */
    suspend fun rerunLast(): Boolean = withTimeout(WIDGET_TIMEOUT_MS) {
        var settings = store.load()
        if (settings.accessToken.isBlank() || settings.baseUrl.isBlank()) return@withTimeout false
        val runs = withAuth(settings) { token ->
            client.listRuns(settings.baseUrl, token)
        }.also { settings = it.first }.second
        if (runs.any { it.status in WidgetActiveStatuses }) return@withTimeout false
        val last = runs.firstOrNull() ?: return@withTimeout false
        if (last.prompt.isBlank()) return@withTimeout false
        val models = withAuth(settings) { token ->
            client.listModels(settings.baseUrl, token)
        }.also { settings = it.first }.second
        val model = models.firstOrNull { it.id == last.model || it.name == last.model }
            ?: models.firstOrNull { "unavailable" !in it.capabilities }
            ?: models.firstOrNull()
            ?: return@withTimeout false
        withAuth(settings) { token ->
            client.createRun(settings.baseUrl, token, last.sessionId, last.prompt, model)
        }
        true
    }

    /** Liste widget'ı için en yeni çalışmalar (varsayılan ilk [FEED_LIMIT]). */
    suspend fun recentRuns(limit: Int = FEED_LIMIT): List<AgentRun> = withTimeout(WIDGET_TIMEOUT_MS) {
        var settings = store.load()
        if (settings.accessToken.isBlank() || settings.baseUrl.isBlank()) return@withTimeout emptyList()
        val runs = withAuth(settings) { token ->
            client.listRuns(settings.baseUrl, token)
        }.also { settings = it.first }.second
        runs.take(limit)
    }

    private suspend fun <T> withAuth(
        settings: ConnectionSettings,
        block: suspend (String) -> T,
    ): Pair<ConnectionSettings, T> {
        try {
            return settings to block(settings.accessToken)
        } catch (exc: ApiException) {
            if (exc.code != 401 || settings.refreshToken.isBlank()) throw exc
            val tokens = client.refresh(settings.baseUrl, settings.refreshToken)
            val refreshed = settings.copy(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                deviceId = tokens.deviceId,
            )
            store.save(refreshed)
            return refreshed to block(refreshed.accessToken)
        }
    }

    private fun friendlyWidgetError(error: Throwable): String = when (error) {
        is ApiException -> error.message
        else -> error.message ?: appContext.getString(R.string.widget_error_unexpected)
    }.truncateForWidget(appContext.getString(R.string.widget_truncation_ellipsis))

    private fun String.truncateForWidget(ellipsis: String): String =
        if (length <= 64) this else take(64 - ellipsis.length).trimEnd() + ellipsis

    private companion object {
        const val WIDGET_TIMEOUT_MS = 8500L
        const val FEED_LIMIT = 12
    }
}

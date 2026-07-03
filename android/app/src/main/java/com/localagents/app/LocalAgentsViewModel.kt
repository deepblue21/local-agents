package com.localagents.app

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.localagents.app.data.AgentRun
import com.localagents.app.data.AgentSession
import com.localagents.app.data.ChatMessage
import com.localagents.app.data.ConnectionSettings
import com.localagents.app.data.HostProbe
import com.localagents.app.data.HostStatus
import com.localagents.app.data.MainTab
import com.localagents.app.data.ModelOption
import com.localagents.app.data.RunEvent
import com.localagents.app.data.SecureSettingsStore
import com.localagents.app.data.SessionContext
import com.localagents.app.data.ToolActivity
import com.localagents.app.data.WebSource
import com.localagents.app.net.ApiException
import com.localagents.app.net.LocalAgentsClient
import com.localagents.app.net.normalizedBaseUrl
import com.localagents.app.ui.theme.applyTheme
import com.localagents.app.widget.LocalAgentsWidgetIntents
import com.localagents.app.widget.LocalAgentsWidgetUpdater
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.sse.EventSource

class LocalAgentsViewModel(app: Application) : AndroidViewModel(app) {
    private val store = SecureSettingsStore(app)
    private val client = LocalAgentsClient()
    private val main = Handler(Looper.getMainLooper())

    var initialized by mutableStateOf(false); private set
    var settings by mutableStateOf(ConnectionSettings()); private set
    var pairUrl by mutableStateOf(""); private set
    var pairCode by mutableStateOf(""); private set
    var pairing by mutableStateOf(false); private set
    var online by mutableStateOf(false); private set
    var loading by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var tab by mutableStateOf(MainTab.SESSIONS); private set
    var selectedSession by mutableStateOf<AgentSession?>(null); private set
    var selectedModel by mutableStateOf<ModelOption?>(null); private set
    var activeRun by mutableStateOf<AgentRun?>(null); private set
    var hostStatus by mutableStateOf(HostStatus.UNKNOWN); private set
    var hostProbe by mutableStateOf(HostProbe()); private set
    var reconnectAttempt by mutableStateOf(0); private set
    var themeId by mutableStateOf("emerald"); private set
    var showSetupGuide by mutableStateOf(false); private set
    var sessionContext by mutableStateOf(SessionContext()); private set
    var compressingContext by mutableStateOf(false); private set
    var pendingPairConfirmation by mutableStateOf<PairLinkConfirmation?>(null); private set

    val sessions = mutableStateListOf<AgentSession>()
    val messages = mutableStateListOf<ChatMessage>()
    val runs = mutableStateListOf<AgentRun>()
    val models = mutableStateListOf<ModelOption>()
    val tools = mutableStateListOf<ToolActivity>()
    val sources = mutableStateListOf<WebSource>()

    private var eventSource: EventSource? = null
    private var lastEventId = 0L
    private var reconnecting = false
    private var probeJob: Job? = null
    private var pendingPairLink: PairLink? = null
    private var pendingWidgetTarget: String? = null
    private var pendingWidgetSessionId: String? = null
    private val notifiedTerminalRuns = mutableSetOf<String>()

    init {
        viewModelScope.launch {
            settings = store.load()
            pairUrl = settings.baseUrl
            val pendingLink = pendingPairLink
            val savedTheme = store.loadThemeId()
            applyTheme(savedTheme)
            themeId = savedTheme
            showSetupGuide = !store.loadSetupGuideSeen() && pendingLink == null
            pendingLink?.let { applyPairLinkFields(it) }
            initialized = true
            if (settings.accessToken.isNotBlank()) refreshAll() else probeHost(pairUrl)
            handleWidgetTargetIfReady()
        }
    }

    fun changeTab(value: MainTab) { tab = value }
    fun updatePairUrl(value: String) {
        pairUrl = value
        pendingPairLink = null
        pendingPairConfirmation = null
        probeHost(value)
    }
    fun updatePairCode(value: String) {
        pairCode = formatPairingCode(value)
        pendingPairLink = null
        pendingPairConfirmation = null
    }

    /** Debounced unauthenticated /health probe so the pairing screen shows live host status. */
    fun probeHost(value: String) {
        probeJob?.cancel()
        val target = value.trim()
        val normalized = normalizedBaseUrl(target)
        if (normalized == null) {
            hostStatus = HostStatus.UNKNOWN
            hostProbe = HostProbe()
            return
        }
        probeJob = viewModelScope.launch {
            delay(450)
            hostStatus = HostStatus.CHECKING
            val probe = client.health(normalized)
            hostProbe = probe
            hostStatus = if (probe.ok) HostStatus.ONLINE else HostStatus.OFFLINE
        }
    }
    fun clearError() { error = null }
    fun selectModel(value: ModelOption) { selectedModel = value }

    fun setTheme(id: String) {
        themeId = id
        applyTheme(id)
        viewModelScope.launch { store.saveThemeId(id) }
    }

    fun applyDeepLink(uri: Uri?) {
        if (uri?.scheme != "localagents" || uri.host != "pair") return
        val link = PairLink(
            url = uri.getQueryParameter("url")?.takeIf(String::isNotBlank),
            code = uri.getQueryParameter("code")?.takeIf(String::isNotBlank),
        )
        pendingPairLink = link
        applyPairLinkFields(link)
        showSetupGuide = false
        if (initialized) probeHost(pairUrl)
    }

    fun confirmPairLink() {
        pendingPairConfirmation = null
    }

    fun rejectPairLink() {
        pendingPairLink = null
        pendingPairConfirmation = null
        pairUrl = settings.baseUrl
        pairCode = ""
        probeHost(pairUrl)
    }

    fun applyWidgetIntent(intent: Intent?) {
        val target = LocalAgentsWidgetIntents.launchTarget(intent) ?: return
        pendingWidgetTarget = target
        pendingWidgetSessionId = LocalAgentsWidgetIntents.sessionId(intent)
        intent?.removeExtra(LocalAgentsWidgetIntents.EXTRA_LAUNCH_TARGET)
        intent?.removeExtra(LocalAgentsWidgetIntents.EXTRA_SESSION_ID)
        handleWidgetTargetIfReady()
    }

    fun openSetupGuide() {
        showSetupGuide = true
    }

    fun finishSetupGuide() {
        showSetupGuide = false
        viewModelScope.launch { store.saveSetupGuideSeen(true) }
    }

    fun pair(deviceName: String) {
        if (pairUrl.isBlank() || pairCode.isBlank() || pairing) return
        if (pendingPairConfirmation != null) {
            error = getApplication<Application>().getString(R.string.error_confirm_pair_link)
            return
        }
        val normalized = normalizedBaseUrl(pairUrl)
        if (normalized == null) {
            error = getApplication<Application>().getString(R.string.error_invalid_server_address)
            hostStatus = HostStatus.UNKNOWN
            return
        }
        pairing = true
        error = null
        viewModelScope.launch {
            try {
                val result = client.pair(normalized, normalizePairingCode(pairCode), deviceName.ifBlank { "Android" })
                settings = ConnectionSettings(
                    baseUrl = normalized,
                    accessToken = result.accessToken,
                    refreshToken = result.refreshToken,
                    deviceId = result.deviceId,
                )
                pairUrl = normalized
                store.save(settings)
                store.saveSetupGuideSeen(true)
                pendingPairLink = null
                pendingPairConfirmation = null
                pairCode = ""
                refreshAll()
            } catch (exc: Exception) {
                error = friendlyError(exc)
            } finally {
                pairing = false
            }
        }
    }

    fun refreshAll() {
        if (loading || settings.accessToken.isBlank()) return
        loading = true
        viewModelScope.launch {
            try {
                val loadedModels = withAuth { token -> client.listModels(settings.baseUrl, token) }
                val loadedSessions = withAuth { token -> client.listSessions(settings.baseUrl, token) }
                val loadedRuns = withAuth { token -> client.listRuns(settings.baseUrl, token) }
                models.replaceWith(loadedModels)
                sessions.replaceWith(loadedSessions)
                runs.replaceWith(loadedRuns)
                selectedModel = selectUsableModel(selectedModel, loadedModels)
                val currentSession = selectedSession?.let { current -> loadedSessions.find { it.id == current.id } }
                    ?: loadedSessions.firstOrNull()
                if (currentSession != null) {
                    selectSession(currentSession)
                } else {
                    eventSource?.cancel()
                    selectedSession = null
                    activeRun = null
                    messages.clear()
                    tools.clear()
                    sources.clear()
                    sessionContext = SessionContext()
                }
                online = true
                error = null
                LocalAgentsWidgetUpdater.updateAll(getApplication())
            } catch (exc: Exception) {
                online = false
                error = friendlyError(exc)
            } finally {
                loading = false
                handleWidgetTargetIfReady()
            }
        }
    }

    fun selectSession(session: AgentSession) {
        eventSource?.cancel()
        selectedSession = session
        tools.clear()
        sources.clear()
        activeRun = runs.firstOrNull { run ->
            run.sessionId == session.id && run.status in ACTIVE_STATUSES
        }
        activeRun?.let { run ->
            lastEventId = 0
            reconnectAttempt = 0
            connectEvents(run.id)
        }
        viewModelScope.launch {
            try {
                messages.replaceWith(withAuth { token -> client.listMessages(settings.baseUrl, token, session.id) })
                sessionContext = withAuth { token ->
                    client.sessionContext(settings.baseUrl, token, session.id)
                }
            } catch (exc: Exception) {
                error = friendlyError(exc)
            }
        }
    }

    fun openSession(session: AgentSession) {
        selectSession(session)
        tab = MainTab.CHAT
    }

    fun refreshContext() {
        val session = selectedSession ?: return
        viewModelScope.launch {
            try {
                sessionContext = withAuth { token ->
                    client.sessionContext(settings.baseUrl, token, session.id)
                }
            } catch (exc: Exception) {
                error = friendlyError(exc)
            }
        }
    }

    fun compressContext() {
        val session = selectedSession ?: return
        val busy = activeRun?.status?.let(ACTIVE_STATUSES::contains) == true
        if (compressingContext || busy) return
        compressingContext = true
        error = null
        viewModelScope.launch {
            try {
                sessionContext = withAuth { token ->
                    client.compressContext(settings.baseUrl, token, session.id, selectedModel)
                }
            } catch (exc: Exception) {
                error = friendlyError(exc)
            } finally {
                compressingContext = false
            }
        }
    }

    fun openRun(run: AgentRun) {
        val session = sessions.firstOrNull { it.id == run.sessionId } ?: return
        selectSession(session)
        if (run.status !in ACTIVE_STATUSES) activeRun = run
        tab = MainTab.CHAT
    }

    fun newSession() {
        eventSource?.cancel()
        activeRun = null
        tools.clear()
        sources.clear()
        messages.clear()
        sessionContext = SessionContext()
        viewModelScope.launch {
            try {
                val session = withAuth { token ->
                    client.createSession(settings.baseUrl, token, getApplication<Application>().getString(R.string.action_new_chat))
                }
                sessions.add(0, session)
                selectedSession = session
                tab = MainTab.CHAT
            } catch (exc: Exception) {
                error = friendlyError(exc)
            }
        }
    }

    fun send(prompt: String) {
        val clean = prompt.trim()
        val session = selectedSession
        val model = selectedModel
        if (
            clean.isEmpty()
            || session == null
            || model == null
            || activeRun?.status?.let(ACTIVE_STATUSES::contains) == true
        ) return
        messages.add(
            ChatMessage(
                id = "local-${System.nanoTime()}",
                sessionId = session.id,
                role = "user",
                content = clean,
                createdAt = "",
            ),
        )
        tools.clear()
        sources.clear()
        error = null
        viewModelScope.launch {
            try {
                val run = withAuth { token ->
                    client.createRun(settings.baseUrl, token, session.id, clean, model)
                }
                activeRun = run
                runs.add(0, run)
                LocalAgentsWidgetUpdater.updateAll(getApplication())
                try {
                    sessionContext = withAuth { token ->
                        client.sessionContext(settings.baseUrl, token, session.id)
                    }
                } catch (_: Exception) {
                }
                lastEventId = 0
                reconnectAttempt = 0
                connectEvents(run.id)
            } catch (exc: Exception) {
                error = friendlyError(exc)
            }
        }
    }

    fun runCommand(command: String, instruction: String? = null) {
        val run = activeRun ?: return
        viewModelScope.launch {
            try {
                activeRun = withAuth { token ->
                    client.command(settings.baseUrl, token, run.id, command, instruction)
                }
                if (command == "cancel") eventSource?.cancel()
            } catch (exc: Exception) {
                error = friendlyError(exc)
            }
        }
    }

    fun unpair() {
        eventSource?.cancel()
        viewModelScope.launch {
            store.clearConnection()
            settings = ConnectionSettings()
            pairUrl = settings.baseUrl
            sessions.clear(); messages.clear(); runs.clear(); models.clear(); tools.clear(); sources.clear()
            selectedSession = null; selectedModel = null; activeRun = null; online = false
            sessionContext = SessionContext(); compressingContext = false
            LocalAgentsWidgetUpdater.updateAll(getApplication())
        }
    }

    private suspend fun clearExpiredConnection() {
        val baseUrl = settings.baseUrl
        eventSource?.cancel()
        val cleared = ConnectionSettings(baseUrl = baseUrl)
        store.save(cleared)
        settings = cleared
        pairUrl = baseUrl
        pairCode = ""
        sessions.clear(); messages.clear(); runs.clear(); models.clear(); tools.clear(); sources.clear()
        selectedSession = null; selectedModel = null; activeRun = null; online = false
        sessionContext = SessionContext(); compressingContext = false
        reconnectAttempt = 0; reconnecting = false
        showSetupGuide = false
        LocalAgentsWidgetUpdater.updateAll(getApplication())
    }

    private fun connectEvents(runId: String) {
        eventSource?.cancel()
        try {
            eventSource = client.streamEvents(
                settings.baseUrl,
                settings.accessToken,
                runId,
                lastEventId,
                object : LocalAgentsClient.StreamCallbacks {
                    override fun onEvent(event: RunEvent) {
                        main.post { handleEvent(event) }
                    }

                    override fun onClosed() {
                        main.post { reconnecting = false }
                    }

                    override fun onError(message: String) {
                        main.post {
                            error = message
                            val active = activeRun?.status?.let(ACTIVE_STATUSES::contains) == true
                            if (!reconnecting && active && reconnectAttempt < MAX_RECONNECT) {
                                reconnecting = true
                                reconnectAttempt += 1
                                viewModelScope.launch {
                                    delay(1500L * reconnectAttempt)
                                    reconnecting = false
                                    connectEvents(runId)
                                }
                            }
                        }
                    }
                },
            )
        } catch (exc: Exception) {
            error = friendlyError(exc)
        }
    }

    private fun handleEvent(event: RunEvent) {
        lastEventId = maxOf(lastEventId, event.seq)
        if (reconnectAttempt != 0) reconnectAttempt = 0
        when (event.type) {
            "run.thinking" -> {
                val active = event.payload["active"]?.toString()?.toBooleanStrictOrNull() ?: true
                if (active) beginAssistantActivity() else removeEmptyAssistantActivity()
            }
            "assistant.delta" -> appendAssistant(event.payload["content"]?.toString().orEmpty(), streaming = true)
            "assistant.final" -> {
                val final = event.payload["content"]?.toString().orEmpty()
                setAssistantFinal(final)
            }
            "tool.started" -> tools.add(
                ToolActivity(
                    name = event.payload["name"]?.toString().orEmpty(),
                    status = "running",
                    args = jsonish(event.payload["arguments"]),
                    seq = event.seq,
                    startedAt = event.createdAt,
                ),
            )
            "tool.finished", "tool.failed" -> {
                val name = event.payload["name"]?.toString().orEmpty()
                val index = tools.indexOfLast { it.name == name && it.status == "running" }
                val started = tools.getOrNull(index)
                val item = ToolActivity(
                    name = name,
                    status = if (event.type == "tool.finished") "done" else "failed",
                    args = started?.args.orEmpty(),
                    result = jsonish(event.payload["result"] ?: event.payload["error"]),
                    durationMs = durationMs(started?.startedAt, event.createdAt),
                    seq = started?.seq ?: event.seq,
                    startedAt = started?.startedAt.orEmpty(),
                )
                if (index >= 0) tools[index] = item else tools.add(item)
            }
            "source.found" -> addSource(event, status = "found")
            "source.fetched" -> addSource(event, status = "fetched")
            "run.started" -> {
                activeRun = activeRun?.copy(status = "running")
                LocalAgentsWidgetUpdater.updateAll(getApplication())
            }
            "run.paused" -> {
                activeRun = activeRun?.copy(status = "paused")
                LocalAgentsWidgetUpdater.updateAll(getApplication())
            }
            "run.resumed" -> {
                activeRun = activeRun?.copy(status = "running")
                LocalAgentsWidgetUpdater.updateAll(getApplication())
            }
            "run.completed" -> {
                activeRun = activeRun?.copy(status = "completed")
                removeEmptyAssistantActivity()
                notifyRunFinished(event.runId, failed = false)
                LocalAgentsWidgetUpdater.updateAll(getApplication())
                refreshAll()
            }
            "run.cancelled" -> {
                activeRun = activeRun?.copy(status = "cancelled")
                removeEmptyAssistantActivity()
                LocalAgentsWidgetUpdater.updateAll(getApplication())
            }
            "run.failed" -> {
                activeRun = activeRun?.copy(status = "failed")
                removeEmptyAssistantActivity()
                notifyRunFinished(event.runId, failed = true)
                LocalAgentsWidgetUpdater.updateAll(getApplication())
                error = event.payload["error"]?.toString()
            }
        }
    }

    private fun handleWidgetTargetIfReady() {
        if (!initialized || loading) return
        val target = pendingWidgetTarget ?: return
        val sessionId = pendingWidgetSessionId
        pendingWidgetTarget = null
        pendingWidgetSessionId = null
        when (target) {
            LocalAgentsWidgetIntents.TARGET_SESSIONS -> tab = MainTab.SESSIONS
            LocalAgentsWidgetIntents.TARGET_CHAT -> tab = if (selectedSession != null) MainTab.CHAT else MainTab.SESSIONS
            LocalAgentsWidgetIntents.TARGET_RUNS -> tab = MainTab.RUNS
            LocalAgentsWidgetIntents.TARGET_SETTINGS -> tab = MainTab.SETTINGS
            LocalAgentsWidgetIntents.TARGET_NEW_SESSION -> {
                if (settings.accessToken.isNotBlank()) newSession() else tab = MainTab.SESSIONS
            }
            LocalAgentsWidgetIntents.TARGET_OPEN_SESSION -> {
                val session = sessions.firstOrNull { it.id == sessionId }
                if (session != null) openSession(session) else tab = MainTab.RUNS
            }
        }
    }

    private fun applyPairLinkFields(link: PairLink) {
        val normalizedUrl = link.url?.let { normalizedBaseUrl(it) ?: it.trim() }
        normalizedUrl?.let { pairUrl = it }
        link.code?.let { pairCode = formatPairingCode(it) }
        pendingPairConfirmation = if (pairLinkRequiresConfirmation(settings.baseUrl, normalizedUrl)) {
            PairLinkConfirmation(
                url = normalizedUrl.orEmpty(),
                codePreview = link.code?.let(::formatPairingCode).orEmpty(),
            )
        } else {
            null
        }
    }

    private fun beginAssistantActivity() {
        val sessionId = selectedSession?.id ?: return
        val hasStreamingAssistant = messages.any { it.role == "assistant" && it.streaming }
        if (hasStreamingAssistant) return
        messages.add(
            ChatMessage(
                id = "stream-${activeRun?.id ?: System.nanoTime()}",
                sessionId = sessionId,
                role = "assistant",
                content = "",
                createdAt = "",
                streaming = true,
            ),
        )
    }

    private fun removeEmptyAssistantActivity() {
        val index = messages.indexOfLast { it.role == "assistant" && it.streaming && it.content.isEmpty() }
        if (index >= 0) messages.removeAt(index)
    }

    private fun addSource(event: RunEvent, status: String) {
        val url = event.payload["url"]?.toString().orEmpty()
        if (url.isBlank()) return
        val item = WebSource(
            title = event.payload["title"]?.toString()?.ifBlank { url } ?: url,
            url = url,
            snippet = event.payload["snippet"]?.toString().orEmpty(),
            status = status,
            seq = event.seq,
        )
        val index = sources.indexOfFirst { it.url == url }
        if (index >= 0) sources[index] = item else sources.add(item)
    }

    private fun appendAssistant(delta: String, streaming: Boolean) {
        val sessionId = selectedSession?.id ?: return
        val index = messages.indexOfLast { it.role == "assistant" && it.streaming }
        if (index >= 0) {
            messages[index] = messages[index].copy(content = messages[index].content + delta, streaming = streaming)
        } else {
            messages.add(
                ChatMessage(
                    id = "stream-${activeRun?.id}",
                    sessionId = sessionId,
                    role = "assistant",
                    content = delta,
                    createdAt = "",
                    streaming = streaming,
                ),
            )
        }
    }

    private fun setAssistantFinal(content: String) {
        val index = messages.indexOfLast { it.role == "assistant" && it.streaming }
        if (index >= 0) messages[index] = messages[index].copy(content = content, streaming = false)
        else appendAssistant(content, streaming = false)
    }

    private fun notifyRunFinished(runId: String, failed: Boolean) {
        val key = "$runId:${if (failed) "failed" else "completed"}"
        if (!notifiedTerminalRuns.add(key)) return
        RunNotifier.notifyRunFinished(getApplication(), runId, failed)
    }

    private suspend fun <T> withAuth(block: suspend (String) -> T): T {
        try {
            return block(settings.accessToken)
        } catch (exc: ApiException) {
            if (exc.code != 401 || settings.refreshToken.isBlank()) throw exc
            val tokens = try {
                client.refresh(settings.baseUrl, settings.refreshToken)
            } catch (refreshError: ApiException) {
                if (refreshError.code == 401) {
                    clearExpiredConnection()
                    throw ApiException(401, getApplication<Application>().getString(R.string.error_session_expired_repair))
                }
                throw refreshError
            }
            settings = settings.copy(
                accessToken = tokens.accessToken,
                refreshToken = tokens.refreshToken,
                deviceId = tokens.deviceId,
            )
            store.save(settings)
            return try {
                block(settings.accessToken)
            } catch (retryError: ApiException) {
                if (retryError.code == 401) {
                    clearExpiredConnection()
                    throw ApiException(401, getApplication<Application>().getString(R.string.error_session_expired_repair))
                }
                throw retryError
            }
        }
    }

    private fun friendlyError(exc: Exception): String = when (exc) {
        is ApiException -> exc.message
        else -> exc.message ?: getApplication<Application>().getString(R.string.error_unexpected)
    }

    private fun jsonish(value: Any?): String = when (value) {
        null -> "—"
        is Map<*, *> -> org.json.JSONObject(value).toString()
        is List<*> -> org.json.JSONArray(value).toString()
        else -> value.toString()
    }

    private fun durationMs(start: String?, end: String): Long? {
        if (start.isNullOrBlank()) return null
        return runCatching {
            java.time.Duration.between(parseInstant(start), parseInstant(end)).toMillis().coerceAtLeast(0)
        }.getOrNull()
    }

    private fun parseInstant(value: String): java.time.Instant =
        runCatching { java.time.OffsetDateTime.parse(value).toInstant() }
            .getOrElse { java.time.Instant.parse(value) }

    override fun onCleared() {
        eventSource?.cancel()
        super.onCleared()
    }

    companion object {
        private const val MAX_RECONNECT = 5
        private val ACTIVE_STATUSES = setOf("queued", "running", "paused")
    }
}

data class PairLinkConfirmation(val url: String, val codePreview: String)

private data class PairLink(val url: String?, val code: String?)

internal fun pairLinkRequiresConfirmation(currentBaseUrl: String, incomingUrl: String?): Boolean {
    val incoming = incomingUrl?.let { normalizedBaseUrl(it) ?: it.trim().trimEnd('/') }.orEmpty()
    if (incoming.isBlank()) return false
    val current = (normalizedBaseUrl(currentBaseUrl) ?: currentBaseUrl.trim().trimEnd('/'))
    return current.isBlank() || !current.equals(incoming, ignoreCase = true)
}

internal fun normalizePairingCode(value: String): String =
    value.uppercase().filter(Char::isLetterOrDigit)

internal fun formatPairingCode(value: String): String =
    normalizePairingCode(value)
        .chunked(4)
        .joinToString(" · ")

internal fun selectUsableModel(
    current: ModelOption?,
    loaded: List<ModelOption>,
): ModelOption? {
    val matching = current?.let { selected ->
        loaded.firstOrNull { it.id == selected.id && it.provider == selected.provider }
    }
    if (matching != null && "unavailable" !in matching.capabilities) return matching
    return loaded.firstOrNull { "unavailable" !in it.capabilities }
        ?: loaded.firstOrNull()
}

private fun <T> MutableList<T>.replaceWith(items: List<T>) {
    clear()
    addAll(items)
}

package com.localagents.app.net

import com.localagents.app.data.AgentRun
import com.localagents.app.data.AgentSession
import com.localagents.app.data.ChatMessage
import com.localagents.app.data.HostProbe
import com.localagents.app.data.ModelOption
import com.localagents.app.data.RunEvent
import com.localagents.app.data.SessionContext
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONArray
import org.json.JSONObject

data class PairResult(
    val accessToken: String,
    val refreshToken: String,
    val deviceId: String,
)

class ApiException(val code: Int, override val message: String) : Exception(message)

private const val INVALID_BASE_URL_MESSAGE = "Sunucu adresi geçersiz"

internal fun normalizedBaseUrl(input: String): String? {
    val raw = input.trim()
    if (raw.isBlank()) return null
    val withScheme = when {
        raw.startsWith("http://", ignoreCase = true) -> raw
        raw.startsWith("https://", ignoreCase = true) -> raw
        raw.contains("://") -> return null
        else -> "http://$raw"
    }
    val parsed = withScheme.toHttpUrlOrNull() ?: return null
    return parsed.newBuilder()
        .encodedPath("/")
        .query(null)
        .fragment(null)
        .build()
        .toString()
        .trimEnd('/')
}

internal fun endpointUrl(baseUrl: String, path: String): HttpUrl? {
    val normalized = normalizedBaseUrl(baseUrl)?.toHttpUrlOrNull() ?: return null
    val cleanPath = if (path.startsWith("/")) path else "/$path"
    return normalized.newBuilder()
        .encodedPath(cleanPath)
        .query(null)
        .fragment(null)
        .build()
}

private fun endpointUrlOrThrow(baseUrl: String, path: String): HttpUrl =
    endpointUrl(baseUrl, path) ?: throw ApiException(0, INVALID_BASE_URL_MESSAGE)

class LocalAgentsClient {
    private val jsonType = "application/json; charset=utf-8".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .build()
    private val streamClient = client.newBuilder()
        .readTimeout(0, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()
    private val probeClient = client.newBuilder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .callTimeout(6, TimeUnit.SECONDS)
        .build()

    /** Unauthenticated liveness probe used before pairing. */
    suspend fun health(baseUrl: String): HostProbe = withContext(Dispatchers.IO) {
        val url = endpointUrl(baseUrl, "/health") ?: return@withContext HostProbe()
        val request = Request.Builder()
            .url(url)
            .get()
            .build()
        runCatching {
            probeClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@use HostProbe()
                JSONObject(response.body?.string().orEmpty()).toHostProbe()
            }
        }.getOrDefault(HostProbe())
    }

    suspend fun pair(baseUrl: String, code: String, deviceName: String): PairResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("code", code).put("device_name", deviceName)
        executeJson(baseUrl, "/api/v1/pair/exchange", "POST", null, body).toPairResult()
    }

    suspend fun refresh(baseUrl: String, refreshToken: String): PairResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("refresh_token", refreshToken)
        executeJson(baseUrl, "/api/v1/auth/refresh", "POST", null, body).toPairResult()
    }

    suspend fun listModels(baseUrl: String, token: String): List<ModelOption> = withContext(Dispatchers.IO) {
        val array = executeArray(baseUrl, "/api/v1/models", token)
        List(array.length()) { index -> array.getJSONObject(index).toModel() }
    }

    suspend fun listSessions(baseUrl: String, token: String): List<AgentSession> = withContext(Dispatchers.IO) {
        val array = executeArray(baseUrl, "/api/v1/sessions", token)
        List(array.length()) { index -> array.getJSONObject(index).toSession() }
    }

    suspend fun createSession(baseUrl: String, token: String, title: String): AgentSession = withContext(Dispatchers.IO) {
        executeJson(baseUrl, "/api/v1/sessions", "POST", token, JSONObject().put("title", title)).toSession()
    }

    suspend fun renameSession(
        baseUrl: String,
        token: String,
        sessionId: String,
        title: String,
    ): AgentSession = withContext(Dispatchers.IO) {
        executeJson(
            baseUrl,
            "/api/v1/sessions/$sessionId",
            "PATCH",
            token,
            JSONObject().put("title", title),
        ).toSession()
    }

    /** Deletes the conversation and every message, run, and event that belongs to it. */
    suspend fun deleteSession(baseUrl: String, token: String, sessionId: String) {
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url(endpointUrlOrThrow(baseUrl, "/api/v1/sessions/$sessionId"))
                .header("Authorization", "Bearer $token")
                .delete()
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw apiError(response.code, response.body?.string().orEmpty())
            }
        }
    }

    suspend fun listMessages(baseUrl: String, token: String, sessionId: String): List<ChatMessage> = withContext(Dispatchers.IO) {
        val array = executeArray(baseUrl, "/api/v1/sessions/$sessionId/messages", token)
        List(array.length()) { index -> array.getJSONObject(index).toMessage() }
    }

    suspend fun sessionContext(baseUrl: String, token: String, sessionId: String): SessionContext = withContext(Dispatchers.IO) {
        executeObject(baseUrl, "/api/v1/sessions/$sessionId/context", token).toSessionContext()
    }

    suspend fun compressContext(
        baseUrl: String,
        token: String,
        sessionId: String,
        model: ModelOption?,
    ): SessionContext = withContext(Dispatchers.IO) {
        val body = JSONObject()
        if (model != null) {
            body.put("model", model.id)
            body.put("provider", model.provider)
        }
        executeJson(baseUrl, "/api/v1/sessions/$sessionId/context/compress", "POST", token, body)
            .toSessionContext()
    }

    suspend fun listRuns(baseUrl: String, token: String): List<AgentRun> = withContext(Dispatchers.IO) {
        val array = executeArray(baseUrl, "/api/v1/runs", token)
        List(array.length()) { index -> array.getJSONObject(index).toRun() }
    }

    suspend fun createRun(
        baseUrl: String,
        token: String,
        sessionId: String,
        prompt: String,
        model: ModelOption,
    ): AgentRun = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("prompt", prompt)
            .put("model", model.id)
            .put("provider", model.provider)
        executeJson(baseUrl, "/api/v1/sessions/$sessionId/runs", "POST", token, body).toRun()
    }

    suspend fun command(
        baseUrl: String,
        token: String,
        runId: String,
        command: String,
        instruction: String? = null,
    ): AgentRun = withContext(Dispatchers.IO) {
        val body = JSONObject().put("command", command)
        if (!instruction.isNullOrBlank()) body.put("instruction", instruction)
        executeJson(baseUrl, "/api/v1/runs/$runId/commands", "POST", token, body).toRun()
    }

    fun streamEvents(
        baseUrl: String,
        token: String,
        runId: String,
        lastEventId: Long,
        callbacks: StreamCallbacks,
    ): EventSource {
        val url = endpointUrlOrThrow(baseUrl, "/api/v1/runs/$runId/events")
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .header("Accept", "text/event-stream")
            .apply { if (lastEventId > 0) header("Last-Event-ID", lastEventId.toString()) }
            .build()
        return EventSources.createFactory(streamClient).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onEvent(source: EventSource, id: String?, type: String?, data: String) {
                    try {
                        callbacks.onEvent(parseEvent(data))
                    } catch (error: Exception) {
                        callbacks.onError("Olay ayrıştırılamadı: ${error.message}")
                    }
                }

                override fun onClosed(source: EventSource) = callbacks.onClosed()

                override fun onFailure(source: EventSource, throwable: Throwable?, response: Response?) {
                    callbacks.onError(
                        when (response?.code) {
                            401 -> "Oturum süresi doldu"
                            null -> "Bağlantı kesildi: ${throwable?.message ?: "bilinmeyen hata"}"
                            else -> "Sunucu hatası (${response.code})"
                        },
                    )
                }
            },
        )
    }

    interface StreamCallbacks {
        fun onEvent(event: RunEvent)
        fun onClosed()
        fun onError(message: String)
    }

    private fun executeObject(baseUrl: String, path: String, token: String): JSONObject {
        val url = endpointUrlOrThrow(baseUrl, path)
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw apiError(response.code, text)
            return JSONObject(text)
        }
    }

    private fun executeArray(baseUrl: String, path: String, token: String): JSONArray {
        val url = endpointUrlOrThrow(baseUrl, path)
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw apiError(response.code, text)
            return JSONArray(text)
        }
    }

    private fun executeJson(
        baseUrl: String,
        path: String,
        method: String,
        token: String?,
        body: JSONObject,
    ): JSONObject {
        val builder = Request.Builder().url(endpointUrlOrThrow(baseUrl, path))
        if (!token.isNullOrBlank()) builder.header("Authorization", "Bearer $token")
        val requestBody = body.toString().toRequestBody(jsonType)
        when (method) {
            "POST" -> builder.post(requestBody)
            "PATCH" -> builder.patch(requestBody)
            else -> error("unsupported method")
        }
        client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw apiError(response.code, text)
            return JSONObject(text)
        }
    }

    private fun apiError(code: Int, text: String): ApiException {
        val detail = try {
            JSONObject(text).optString("detail", "İstek başarısız")
        } catch (_: Exception) {
            "İstek başarısız"
        }
        return ApiException(code, detail)
    }

    companion object {
        fun parseEvent(data: String): RunEvent {
            val root = JSONObject(data)
            val payload = root.optJSONObject("payload")?.toMap().orEmpty()
            return RunEvent(
                seq = root.getLong("seq"),
                runId = root.getString("run_id"),
                type = root.getString("type"),
                payload = payload,
                createdAt = root.getString("created_at"),
            )
        }
    }
}

private fun JSONObject.toPairResult() = PairResult(
    accessToken = getString("access_token"),
    refreshToken = getString("refresh_token"),
    deviceId = getString("device_id"),
)

private fun JSONObject.toModel(): ModelOption {
    val caps = optJSONArray("capabilities") ?: JSONArray()
    return ModelOption(
        id = getString("id"),
        name = getString("name"),
        provider = getString("provider"),
        capabilities = List(caps.length()) { caps.getString(it) },
    )
}

private fun JSONObject.toHostProbe(): HostProbe {
    val providers = optJSONObject("providers")
    val ollama = providers?.optJSONObject("ollama")
    return HostProbe(
        ok = optBoolean("ok", false),
        service = optString("service", ""),
        defaultModel = optString("default_model", ollama?.optString("default_model", "").orEmpty()),
        ollamaOnline = ollama?.optBoolean("online", false) ?: false,
        defaultModelReady = ollama?.optBoolean("default_model_ready", false) ?: false,
        webEnabled = optBoolean("web", false),
    )
}

private fun JSONObject.toSession() = AgentSession(
    id = getString("id"),
    title = getString("title"),
    createdAt = getString("created_at"),
    updatedAt = getString("updated_at"),
    toolCount = optInt("tool_count", 0),
)

private fun JSONObject.toMessage() = ChatMessage(
    id = getString("id"),
    sessionId = getString("session_id"),
    role = getString("role"),
    content = getString("content"),
    createdAt = getString("created_at"),
)

private fun JSONObject.toSessionContext() = SessionContext(
    sessionId = getString("session_id"),
    tokenEstimate = optInt("token_estimate", 0),
    maxTokens = optInt("max_tokens", 8192),
    usageRatio = optDouble("usage_ratio", 0.0),
    usagePercent = optInt("usage_percent", 0),
    messageCount = optInt("message_count", 0),
    summarizedMessageCount = optInt("summarized_message_count", 0),
    summaryTokenEstimate = optInt("summary_token_estimate", 0),
    unsummarizedTokenEstimate = optInt("unsummarized_token_estimate", 0),
    hasSummary = optBoolean("has_summary", false),
    canCompress = optBoolean("can_compress", false),
)

private fun JSONObject.toRun() = AgentRun(
    id = getString("id"),
    sessionId = getString("session_id"),
    status = getString("status"),
    model = getString("model"),
    provider = getString("provider"),
    prompt = getString("prompt"),
    createdAt = getString("created_at"),
    updatedAt = getString("updated_at"),
)

private fun JSONObject.toMap(): Map<String, Any?> = keys().asSequence().associateWith { key ->
    when (val value = get(key)) {
        JSONObject.NULL -> null
        is JSONObject -> value.toMap()
        is JSONArray -> List(value.length()) { index -> value.get(index) }
        else -> value
    }
}

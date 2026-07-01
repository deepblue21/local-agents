package com.localagents.app.data

data class ConnectionSettings(
    val baseUrl: String = "",
    val accessToken: String = "",
    val refreshToken: String = "",
    val deviceId: String = "",
)

data class AgentSession(
    val id: String,
    val title: String,
    val createdAt: String,
    val updatedAt: String,
    val toolCount: Int = 0,
)

data class ChatMessage(
    val id: String,
    val sessionId: String,
    val role: String,
    val content: String,
    val createdAt: String,
    val streaming: Boolean = false,
)

data class SessionContext(
    val sessionId: String = "",
    val tokenEstimate: Int = 0,
    val maxTokens: Int = 8192,
    val usageRatio: Double = 0.0,
    val usagePercent: Int = 0,
    val messageCount: Int = 0,
    val summarizedMessageCount: Int = 0,
    val summaryTokenEstimate: Int = 0,
    val unsummarizedTokenEstimate: Int = 0,
    val hasSummary: Boolean = false,
    val canCompress: Boolean = false,
)

data class AgentRun(
    val id: String,
    val sessionId: String,
    val status: String,
    val model: String,
    val provider: String,
    val prompt: String,
    val createdAt: String,
    val updatedAt: String,
)

data class ModelOption(
    val id: String,
    val name: String,
    val provider: String,
    val capabilities: List<String>,
)

data class RunEvent(
    val seq: Long,
    val runId: String,
    val type: String,
    val payload: Map<String, Any?>,
    val createdAt: String,
)

data class ToolActivity(
    val name: String,
    val status: String,
    val args: String = "",
    val result: String = "",
    val durationMs: Long? = null,
    val seq: Long,
    val startedAt: String = "",
)

data class WebSource(
    val title: String,
    val url: String,
    val snippet: String = "",
    val status: String = "found",
    val seq: Long,
)

data class HostProbe(
    val ok: Boolean = false,
    val service: String = "",
    val defaultModel: String = "",
    val ollamaOnline: Boolean = false,
    val defaultModelReady: Boolean = false,
    val webEnabled: Boolean = false,
)

enum class MainTab { SESSIONS, CHAT, RUNS, MODELS, SETTINGS }

enum class HostStatus { UNKNOWN, CHECKING, ONLINE, OFFLINE }

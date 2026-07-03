# Local_Agents Architecture

## Components

The Android application talks only to the companion API. The companion owns device
authentication, persisted sessions, run orchestration, model adapters, and event
streaming. Ollama and Nova credentials never leave the PC.

Workspace tools execute in the runner container. The runner has no network and sees
only explicitly mounted workspaces. It communicates with the API through a Unix socket;
the Docker socket and host shell are never exposed.

Web research tools execute in the PC companion API process, not on Android and not in
the isolated runner. Search provider credentials, such as a Brave Search API key, stay
on the PC. The runner remains networkless; `fetch_url` rejects localhost, private LAN,
link-local, and other non-public network targets by default to reduce SSRF risk.

## Core protocol

- `GET /health`: unauthenticated companion liveness plus limited host readiness
  metadata for pairing previews: default model, web-tool availability, and Ollama
  default-model readiness.
- `GET /api/v1/admin/devices`: list paired devices for the companion owner.
- `POST /api/v1/admin/devices/{id}/revoke`: revoke a paired device and its tokens.
- `POST /api/v1/pair/exchange`: exchange a short-lived pairing code for device tokens.
- `POST /api/v1/auth/refresh`: rotate a refresh token and issue a new access token.
- `GET /api/v1/models`: list models and provider capabilities.
- `GET|POST /api/v1/sessions`: list or create conversations. Listed sessions include
  `tool_count`, the persisted count of tool-start events across that conversation.
- `GET /api/v1/sessions/{id}/context`: estimate context-window usage for the session.
- `POST /api/v1/sessions/{id}/context/compress`: summarize older session history into
  server-side memory so later runs can continue with a smaller prompt.
- `POST /api/v1/sessions/{id}/runs`: add a prompt and queue an agent run.
- `GET /api/v1/runs/{id}/events`: SSE replay followed by live events.
- `POST /api/v1/runs/{id}/commands`: pause, resume, cancel, or steer a run.

Each event has a monotonically increasing sequence. Android reconnects with
`Last-Event-ID`; the server replays newer rows before tailing live events.
Event streams are capped per device by `LOCAL_AGENTS_SSE_STREAMS_PER_DEVICE` and long-lived
streams periodically revalidate the bearer token using `LOCAL_AGENTS_SSE_REAUTH_SECONDS`.
If the token expires or the device is revoked, the stream ends and Android must refresh or
pair again. The live tail still uses a lightweight DB polling loop; replacing it with an
in-process notify/condition is the next reliability improvement.

Common run events:

- `run.started|run.thinking|run.paused|run.resumed|run.completed|run.failed|run.cancelled`
- `assistant.delta|assistant.final`
- `tool.started|tool.finished|tool.failed`
- `source.found|source.fetched` for web research results shown as citations/sources.

## Run lifecycle

`queued -> running -> paused -> running -> completed|failed|cancelled`

Only one run is active by default because local models generally share one GPU. Other
runs remain in a FIFO queue. A server restart moves interrupted `running` rows to
`paused`; they are resumed explicitly to avoid repeating side effects.

## Context memory

The companion keeps the full message history in SQLite. A separate `session_contexts`
row stores an LLM-generated operational summary plus the number of messages covered
by that summary. New runs receive the memory summary as a system message followed by
only the unsummarized tail of the conversation.

Context usage is an estimate, not a provider tokenizer result. The default budget is
`LOCAL_AGENTS_CONTEXT_WINDOW_TOKENS=8192`. Android displays token estimate,
percentage, and the "summarize and continue" action, but raw model chain-of-thought is
never stored or exposed.

## Authentication

Pairing codes are random, one-use, hashed at rest, and expire after the configured
`LOCAL_AGENTS_PAIRING_CODE_MINUTES` window. The development default is 240 minutes to
support remote Tailscale testing.
Codes are displayed in four-character groups for manual entry; the server normalizes
case and visual separators before comparing the hash.
QR/deep-link pairing pre-fills the companion URL and code, but Android requires explicit
host confirmation before the Pair action is enabled when the link introduces a new or
changed host. Verified Android App Links and production tunnel allowlisting remain planned
hardening work.
Access tokens expire after fifteen minutes. Refresh tokens are rotated and revocable.
Android encrypts the refresh token with an AES-GCM key stored in Android Keystore.
Admin-authenticated device revocation marks the device and all of its existing auth
tokens revoked; subsequent access-token authentication and refresh attempts fail.
When refresh fails with a revoked or expired token, Android clears the stale device
credentials, keeps the last server URL in the pairing form, and requires a fresh one-use
pairing code.

Cloudflare Tunnel provides the public TLS transport through outbound-only connections.
The companion still authenticates every non-health API request independently.

Android denies cleartext by default through `network_security_config.xml`. Cleartext
is scoped to emulator/loopback and this PC's Tailscale tailnet host for development
and remote testing; production/public endpoints should use HTTPS.

## Retention

The companion runs a startup retention sweep after SQLite initialization. It removes
used or expired pairing codes, expired auth tokens, old revoked tokens, and run events
older than `LOCAL_AGENTS_RETENTION_RUN_EVENT_DAYS` for terminal runs. Active-run events
are preserved so phone disconnects still remain replayable. Revoked-token cleanup uses
`LOCAL_AGENTS_RETENTION_REVOKED_TOKEN_GRACE_DAYS`.

## Deployment hardening

`docker-compose.yml` keeps the runner networkless, read-only, non-root, capability-free,
and limited by pids/memory/CPU. API and runner services have healthchecks; API and the
optional Cloudflare Tunnel wait for healthy dependencies. The runner also uses
`docker/seccomp/local-agents-runner.json` to deny high-risk syscalls such as `ptrace`,
`mount`, `unshare`, `keyctl`, `bpf`, and `perf_event_open`.

This seccomp profile is compatibility-first hardening, not the final isolation boundary.
For production exposure, evaluate gVisor/AppArmor or a microVM runner, plus dependency
lock/audit and optional Cloudflare Access in front of admin/public tunnel routes.

## Notifications

Android creates a local "run notifications" channel and requests
`POST_NOTIFICATIONS` on Android 13+. When the active SSE stream receives
`run.completed` or `run.failed`, the app posts a local notification. This does not
use FCM yet; true server-initiated push while the app process is stopped requires a
Firebase project and a companion-side push token/credential flow.

## Home Screen Widgets

Android exposes six RemoteViews home-screen widgets: 1x1 status, 2x1 connection,
4x1 strip, 2x2 run summary, 4x2 control panel, and 2x3 recent-run feed. They
intentionally scale functionality with size: the smallest widget opens the app and shows
pairing/online state; larger widgets add refresh, new-session, runs navigation,
recent-run deep links, re-run-last-task, and active-run pause/resume/cancel actions.

Widgets read the existing encrypted device tokens through `SecureSettingsStore` and
call the same companion API as the app. They do not keep an SSE stream alive in the
background. Periodic and manual refreshes take a short snapshot from `/health`,
`/api/v1/sessions`, `/api/v1/runs`, and `/api/v1/models`; user-tapped run controls
call `POST /api/v1/runs/{id}/commands`. Credentials still remain scoped to the
paired Android device and provider credentials remain on the PC companion.

## Web research

When enabled, Ollama tool-capable models receive two additional tools:

- `web_search`: searches the public web and returns titles, URLs, and snippets.
- `fetch_url`: fetches readable text from a public HTTP/HTTPS URL.

The default provider is `duckduckgo`, which requires no API key. Set
`LOCAL_AGENTS_WEB_SEARCH_PROVIDER=brave` and `LOCAL_AGENTS_BRAVE_SEARCH_API_KEY` to use
Brave Search API instead. Set `LOCAL_AGENTS_WEB_SEARCH_PROVIDER=disabled` to remove web
tools from the model tool schema.

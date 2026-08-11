# Local_Agents Architecture

## Components

There are two clients: the Android controller and the browser console the companion
serves at `/app`. Both speak the same API, carry the same device-ownership model, and
see the same runs; they differ only in how a credential is stored and how the UI is
drawn. Anything added to one belongs in the other.

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
- `PATCH /api/v1/sessions/{id}`: rename a conversation.
- `DELETE /api/v1/sessions/{id}`: delete a conversation and everything under it.
  Active runs are cancelled first, then messages, memory, runs, and run events are
  removed through `ON DELETE CASCADE`.
- `GET /api/v1/sessions/{id}/context`: estimate context-window usage for the session.
- `POST /api/v1/sessions/{id}/context/compress`: summarize older session history into
  server-side memory so later runs can continue with a smaller prompt.
- `POST /api/v1/sessions/{id}/runs`: add a prompt and queue an agent run.
- `GET /api/v1/runs/{id}/events`: SSE replay followed by live events.
- `POST /api/v1/runs/{id}/commands`: pause, resume, cancel, or steer a run.
- `GET /api/v1/runs?session_id=`: optionally scope the run list to one conversation.

A conversation created with a placeholder title is renamed after its first prompt, so
session lists read as work rather than as a column of identical defaults.

Each event has a monotonically increasing sequence. Android reconnects with
`Last-Event-ID`; the server replays newer rows before tailing live events.
Event streams are capped per device by `LOCAL_AGENTS_SSE_STREAMS_PER_DEVICE` and long-lived
streams periodically revalidate the bearer token using `LOCAL_AGENTS_SSE_REAUTH_SECONDS`.
If the token expires or the device is revoked, the stream ends and Android must refresh or
pair again. Replay reads persisted SQLite rows; the live tail wakes through an in-process
run-event notifier when `AgentManager` persists new run events.

Sessions are owned by the paired device that created them. Run ownership is inherited
through the session. Session/run lists, message reads, context reads/compression, run
creation, run reads, run commands, and event streams are filtered by the authenticated
device ID. This keeps a second paired phone from reading or controlling another device's
work even though both devices belong to the same companion.

Common run events:

- `run.started|run.thinking|run.paused|run.resumed|run.completed|run.failed|run.cancelled`
- `assistant.delta|assistant.final`
- `tool.started|tool.finished|tool.failed`
- `source.found|source.fetched` for web research results shown as citations/sources.

Unexpected agent and tool exceptions are logged by the companion, but persisted
`run.failed` and `tool.failed` payloads expose generic user-facing messages rather than
raw exception text. This avoids leaking local paths, command internals, provider details,
or other host-side implementation data to Android while preserving enough status for the
operator to understand that the run/tool failed.

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
Revocation does not delete existing sessions/runs; it prevents that device from
authenticating. Existing sessions remain owned by their original `device_id`.
When refresh fails with a revoked or expired token, Android clears the stale device
credentials, keeps the last server URL in the pairing form, and requires a fresh one-use
pairing code.

Cloudflare Tunnel provides the public TLS transport through outbound-only connections.
The companion still authenticates every non-health API request independently.

### Client address trust

Auth-adjacent endpoints are rate-limited per client address. `CF-Connecting-IP`,
`X-Forwarded-For`, and `X-Real-IP` are only read when the immediate peer is inside
`LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS`; otherwise the socket peer is used. The default
is to trust nobody, which is correct for a directly exposed port: any caller can set
those headers, and honouring them unconditionally lets one client rotate the value and
mint an unlimited number of rate-limit buckets. Set the variable to the tunnel or
reverse-proxy network — for example `LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS=172.16.0.0/12`
— when the companion sits behind one, so per-client limits track real clients again.

`/health` is unauthenticated by design. It is cached for
`LOCAL_AGENTS_HEALTH_CACHE_SECONDS` and throttled on its own budget, so anonymous
polling cannot be amplified into one Ollama request per call.

Android denies cleartext by default through `network_security_config.xml`. Cleartext
is scoped to emulator/loopback and this PC's Tailscale tailnet host for development
and remote testing; production/public endpoints should use HTTPS.

## Web console

The companion serves a browser console at `/app` from `server/local_agents/web/`, with
the same feature set as Android: pairing, session list with rename and delete, chat with
live streaming, tool and source timelines, run controls (pause/resume/steer/cancel),
context usage and compression, model selection, themes, and Turkish/English strings. It
installs as a PWA through `manifest.webmanifest` and an offline app shell in `sw.js`,
and posts a browser notification when a run finishes while the tab is in the background.

Assets are enumerated into an exact-name map at import time and matched by name, so no
request string ever reaches the filesystem. Pages are served with a CSP that has no
inline-script escape hatch (`script-src 'self'`, no `unsafe-inline`), API responses
declare `default-src 'none'`, and the service worker gets its own policy — a worker runs
under the CSP of its own script response, so the load-nothing API policy would leave
`connect-src` at `'none'` and break every fetch inside it.

Set `LOCAL_AGENTS_WEB_CONSOLE_ENABLED=0` to serve the API and `/admin` only.

### Browser credentials

Android encrypts its refresh token with an Android Keystore key. A browser has no
equivalent, and `localStorage` is readable by any script that gets injected, so the
console uses a different split:

- `POST /api/v1/web/session` exchanges a pairing code and sets the refresh token in an
  `HttpOnly`, `SameSite=Strict` cookie scoped to `/api/v1/web`. It never appears in a
  response body and page script cannot read it.
- The access token is returned in the body and kept in memory only. A reload discards
  it and silently re-derives one from the cookie, so no long-lived credential is
  persisted anywhere script can reach.
- `POST /api/v1/web/refresh` rotates the refresh token; `POST /api/v1/web/logout`
  revokes it. Both require the `la_csrf` cookie echoed in an `X-CSRF-Token` header,
  which only same-origin script can do.
- Every other route stays bearer-authenticated exactly as it is for Android, so the
  cookie is never sent on an API call and cannot be used for cross-site requests.

`Secure` is derived from the scheme the browser actually used, not from `public_url`: a
companion is commonly reached over HTTPS through the tunnel *and* over plain HTTP on a
tailnet address, and pinning `Secure` on would silently break the second path.
`LOCAL_AGENTS_WEB_SESSION_COOKIE_SECURE` forces the flag either way.

## Retention

The companion runs a startup retention sweep after SQLite initialization, then repeats
it every `LOCAL_AGENTS_RETENTION_SWEEP_HOURS` for as long as the process lives — a
startup-only sweep never runs again on a companion that stays up for weeks. It removes
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

This seccomp profile is compatibility-first hardening, not the final isolation boundary. A
separate `docker-compose.gvisor.yml` override can run the runner with Docker runtime `runsc`
when gVisor is installed on the host. For production exposure, evaluate that gVisor path,
AppArmor, or a microVM runner, and consider optional Cloudflare Access in front of
admin/public tunnel routes. Python dependencies are installed from deterministic lockfiles
in CI and Docker, and CI runs `pip-audit` for the locked server/runner dependency sets.

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

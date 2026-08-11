# Local_Agents — Security & Gap Audit

**Date:** 2026-06-22
**Scope:** `server/` (FastAPI companion), `runner/` (isolated tool service), `android/`
(Kotlin/Compose controller), `docker-compose.yml`, scripts and docs.
**Method:** manual source review of the full codebase plus an automated test suite that
pins the security controls described under *Verified controls*.

**Progress note (2026-06-28):** H1, H2, M1, and M2 are now addressed in code. The
companion refuses insecure admin tokens unless explicitly overridden for isolated local
development, rate-limits auth-adjacent routes per client/path, disables public OpenAPI
docs, and emits browser security headers.

**Progress note (2026-07-02):** M3, M4, and M8 are now addressed in code. Admins can
list and revoke paired devices through HTTP; revocation invalidates both access and
refresh tokens. Runner file search delegates untrusted patterns to ripgrep's linear-time
regex engine with a timeout, and missing executables now return a controlled `400`.

**Progress note (2026-07-02, second pass):** Android deep links now require explicit
host confirmation before pairing can proceed. The companion now performs startup
retention cleanup for expired/used auth artifacts and old terminal run events, caps SSE
streams per device, and revalidates access tokens during long-lived streams. CI, Compose
healthchecks, and a runner seccomp deny profile were added. Verified App Links,
stronger sandbox runtimes such as gVisor/AppArmor, dependency locks/audit, and
fine-grained device authorization remain open follow-ups.

**Progress note (2026-07-03):** L1 and L5 are now addressed. The unused LangGraph
packages were removed from the server dependency lists. Unexpected agent and tool
exceptions are logged server-side but return generic run/tool failure messages to Android
so local paths and internal exception text do not leak into persisted events.

**Progress note (2026-07-03, second pass):** M5 is now addressed for sessions, runs,
messages, context, commands, and event streams. New sessions are owned by the paired
device that creates them, and all controller routes filter by that owner. Existing legacy
sessions are assigned to the sole active device during migration when that is unambiguous.

**Progress note (2026-07-03, third pass):** M9 is fully addressed. SSE live tails now wake
through an in-process run-event notifier instead of a fixed DB polling loop.

**Progress note (2026-07-03, fourth pass):** L2 is now addressed. Server, server-dev, and
runner Python dependency locks are generated with `uv pip compile`; CI and Docker images
install from the lockfiles, and CI audits those locked dependency sets with `pip-audit`.

**Progress note (2026-08-11, web console pass):** A browser console now ships with the
companion, and this pass reviewed both it and the pre-existing server surface. Four new
findings were opened and fixed — H5 (spoofable client-IP headers bypassing every
auth-adjacent rate limit), M10 (unbounded rate-limiter memory), M11 (unauthenticated
`/health` amplifying into upstream Ollama requests), and L8 (retention swept only at
startup). The console's own controls — HttpOnly refresh cookie, in-memory access token,
CSRF double-submit, strict CSP with no inline script, exact-name static asset matching —
are described under *Web console* below and pinned by tests.

**Progress note (2026-07-03, fifth pass):** H4 now has an optional gVisor deployment path.
`docker-compose.gvisor.yml` can run the runner with Docker runtime `runsc` when the host has
gVisor installed. AppArmor or microVM isolation remain future production evaluations.

This project's threat model is unusually sharp: a phone on the public internet drives an
LLM agent that can **read, write, and execute commands** on the operator's PC. The design
is sound — a hardened runner, hashed one-use pairing codes, rotating tokens — but several
gaps would matter the moment the service is exposed through the Cloudflare tunnel.

---

## Severity summary

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| H1 | High | Server / config | Resolved: insecure default admin token is refused without explicit dev override |
| H2 | High | Server / API | Resolved: auth-adjacent endpoints are rate-limited by client/path |
| H3 | High | Android | Partially resolved: deep-link host confirmation added; verified App Links still pending |
| H4 | High | Runner | Partially hardened: seccomp plus optional gVisor override; AppArmor/microVM pending |
| M1 | Medium | Server | Resolved: public OpenAPI docs are disabled |
| M2 | Medium | Server | Resolved: browser/admin security headers are emitted |
| M3 | Medium | Runner | Resolved: `search_files` uses ripgrep with timeout instead of Python `re` |
| M4 | Medium | Server | Resolved: admin device listing and revocation API |
| M5 | Medium | Server | Resolved: sessions/runs are scoped to the owning paired device |
| M6 | Medium | Server / DB | Resolved: startup retention cleanup purges expired/used auth artifacts and old terminal events |
| M7 | Medium | Android | Resolved: cleartext scoped by `network_security_config`; pinning optional |
| M8 | Medium | Runner | Resolved: missing executable returns controlled `400` |
| M9 | Medium | Server | Resolved: per-device stream cap, token revalidation, and in-process event notification |
| L1 | Low | Build | Resolved: unused LangGraph dependencies removed |
| L2 | Low | Build | Resolved: Python dependency lockfiles plus CI `pip-audit` |
| L3 | Low | CI | Resolved: GitHub Actions runs Python lint/tests and Android unit tests |
| L4 | Low | Infra | Resolved: Compose healthchecks and `service_healthy` dependencies added |
| L5 | Low | Server | Resolved: unexpected agent/tool exceptions use generic user-facing errors |
| L6 | Low | Server | Resolved: long-lived SSE streams periodically revalidate the access token |
| L7 | Low | Build | Resolved: Docker build contexts are scoped and server/runner `.dockerignore` files exist |
| H5 | High | Server | Resolved: forwarded client-IP headers are only trusted from a declared proxy |
| M10 | Medium | Server | Resolved: rate-limiter buckets are evicted and capped |
| M11 | Medium | Server | Resolved: `/health` is cached and separately throttled |
| M12 | Medium | Web | Resolved by design: browser refresh token is HttpOnly; access token is memory-only |
| L8 | Low | Server | Resolved: retention sweeps periodically, not only at startup |
| L9 | Low | Build | Resolved: `android/gradlew` is committed executable, so the CI Android job runs |
| L10 | Low | CI | Resolved: CI installs ripgrep, so the ReDoS-mitigation tests actually run |

---

## High severity

### H1 — Weak default admin token with no startup guard
`server/local_agents/config.py:21`

```python
admin_token: str = Field(default="development-admin-token-change-me")
```

The admin token mints pairing codes, which mint device tokens — it is the root of the
whole trust chain. The constant-time comparison in `require_admin` is correct, but nothing
prevents the server from booting and serving `/admin` with the *default* token. If the
operator starts the tunnel before editing `.env`, anyone who knows this (public) default can
pair a device and gain full agent access to the PC.

**Fix:** refuse to start — or refuse to serve `/admin` and `/api/v1/admin/*` — when
`admin_token` equals the default or is shorter than 32 characters, unless an explicit
`LOCAL_AGENTS_ALLOW_INSECURE_ADMIN=1` dev override is set. Validate in `get_settings()` or a
startup hook.

### H2 — No rate limiting or lockout on auth-adjacent endpoints
`server/local_agents/app.py` (`/api/v1/admin/pairing`, `/api/v1/pair/exchange`, `/api/v1/auth/refresh`)

These endpoints accept unauthenticated or single-secret POSTs and have no throttling. The
pairing *code* is a 48-byte token (infeasible to brute force), but the **admin token's**
strength is operator-chosen, and unthrottled `pair/exchange` and `auth/refresh` allow online
guessing and resource abuse over the tunnel.

**Fix:** add a small token-bucket / `slowapi` limiter keyed by client IP on these three
routes (e.g. 5–10/min), log failures, and back off on repeated `401`s. Pair with H1.

### H3 — Android deep link trusts an attacker-controlled server URL
`android/app/src/main/java/com/localagents/app/MainActivity.kt`,
`LocalAgentsViewModel.kt:71`, `AndroidManifest.xml` (`localagents://pair`, `BROWSABLE`)

```kotlin
fun applyDeepLink(uri: Uri?) {
    if (uri?.scheme != "localagents" || uri.host != "pair") return
    uri.getQueryParameter("url")?.let { pairUrl = it }   // attacker-controlled
    uri.getQueryParameter("code")?.let { pairCode = it }
}
```

Because `localagents://` is a **custom, unverified scheme** registered with a `BROWSABLE`
intent filter, any web page or installed app can launch it and silently pre-fill the pairing
**server URL** and **code**. A user who scanned a QR and taps *Pair* will not notice that
`url` points at an attacker's host — pairing the phone to a malicious server that then
receives every prompt and run output. The same scheme can be registered by a malicious app
to intercept a legitimate pairing code (one-use, 5-min TTL mitigates but does not remove
this). Pairing still requires a user tap, which is why this is High rather than Critical.

**Fix:** (1) show the host and require explicit confirmation before pairing; (2) migrate to
verified **Android App Links** (`https` scheme + `assetlinks.json` on the tunnel domain +
`android:autoVerify="true"`), which eliminate scheme hijacking; (3) allowlist/validate the
host against the operator's known tunnel domain. See `docs/RESEARCH.md` §Android.

**Status:** the app now shows a host confirmation panel for QR/deep-link pairing and
keeps the Pair action disabled until the operator confirms the companion URL. Remaining:
verified Android App Links and an operator/domain allowlist for production tunnel domains.

### H4 — Arbitrary command execution; the container is the only boundary
`runner/runner_app/main.py:112` (`run_command`), `docker-compose.yml` (`runner` service)

By design the runner executes any `argv` the model emits. The compose hardening is genuinely
good defense-in-depth — `network_mode: none`, `read_only: true`, `cap_drop: ALL`,
`no-new-privileges`, non-root `10002:10000`, `pids_limit`, `mem_limit`, `cpus`, workspace
bind-mount only. The residual risk: a prompt-injected model has **code execution inside the
workspace + tmpfs**, the image ships `python3` (arbitrary scripting), and `runc` shares the
host kernel — only the Docker default seccomp profile stands between the container and a
kernel-level escape.

**Fix:** treat this as the primary trust boundary and document it. Add a hardened seccomp
profile (block `ptrace`, `unshare`, `mount`, `keyctl`, `bpf`, `perf_event_open`) and/or an
AppArmor profile; consider `gVisor` (runsc) or a microVM (Firecracker/Kata) for stronger
isolation; optionally allowlist executables. See `docs/RESEARCH.md` §Sandboxing.

**Status:** Compose now attaches `docker/seccomp/local-agents-runner.json`, which denies
high-risk syscalls such as `ptrace`, `mount`, `unshare`, `keyctl`, `bpf`, and
`perf_event_open`. `docker-compose.gvisor.yml` provides an opt-in `runtime: runsc` runner
override for hosts with gVisor installed. AppArmor or a microVM remain stronger production
boundary evaluations.

### H5 — Spoofable client-IP headers bypassed every auth-adjacent rate limit
`server/local_agents/rate_limit.py`

```python
def _client_key(request: Request) -> str:
    cloudflare_ip = request.headers.get("cf-connecting-ip")
    if cloudflare_ip:
        return cloudflare_ip.strip()   # attacker-controlled
```

`CF-Connecting-IP` was trusted unconditionally. It is a plain request header: any caller
can set it, and a caller that varies it per request gets a **fresh rate-limit bucket
every time**. That defeats H2 entirely — the throttle on `/api/v1/admin/pairing`,
`/api/v1/pair/exchange`, and `/api/v1/auth/refresh` becomes decorative, restoring
unlimited online guessing against the operator-chosen admin token. The header is only
meaningful when the request genuinely passed through Cloudflare; a directly exposed port
or a tailnet address receives it straight from the client.

**Fix:** forwarded headers (`CF-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP`) are read
only when the immediate peer falls inside `LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS`, which
defaults to empty — trust nobody. Otherwise the socket peer keys the bucket. Operators
behind a tunnel set the variable to that proxy's network. Pinned by
`test_forwarded_client_headers_are_ignored_without_a_trusted_proxy` and
`server/tests/test_rate_limit.py`.

---

## Medium severity

### M1 — OpenAPI docs exposed without authentication
`server/local_agents/app.py:60`

```python
app = FastAPI(title="Local_Agents", version="0.1.0", lifespan=lifespan)
```

No `docs_url=None`, so `/docs`, `/redoc`, and `/openapi.json` publicly enumerate every route
and schema over the tunnel. (The runner correctly sets `docs_url=None, redoc_url=None`.)

**Fix:** `FastAPI(..., docs_url=None, redoc_url=None, openapi_url=None)`, or gate them behind
the admin dependency.

### M2 — No HTTP security headers
The admin page can be framed (clickjacking), and there is no `X-Content-Type-Options`,
`Referrer-Policy`, `Content-Security-Policy`, or `Strict-Transport-Security`.

**Fix:** add a middleware that sets `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, an HSTS header (tunnel is HTTPS),
and a restrictive CSP on `/admin` (the page is fully inline).

### M3 — ReDoS in `search_files` — resolved
`runner/runner_app/main.py:64`

The user-supplied regex is compiled and run line-by-line against every workspace file with
no time budget. Python's `re` is a backtracking engine; a pattern like `(a+)+$` against a
long line causes catastrophic backtracking and pegs the runner CPU (DoS of the single active
run). Input is partially bounded (query ≤ 500 chars, files ≤ 1 MB) but match time is not.

**Fix:** resolved by delegating searches to the already-installed `ripgrep` binary with
JSON output and a wall-clock timeout. Invalid regexes return `400`; no matches return an
empty result.

### M4 — No device/token revocation or listing API — resolved
`server/local_agents/database.py` (schema has `devices.revoked_at`, `auth_tokens.revoked_at`)

`docs/ARCHITECTURE.md` states tokens are "rotated and revocable," and the auth/refresh
queries **do** enforce revocation (pinned by `test_revoked_device_cannot_authenticate_or_refresh`).
But no HTTP endpoint lists paired devices or revokes one. A lost or compromised phone can
only be deauthorized by hand-editing SQLite.

**Fix:** resolved with admin-authenticated `GET /api/v1/admin/devices` and
`POST /api/v1/admin/devices/{id}/revoke`. Revocation sets `devices.revoked_at` and marks
that device's existing auth tokens revoked.

### M5 — Coarse authorization: every device sees everything — resolved
`server/local_agents/app.py` now uses the authenticated `device_id` for session/run
listing, message reads, context reads/compression, run creation, run reads, commands, and
event streams. `sessions.owner_device_id` records the paired device that created the
conversation; `runs` inherit ownership through their session. A second paired device gets
empty list responses and `404` for another device's session/run IDs.

Migration note: existing unowned sessions are assigned to the sole active device during
startup if there is exactly one active device. If multiple devices already exist, legacy
unowned sessions stay unowned rather than being exposed to every device.

### M6 — Unbounded data growth / no retention
Expired `auth_tokens`, used/expired `pairing_codes`, and all `run_events` accumulate forever
— an availability and privacy gap (chat history and tool I/O persist indefinitely).

**Fix:** periodic cleanup (delete expired tokens and used/expired pairing codes; optionally
cap or age out `run_events`). A lightweight `asyncio` housekeeping task or a startup sweep.

**Status:** resolved with a startup sweep in the companion. It deletes expired auth tokens,
old revoked tokens, used/expired pairing codes, and run events older than the retention
window for terminal runs while preserving active-run replay.

### M7 — Android cleartext traffic globally enabled — resolved
`android/app/src/main/AndroidManifest.xml` no longer sets global
`android:usesCleartextTraffic="true"`.

`android/app/src/main/res/xml/network_security_config.xml` now denies cleartext by
default and permits it only for emulator/loopback plus the configured Tailscale test
host. This keeps remote public transport TLS-first while preserving local development
and Tailscale test ergonomics.

**Remaining hardening:** certificate pinning for a production tunnel domain is still an
optional future step.

### M8 — `run_command` leaks `FileNotFoundError` as a 500 — resolved
`runner/runner_app/main.py:128` — `create_subprocess_exec` runs *before* the `try/except`
around `communicate()`, so a non-existent binary raises an uncaught `FileNotFoundError` and
returns an opaque `500` instead of a structured tool error.

**Fix:** resolved by wrapping process spawn and returning `HTTPException(400)` with an
`executable not found` message.

### M10 — Rate-limiter memory grew once per client address, forever — resolved
`server/local_agents/rate_limit.py`

`_hits` was keyed by `(path, client)` and never pruned; an empty deque stayed in the map
after its window elapsed. Combined with H5 that was directly attacker-driven (a new key
per spoofed header value); even without it, a large client pool grows the map without
bound.

**Fix:** resolved. Buckets whose window has fully elapsed are dropped on each check, and
the map is capped at `max_tracked_keys` with least-recently-used eviction.

### M11 — Unauthenticated `/health` amplified into upstream requests — resolved
`server/local_agents/app.py`

`/health` is unauthenticated by design so the pairing screens can preview host state. It
called Ollama on every request with a 2.5 s timeout and no cache, so an anonymous caller
turned one cheap HTTP request into one upstream request against the operator's model
server, and could hold connections open.

**Fix:** resolved. The payload is cached for `LOCAL_AGENTS_HEALTH_CACHE_SECONDS` (default
5 s) and the route has its own rate-limit budget, separate from the auth bucket so
health polling cannot exhaust pairing attempts. Pinned by `server/tests/test_health.py`.

### M12 — Browser credential storage — resolved by design
`server/local_agents/app.py`, `server/local_agents/web/api.js`

A browser has no Android Keystore. Putting a 30-day refresh token in `localStorage`
would make any injected script a permanent account takeover.

**Fix:** the refresh token is delivered only as an `HttpOnly`, `SameSite=Strict` cookie
scoped to `/api/v1/web` and never appears in a response body; the access token is
returned in the body and held in memory only, so a reload discards it. The two
cookie-authenticated routes additionally require the CSRF value echoed in a header. Every
other route remains bearer-only, so the cookie is never attached to an API call. Pinned
by `server/tests/test_web_console.py` and the browser suite in `e2e/web-console`.

### M9 — SSE has no per-device cap and polls every 0.3 s — resolved
`server/local_agents/app.py:198` — each `/runs/{id}/events` connection holds an open
streaming response and re-queries the DB every 300 ms. Many reconnecting clients multiply
open connections and DB reads.

**Fix:** cap concurrent streams per device; longer term, replace polling with an in-process
notify/condition so events push instead of being polled.

**Status:** resolved. Per-device stream caps and periodic token revalidation are
implemented. Live tails now use an in-process run-event notifier, so new agent/command
events wake the stream without a fixed 300 ms DB polling loop.

---

## Low severity / hardening

- **L1** — Resolved: `langgraph` and `langgraph-checkpoint-sqlite` were removed from
  `pyproject.toml` and `requirements.txt`; the agent loop remains hand-rolled.
- **L2** — Resolved: `server/requirements.lock`, `server/requirements-dev.lock`, and
  `runner/requirements.lock` pin deterministic Python dependency sets generated by
  `uv pip compile`. CI and Docker install from those locks, and CI audits the locked
  server/runner dependency sets with `pip-audit`.
- **L3** — Resolved: `.github/workflows/ci.yml` runs server/runner `ruff`, Python tests, and
  Android `testDebugUnitTest`.
- **L4** — Resolved: API and runner healthchecks are wired, and API/cloudflared wait for
  `service_healthy`.
- **L5** — Resolved for unexpected agent/tool failures: raw exception text is logged
  server-side, while persisted `run.failed` / `tool.failed` payloads expose generic
  messages and an exception class only. Intentional validation errors still return
  specific messages.
- **L6** — Resolved: SSE streams revalidate the access token periodically and end if the
  token expires or the device is revoked.
- **L8** — Resolved: retention swept only once, at startup. A companion that stays up
  for weeks — the normal case for a desktop service — never swept again, so expired
  tokens, used pairing codes, and old run events accumulated indefinitely. A background
  task now repeats the sweep every `LOCAL_AGENTS_RETENTION_SWEEP_HOURS`.
- **L9** — Resolved: `android/gradlew` was committed with mode `100644`. The CI Android
  job invokes `./gradlew` directly, so it failed with "Permission denied" and the Android
  unit tests were not actually running. The file is now committed executable and
  `test_gradle_wrapper_is_executable` fails if that regresses.
- **L10** — Resolved: CI did not install ripgrep. `search_files` shells out to it, which
  is the whole of the M3 ReDoS mitigation, so the three tests pinning that control failed
  with a `503` on every CI run and the control went unverified. The runner *image* has
  ripgrep; the CI job runs the tests on the host, which did not. Both this and L9 mean two
  of the three CI jobs were reporting on work they never performed.
- **L7** — Resolved for the active Docker contexts: Compose builds `./server` and `./runner`,
  and both contexts include `.dockerignore`.

---

## Web console

The browser console at `/app` is a second client for the same API, with the same device
ownership model. Its security-relevant properties:

- **Credential split** — see M12. Refresh token: HttpOnly cookie, `/api/v1/web` scope.
  Access token: memory only. CSRF: double-submit cookie plus `SameSite=Strict`.
- **Cookie `Secure`** — derived from the scheme the browser actually used, not from
  `public_url`, so the flag is correct on both the HTTPS tunnel and a plain-HTTP tailnet
  address instead of silently breaking the second. Forceable either way with
  `LOCAL_AGENTS_WEB_SESSION_COOKIE_SECURE`.
- **CSP** — pages are served with `script-src 'self'` and no `unsafe-inline`; the bundle
  contains no inline `<script>` and no `on*=` handlers, and a test fails if one appears.
  API responses declare `default-src 'none'`. The previous global policy allowed
  `script-src 'unsafe-inline'`, which made the CSP largely ornamental.
- **Service worker CSP** — `/sw.js` is served with `connect-src 'self'` because a worker
  runs under the CSP of its own script response. Under the load-nothing API policy every
  `fetch` inside the worker is blocked and navigation in the installed app fails
  outright; this was found by the browser suite, not by review.
- **XSS** — no server value is ever written as markup. The DOM helper throws if given an
  `html` key, agent output goes through `textContent`, and agent-supplied links carry
  `rel="noopener noreferrer nofollow"`. A browser test asserts that an `<img onerror=>`
  payload in a prompt does not execute.
- **Static assets** — matched against an exact-name map built at import time, so a
  request string never reaches the filesystem and traversal is structurally impossible.
- **Offline cache** — the service worker caches only the console's own files; `/api`
  traffic is always network-only, so no conversation content lands in a cache.
- **Kill switch** — `LOCAL_AGENTS_WEB_CONSOLE_ENABLED=0` removes the console and its web
  auth routes while leaving the API and `/admin` intact.

Residual: the console is only as safe as the transport. Behind a plain-HTTP tunnel the
session cookie is not `Secure` and is exposed to a network attacker. Terminate TLS
(Cloudflare Tunnel or Tailscale HTTPS) before any non-local exposure.

## Verified controls (regression-tested)

These behaviours are correct today and are now pinned by `server/tests` and `runner/tests`
so regressions surface immediately:

- Pairing codes are **one-use** and expire; the API rejects unauthenticated access.
  (`test_auth_lifecycle`, `test_api`)
- Admin pairing requires a valid admin token; malformed `Authorization` headers are rejected.
- Insecure/default admin tokens refuse startup unless the local-only development override is set.
- Auth-adjacent endpoints are rate-limited by client and path.
- Public OpenAPI docs are disabled; admin/browser responses include security headers.
- Access-token expiry is enforced; refresh tokens **rotate** (replay of an old refresh fails).
- **Device revocation is enforced** at the DB layer for both access and refresh.
- Run control plane returns correct `404`/`400`s; `pause→resume→cancel` transitions are correct;
  `steer` requires an instruction and is consumed exactly once.
- The agent loop completes without tools, invokes tools then completes, fails closed on an
  unconfigured provider, and stops at the 8-round tool limit. (`test_agent_loop`)
- Runner **path containment** holds against `../`, absolute, and **symlink** escapes; search
  rejects invalid/oversized regex; `run_command` validates `argv` and enforces a timeout; the
  tool name is allowlisted at the schema layer. (`test_runner_security`)
- SSE **replays** persisted events for a finished run and honours `Last-Event-ID` on reconnect.
  (`test_sse_events`)
- SSE live tails wake from an in-process run-event notifier, and `AgentManager` notifies
  when it persists run events. (`test_sse_events`, `test_agent_loop`)
- GitHub Actions runs `pip-audit` against the Python server and runner dependency sets.
  (`test_infra_config`, `test_dependencies`)
- CI and Docker install Python packages from deterministic lockfiles.
  (`test_dependencies`)
- Forwarded client-IP headers are ignored unless the peer is a declared trusted proxy;
  rate-limit buckets are evicted and capped. (`test_rate_limit`, `test_auth_lifecycle`)
- `/health` is cached and throttled on its own budget. (`test_health`)
- The browser refresh token never appears in a response body, its cookie is HttpOnly and
  path-scoped, refresh rotates and rejects replay, and logout revokes.
  (`test_web_console`)
- Cookie-authenticated web routes reject a missing or mismatched CSRF header.
  (`test_web_console`)
- Served pages carry a CSP with no inline-script escape hatch, the bundle contains no
  inline handlers, and the static route cannot escape the bundle. (`test_web_console`)
- Session delete cascades to messages, runs, and events, cancels active runs first, and
  is scoped to the owning device. (`test_sessions_api`)
- A conversation is auto-titled from its first prompt only, and never overwrites an
  operator-chosen title. (`test_sessions_api`)
- The full console — pairing, streaming, run lifecycle, XSS handling, cookie
  inaccessibility — runs in a real browser in desktop and mobile viewports.
  (`e2e/web-console`)

---

## Suggested remediation order

1. **H3 remaining** — verified Android App Links + production tunnel domain allowlist.
2. **H4 remaining** — evaluate gVisor/AppArmor or a microVM for the runner trust boundary.
3. **Set `LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS`** when deploying behind Cloudflare or any
   reverse proxy. Leaving it empty is safe but makes every request through the proxy share
   one rate-limit bucket, which throttles legitimate clients as a group.
4. **Consider Cloudflare Access** in front of `/admin` and `/app` for public exposure. Both
   are single-secret or single-code entry points to full agent control of the PC.
5. **Release hardening remaining** — verified App Links, stronger runner isolation, and
   production perimeter decisions.

Items 1–2 of the previous list (H1/H2 gating, M1/M2 docs and headers) are complete.

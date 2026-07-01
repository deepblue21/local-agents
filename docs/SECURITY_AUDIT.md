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

This project's threat model is unusually sharp: a phone on the public internet drives an
LLM agent that can **read, write, and execute commands** on the operator's PC. The design
is sound — a hardened runner, hashed one-use pairing codes, rotating tokens — but several
gaps would matter the moment the service is exposed through the Cloudflare tunnel.

---

## Severity summary

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| H1 | High | Server / config | Weak default admin token, no startup guard |
| H2 | High | Server / API | No rate limiting or lockout on admin / pairing / auth endpoints |
| H3 | High | Android | Deep link pre-fills attacker-controlled server URL + code without confirmation |
| H4 | High | Runner | Arbitrary command execution — container hardening is the only boundary |
| M1 | Medium | Server | OpenAPI docs (`/docs`, `/redoc`, `/openapi.json`) exposed without auth |
| M2 | Medium | Server | No HTTP security headers; admin page is framable (clickjacking) |
| M3 | Medium | Runner | ReDoS: untrusted regex in `search_files` has no timeout / linear-time engine |
| M4 | Medium | Server | No device/token revocation or listing API (lost phone can't be deauthorized) |
| M5 | Medium | Server | Coarse authorization — every paired device sees all sessions and runs |
| M6 | Medium | Server / DB | Unbounded growth: expired tokens, used codes, and events are never purged |
| M7 | Medium | Android | Resolved: cleartext scoped by `network_security_config`; pinning optional |
| M8 | Medium | Runner | `run_command` leaks an uncaught `FileNotFoundError` as a 500 |
| M9 | Medium | Server | SSE stream has no per-device cap and polls the DB every 0.3 s |
| L1 | Low | Build | `langgraph` / `langgraph-checkpoint-sqlite` declared but never imported |
| L2 | Low | Build | No dependency lockfile / `pip-audit` |
| L3 | Low | CI | No CI runs `ruff` + `pytest` |
| L4 | Low | Infra | `depends_on` uses `service_started`, not `service_healthy` |
| L5 | Low | Server | Raw exception text surfaced into events / responses |
| L6 | Low | Server | Access-token TTL not re-checked mid-SSE-stream |
| L7 | Low | Build | No `.dockerignore` |

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

### M3 — ReDoS in `search_files`
`runner/runner_app/main.py:64`

The user-supplied regex is compiled and run line-by-line against every workspace file with
no time budget. Python's `re` is a backtracking engine; a pattern like `(a+)+$` against a
long line causes catastrophic backtracking and pegs the runner CPU (DoS of the single active
run). Input is partially bounded (query ≤ 500 chars, files ≤ 1 MB) but match time is not.

**Fix:** run searches with `google-re2` (linear time, no backtracking) for untrusted
patterns, or enforce a wall-clock budget, or delegate to the already-installed `ripgrep`
binary. See `docs/RESEARCH.md` §ReDoS.

### M4 — No device/token revocation or listing API
`server/local_agents/database.py` (schema has `devices.revoked_at`, `auth_tokens.revoked_at`)

`docs/ARCHITECTURE.md` states tokens are "rotated and revocable," and the auth/refresh
queries **do** enforce revocation (pinned by `test_revoked_device_cannot_authenticate_or_refresh`).
But no HTTP endpoint lists paired devices or revokes one. A lost or compromised phone can
only be deauthorized by hand-editing SQLite.

**Fix:** add admin-authenticated `GET /api/v1/admin/devices` and
`POST /api/v1/admin/devices/{id}/revoke` (set `devices.revoked_at`; optionally revoke that
device's tokens).

### M5 — Coarse authorization: every device sees everything
`server/local_agents/app.py` — routes depend on `bearer_device` purely as a gate and discard
the returned `device_id`. Any paired device can read all sessions/messages/runs and can
pause/cancel/steer any run.

**Fix:** if multi-device is intended, scope sessions/runs by owning `device_id`. If this is a
strictly single-user tool, state that assumption explicitly and keep device count to one
(reinforced by M4 revocation).

### M6 — Unbounded data growth / no retention
Expired `auth_tokens`, used/expired `pairing_codes`, and all `run_events` accumulate forever
— an availability and privacy gap (chat history and tool I/O persist indefinitely).

**Fix:** periodic cleanup (delete expired tokens and used/expired pairing codes; optionally
cap or age out `run_events`). A lightweight `asyncio` housekeeping task or a startup sweep.

### M7 — Android cleartext traffic globally enabled — resolved
`android/app/src/main/AndroidManifest.xml` no longer sets global
`android:usesCleartextTraffic="true"`.

`android/app/src/main/res/xml/network_security_config.xml` now denies cleartext by
default and permits it only for emulator/loopback plus the configured Tailscale test
host. This keeps remote public transport TLS-first while preserving local development
and Tailscale test ergonomics.

**Remaining hardening:** certificate pinning for a production tunnel domain is still an
optional future step.

### M8 — `run_command` leaks `FileNotFoundError` as a 500
`runner/runner_app/main.py:128` — `create_subprocess_exec` runs *before* the `try/except`
around `communicate()`, so a non-existent binary raises an uncaught `FileNotFoundError` and
returns an opaque `500` instead of a structured tool error.

**Fix:** wrap the spawn in `try/except FileNotFoundError` and return
`{"ok": false, "error": "executable not found"}` (or `HTTPException(400)`).

### M9 — SSE has no per-device cap and polls every 0.3 s
`server/local_agents/app.py:198` — each `/runs/{id}/events` connection holds an open
streaming response and re-queries the DB every 300 ms. Many reconnecting clients multiply
open connections and DB reads.

**Fix:** cap concurrent streams per device; longer term, replace polling with an in-process
notify/condition so events push instead of being polled.

---

## Low severity / hardening

- **L1** — `langgraph` and `langgraph-checkpoint-sqlite` are declared in `pyproject.toml` /
  `requirements.txt` but never imported (the agent loop is hand-rolled). Remove them or adopt
  them; today they only enlarge the install and attack surface.
- **L2** — Dependencies are range-pinned with no lockfile and no `pip-audit`. Add a lock
  (uv / pip-tools) and a vulnerability scan.
- **L3** — No CI. `ruff` and `pytest` exist but nothing runs them on push. Add a GitHub
  Actions workflow across Python 3.11–3.13.
- **L4** — `docker-compose.yml` `depends_on` uses `condition: service_started`; the `/health`
  endpoints aren't wired as container healthchecks. Add `healthcheck` blocks + `service_healthy`.
- **L5** — Raw `str(exc)` is surfaced into `run.failed` events and the `run_command` error
  response (`agent.py:133`, `app.py:195`), a minor internal-detail leak to the phone. Log
  detail server-side; return a generic message.
- **L6** — A long-lived SSE stream is not re-validated after the 15-minute access token
  expires. Optionally re-check the token periodically inside the stream.
- **L7** — No `.dockerignore`; the build context may pull in `.git` / `.venv`.

---

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

---

## Suggested remediation order

1. **H1 + H2** — gate the default admin token and add rate limiting (smallest change, biggest
   exposure reduction before any tunnel goes live).
2. **M1 + M2** — disable public docs, add security headers.
3. **H3 + M7** — Android pairing confirmation + App Links + cleartext policy.
4. **M4** — device revocation API (operational must-have for a lost phone).
5. **M3 + M8** — runner ReDoS mitigation and clean command errors.
6. **H4 hardening** — seccomp/AppArmor profile and documented runner threat model.
7. **M5, M6, M9, L1–L7** — authorization scoping, retention, and build/CI hygiene.

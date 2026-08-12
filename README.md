# Local_Agents

Local_Agents controls an LLM agent running on your own PC. There are two clients with
the same feature set: a native Android app and a browser console the companion serves
itself. Either one can start tasks, follow model output and tool activity live, pause or
cancel runs, and reconnect to persisted history after losing network access.

## Repository layout

- `android/`: Kotlin and Jetpack Compose application.
- `server/`: FastAPI companion API, agent runtime, persistence, and tests.
- `server/local_agents/web/`: the browser console served at `/app` (no build step).
- `e2e/`: Playwright suites for the web console and the Android smoke harness.
- `runner/`: Isolated workspace tool service used by the agent.
- `infra/`: Cloudflare Tunnel and container configuration.
- `scripts/`: Windows development helpers.

## Relationship to Nova Agent

Local_Agents is designed to work alongside the separate Nova Agent project. Think of
Local_Agents as the mobile control plane: the Android app pairs with this companion API,
starts or controls runs, watches persisted events, and exposes widgets. Nova Agent remains
the PC-side model/runtime surface when its OpenAI-compatible gateway is enabled.

The connection is intentionally one-way and credential-safe. Android never receives Nova
provider credentials or gateway secrets. The Local_Agents companion reads
`LOCAL_AGENTS_NOVA_URL` and `LOCAL_AGENTS_NOVA_TOKEN` from its local `.env`, talks to the
Nova gateway as an additional `nova` model provider, and streams the result back to the
phone through the same replayable run/event API used for Ollama.

Use `scripts\connect-nova.ps1` to wire the two projects together. The helper reads the
Nova gateway token from the sibling Nova checkout (default:
`C:\Users\salih\Nova_Agent_AI\gateway\.env`) and writes only the Local_Agents-side
connection values into this repo's `.env`. With `-StartGateway`, it can also start the
Nova gateway and point it at the WSL Ollama service. Plain Nova chat does not get host
filesystem access; file tools still run only in the isolated Local_Agents runner mounted
to `LOCAL_AGENTS_WORKSPACE`.

## Quick start

1. Copy `.env.example` to `.env` and set the admin token and public URL.
2. Start Ollama and pull a tool-capable model such as `qwen3.6`.
3. Run the Docker companion stack with `docker compose up -d api`.
4. Expose the companion to the tailnet when testing from a phone:

   ```powershell
   tailscale serve --bg --http=8787 http://127.0.0.1:8791
   ```

5. Open `http://127.0.0.1:8791/admin` or `http://salih.tail033a5f.ts.net:8787/admin`
   to create a pairing code. Pairing codes use four-character groups and are valid for
   `LOCAL_AGENTS_PAIRING_CODE_MINUTES` minutes; the development default is 240 minutes.
6. Open `http://127.0.0.1:8791/app` and paste the code to use the browser console, or
   build the Android app with `android\gradlew.bat assembleDebug`.

## Web console

The companion serves a browser console at `/app` with the same feature set as the
Android app: pairing, sessions with rename and delete, live streaming with tool and
source timelines, run controls, context compression, model selection, eight themes, and
Turkish/English strings. It installs as a PWA and needs no build step or Node runtime —
it is static files served by the same FastAPI process.

Browser credentials use a different split from Android, which has the Keystore: the
refresh token is delivered only as an `HttpOnly`, `SameSite=Strict` cookie scoped to
`/api/v1/web` and never reaches page script, while the short-lived access token is kept
in memory and re-derived on reload. Details in `docs/WEB_CONSOLE.md`.

Set `LOCAL_AGENTS_WEB_CONSOLE_ENABLED=0` to serve the API and `/admin` only.

For a host-only development run, `scripts\dev-server.ps1` starts the FastAPI companion on
`127.0.0.1:8787`. Keep the Docker stack for normal phone testing because it preserves the
runner isolation and production-like networking boundaries.

## Ollama model visibility

On Windows it is possible to have two Ollama listeners:

- `127.0.0.1:11434`, often owned by Docker Desktop and visible to containers through
  `host.docker.internal`.
- `[::1]:11434`, often owned by the host/WSL relay and visible from `localhost`.

If the Android app only shows two models while `http://localhost:11434/api/tags` shows the
full model set, the Docker companion is reaching the smaller IPv4 listener. Use this fix:

```powershell
# Requires Administrator PowerShell.
netsh interface portproxy add v4tov6 listenaddress=0.0.0.0 listenport=11435 connectaddress=::1 connectport=11434
```

Then set:

```env
LOCAL_AGENTS_OLLAMA_URL=http://host.docker.internal:11435
```

Restart the companion with `docker compose up -d api` and verify:

```powershell
Invoke-RestMethod http://salih.tail033a5f.ts.net:8787/health
```

`providers.ollama.model_count` should match the full installed model list. A non-admin
fallback proxy exists at `scripts\ollama-ipv6-proxy.py`, started by
`scripts\start-ollama-ipv6-proxy.ps1`, but the `netsh` bridge is the cleaner Windows setup.

## Home screen widgets

The Android app ships a family of resizable home screen widgets that surface companion
state and recent agent activity without opening the app:

- **1x1 status**, **2x1 connection**, **4x1 strip** — connection/run state, default model,
  session count, and a quick refresh.
- **2x2 summary** and **4x2 control** — latest run with a live elapsed-time + tool-count
  meta line and an indeterminate progress bar while a run is active. The control panel adds
  pause/resume/stop for the active run and a one-tap **re-run last task** when idle (starts a
  run through the companion without opening the app).
- **2x3 feed** — a scrollable list of recent runs (status dot, title, prompt, elapsed);
  tapping a row opens the Runs screen.

While a run is active the widgets auto-refresh about every 45s (battery-friendly,
permission-free `AlarmManager`); otherwise the system update period applies. The
2x2/4x2/2x3 widgets show a configuration screen when added, letting you choose what a tap
opens (Sessions / Runs / New task). On Android 12+ the widgets adopt Material You dynamic
colors.

Typography uses bundled **Inter** (UI) and **JetBrains Mono** (tool stream) fonts under
`android/app/src/main/res/font/`; details in `docs/FONTS.md`.

## Testing

The companion and runner ship a pytest suite covering the authentication lifecycle
(pairing, token expiry/rotation, device revocation, admin-token guard, rate limiting),
the agent run loop
(tool calls, round limit, provider errors, command transitions), run control-plane
validation, SSE replay with `Last-Event-ID`, and runner path containment / command
execution. Requires Python 3.11+ (`datetime.UTC`, `enum.StrEnum`).

```powershell
scripts\test.ps1            # ruff + pytest from the server venv
# or, directly:
cd server; python -m pytest # runs server/tests and ../runner/tests
```

The web console has a Playwright suite that drives the real browser against a stub
Ollama, so no GPU or model is needed. It covers pairing, streaming, run lifecycle,
session rename/delete, theme persistence, cookie inaccessibility, CSP, and XSS
handling, in both desktop and mobile viewports:

```bash
cd e2e/web-console
npm ci && npx playwright install --with-deps chromium
npm test
```

CI runs the Python suite, the browser suite, and the Android unit tests.

## Security

The service is designed to sit behind a Cloudflare Tunnel, so every non-health request is
authenticated independently and tools run in a no-network, read-only runner. Pairing codes
are one-use and hashed at rest, access tokens are short-lived, and refresh tokens rotate.
If the Android app sees an expired refresh token, it clears device credentials, keeps the
last server URL prefilled, and returns to pairing so a new code can be entered.

Before exposing the service publicly, set a strong `LOCAL_AGENTS_ADMIN_TOKEN`
(`scripts\configure.ps1` generates one). The companion refuses insecure admin tokens by
default, disables public OpenAPI docs, rate-limits auth-adjacent endpoints, and sends
browser security headers.

If the companion sits behind Cloudflare Tunnel or any reverse proxy, also set
`LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS` to that proxy's network. Client-IP headers such as
`CF-Connecting-IP` are ignored unless the peer is in that list — otherwise any caller
could rotate the header and give itself an unlimited number of rate-limit buckets. A full review — findings, severities, and fixes — is in
`docs/SECURITY_AUDIT.md`, with stack best-practice notes in `docs/RESEARCH.md`.

See `docs/ARCHITECTURE.md` for the protocol and security boundaries, `docs/SECURITY_AUDIT.md`
for the security audit, and `docs/RESEARCH.md` for research and recommendations.

## Release

The Android release build is minified (R8) and signed. Without an `android/keystore.properties`
it falls back to the debug key for quick sideload APKs; add a real upload keystore for store
distribution. Full signing steps, store-listing draft, permissions/data-safety notes, and a
pre-release checklist are in `docs/RELEASE.md`.

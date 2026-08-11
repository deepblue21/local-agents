# Setup

## 1. Local configuration

Copy `.env.example` to `.env`. Set these values before exposing the service:

- `LOCAL_AGENTS_ADMIN_TOKEN`: at least 32 random bytes.
- `LOCAL_AGENTS_PUBLIC_URL`: the HTTPS hostname assigned to the tunnel.
- `LOCAL_AGENTS_WORKSPACE`: the only host directory the runner may access.
- `CLOUDFLARE_TUNNEL_TOKEN`: token from the remotely managed tunnel.

Run `scripts\configure.ps1` to generate a fresh admin token while preserving the
remaining template values.

The companion refuses to start with the built-in development admin token or any admin
token shorter than 32 characters. For isolated local development only, set
`LOCAL_AGENTS_ALLOW_INSECURE_ADMIN=1`; never use that override with a public tunnel.
Authentication-adjacent endpoints are rate-limited with
`LOCAL_AGENTS_AUTH_RATE_LIMIT_PER_MINUTE`.

## 2. Model runtime

For a host Ollama installation, expose it only to the local machine and Docker Desktop,
then set `LOCAL_AGENTS_OLLAMA_URL=http://host.docker.internal:11434`.

Alternatively start the optional container profile:

```powershell
docker compose --profile models up -d ollama
docker compose exec ollama ollama pull qwen3.6
```

When the compose profile is used, set `LOCAL_AGENTS_OLLAMA_URL=http://ollama:11434`.

### Nova Agent gateway

Nova's OpenAI-compatible gateway can be used as an additional model provider. The
helper below copies only Nova's gateway bearer token into the companion `.env`; provider
credentials remain on the PC and are never sent to Android:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\connect-nova.ps1 -StartGateway
```

Use `-CompanionMode Host` when running the companion directly on Windows instead of
Docker. The helper discovers the Ubuntu WSL address, keeps that distro alive, and starts
the Windows Nova gateway with its `OLLAMA_URL` pointed at the WSL Ollama service.

Plain Nova chat needs no filesystem access. File tools remain in the isolated
Local_Agents runner and can only see `LOCAL_AGENTS_WORKSPACE`. Set that mount to a
specific repository only when the agent must read or change that repository; never mount
the whole user profile.

## 3. Companion and runner

```powershell
docker compose up -d api runner
```

Open `http://127.0.0.1:8787/admin`, enter the admin token, and create a pairing QR.
The phone camera opens the `localagents://pair` deep link in the Android application.

The same companion serves a browser console at `http://127.0.0.1:8787/app`. Paste a
pairing code there to control the agent from a desktop or a phone browser with the same
feature set as the app. See `docs/WEB_CONSOLE.md`; set
`LOCAL_AGENTS_WEB_CONSOLE_ENABLED=0` to serve the API and `/admin` only.

### Optional gVisor runner

If the host has gVisor installed as Docker runtime `runsc`, start the runner with the
override file:

```powershell
docker compose -f docker-compose.yml -f docker-compose.gvisor.yml up -d api runner
```

This keeps the existing no-network, read-only, seccomp, capability, pid, memory, and CPU
limits, then runs the workspace tool container behind gVisor's user-space syscall layer.
If Docker reports that runtime `runsc` is unknown, install/configure gVisor first or use the
default compose file.

## 4. Cloudflare Tunnel

Set `LOCAL_AGENTS_TRUSTED_PROXY_NETWORKS` to the Docker network the tunnel connects
from (for example `172.16.0.0/12`) before going public. Client-IP headers are ignored
unless the peer is inside that range, so without it every tunnelled request shares one
rate-limit bucket; with a wrong value set too broadly, a client could spoof its address.

Create a remotely managed tunnel and route the chosen public hostname to
`http://api:8787`. Then start the public profile:

```powershell
docker compose --profile public up -d cloudflared
```

No router port forwarding is required. Keep API authentication enabled even though
Cloudflare terminates TLS.

## 5. Android

Open `android/` in Android Studio or build from PowerShell:

```powershell
cd android
.\gradlew.bat test assembleDebug
```

The debug APK is written as `Local_Agents-debug.apk`.

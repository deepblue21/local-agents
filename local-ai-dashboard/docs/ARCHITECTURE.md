# Local AI Dashboard — Architecture

A FastAPI master + small worker-agent on every node + SQLite + Qdrant.
The same Python codebase runs in two modes:

- `uvicorn app.main:app` — full **master** (UI, all APIs, aggregator, websockets).
- `python -m app.worker.agent` — minimal **worker** (telemetry endpoint only).

## Process layout (real multi-node)

```
                  ┌────────────────────────────────────────────────────┐
                  │  workstation.local  (master, runs FastAPI on :7878)│
                  │  ─────────────────────────────────────────────     │
                  │  uvicorn app.main:app                              │
                  │  ├─ serves frontend/                               │
                  │  ├─ /api/* + /ws/*                                 │
                  │  ├─ background poller → fan-out to worker agents   │
                  │  ├─ talks to Ollama on :11434                      │
                  │  └─ talks to Qdrant on :6333                       │
                  └──────┬─────────────────────┬──────────────────────┘
                         │ HTTP (every 1.3s)   │ HTTP
                         ▼                     ▼
                ┌──────────────┐       ┌──────────────┐
                │ studio.local │       │ rack-01.dc   │
                │ :7879/agent  │       │ :7879/agent  │
                │ (worker)     │       │ (worker)     │
                └──────────────┘       └──────────────┘
```

The master itself is also exposed as a worker on `:7879` for symmetry —
its own local telemetry comes from a direct in-process call, not an HTTP loopback.

## API surface (matches what the React `useCluster()` already expects)

| Method | Path                              | Purpose                                                          |
|--------|-----------------------------------|------------------------------------------------------------------|
| GET    | `/api/cluster/state`              | Full snapshot: nodes, totals, model, installedModels, deployment |
| WS     | `/ws/cluster`                     | Live telemetry every 1.3 s                                       |
| WS     | `/ws/logs`                        | Merged log stream from Ollama + agents                           |
| GET    | `/api/models`                     | Installed models (from Ollama `/api/tags`)                       |
| GET    | `/api/models/registry?q=`         | Search Hugging Face / Ollama registry                            |
| POST   | `/api/models/pull`                | Pull a model — streams progress via WS                           |
| DELETE | `/api/models/{id}`                | Remove a model                                                   |
| GET    | `/api/deployment`                 | Current deployment config                                        |
| POST   | `/api/deployment`                 | Apply a new deployment (model + strategy)                        |
| GET    | `/api/prompts`                    | List prompt templates                                            |
| POST   | `/api/prompts`                    | Create                                                           |
| PATCH  | `/api/prompts/{id}`               | Edit                                                             |
| DELETE | `/api/prompts/{id}`               | Delete                                                           |
| POST   | `/api/chat/stream`                | Streaming chat — Anthropic                                       |
| GET    | `/api/chat/sessions`              | Saved sessions                                                   |
| POST   | `/api/kb/upload`                  | Multipart file upload → chunk → embed → Qdrant                   |
| GET    | `/api/kb/docs`                    | List documents in the KB                                         |
| DELETE | `/api/kb/docs/{id}`               | Remove a doc                                                     |
| POST   | `/api/kb/search`                  | Vector search → top-k chunks                                     |
| POST   | `/api/kb/obsidian`                | Connect / ingest an Obsidian vault folder                        |
| GET    | `/api/energy/series?range=`       | Stacked area data (24h / 7d / 30d / 90d)                         |
| GET    | `/api/energy/totals`              | KPI strip values                                                 |
| GET    | `/api/settings`                   | Inference params + system config + advanced                      |
| PATCH  | `/api/settings`                   | Update settings                                                  |

## Persistence

- **SQLite** (`data/dashboard.db`) — chat sessions, prompt templates, settings, KB doc metadata, energy history, deployment history.
- **Qdrant** (`localhost:6333`) — KB embeddings (collection name: `kb`).

## Telemetry sources

| Metric                | Source on the master (this process)                              |
|-----------------------|------------------------------------------------------------------|
| CPU %, temp, cores    | `psutil` + `psutil.sensors_temperatures()`                       |
| RAM used / total      | `psutil.virtual_memory()`                                        |
| GPU VRAM / util / temp| `pynvml` if NVIDIA present; `system_profiler` / `ioreg` on macOS |
| GPU power (watts)     | `pynvml.nvmlDeviceGetPowerUsage`; macOS `powermetrics` (opt-in)  |
| CPU power (watts)     | RAPL on Linux (`/sys/class/powercap/intel-rapl/`); else estimate |
| Throughput (tok/s)    | Reported by Ollama process via `/api/ps` + recent gen stats      |

Worker nodes expose the same shape via `/agent/telemetry`.

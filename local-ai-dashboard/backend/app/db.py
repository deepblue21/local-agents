"""SQLite persistence — chats, prompts, settings, KB metadata, energy."""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterable

from .config import get_settings

_LOCAL = threading.local()


def _connect() -> sqlite3.Connection:
    cfg = get_settings()
    conn = sqlite3.connect(cfg.db_file, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def get_conn() -> sqlite3.Connection:
    conn = getattr(_LOCAL, "conn", None)
    if conn is None:
        conn = _connect()
        _LOCAL.conn = conn
    return conn


@contextmanager
def tx():
    conn = get_conn()
    conn.execute("BEGIN;")
    try:
        yield conn
        conn.execute("COMMIT;")
    except Exception:
        conn.execute("ROLLBACK;")
        raise


SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompts (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tag  TEXT NOT NULL,
    icon TEXT NOT NULL,
    sys  TEXT NOT NULL,
    created_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    template   TEXT,
    created_at REAL NOT NULL DEFAULT (strftime('%s','now')),
    updated_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    metrics_json TEXT,
    created_at  REAL NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

CREATE TABLE IF NOT EXISTS kb_docs (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    source     TEXT NOT NULL,
    size       INTEGER NOT NULL,
    chunks     INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL DEFAULT 'indexing',
    progress   REAL NOT NULL DEFAULT 0,
    storage_path TEXT,
    created_at REAL NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS energy_samples (
    ts         REAL NOT NULL,
    node_id    TEXT NOT NULL,
    watts      REAL NOT NULL,
    PRIMARY KEY (ts, node_id)
);
CREATE INDEX IF NOT EXISTS idx_energy_ts ON energy_samples(ts);

CREATE TABLE IF NOT EXISTS deployments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    active_model TEXT NOT NULL,
    strategy     TEXT NOT NULL,
    pinned_node  TEXT,
    per_node_json TEXT,
    created_at   REAL NOT NULL DEFAULT (strftime('%s','now'))
);
"""


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    _seed(conn)


def _seed(conn: sqlite3.Connection) -> None:
    # Seed default settings if empty.
    row = conn.execute("SELECT COUNT(*) AS n FROM settings").fetchone()
    if row["n"] == 0:
        defaults = {
            "params.temperature": 0.7,
            "params.topP": 0.9,
            "params.context": 16384,
            "params.maxTokens": 2048,
            "params.repPenalty": 1.10,
            "params.seed": "",
            "system.rayHead": "workstation.local:6379",
            "system.ollama": "http://localhost:11434",
            "system.openclawPort": "7878",
            "system.defaultModel": "deepseek-v3:67b",
            "system.env": "OLLAMA_HOST=0.0.0.0:11434\nOLLAMA_KEEP_ALIVE=30m",
            "advanced.gpuLayers": 20,
            "advanced.threads": 14,
            "advanced.batch": 512,
            "advanced.flash": True,
            "advanced.kv8": True,
            "advanced.mlock": True,
            "advanced.telemetry": False,
            "advanced.shard": "hybrid",
            "theme": "deepsea",
        }
        for k, v in defaults.items():
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?)",
                (k, json.dumps(v)),
            )

    # Seed default prompt templates.
    row = conn.execute("SELECT COUNT(*) AS n FROM prompts").fetchone()
    if row["n"] == 0:
        for tpl in DEFAULT_PROMPTS:
            conn.execute(
                "INSERT INTO prompts (id, name, tag, icon, sys) VALUES (?, ?, ?, ?, ?)",
                (tpl["id"], tpl["name"], tpl["tag"], tpl["icon"], tpl["sys"]),
            )

    # Seed initial deployment if empty.
    row = conn.execute("SELECT COUNT(*) AS n FROM deployments").fetchone()
    if row["n"] == 0:
        conn.execute(
            "INSERT INTO deployments (active_model, strategy, pinned_node, per_node_json) VALUES (?, ?, ?, ?)",
            ("deepseek-v3:67b", "shard", None, json.dumps({})),
        )


DEFAULT_PROMPTS = [
    {
        "id": "default",
        "name": "Default Assistant",
        "icon": "Sparkles",
        "tag": "general",
        "sys": "You are a helpful assistant. Be concise and accurate.",
    },
    {
        "id": "kotlin",
        "name": "Kotlin Expert",
        "icon": "Code2",
        "tag": "engineering",
        "sys": (
            "You are a senior Kotlin engineer. Reply with idiomatic Kotlin, "
            "prefer extension functions and coroutines, and explain tradeoffs briefly."
        ),
    },
    {
        "id": "qa",
        "name": "QA Tester",
        "icon": "BugPlay",
        "tag": "engineering",
        "sys": (
            "You are a QA engineer. For every feature, list happy paths, edge cases, "
            "and adversarial inputs as a checklist."
        ),
    },
    {
        "id": "sql",
        "name": "SQL Architect",
        "icon": "Database",
        "tag": "data",
        "sys": (
            "You are a SQL expert. Reply with portable ANSI SQL. "
            "Always cite the index strategy and explain query plans."
        ),
    },
    {
        "id": "duck",
        "name": "Rubber Duck",
        "icon": "Bird",
        "tag": "thinking",
        "sys": (
            "You are a patient debugging partner. Ask clarifying questions and "
            "never give code unless asked."
        ),
    },
    {
        "id": "editor",
        "name": "Markdown Editor",
        "icon": "PencilLine",
        "tag": "writing",
        "sys": (
            "You are a meticulous editor. Improve clarity and tone. "
            "Show a diff with reasoning beside it."
        ),
    },
]


# ── tiny helpers ──────────────────────────────────────────────────────────


def get_setting(key: str, default: Any = None) -> Any:
    row = get_conn().execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return row["value"]


def set_setting(key: str, value: Any) -> None:
    get_conn().execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, json.dumps(value)),
    )


def all_settings() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for row in get_conn().execute("SELECT key, value FROM settings"):
        try:
            out[row["key"]] = json.loads(row["value"])
        except Exception:
            out[row["key"]] = row["value"]
    return out


def latest_deployment() -> dict[str, Any]:
    row = get_conn().execute(
        "SELECT * FROM deployments ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return {
            "activeModelId": None,
            "strategy": "shard",
            "pinnedNodeId": None,
            "perNode": {},
        }
    return {
        "activeModelId": row["active_model"],
        "strategy": row["strategy"],
        "pinnedNodeId": row["pinned_node"],
        "perNode": json.loads(row["per_node_json"] or "{}"),
        "createdAt": row["created_at"],
    }

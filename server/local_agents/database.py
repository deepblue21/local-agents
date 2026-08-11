from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Iterator

from .models import RunStatus
from .pairing import normalize_pairing_code


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


class Database:
    def __init__(self, path: Path):
        self.path = path
        self._write_lock = threading.Lock()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self) -> None:
        schema = """
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL, revoked_at TEXT
        );
        CREATE TABLE IF NOT EXISTS pairing_codes (
          code_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL, used_at TEXT
        );
        CREATE TABLE IF NOT EXISTS auth_tokens (
          token_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL, kind TEXT NOT NULL,
          expires_at TEXT NOT NULL, revoked_at TEXT,
          FOREIGN KEY(device_id) REFERENCES devices(id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, owner_device_id TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
          content TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS session_contexts (
          session_id TEXT PRIMARY KEY, summary TEXT NOT NULL,
          summarized_message_count INTEGER NOT NULL,
          source_token_estimate INTEGER NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL,
          model TEXT NOT NULL, provider TEXT NOT NULL, prompt TEXT NOT NULL,
          steering TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS run_events (
          seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, type TEXT NOT NULL,
          payload TEXT NOT NULL, created_at TEXT NOT NULL,
          FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS run_events_run_seq ON run_events(run_id, seq);
        CREATE INDEX IF NOT EXISTS runs_status_created ON runs(status, created_at);
        CREATE INDEX IF NOT EXISTS sessions_owner_updated ON sessions(owner_device_id, updated_at);
        """
        with self.connect() as conn:
            conn.executescript(schema)
            self._migrate_session_owner(conn)
            conn.execute(
                "UPDATE runs SET status=?, updated_at=? WHERE status=?",
                (RunStatus.PAUSED, now_iso(), RunStatus.RUNNING),
            )

    def _migrate_session_owner(self, conn: sqlite3.Connection) -> None:
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()}
        if "owner_device_id" not in columns:
            conn.execute("ALTER TABLE sessions ADD COLUMN owner_device_id TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS sessions_owner_updated ON sessions(owner_device_id, updated_at)"
        )
        active_devices = conn.execute(
            "SELECT id FROM devices WHERE revoked_at IS NULL ORDER BY created_at"
        ).fetchall()
        if len(active_devices) == 1:
            conn.execute(
                "UPDATE sessions SET owner_device_id=? WHERE owner_device_id IS NULL",
                (active_devices[0]["id"],),
            )

    @staticmethod
    def digest(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    @classmethod
    def pairing_digest(cls, value: str) -> str:
        return cls.digest(normalize_pairing_code(value))

    def create_pairing(self, raw_code: str, minutes: int) -> datetime:
        expires = datetime.now(UTC) + timedelta(minutes=minutes)
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO pairing_codes(code_hash, expires_at) VALUES (?, ?)",
                (self.pairing_digest(raw_code), expires.isoformat()),
            )
        return expires

    def consume_pairing(self, raw_code: str, device_name: str) -> str | None:
        now = datetime.now(UTC)
        digest = self.pairing_digest(raw_code)
        with self._write_lock, self.connect() as conn:
            row = conn.execute(
                "SELECT expires_at, used_at FROM pairing_codes WHERE code_hash=?", (digest,)
            ).fetchone()
            if not row or row["used_at"] or parse_dt(row["expires_at"]) <= now:
                return None
            device_id = str(uuid.uuid4())
            timestamp = now.isoformat()
            conn.execute("UPDATE pairing_codes SET used_at=? WHERE code_hash=?", (timestamp, digest))
            conn.execute(
                "INSERT INTO devices(id, name, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
                (device_id, device_name, timestamp, timestamp),
            )
            return device_id

    def store_token(self, raw_token: str, device_id: str, kind: str, expires_at: datetime) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO auth_tokens(token_hash, device_id, kind, expires_at) VALUES (?, ?, ?, ?)",
                (self.digest(raw_token), device_id, kind, expires_at.isoformat()),
            )

    def consume_refresh(self, raw_token: str) -> str | None:
        now = datetime.now(UTC)
        digest = self.digest(raw_token)
        with self._write_lock, self.connect() as conn:
            row = conn.execute(
                """SELECT t.device_id, t.expires_at, t.revoked_at, d.revoked_at AS device_revoked
                   FROM auth_tokens t JOIN devices d ON d.id=t.device_id
                   WHERE t.token_hash=? AND t.kind='refresh'""",
                (digest,),
            ).fetchone()
            if (
                not row
                or row["revoked_at"]
                or row["device_revoked"]
                or parse_dt(row["expires_at"]) <= now
            ):
                return None
            conn.execute("UPDATE auth_tokens SET revoked_at=? WHERE token_hash=?", (now.isoformat(), digest))
            return row["device_id"]

    def authenticate(self, raw_token: str) -> str | None:
        now = datetime.now(UTC)
        with self.connect() as conn:
            row = conn.execute(
                """SELECT t.device_id, t.expires_at, t.revoked_at, d.revoked_at AS device_revoked
                   FROM auth_tokens t JOIN devices d ON d.id=t.device_id
                   WHERE t.token_hash=? AND t.kind='access'""",
                (self.digest(raw_token),),
            ).fetchone()
            if (
                not row
                or row["revoked_at"]
                or row["device_revoked"]
                or parse_dt(row["expires_at"]) <= now
            ):
                return None
            conn.execute("UPDATE devices SET last_seen_at=? WHERE id=?", (now.isoformat(), row["device_id"]))
            return row["device_id"]

    def get_device(self, device_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
            return dict(row) if row else None

    def list_devices(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM devices ORDER BY last_seen_at DESC, created_at DESC"
            ).fetchall()
            return [dict(row) for row in rows]

    def revoke_device(self, device_id: str) -> dict | None:
        now = now_iso()
        with self._write_lock, self.connect() as conn:
            row = conn.execute("SELECT revoked_at FROM devices WHERE id=?", (device_id,)).fetchone()
            if not row:
                return None
            revoked_at = row["revoked_at"] or now
            conn.execute(
                "UPDATE devices SET revoked_at=? WHERE id=? AND revoked_at IS NULL",
                (revoked_at, device_id),
            )
            conn.execute(
                "UPDATE auth_tokens SET revoked_at=? WHERE device_id=? AND revoked_at IS NULL",
                (revoked_at, device_id),
            )
        return self.get_device(device_id)

    def cleanup_retention(
        self,
        *,
        now: datetime | None = None,
        revoked_token_grace_days: int = 7,
        run_event_retention_days: int = 30,
    ) -> dict[str, int]:
        current = now or datetime.now(UTC)
        current_iso = current.isoformat()
        revoked_token_cutoff = (
            current - timedelta(days=max(0, revoked_token_grace_days))
        ).isoformat()
        run_event_cutoff = (
            current - timedelta(days=max(1, run_event_retention_days))
        ).isoformat()
        terminal_statuses = (
            RunStatus.COMPLETED,
            RunStatus.FAILED,
            RunStatus.CANCELLED,
        )
        with self._write_lock, self.connect() as conn:
            pairing_cursor = conn.execute(
                "DELETE FROM pairing_codes WHERE expires_at <= ? OR used_at IS NOT NULL",
                (current_iso,),
            )
            token_cursor = conn.execute(
                """DELETE FROM auth_tokens
                   WHERE expires_at <= ?
                      OR (revoked_at IS NOT NULL AND revoked_at <= ?)""",
                (current_iso, revoked_token_cutoff),
            )
            event_cursor = conn.execute(
                f"""DELETE FROM run_events
                    WHERE created_at <= ?
                      AND run_id IN (
                        SELECT id FROM runs
                        WHERE status IN ({','.join('?' for _ in terminal_statuses)})
                      )""",
                (run_event_cutoff, *terminal_statuses),
            )
        return {
            "pairing_codes": max(pairing_cursor.rowcount, 0),
            "auth_tokens": max(token_cursor.rowcount, 0),
            "run_events": max(event_cursor.rowcount, 0),
        }

    def create_session(self, title: str, owner_device_id: str | None = None) -> dict:
        session_id = str(uuid.uuid4())
        timestamp = now_iso()
        with self.connect() as conn:
            conn.execute(
                """INSERT INTO sessions(id, title, created_at, updated_at, owner_device_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, title, timestamp, timestamp, owner_device_id),
            )
        return self.get_session(session_id)

    def get_session(self, session_id: str, owner_device_id: str | None = None) -> dict | None:
        owner_clause = " AND s.owner_device_id=?" if owner_device_id is not None else ""
        params = (session_id, owner_device_id) if owner_device_id is not None else (session_id,)
        with self.connect() as conn:
            row = conn.execute(
                f"""SELECT s.*, COALESCE(t.tool_count, 0) AS tool_count
                   FROM sessions s
                   LEFT JOIN (
                     SELECT r.session_id, COUNT(*) AS tool_count
                     FROM runs r
                     JOIN run_events e ON e.run_id = r.id
                     WHERE e.type = 'tool.started'
                     GROUP BY r.session_id
                   ) t ON t.session_id = s.id
                   WHERE s.id=?{owner_clause}""",
                params,
            ).fetchone()
            return dict(row) if row else None

    def list_sessions(self, owner_device_id: str | None = None) -> list[dict]:
        owner_clause = " WHERE s.owner_device_id=?" if owner_device_id is not None else ""
        params = (owner_device_id,) if owner_device_id is not None else ()
        with self.connect() as conn:
            rows = conn.execute(
                f"""SELECT s.*, COALESCE(t.tool_count, 0) AS tool_count
                   FROM sessions s
                   LEFT JOIN (
                     SELECT r.session_id, COUNT(*) AS tool_count
                     FROM runs r
                     JOIN run_events e ON e.run_id = r.id
                     WHERE e.type = 'tool.started'
                     GROUP BY r.session_id
                   ) t ON t.session_id = s.id
                   {owner_clause}
                   ORDER BY s.updated_at DESC"""
                ,
                params,
            ).fetchall()
            return [dict(row) for row in rows]

    def set_session_title(
        self,
        session_id: str,
        title: str,
        owner_device_id: str | None = None,
    ) -> dict | None:
        if not self.get_session(session_id, owner_device_id):
            return None
        with self.connect() as conn:
            conn.execute(
                "UPDATE sessions SET title=?, updated_at=? WHERE id=?",
                (title, now_iso(), session_id),
            )
        return self.get_session(session_id, owner_device_id)

    def delete_session(self, session_id: str, owner_device_id: str | None = None) -> bool:
        """Delete a conversation and every row that hangs off it.

        Messages, memory summaries, runs, and run events are removed by the schema's
        ``ON DELETE CASCADE`` foreign keys, which is why ``PRAGMA foreign_keys=ON``
        matters on every connection.
        """
        if not self.get_session(session_id, owner_device_id):
            return False
        with self._write_lock, self.connect() as conn:
            cursor = conn.execute("DELETE FROM sessions WHERE id=?", (session_id,))
            return cursor.rowcount > 0

    def session_run_ids(self, session_id: str, statuses: tuple[str, ...] | None = None) -> list[str]:
        query = "SELECT id FROM runs WHERE session_id=?"
        params: tuple = (session_id,)
        if statuses:
            placeholders = ",".join("?" for _ in statuses)
            query += f" AND status IN ({placeholders})"
            params += tuple(statuses)
        with self.connect() as conn:
            return [row["id"] for row in conn.execute(query, params).fetchall()]

    def revoke_token(self, raw_token: str, kind: str = "refresh") -> bool:
        with self._write_lock, self.connect() as conn:
            cursor = conn.execute(
                """UPDATE auth_tokens SET revoked_at=?
                   WHERE token_hash=? AND kind=? AND revoked_at IS NULL""",
                (now_iso(), self.digest(raw_token), kind),
            )
            return cursor.rowcount > 0

    def revoke_device_tokens(self, device_id: str) -> int:
        with self._write_lock, self.connect() as conn:
            cursor = conn.execute(
                "UPDATE auth_tokens SET revoked_at=? WHERE device_id=? AND revoked_at IS NULL",
                (now_iso(), device_id),
            )
            return max(cursor.rowcount, 0)

    def add_message(self, session_id: str, role: str, content: str) -> dict:
        message_id = str(uuid.uuid4())
        timestamp = now_iso()
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO messages(id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
                (message_id, session_id, role, content, timestamp),
            )
            conn.execute("UPDATE sessions SET updated_at=? WHERE id=?", (timestamp, session_id))
        return {
            "id": message_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "created_at": timestamp,
        }

    def list_messages(self, session_id: str) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM messages WHERE session_id=? ORDER BY created_at", (session_id,)
            ).fetchall()
            return [dict(row) for row in rows]

    def get_session_context(self, session_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM session_contexts WHERE session_id=?", (session_id,)
            ).fetchone()
            return dict(row) if row else None

    def upsert_session_context(
        self,
        session_id: str,
        summary: str,
        summarized_message_count: int,
        source_token_estimate: int,
    ) -> dict:
        timestamp = now_iso()
        with self.connect() as conn:
            conn.execute(
                """INSERT INTO session_contexts(
                     session_id, summary, summarized_message_count,
                     source_token_estimate, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(session_id) DO UPDATE SET
                     summary=excluded.summary,
                     summarized_message_count=excluded.summarized_message_count,
                     source_token_estimate=excluded.source_token_estimate,
                     updated_at=excluded.updated_at""",
                (
                    session_id,
                    summary,
                    summarized_message_count,
                    source_token_estimate,
                    timestamp,
                    timestamp,
                ),
            )
        return self.get_session_context(session_id) or {}

    def create_run(self, session_id: str, prompt: str, model: str, provider: str) -> dict:
        run_id = str(uuid.uuid4())
        timestamp = now_iso()
        with self.connect() as conn:
            conn.execute(
                """INSERT INTO runs(id, session_id, status, model, provider, prompt, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (run_id, session_id, RunStatus.QUEUED, model, provider, prompt, timestamp, timestamp),
            )
        self.add_event(run_id, "run.queued", {"model": model, "provider": provider})
        return self.get_run(run_id)

    def get_run(self, run_id: str, owner_device_id: str | None = None) -> dict | None:
        with self.connect() as conn:
            if owner_device_id is None:
                row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
            else:
                row = conn.execute(
                    """SELECT r.* FROM runs r
                       JOIN sessions s ON s.id = r.session_id
                       WHERE r.id=? AND s.owner_device_id=?""",
                    (run_id, owner_device_id),
                ).fetchone()
            return dict(row) if row else None

    def list_runs(
        self,
        limit: int = 100,
        owner_device_id: str | None = None,
        session_id: str | None = None,
    ) -> list[dict]:
        """List runs, newest first.

        The session filter is applied in SQL rather than by the caller: filtering
        after ``LIMIT`` would silently drop a quiet conversation's runs as soon as
        newer runs elsewhere fill the page.
        """
        bounded_limit = max(1, min(limit, 200))
        clauses = []
        params: list = []
        if owner_device_id is not None:
            clauses.append("s.owner_device_id=?")
            params.append(owner_device_id)
        if session_id is not None:
            clauses.append("r.session_id=?")
            params.append(session_id)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(bounded_limit)
        with self.connect() as conn:
            rows = conn.execute(
                f"""SELECT r.* FROM runs r
                    JOIN sessions s ON s.id = r.session_id
                    {where}
                    ORDER BY r.created_at DESC LIMIT ?""",
                tuple(params),
            ).fetchall()
            return [dict(row) for row in rows]

    def next_queued_run(self) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM runs WHERE status=? ORDER BY created_at LIMIT 1", (RunStatus.QUEUED,)
            ).fetchone()
            return dict(row) if row else None

    def set_run_status(self, run_id: str, status: RunStatus, error: str | None = None) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE runs SET status=?, error=?, updated_at=? WHERE id=?",
                (status, error, now_iso(), run_id),
            )

    def set_steering(self, run_id: str, instruction: str | None) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE runs SET steering=?, updated_at=? WHERE id=?",
                (instruction, now_iso(), run_id),
            )

    def pop_steering(self, run_id: str) -> str | None:
        with self._write_lock, self.connect() as conn:
            row = conn.execute("SELECT steering FROM runs WHERE id=?", (run_id,)).fetchone()
            value = row["steering"] if row else None
            if value:
                conn.execute("UPDATE runs SET steering=NULL WHERE id=?", (run_id,))
            return value

    def add_event(self, run_id: str, event_type: str, payload: dict) -> int:
        with self._write_lock, self.connect() as conn:
            cursor = conn.execute(
                "INSERT INTO run_events(run_id, type, payload, created_at) VALUES (?, ?, ?, ?)",
                (run_id, event_type, json.dumps(payload, ensure_ascii=False), now_iso()),
            )
            return int(cursor.lastrowid)

    def list_events(self, run_id: str, after_seq: int = 0) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM run_events WHERE run_id=? AND seq>? ORDER BY seq",
                (run_id, after_seq),
            ).fetchall()
            return [
                {**dict(row), "payload": json.loads(row["payload"])}
                for row in rows
            ]

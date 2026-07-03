from __future__ import annotations

from datetime import UTC, datetime, timedelta

from local_agents.database import Database
from local_agents.models import RunStatus


def test_events_are_ordered_and_replayable(tmp_path):
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    session = db.create_session("Test")
    run = db.create_run(session["id"], "task", "qwen3", "ollama")
    first = db.add_event(run["id"], "assistant.delta", {"content": "a"})
    second = db.add_event(run["id"], "assistant.delta", {"content": "b"})

    replay = db.list_events(run["id"], first)
    assert [event["seq"] for event in replay] == [second]
    assert replay[0]["payload"] == {"content": "b"}


def test_sessions_include_persisted_tool_count(tmp_path):
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    session = db.create_session("Tools")
    run = db.create_run(session["id"], "task", "qwen3.6", "ollama")
    db.add_event(run["id"], "tool.started", {"name": "web_search"})
    db.add_event(run["id"], "tool.finished", {"name": "web_search", "result": {}})
    db.add_event(run["id"], "tool.started", {"name": "fetch_url"})

    assert db.get_session(session["id"])["tool_count"] == 2
    assert db.list_sessions()[0]["tool_count"] == 2


def test_cleanup_retention_purges_expired_auth_pairing_and_old_events(tmp_path):
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    now = datetime.now(UTC)
    old = now - timedelta(days=45)
    recent = now - timedelta(days=2)
    future = now + timedelta(days=1)

    with db.connect() as conn:
        conn.execute(
            "INSERT INTO pairing_codes(code_hash, expires_at, used_at) VALUES (?, ?, ?)",
            ("expired-pair", old.isoformat(), None),
        )
        conn.execute(
            "INSERT INTO pairing_codes(code_hash, expires_at, used_at) VALUES (?, ?, ?)",
            ("used-pair", future.isoformat(), old.isoformat()),
        )
        conn.execute(
            "INSERT INTO pairing_codes(code_hash, expires_at, used_at) VALUES (?, ?, ?)",
            ("active-pair", future.isoformat(), None),
        )
        conn.execute(
            "INSERT INTO devices(id, name, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
            ("device-1", "Phone", old.isoformat(), recent.isoformat()),
        )
        conn.execute(
            """INSERT INTO auth_tokens(token_hash, device_id, kind, expires_at, revoked_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("expired-token", "device-1", "access", old.isoformat(), None),
        )
        conn.execute(
            """INSERT INTO auth_tokens(token_hash, device_id, kind, expires_at, revoked_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("old-revoked-token", "device-1", "refresh", future.isoformat(), old.isoformat()),
        )
        conn.execute(
            """INSERT INTO auth_tokens(token_hash, device_id, kind, expires_at, revoked_at)
               VALUES (?, ?, ?, ?, ?)""",
            ("current-token", "device-1", "access", future.isoformat(), None),
        )

    session = db.create_session("Retention")
    terminal_run = db.create_run(session["id"], "done", "qwen3", "ollama")
    recent_run = db.create_run(session["id"], "recent", "qwen3", "ollama")
    active_run = db.create_run(session["id"], "active", "qwen3", "ollama")
    old_terminal_event = db.add_event(terminal_run["id"], "assistant.delta", {"content": "old"})
    recent_terminal_event = db.add_event(recent_run["id"], "assistant.delta", {"content": "recent"})
    old_active_event = db.add_event(active_run["id"], "assistant.delta", {"content": "active"})
    db.set_run_status(terminal_run["id"], RunStatus.COMPLETED)
    db.set_run_status(recent_run["id"], RunStatus.COMPLETED)
    db.set_run_status(active_run["id"], RunStatus.RUNNING)
    with db.connect() as conn:
        conn.execute(
            "UPDATE run_events SET created_at=? WHERE seq IN (?, ?)",
            (old.isoformat(), old_terminal_event, old_active_event),
        )
        conn.execute(
            "UPDATE run_events SET created_at=? WHERE seq=?",
            (recent.isoformat(), recent_terminal_event),
        )

    removed = db.cleanup_retention(
        now=now,
        revoked_token_grace_days=7,
        run_event_retention_days=30,
    )

    assert removed == {"pairing_codes": 2, "auth_tokens": 2, "run_events": 1}
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM pairing_codes").fetchone()[0] == 1
        assert conn.execute("SELECT code_hash FROM pairing_codes").fetchone()[0] == "active-pair"
        assert conn.execute("SELECT COUNT(*) FROM auth_tokens").fetchone()[0] == 1
        assert conn.execute("SELECT token_hash FROM auth_tokens").fetchone()[0] == "current-token"
        remaining_events = {
            row[0] for row in conn.execute("SELECT seq FROM run_events").fetchall()
        }
    assert old_terminal_event not in remaining_events
    assert recent_terminal_event in remaining_events
    assert old_active_event in remaining_events

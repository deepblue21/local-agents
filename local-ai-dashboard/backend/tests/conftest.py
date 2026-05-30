"""Shared fixtures — each test gets its own SQLite + clean settings."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def _reset_caches():
    import app.config as cfg
    cfg.get_settings.cache_clear()
    import app.services.telemetry_local as tl
    tl._STATIC.clear()
    import app.db as db
    if hasattr(db._LOCAL, "conn"):
        try:
            db._LOCAL.conn.close()
        except Exception:
            pass
        del db._LOCAL.conn


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    """Each test gets a fresh SQLite and zero-config defaults."""
    # Use a flat temp dir (no nesting) to avoid Cowork mount cleanup issues.
    base = Path(tempfile.mkdtemp(prefix="lad-test-"))
    monkeypatch.setenv("DB_PATH", str(base / "test.db"))
    monkeypatch.setenv("DATA_DIR", str(base / "data"))
    monkeypatch.setenv("NODES_JSON", "[]")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("OLLAMA_BASE", "http://127.0.0.1:1")
    monkeypatch.setenv("QDRANT_URL", "http://127.0.0.1:1")
    _reset_caches()

    # Initialise the DB explicitly so endpoints work without lifespan.
    import app.db as db
    db.init_db()

    yield base

    _reset_caches()
    # Best-effort cleanup, don't recurse forever on weird mounts.
    try:
        for p in base.rglob("*"):
            if p.is_file():
                p.unlink(missing_ok=True)
        base.rmdir()
    except Exception:
        pass


@pytest.fixture
def app_instance():
    import app.main as m
    return m.create_app()


@pytest.fixture
def client(app_instance):
    """TestClient without lifespan — we already inited the DB."""
    from fastapi.testclient import TestClient
    return TestClient(app_instance)

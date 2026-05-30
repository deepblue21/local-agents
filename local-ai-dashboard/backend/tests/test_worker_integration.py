"""Worker integration — boot the worker on a side port and verify the master
polls it through telemetry_remote.fetch_all() and the cluster state."""

import asyncio
import socket
import threading
import time

import pytest


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


@pytest.fixture
def worker_port():
    """Run the worker FastAPI app in a background thread on a free port."""
    import uvicorn
    from app.worker.agent import app as worker_app

    port = _free_port()
    cfg = uvicorn.Config(worker_app, host="127.0.0.1", port=port, log_level="warning", access_log=False)
    server = uvicorn.Server(cfg)

    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    # Wait for it to listen.
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                break
        except OSError:
            time.sleep(0.05)
    else:
        raise RuntimeError("worker did not come up in time")

    yield port

    server.should_exit = True
    t.join(timeout=3)


def test_worker_health(worker_port):
    import httpx
    r = httpx.get(f"http://127.0.0.1:{worker_port}/agent/health", timeout=3)
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_worker_telemetry(worker_port):
    import httpx
    r = httpx.get(f"http://127.0.0.1:{worker_port}/agent/telemetry", timeout=3)
    assert r.status_code == 200
    body = r.json()
    assert body["cpu"]["total"] is None or "pct" in body["cpu"]
    assert body["ram"]["total"] > 0


def test_master_polls_worker(worker_port, client, monkeypatch):
    """Configure NODES_JSON to point at the worker; /api/cluster/state must
    include it with status != 'error' and a real RAM total."""
    import json as _json
    nodes_json = _json.dumps([
        {"id": "n1", "role": "master", "name": "local", "host": "127.0.0.1", "port": worker_port, "icon": "Monitor"},
        {"id": "n2", "role": "worker", "name": "loopback-worker", "host": "127.0.0.1", "port": worker_port, "icon": "Server"},
    ])
    monkeypatch.setenv("NODES_JSON", nodes_json)
    import app.config as cfg
    cfg.get_settings.cache_clear()

    r = client.get("/api/cluster/state")
    assert r.status_code == 200
    nodes = {n["id"]: n for n in r.json()["nodes"]}
    assert "n2" in nodes
    assert nodes["n2"]["status"] in ("online", "idle", "processing")
    assert nodes["n2"]["ram"]["total"] > 0

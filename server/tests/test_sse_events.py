"""Server-Sent Events replay tests for the run event stream.

A finished run's event stream must replay persisted events and then close, and a
reconnect carrying ``Last-Event-ID`` must skip everything already delivered. This is
the backbone of the "a phone disconnect never loses a run" guarantee.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from local_agents.app import EventStreamLimiter, create_app
from local_agents.config import Settings
from local_agents.models import RunStatus

ADMIN = "a" * 40


def make_app_and_client(tmp_path):
    settings = Settings(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    app = create_app(settings)
    app.state.db.initialize()  # no lifespan -> no background worker
    return app, TestClient(app)


def make_app_and_client_with_stream_cap(tmp_path, stream_cap: int):
    settings = Settings(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
        sse_streams_per_device=stream_cap,
    )
    app = create_app(settings)
    app.state.db.initialize()
    return app, TestClient(app)


def auth_headers(client: TestClient) -> dict[str, str]:
    code = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": ADMIN}).json()["code"]
    tokens = client.post(
        "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
    ).json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def device_id_for_headers(app, headers: dict[str, str]) -> str:
    token = headers["Authorization"].removeprefix("Bearer ")
    device_id = app.state.db.authenticate(token)
    assert device_id
    return device_id


def make_finished_run(app, owner_device_id: str | None = None):
    db = app.state.db
    session = db.create_session("S", owner_device_id=owner_device_id)
    run = db.create_run(session["id"], "task", "qwen3", "ollama")  # emits run.queued
    db.add_event(run["id"], "assistant.delta", {"content": "Merhaba"})
    db.set_run_status(run["id"], RunStatus.COMPLETED)
    return run["id"]


def make_running_run(app):
    db = app.state.db
    session = db.create_session("S")
    run = db.create_run(session["id"], "task", "qwen3", "ollama")
    db.set_run_status(run["id"], RunStatus.RUNNING)
    return run["id"]


def test_events_require_authentication(tmp_path):
    app, client = make_app_and_client(tmp_path)
    run_id = make_finished_run(app)
    assert client.get(f"/api/v1/runs/{run_id}/events").status_code == 401


def test_events_unknown_run_is_404(tmp_path):
    app, client = make_app_and_client(tmp_path)
    headers = auth_headers(client)
    assert client.get("/api/v1/runs/missing/events", headers=headers).status_code == 404


def test_finished_run_replays_all_events_then_closes(tmp_path):
    app, client = make_app_and_client(tmp_path)
    headers = auth_headers(client)
    run_id = make_finished_run(app, owner_device_id=device_id_for_headers(app, headers))

    response = client.get(f"/api/v1/runs/{run_id}/events", headers=headers)
    assert response.status_code == 200
    body = response.text
    assert "event: run.queued" in body
    assert "event: assistant.delta" in body
    assert "Merhaba" in body


def test_last_event_id_skips_already_delivered_events(tmp_path):
    app, client = make_app_and_client(tmp_path)
    headers = auth_headers(client)
    run_id = make_finished_run(app, owner_device_id=device_id_for_headers(app, headers))

    queued_seq = next(
        e["seq"] for e in app.state.db.list_events(run_id) if e["type"] == "run.queued"
    )
    response = client.get(
        f"/api/v1/runs/{run_id}/events",
        headers={**headers, "Last-Event-ID": str(queued_seq)},
    )
    assert response.status_code == 200
    body = response.text
    assert "event: run.queued" not in body
    assert "event: assistant.delta" in body


async def test_event_stream_limiter_caps_and_releases_per_device():
    limiter = EventStreamLimiter(per_device=1)

    assert await limiter.acquire("device-1") is True
    assert await limiter.acquire("device-1") is False
    assert await limiter.acquire("device-2") is True

    await limiter.release("device-1")

    assert await limiter.acquire("device-1") is True

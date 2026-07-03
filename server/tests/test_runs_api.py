"""Run control-plane API tests (validation, 404s, command transitions).

These use a client whose background run-queue worker is *not* started, so runs stay
in a deterministic ``queued`` state and command transitions can be asserted without
racing the agent loop or touching the network.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from local_agents.app import create_app
from local_agents.config import Settings

ADMIN = "a" * 40


def make_client_no_worker(tmp_path) -> TestClient:
    settings = Settings(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    app = create_app(settings)
    # Initialise the schema without entering the lifespan, so the run-queue worker
    # never starts and queued runs do not advance.
    app.state.db.initialize()
    return TestClient(app)


def auth_headers(client: TestClient) -> dict[str, str]:
    code = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": ADMIN}).json()["code"]
    tokens = client.post(
        "/api/v1/pair/exchange", json={"code": code, "device_name": "Phone"}
    ).json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def auth_headers_for(client: TestClient, device_name: str) -> dict[str, str]:
    code = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": ADMIN}).json()["code"]
    tokens = client.post(
        "/api/v1/pair/exchange", json={"code": code, "device_name": device_name}
    ).json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def new_run(client: TestClient, headers: dict[str, str]) -> dict:
    session = client.post("/api/v1/sessions", headers=headers, json={"title": "S"}).json()
    return client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=headers,
        json={"prompt": "do the thing", "model": "qwen3", "provider": "ollama"},
    ).json()


def test_create_run_unknown_session_is_404(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    resp = client.post(
        "/api/v1/sessions/missing/runs", headers=headers, json={"prompt": "hi"}
    )
    assert resp.status_code == 404


def test_create_run_with_unconfigured_provider_is_400(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    session = client.post("/api/v1/sessions", headers=headers, json={"title": "S"}).json()
    resp = client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=headers,
        json={"prompt": "hi", "provider": "nova"},  # valid pattern, not configured
    )
    assert resp.status_code == 400


def test_messages_for_unknown_session_is_404(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    assert client.get("/api/v1/sessions/missing/messages", headers=headers).status_code == 404
    assert client.get("/api/v1/sessions/missing/context", headers=headers).status_code == 404


def test_get_unknown_run_is_404(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    assert client.get("/api/v1/runs/missing", headers=headers).status_code == 404


def test_command_on_unknown_run_is_404(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    resp = client.post(
        "/api/v1/runs/missing/commands", headers=headers, json={"command": "cancel"}
    )
    assert resp.status_code == 404


def test_steer_without_instruction_is_400(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    run = new_run(client, headers)
    resp = client.post(
        f"/api/v1/runs/{run['id']}/commands", headers=headers, json={"command": "steer"}
    )
    assert resp.status_code == 400


def test_pause_then_resume_transitions(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    run = new_run(client, headers)

    paused = client.post(
        f"/api/v1/runs/{run['id']}/commands", headers=headers, json={"command": "pause"}
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"

    resumed = client.post(
        f"/api/v1/runs/{run['id']}/commands", headers=headers, json={"command": "resume"}
    )
    assert resumed.status_code == 200
    # With no active worker task, resume returns the run to the queue.
    assert resumed.json()["status"] == "queued"


def test_cancel_marks_run_cancelled(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    run = new_run(client, headers)
    cancelled = client.post(
        f"/api/v1/runs/{run['id']}/commands", headers=headers, json={"command": "cancel"}
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_create_run_persists_prompt_as_user_message(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers(client)
    session = client.post("/api/v1/sessions", headers=headers, json={"title": "S"}).json()
    client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=headers,
        json={"prompt": "remember me", "provider": "ollama"},
    )
    messages = client.get(
        f"/api/v1/sessions/{session['id']}/messages", headers=headers
    ).json()
    assert [m["role"] for m in messages] == ["user"]
    assert messages[0]["content"] == "remember me"


def test_sessions_runs_and_controls_are_scoped_to_owning_device(tmp_path):
    client = make_client_no_worker(tmp_path)
    owner_headers = auth_headers_for(client, "Owner phone")
    other_headers = auth_headers_for(client, "Other phone")

    session = client.post(
        "/api/v1/sessions", headers=owner_headers, json={"title": "Private"}
    ).json()
    run = client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=owner_headers,
        json={"prompt": "secret task", "model": "qwen3", "provider": "ollama"},
    ).json()

    assert client.get("/api/v1/sessions", headers=owner_headers).json()[0]["id"] == session["id"]
    assert client.get("/api/v1/runs", headers=owner_headers).json()[0]["id"] == run["id"]

    assert client.get("/api/v1/sessions", headers=other_headers).json() == []
    assert client.get("/api/v1/runs", headers=other_headers).json() == []
    assert client.get(
        f"/api/v1/sessions/{session['id']}/messages", headers=other_headers
    ).status_code == 404
    assert client.get(
        f"/api/v1/sessions/{session['id']}/context", headers=other_headers
    ).status_code == 404
    assert client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=other_headers,
        json={"prompt": "take over", "model": "qwen3", "provider": "ollama"},
    ).status_code == 404
    assert client.get(f"/api/v1/runs/{run['id']}", headers=other_headers).status_code == 404
    assert client.post(
        f"/api/v1/runs/{run['id']}/commands",
        headers=other_headers,
        json={"command": "cancel"},
    ).status_code == 404
    assert client.get(
        f"/api/v1/runs/{run['id']}/events", headers=other_headers
    ).status_code == 404

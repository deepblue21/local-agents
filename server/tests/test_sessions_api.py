"""Session lifecycle: rename, delete with cascade, ownership, and auto-titling.

Like ``test_runs_api``, these use a client whose run-queue worker never starts, so
runs stay ``queued`` and assertions do not race the agent loop.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from local_agents.app import create_app
from local_agents.config import Settings

ADMIN = "c" * 40


def make_client_no_worker(tmp_path) -> TestClient:
    settings = Settings(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    app = create_app(settings)
    app.state.db.initialize()
    return TestClient(app)


def auth_headers_for(client: TestClient, device_name: str = "Phone") -> dict[str, str]:
    code = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": ADMIN}).json()["code"]
    tokens = client.post(
        "/api/v1/pair/exchange", json={"code": code, "device_name": device_name}
    ).json()
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def create_session(client, headers, title="Yeni sohbet") -> dict:
    return client.post("/api/v1/sessions", headers=headers, json={"title": title}).json()


def create_run(client, headers, session_id, prompt="do the thing") -> dict:
    return client.post(
        f"/api/v1/sessions/{session_id}/runs",
        headers=headers,
        json={"prompt": prompt, "model": "qwen3", "provider": "ollama"},
    ).json()


# --------------------------------------------------------------------- rename


def test_rename_session(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)

    response = client.patch(
        f"/api/v1/sessions/{session['id']}", headers=headers, json={"title": "  Deploy notes  "}
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Deploy notes"
    assert client.get("/api/v1/sessions", headers=headers).json()[0]["title"] == "Deploy notes"


def test_rename_validates_title(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)

    assert client.patch(
        f"/api/v1/sessions/{session['id']}", headers=headers, json={"title": ""}
    ).status_code == 422
    assert client.patch(
        f"/api/v1/sessions/{session['id']}", headers=headers, json={"title": "x" * 121}
    ).status_code == 422


def test_rename_requires_ownership(tmp_path):
    client = make_client_no_worker(tmp_path)
    owner = auth_headers_for(client, "Phone")
    other = auth_headers_for(client, "Tablet")
    session = create_session(client, owner)

    assert client.patch(
        f"/api/v1/sessions/{session['id']}", headers=other, json={"title": "stolen"}
    ).status_code == 404
    assert client.patch(
        "/api/v1/sessions/does-not-exist", headers=owner, json={"title": "x"}
    ).status_code == 404


def test_rename_requires_authentication(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)
    assert client.patch(f"/api/v1/sessions/{session['id']}", json={"title": "x"}).status_code == 401


# --------------------------------------------------------------------- delete


def test_delete_session_removes_messages_runs_and_events(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)
    run = create_run(client, headers, session["id"])

    assert client.delete(f"/api/v1/sessions/{session['id']}", headers=headers).status_code == 204

    assert client.get("/api/v1/sessions", headers=headers).json() == []
    assert client.get(f"/api/v1/sessions/{session['id']}/messages", headers=headers).status_code == 404
    assert client.get(f"/api/v1/runs/{run['id']}", headers=headers).status_code == 404
    assert client.get("/api/v1/runs", headers=headers).json() == []

    db = client.app.state.db
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0] == 0
        assert conn.execute("SELECT COUNT(*) FROM run_events").fetchone()[0] == 0


def test_delete_session_cancels_an_active_run_first(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)
    run = create_run(client, headers, session["id"])
    assert run["status"] == "queued"

    assert client.delete(f"/api/v1/sessions/{session['id']}", headers=headers).status_code == 204
    # The queue worker must not find a runnable row pointing at a deleted session.
    assert client.app.state.db.next_queued_run() is None


def test_delete_session_is_idempotent_and_scoped(tmp_path):
    client = make_client_no_worker(tmp_path)
    owner = auth_headers_for(client, "Phone")
    other = auth_headers_for(client, "Tablet")
    session = create_session(client, owner)

    assert client.delete(f"/api/v1/sessions/{session['id']}", headers=other).status_code == 404
    assert client.delete(f"/api/v1/sessions/{session['id']}", headers=owner).status_code == 204
    assert client.delete(f"/api/v1/sessions/{session['id']}", headers=owner).status_code == 404


def test_delete_leaves_other_sessions_intact(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    keep = create_session(client, headers, title="Keep")
    drop = create_session(client, headers, title="Drop")
    create_run(client, headers, keep["id"])

    assert client.delete(f"/api/v1/sessions/{drop['id']}", headers=headers).status_code == 204
    remaining = client.get("/api/v1/sessions", headers=headers).json()
    assert [item["title"] for item in remaining] == ["Keep"]
    assert len(client.get("/api/v1/runs", headers=headers).json()) == 1


# ----------------------------------------------------------------- auto-title


def test_first_prompt_names_an_unnamed_session(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers, title="Yeni sohbet")

    create_run(client, headers, session["id"], prompt="Fix the failing deploy pipeline")
    assert client.get("/api/v1/sessions", headers=headers).json()[0]["title"] == (
        "Fix the failing deploy pipeline"
    )


def test_auto_title_does_not_overwrite_an_operator_title(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers, title="Release checklist")

    create_run(client, headers, session["id"], prompt="Fix the failing deploy pipeline")
    assert client.get("/api/v1/sessions", headers=headers).json()[0]["title"] == "Release checklist"


def test_auto_title_applies_only_to_the_first_prompt(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers, title="New chat")

    create_run(client, headers, session["id"], prompt="First task")
    create_run(client, headers, session["id"], prompt="Second task")
    assert client.get("/api/v1/sessions", headers=headers).json()[0]["title"] == "First task"


def test_blank_prompt_is_rejected(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    session = create_session(client, headers)

    response = client.post(
        f"/api/v1/sessions/{session['id']}/runs",
        headers=headers,
        json={"prompt": "   ", "provider": "ollama"},
    )
    assert response.status_code == 400
    assert client.get("/api/v1/runs", headers=headers).json() == []


# ------------------------------------------------------------------ run query


def test_runs_can_be_filtered_by_session(tmp_path):
    client = make_client_no_worker(tmp_path)
    headers = auth_headers_for(client)
    first = create_session(client, headers, title="First")
    second = create_session(client, headers, title="Second")
    create_run(client, headers, first["id"], prompt="one")
    create_run(client, headers, second["id"], prompt="two")

    scoped = client.get(f"/api/v1/runs?session_id={first['id']}", headers=headers).json()
    assert [run["prompt"] for run in scoped] == ["one"]

from __future__ import annotations

from fastapi.testclient import TestClient

from local_agents.app import create_app
from local_agents.config import Settings


def make_client(tmp_path) -> TestClient:
    settings = Settings(
        database=tmp_path / "local_agents.db",
        admin_token="a" * 40,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    return TestClient(create_app(settings))


def pair(client: TestClient) -> dict:
    response = client.post("/api/v1/admin/pairing", headers={"X-Admin-Token": "a" * 40})
    assert response.status_code == 200
    code = response.json()["code"]
    paired = client.post(
        "/api/v1/pair/exchange",
        json={"code": code, "device_name": "Test phone"},
    )
    assert paired.status_code == 200
    return {**paired.json(), "code": code}


def test_pairing_is_one_use_and_protects_api(tmp_path):
    with make_client(tmp_path) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["default_model"] == "qwen3.6"
        assert health.json()["providers"]["ollama"]["default_model"] == "qwen3.6"
        assert health.json()["web"] is True
        assert client.get("/api/v1/sessions").status_code == 401
        tokens = pair(client)
        second = client.post(
            "/api/v1/pair/exchange",
            json={"code": tokens["code"], "device_name": "Other phone"},
        )
        assert second.status_code == 401
        sessions = client.get(
            "/api/v1/sessions",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert sessions.status_code == 200


def test_refresh_token_rotates(tmp_path):
    with make_client(tmp_path) as client:
        tokens = pair(client)
        refreshed = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert refreshed.status_code == 200
        replay = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert replay.status_code == 401


def test_session_and_run_are_persisted(tmp_path):
    with make_client(tmp_path) as client:
        tokens = pair(client)
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}
        session = client.post("/api/v1/sessions", headers=headers, json={"title": "Demo"})
        assert session.status_code == 200
        run = client.post(
            f"/api/v1/sessions/{session.json()['id']}/runs",
            headers=headers,
            json={"prompt": "Merhaba", "model": "qwen3.6", "provider": "ollama"},
        )
        assert run.status_code == 200
        assert run.json()["status"] in {"queued", "running", "failed"}
        sessions = client.get("/api/v1/sessions", headers=headers)
        assert sessions.json()[0]["tool_count"] == 0
        context = client.get(f"/api/v1/sessions/{session.json()['id']}/context", headers=headers)
        assert context.status_code == 200
        assert context.json()["message_count"] >= 1
        assert context.json()["max_tokens"] == 8192
        listed = client.get("/api/v1/runs", headers=headers)
        assert listed.json()[0]["prompt"] == "Merhaba"

"""Error/failure tests — does the system degrade gracefully?"""

import json


def test_ollama_unreachable_returns_empty_models(client):
    """When Ollama is down, /api/models returns [] — UI shows 'no models'."""
    r = client.get("/api/models")
    assert r.status_code == 200
    assert r.json() == []


def test_ollama_unreachable_registry_empty(client):
    r = client.get("/api/models/registry?q=llama")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_unknown_node_in_deployment_still_accepted(client):
    """Backend should accept a deployment plan even if pinned node is missing."""
    bad = {
        "activeModelId": "ghost-model",
        "strategy": "pin",
        "pinnedNodeId": "nope",
        "perNode": {},
    }
    r = client.post("/api/deployment", json=bad)
    assert r.status_code == 200
    assert r.json()["started"] is True


def test_chat_without_api_key_streams_friendly_fallback(client):
    """No ANTHROPIC_API_KEY — chat must still respond, not 500."""
    r = client.post(
        "/api/chat/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert r.status_code == 200
    body = r.text
    assert "data:" in body
    # Should NOT mention the key value, but SHOULD mention how to set it.
    assert "ANTHROPIC_API_KEY" in body


def test_worker_unreachable_marks_node_error(client, monkeypatch):
    """A configured worker that isn't running shows up with status=error."""
    monkeypatch.setenv(
        "NODES_JSON",
        '[{"id":"n1","role":"master","name":"local","host":"127.0.0.1","port":7879,"icon":"Monitor"},'
        '{"id":"n2","role":"worker","name":"ghost","host":"10.255.255.1","port":7879,"icon":"Server"}]',
    )
    import app.config as cfg
    cfg.get_settings.cache_clear()
    r = client.get("/api/cluster/state")
    assert r.status_code == 200
    nodes = {n["id"]: n for n in r.json()["nodes"]}
    assert "n2" in nodes
    assert nodes["n2"]["status"] == "error"
    assert "offline" in nodes["n2"]["task"].lower() or nodes["n2"].get("error")


def test_kb_obsidian_bad_path_400(client):
    r = client.post("/api/kb/obsidian", json={"path": "/this/path/does/not/exist/anywhere"})
    assert r.status_code == 400


def test_kb_delete_unknown_id_404(client):
    r = client.delete("/api/kb/docs/this-id-does-not-exist")
    assert r.status_code == 404


def test_prompt_patch_unknown_id_404(client):
    r = client.patch(
        "/api/prompts/this-id-does-not-exist",
        json={"name": "x", "tag": "general", "icon": "Sparkles", "sys": "y"},
    )
    assert r.status_code == 404


def test_chat_session_unknown_id_404(client):
    r = client.get("/api/chat/sessions/does-not-exist")
    assert r.status_code == 404


def test_energy_invalid_range_422(client):
    r = client.get("/api/energy/series?range=4242h")
    assert r.status_code == 422

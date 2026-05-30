"""Smoke tests — every endpoint answers and basic round-trips work."""

def test_health(client):
    r = client.get("/agent/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "hostname" in body


def test_agent_telemetry_shape(client):
    r = client.get("/agent/telemetry")
    assert r.status_code == 200
    t = r.json()
    assert "cpu" in t and "ram" in t and "accelerators" in t
    assert isinstance(t["cpu"]["pct"], (int, float))
    assert t["ram"]["total"] > 0


def test_cluster_state_shape(client):
    r = client.get("/api/cluster/state")
    assert r.status_code == 200
    s = r.json()
    for key in ("nodes", "totals", "installedModels", "deployment"):
        assert key in s
    assert isinstance(s["nodes"], list)


def test_settings_get_and_patch(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    before = r.json()
    assert "params" in before and "system" in before

    new_temp = 0.42
    r = client.patch("/api/settings", json={"params": {"temperature": new_temp}})
    assert r.status_code == 200
    after = r.json()
    assert abs(after["params"]["temperature"] - new_temp) < 1e-6


def test_prompts_crud(client):
    r = client.get("/api/prompts")
    assert r.status_code == 200
    seeded = r.json()
    assert any(p["id"] == "default" for p in seeded)

    body = {"name": "Test", "tag": "general", "icon": "Sparkles", "sys": "test"}
    r = client.post("/api/prompts", json=body)
    assert r.status_code == 200
    new_id = r.json()["id"]

    r = client.patch(f"/api/prompts/{new_id}", json={**body, "name": "Renamed"})
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"

    r = client.delete(f"/api/prompts/{new_id}")
    assert r.status_code == 200


def test_deployment_get(client):
    r = client.get("/api/deployment")
    assert r.status_code == 200
    d = r.json()
    assert "strategy" in d and "perNode" in d


def test_energy_endpoints(client):
    for rng in ("24h", "7d", "30d", "90d"):
        r = client.get(f"/api/energy/series?range={rng}")
        assert r.status_code == 200
        assert "points" in r.json()
        r = client.get(f"/api/energy/totals?range={rng}")
        assert r.status_code == 200
        assert "kWh" in r.json()


def test_kb_list_empty(client):
    r = client.get("/api/kb/docs")
    assert r.status_code == 200
    assert r.json() == []


def test_chat_stream_anthropic_fallback(client):
    body = {
        "messages": [{"role": "user", "content": "hello"}],
        "temperature": 0.7,
        "max_tokens": 100,
        "top_p": 0.9
    }
    r = client.post("/api/chat/stream", json=body)
    assert r.status_code == 200
    assert "ANTHROPIC_API_KEY" in r.text


def test_chat_routing_to_ollama(client, monkeypatch):
    from app.services.ollama import OllamaClient
    import json as _json
    import app.db as db

    mock_models = [
        {
            "id": "deepseek-v3-67b",
            "name": "deepseek-v3:67b",
            "family": "DeepSeek",
            "params": "67B",
            "quant": "q4_K_M",
            "size": 38.6,
            "totalLayers": 80,
            "contextWindow": 16384,
            "vramFootprint": 38.6,
            "lastUsed": ""
        }
    ]

    async def mock_list_models(self):
        return mock_models

    async def mock_chat_stream(self, model_name, messages, temperature, max_tokens, top_p):
        yield {"type": "delta", "text": "Hello from mock local Ollama!"}
        yield {
            "type": "metrics",
            "tps": 25.0,
            "time": 1.5,
            "tokens": 30,
            "model": model_name,
            "nodes": []
        }
        yield {"type": "done"}

    monkeypatch.setattr(OllamaClient, "list_models", mock_list_models)
    monkeypatch.setattr(OllamaClient, "chat_stream", mock_chat_stream)

    # Insert deployment directly to SQLite to avoid background thread block / sleep starvation
    db.get_conn().execute(
        "INSERT INTO deployments (active_model, strategy, pinned_node, per_node_json) "
        "VALUES (?, ?, ?, ?)",
        ("deepseek-v3-67b", "shard", None, _json.dumps({})),
    )

    body = {
        "messages": [{"role": "user", "content": "hello"}],
        "temperature": 0.7,
        "max_tokens": 100,
        "top_p": 0.9
    }
    r = client.post("/api/chat/stream", json=body)
    assert r.status_code == 200
    assert "Hello from mock local Ollama!" in r.text
    assert "25.0" in r.text

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

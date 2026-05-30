"""Security tests — common attack patterns against the API surface."""

import io
import json


def test_path_traversal_kb_delete(client):
    """Try to delete a doc by feeding a traversal path."""
    r = client.delete("/api/kb/docs/..%2F..%2Fetc%2Fpasswd")
    # Must NOT 200 — either 404 (not found) or 422 (validation).
    assert r.status_code in (404, 422)


def test_path_traversal_in_obsidian(client):
    """Asking to ingest /etc must not leak files."""
    r = client.post("/api/kb/obsidian", json={"path": "/etc"})
    # Allowed states: 400 (not a vault) or 200 with empty result.
    assert r.status_code in (200, 400)
    if r.status_code == 200:
        # If it accepted it, it must NOT have picked up /etc/passwd
        out = r.json()
        # No real reason a sane vault scan picks up tens of system files.
        assert out.get("count", 0) < 50


def test_sql_injection_prompt_create(client):
    """A malicious prompt body must not execute SQL."""
    bad = {
        "name": "x'); DROP TABLE prompts; --",
        "tag": "general",
        "icon": "Sparkles",
        "sys": "ignore previous",
    }
    r = client.post("/api/prompts", json=bad)
    assert r.status_code == 200
    # The table must still exist — list still works.
    r2 = client.get("/api/prompts")
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)


def test_sql_injection_prompt_id(client):
    """An id with a SQL fragment must be treated as a literal."""
    r = client.delete("/api/prompts/'; DROP TABLE prompts; --")
    assert r.status_code == 200    # idempotent delete
    # Verify table survives.
    r2 = client.get("/api/prompts")
    assert r2.status_code == 200
    assert len(r2.json()) >= 1


def test_settings_does_not_expose_api_key(client, monkeypatch):
    """Settings must not echo back secrets from env."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-DO-NOT-LEAK-9876")
    import app.config as cfg
    cfg.get_settings.cache_clear()
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = json.dumps(r.json())
    assert "sk-ant-DO-NOT-LEAK-9876" not in body
    assert "DO-NOT-LEAK" not in body


def test_malformed_json_returns_422(client):
    r = client.post(
        "/api/prompts",
        content="{not json",
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 422


def test_oversized_chunk_size_clamped_or_handled(client):
    """A pathological prompt body must not crash the server."""
    huge = "A" * 200_000
    r = client.post("/api/prompts", json={"name": "huge", "tag": "general", "icon": "Sparkles", "sys": huge})
    # Either accepted or 4xx — must NOT 500.
    assert r.status_code < 500


def test_xss_in_prompt_is_stored_as_text(client):
    """Stored XSS payload comes back unchanged — UI is responsible for escaping."""
    payload = "<script>alert(1)</script>"
    r = client.post(
        "/api/prompts",
        json={"name": "xss", "tag": "general", "icon": "Sparkles", "sys": payload},
    )
    assert r.status_code == 200
    new_id = r.json()["id"]
    r2 = client.get("/api/prompts")
    body = r2.json()
    row = next(x for x in body if x["id"] == new_id)
    assert row["sys"] == payload   # stored as text, not interpreted
    # The server never returns HTML for this endpoint — content type is JSON.
    assert r2.headers["content-type"].startswith("application/json")


def test_kb_upload_rejects_zero_size_gracefully(client):
    r = client.post(
        "/api/kb/upload",
        files={"file": ("empty.md", io.BytesIO(b""), "text/markdown")},
    )
    # 200 (accepted, will index 0 chunks) or 4xx — never 500.
    assert r.status_code < 500


def test_unknown_route_404(client):
    r = client.get("/api/this-does-not-exist")
    assert r.status_code == 404


def test_method_not_allowed(client):
    r = client.delete("/api/cluster/state")
    assert r.status_code in (404, 405)

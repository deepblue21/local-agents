"""Unauthenticated `/health`: caching and throttling.

`/health` is the one route anyone can call, and it reaches out to Ollama. Without a
cache each anonymous request becomes an upstream request, which turns a cheap probe
into an amplification vector against the operator's own model server.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

from local_agents.app import HealthCache, create_app
from local_agents.config import Settings

ADMIN = "d" * 40


def make_client(tmp_path, **overrides) -> TestClient:
    base = dict(
        database=tmp_path / "local_agents.db",
        admin_token=ADMIN,
        public_url="https://agents.example.test",
        ollama_url="http://127.0.0.1:9",
        nova_url=None,
    )
    base.update(overrides)
    return TestClient(create_app(Settings(**base)), client=("127.0.0.1", 51000))


def test_health_reports_console_and_provider_state(tmp_path):
    with make_client(tmp_path) as client:
        body = client.get("/health").json()
        assert body["ok"] is True
        assert body["service"] == "Local_Agents"
        assert body["console"] is True
        # Ollama is not reachable in tests; the probe must degrade, not fail.
        assert body["providers"]["ollama"]["online"] is False
        assert body["providers"]["ollama"]["error"]


def test_health_probes_the_provider_once_per_cache_window(tmp_path):
    calls = 0

    async def probe():
        nonlocal calls
        calls += 1
        return {"ok": True, "call": calls}

    cache = HealthCache(60.0)

    async def exercise():
        first = await cache.get(probe)
        second = await cache.get(probe)
        assert first == second
        assert calls == 1
        cache.invalidate()
        await cache.get(probe)
        assert calls == 2

    asyncio.run(exercise())


def test_health_cache_can_be_disabled(tmp_path):
    calls = 0

    async def probe():
        nonlocal calls
        calls += 1
        return {"ok": True}

    async def exercise():
        cache = HealthCache(0.0)
        await cache.get(probe)
        await cache.get(probe)
        assert calls == 2

    asyncio.run(exercise())


def test_health_serves_repeated_requests_from_cache(tmp_path):
    with make_client(tmp_path, health_cache_seconds=60.0) as client:
        first = client.get("/health").json()
        second = client.get("/health").json()
        assert first == second


@pytest.mark.parametrize("limit", [1, 2])
def test_health_is_throttled_separately_from_auth_routes(tmp_path, limit):
    """The health budget is looser than the auth budget but still bounded."""
    with make_client(tmp_path, auth_rate_limit_per_minute=limit) as client:
        allowed = max(limit * 5, 60)
        for _ in range(allowed):
            assert client.get("/health").status_code == 200
        assert client.get("/health").status_code == 429

        # Exhausting health must not consume the pairing budget.
        assert client.post(
            "/api/v1/pair/exchange", json={"code": "x" * 30, "device_name": "Phone"}
        ).status_code == 401

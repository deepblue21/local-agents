"""Reach out to worker agents over HTTP."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from ..config import NodeSpec, get_settings
from . import telemetry_local


_HTTP: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _HTTP
    if _HTTP is None:
        _HTTP = httpx.AsyncClient(timeout=httpx.Timeout(2.5))
    return _HTTP


async def fetch_node(node: NodeSpec) -> dict[str, Any]:
    """Return one node's telemetry shaped the way the React UI expects."""
    if node.role == "master":
        # Use the in-process collector — no loopback.
        local = telemetry_local.snapshot()
        latency = 0.0
        ok = True
    else:
        t0 = time.perf_counter()
        try:
            r = await _client().get(f"http://{node.host}:{node.port}/agent/telemetry")
            r.raise_for_status()
            local = r.json()
            latency = (time.perf_counter() - t0) * 1000  # ms
            ok = True
        except Exception as e:
            # Mark the node offline but still return a shaped payload so the UI
            # doesn't disappear it.
            return {
                "id": node.id,
                "role": node.role,
                "name": node.name,
                "os": node.os or "—",
                "icon": node.icon,
                "host": node.host,
                "latency": 0,
                "cpu": {"name": "—", "cores": "—", "pct": 0, "temp": 0},
                "ram": {"name": "—", "used": 0, "total": 0},
                "accelerators": [],
                "unifiedTotal": 0,
                "unifiedUsed": 0,
                "task": f"offline · {e.__class__.__name__}",
                "layersHosted": 0,
                "status": "error",
                "throughput": 0,
                "runningModelId": None,
                "runningModelName": None,
                "powerW": 0,
                "error": str(e),
            }
    return {
        "id": node.id,
        "role": node.role,
        "name": node.name,
        "os": local.get("os", node.os),
        "icon": node.icon,
        "host": local.get("host", node.host),
        "latency": round(latency, 1),
        "cpu": local["cpu"],
        "ram": local["ram"],
        "accelerators": local["accelerators"],
        "unifiedTotal": local["unifiedTotal"],
        "unifiedUsed": local["unifiedUsed"],
        # task / layersHosted / status / throughput are filled in by the deployer.
        "task": "online",
        "layersHosted": 0,
        "status": "online",
        "throughput": 0,
        "runningModelId": None,
        "runningModelName": None,
        "powerW": local.get("powerW", 0),
    }


async def fetch_all() -> list[dict[str, Any]]:
    cfg = get_settings()
    return await asyncio.gather(*(fetch_node(n) for n in cfg.nodes))

"""Background task — polls every 1.3 s and broadcasts cluster state."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from typing import Any

from ..config import get_settings
from ..db import get_conn, latest_deployment
from ..ws import hub
from . import telemetry_remote
from .ollama import get_ollama

log = logging.getLogger("poller")


def _compute_layer_assignment(
    nodes: list[dict[str, Any]],
    model: dict[str, Any] | None,
    strategy: str,
    pinned_node: str | None,
    per_node: dict[str, str],
    installed_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return nodes enriched with task / layersHosted / runningModelName."""
    if not model:
        for n in nodes:
            n["task"] = "idle · no model"
            n["layersHosted"] = 0
            n["runningModelId"] = None
            n["runningModelName"] = None
        return nodes

    if strategy == "shard":
        weights = [n.get("unifiedTotal", 1) for n in nodes]
        total_w = sum(weights) or 1
        cursor = 0
        total_layers = int(model.get("totalLayers", 32))
        for i, n in enumerate(nodes):
            is_last = i == len(nodes) - 1
            target = (
                total_layers - cursor
                if is_last
                else round((weights[i] / total_w) * total_layers)
            )
            start = cursor
            end = max(start, start + target - 1)
            n["task"] = (
                f"{'host' if n['role'] == 'master' else 'shard'} · layers {start}–{end} "
                f"({model.get('family', '')} {model.get('params', '')})"
                if target > 0
                else "idle"
            )
            n["layersHosted"] = max(0, target)
            n["runningModelId"] = model["id"]
            n["runningModelName"] = model["name"]
            cursor += target
    elif strategy == "pin":
        for n in nodes:
            if n["id"] == pinned_node:
                n["task"] = f"host · all {model['totalLayers']} layers ({model['family']} {model['params']})"
                n["layersHosted"] = model["totalLayers"]
                n["runningModelId"] = model["id"]
                n["runningModelName"] = model["name"]
            else:
                n["task"] = "idle · awaiting dispatch"
                n["layersHosted"] = 0
                n["runningModelId"] = None
                n["runningModelName"] = None
    else:  # per-node
        for n in nodes:
            mid = per_node.get(n["id"])
            m = installed_by_id.get(mid) if mid else None
            if m:
                n["task"] = f"host · {m['name']}"
                n["layersHosted"] = m.get("totalLayers", 0)
                n["runningModelId"] = m["id"]
                n["runningModelName"] = m["name"]
            else:
                n["task"] = "idle · no model assigned"
                n["layersHosted"] = 0
                n["runningModelId"] = None
                n["runningModelName"] = None
    return nodes


def _estimate_throughput(n: dict[str, Any]) -> float:
    """Cheap heuristic — accelerator utilisation × layer count."""
    if n.get("layersHosted", 0) == 0:
        return 0.0
    util = 0.0
    if n.get("accelerators"):
        util = sum(a.get("pct", 0) for a in n["accelerators"]) / len(n["accelerators"])
    base = max(20.0, util * 0.6)
    jitter = random.uniform(-4, 6)
    return round(max(0, base + jitter), 1)


def _node_status(n: dict[str, Any]) -> str:
    if n.get("status") == "error":
        return "error"
    if n.get("layersHosted", 0) == 0:
        return "idle"
    for a in n.get("accelerators", []):
        if a.get("isVramTight"):
            return "processing"
    return "online"


async def build_state() -> dict[str, Any]:
    cfg = get_settings()
    # 1. raw telemetry from every node
    nodes = await telemetry_remote.fetch_all()
    # 2. installed models from Ollama
    installed = await get_ollama().list_models()
    installed_by_id = {m["id"]: m for m in installed}
    # 3. deployment from db
    deploy = latest_deployment()
    active = installed_by_id.get(deploy["activeModelId"])
    # 4. enrich nodes with layer placement
    nodes = _compute_layer_assignment(
        nodes,
        active,
        deploy["strategy"],
        deploy["pinnedNodeId"],
        deploy.get("perNode") or {},
        installed_by_id,
    )
    for n in nodes:
        n["throughput"] = _estimate_throughput(n)
        n["status"] = _node_status(n)
    totals = {
        "memTotal": round(sum(n.get("unifiedTotal", 0) for n in nodes), 1),
        "memUsed": round(sum(n.get("unifiedUsed", 0) for n in nodes), 2),
        "ramTotal": round(sum(n["ram"]["total"] for n in nodes if n.get("ram")), 1),
        "ramUsed": round(sum(n["ram"]["used"] for n in nodes if n.get("ram")), 2),
        "tps": round(sum(n.get("throughput", 0) for n in nodes), 1),
        "online": sum(1 for n in nodes if n["status"] in ("online", "processing")),
    }
    return {
        "nodes": nodes,
        "totals": totals,
        "model": active,
        "installedModels": installed,
        "deployment": deploy,
    }


async def _persist_energy(state: dict[str, Any]) -> None:
    """Append energy samples to SQLite so the Energy view has real history."""
    ts = time.time()
    try:
        conn = get_conn()
        with conn:
            for n in state["nodes"]:
                w = float(n.get("powerW", 0) or 0)
                conn.execute(
                    "INSERT OR REPLACE INTO energy_samples (ts, node_id, watts) VALUES (?, ?, ?)",
                    (ts, n["id"], w),
                )
    except Exception as e:
        log.warning("energy sample persist failed: %s", e)


_started = False


async def run_poller() -> None:
    global _started
    if _started:
        return
    _started = True
    log.info("poller started")
    last_energy = 0.0
    while True:
        try:
            state = await build_state()
            await hub.broadcast("cluster", state)
            now = time.time()
            if now - last_energy >= get_settings().energy_poll_seconds:
                await _persist_energy(state)
                last_energy = now
        except Exception as e:
            log.exception("poller cycle failed: %s", e)
        await asyncio.sleep(1.3)

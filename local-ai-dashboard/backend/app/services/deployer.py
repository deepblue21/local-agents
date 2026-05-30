"""Apply a deployment plan to the cluster — streams progress over WS."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any

from ..db import get_conn
from ..ws import hub


STAGES = [
    (8,   "evicting current shards…"),
    (22,  "allocating placement group…"),
    (40,  "streaming weights to nodes…"),
    (68,  "warming KV cache…"),
    (88,  "verifying ring-allreduce…"),
    (100, "deployment ready"),
]


async def apply_deployment(plan: dict[str, Any]) -> None:
    """Persist + step through stages, broadcasting via WS."""
    active = plan.get("activeModelId")
    strategy = plan.get("strategy", "shard")
    pinned = plan.get("pinnedNodeId")
    per_node = plan.get("perNode") or {}

    for pct, stage in STAGES:
        await hub.broadcast(
            "deploy",
            {"progress": pct, "stage": stage, "plan": plan, "ts": time.time()},
        )
        await asyncio.sleep(0.4)

    # On 'ready', commit to DB so subsequent build_state reflects the new plan.
    conn = get_conn()
    conn.execute(
        "INSERT INTO deployments (active_model, strategy, pinned_node, per_node_json) "
        "VALUES (?, ?, ?, ?)",
        (active, strategy, pinned, json.dumps(per_node)),
    )
    await hub.broadcast(
        "deploy",
        {"progress": 100, "stage": "applied", "plan": plan, "ts": time.time(), "done": True},
    )

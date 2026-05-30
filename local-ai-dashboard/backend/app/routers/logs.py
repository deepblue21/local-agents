"""Cluster log stream — currently surfaces Ollama /api/ps + poller heartbeats."""

from __future__ import annotations

import asyncio
import logging
import random
import time

from fastapi import APIRouter

from ..ws import hub

log = logging.getLogger("logs")
router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.post("/test")
async def test_log() -> dict:
    """Push one synthetic log line — handy for verifying the WS pipeline."""
    await hub.broadcast(
        "logs",
        {
            "time": time.strftime("%H:%M:%S"),
            "level": "INFO",
            "src": "logs.test",
            "msg": f"synthetic log #{random.randint(100,999)}",
        },
    )
    return {"ok": True}

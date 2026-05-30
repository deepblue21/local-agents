"""/api/cluster + /ws/cluster — full snapshot + live updates."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..services.poller import build_state
from ..ws import hub

router = APIRouter(prefix="/api/cluster", tags=["cluster"])


@router.get("/state")
async def state() -> dict:
    return await build_state()


ws_router = APIRouter()


@ws_router.websocket("/ws/cluster")
async def ws_cluster(ws: WebSocket) -> None:
    await ws.accept()
    ch = hub.channel("cluster")
    await ch.add(ws)
    try:
        # Send the latest snapshot immediately so the UI hydrates without delay.
        await ws.send_json(await build_state())
        while True:
            await asyncio.sleep(60)  # keep-alive; broadcasts come from poller.
    except WebSocketDisconnect:
        pass
    finally:
        await ch.remove(ws)


@ws_router.websocket("/ws/deploy")
async def ws_deploy(ws: WebSocket) -> None:
    await ws.accept()
    ch = hub.channel("deploy")
    await ch.add(ws)
    try:
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        await ch.remove(ws)


@ws_router.websocket("/ws/logs")
async def ws_logs(ws: WebSocket) -> None:
    await ws.accept()
    ch = hub.channel("logs")
    await ch.add(ws)
    try:
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        await ch.remove(ws)

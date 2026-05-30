"""Model Hub backend — list / pull / delete / registry search."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services.ollama import get_ollama
from ..ws import hub

router = APIRouter(prefix="/api/models", tags=["models"])


class PullRequest(BaseModel):
    name: str


@router.get("")
async def list_models() -> list[dict]:
    return await get_ollama().list_models()


@router.get("/registry")
async def registry(q: str = "") -> list[dict]:
    return await get_ollama().search_hf(q)


@router.post("/pull")
async def pull(req: PullRequest) -> dict:
    """Kick off a pull. Progress is broadcast on the `models` WS channel."""
    asyncio.create_task(_pull_task(req.name))
    return {"started": True, "name": req.name}


async def _pull_task(name: str) -> None:
    client = get_ollama()
    try:
        async for evt in client.pull(name):
            # Ollama events: { status, digest, total, completed, error }
            total = evt.get("total") or 0
            done = evt.get("completed") or 0
            pct = round((done / total) * 100, 1) if total else 0
            await hub.broadcast(
                "models",
                {
                    "type": "pull-progress",
                    "name": name,
                    "status": evt.get("status"),
                    "pct": pct,
                    "completed": done,
                    "total": total,
                },
            )
            if evt.get("error"):
                await hub.broadcast(
                    "models", {"type": "pull-error", "name": name, "error": evt["error"]}
                )
                return
        await hub.broadcast("models", {"type": "pull-done", "name": name})
    except Exception as e:
        await hub.broadcast("models", {"type": "pull-error", "name": name, "error": str(e)})


@router.delete("/{model_name:path}")
async def delete_model(model_name: str) -> dict:
    try:
        await get_ollama().delete(model_name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"deleted": model_name}


ws_router = APIRouter()


@ws_router.websocket("/ws/models")
async def ws_models(ws):
    from fastapi import WebSocketDisconnect

    await ws.accept()
    ch = hub.channel("models")
    await ch.add(ws)
    try:
        while True:
            await asyncio.sleep(60)
    except WebSocketDisconnect:
        pass
    finally:
        await ch.remove(ws)

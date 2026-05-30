"""Deployment dialog backend — GET + POST."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

from ..db import latest_deployment
from ..services import deployer

router = APIRouter(prefix="/api/deployment", tags=["deployment"])


class DeploymentIn(BaseModel):
    activeModelId: str
    strategy: str = "shard"  # shard | pin | per-node
    pinnedNodeId: str | None = None
    perNode: dict[str, str] = {}


@router.get("")
def get_deployment() -> dict:
    return latest_deployment()


@router.post("")
async def apply(plan: DeploymentIn) -> dict:
    """Kick off the deployment — progress streams via /ws/deploy."""
    asyncio.create_task(deployer.apply_deployment(plan.model_dump()))
    return {"started": True, "plan": plan.model_dump()}

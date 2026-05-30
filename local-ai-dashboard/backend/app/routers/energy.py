"""Energy & cost router."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..services import energy as energy_svc

router = APIRouter(prefix="/api/energy", tags=["energy"])


@router.get("/series")
def series(range: str = Query("24h", regex="^(24h|7d|30d|90d)$")) -> dict:
    return energy_svc.series(range)


@router.get("/totals")
def totals(range: str = Query("24h", regex="^(24h|7d|30d|90d)$")) -> dict:
    return energy_svc.totals(range)

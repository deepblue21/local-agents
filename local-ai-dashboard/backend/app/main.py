"""FastAPI entrypoint — wires routers, serves the frontend, runs poller."""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import get_settings
from .db import init_db
from .routers import chat, cluster, deployment, energy, knowledge, logs, models, settings
from .services.poller import run_poller

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    poll_task = asyncio.create_task(run_poller())
    log.info("startup complete - listening")
    try:
        yield
    finally:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass


def _find_frontend():
    """Return the frontend/ dir whether running from source or PyInstaller."""
    here = Path(__file__).resolve()
    candidates = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "frontend")
    candidates.append(here.parent.parent.parent / "frontend")
    candidates.append(here.parent.parent / "frontend")
    for p in candidates:
        if p and p.exists():
            return p
    return None


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title="Local AI Dashboard", version="0.1.0", lifespan=lifespan)

    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    app.include_router(cluster.router)
    app.include_router(cluster.ws_router)
    app.include_router(models.router)
    app.include_router(models.ws_router)
    app.include_router(chat.router)
    app.include_router(knowledge.router)
    app.include_router(deployment.router)
    app.include_router(energy.router)
    app.include_router(settings.router)
    app.include_router(logs.router)

    from .services import telemetry_local

    @app.get("/agent/health")
    def agent_health():
        return {"ok": True, "hostname": telemetry_local.static_info()["hostname"]}

    @app.get("/agent/telemetry")
    def agent_telemetry():
        return telemetry_local.snapshot()

    frontend = _find_frontend()
    if frontend is not None:
        app.mount("/src", StaticFiles(directory=str(frontend / "src")), name="src")

        @app.get("/")
        def index():
            return FileResponse(frontend / "index.html")

    return app


app = create_app()

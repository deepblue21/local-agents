from __future__ import annotations

import asyncio
import base64
import io
import json
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from urllib.parse import urlencode

import qrcode
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import HTMLResponse, StreamingResponse

from .adapters import NovaAdapter, OllamaAdapter
from .agent import AgentManager
from .config import Settings, get_settings
from .database import Database
from .models import (
    ContextCompress,
    EventOut,
    ModelOut,
    PairingExchange,
    PairingOut,
    RunCommand,
    RunCreate,
    RunOut,
    RunStatus,
    SessionCreate,
    SessionContextOut,
    SessionOut,
    TokenBundle,
    TokenRefresh,
)
from .pairing import random_pairing_code
from .rate_limit import InMemoryRateLimiter
from .runner_client import RunnerClient
from .security import issue_tokens
from .web_tools import WebToolClient


def _qr_data_url(value: str) -> str:
    image = qrcode.make(value)
    output = io.BytesIO()
    image.save(output, format="PNG")
    return "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or get_settings()
    cfg.validate_admin_token()
    db = Database(cfg.database)
    adapters = {"ollama": OllamaAdapter(cfg.ollama_url)}
    if cfg.nova_url:
        adapters["nova"] = NovaAdapter(cfg.nova_url, cfg.nova_token)
    web_tools = WebToolClient(
        provider=cfg.web_search_provider,
        brave_api_key=cfg.brave_search_api_key,
        timeout_seconds=cfg.web_search_timeout_seconds,
        allow_private_fetch=cfg.web_fetch_allow_private,
    )
    manager = AgentManager(
        db,
        RunnerClient(cfg.runner_socket),
        adapters,
        cfg.default_model,
        web_tools=web_tools,
        context_window_tokens=cfg.context_window_tokens,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        db.initialize()
        await manager.start()
        yield
        await manager.stop()

    app = FastAPI(
        title="Local_Agents",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = cfg
    app.state.db = db
    app.state.manager = manager
    auth_rate_limiter = InMemoryRateLimiter(cfg.auth_rate_limit_per_minute)

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; "
            "img-src 'self' data:; "
            "style-src 'unsafe-inline'; "
            "script-src 'unsafe-inline'; "
            "connect-src 'self'; "
            "base-uri 'none'; "
            "form-action 'self'; "
            "frame-ancestors 'none'",
        )
        if cfg.normalized_public_url.startswith("https://"):
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    def bearer_device(authorization: Annotated[str | None, Header()] = None) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bearer token required")
        device_id = db.authenticate(authorization[7:].strip())
        if not device_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
        return device_id

    def require_admin(x_admin_token: Annotated[str | None, Header()] = None) -> None:
        if not x_admin_token or not secrets.compare_digest(x_admin_token, cfg.admin_token):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "admin token required")

    async def auth_rate_limited(request: Request) -> None:
        await auth_rate_limiter.check(request)

    def model_matches_default(model_id: str) -> bool:
        default = cfg.default_model
        candidates = {default, f"{default}:latest"}
        if default.endswith(":latest"):
            candidates.add(default.removesuffix(":latest"))
        return model_id in candidates

    @app.get("/health")
    async def health() -> dict:
        ollama = {
            "online": False,
            "default_model": cfg.default_model,
            "default_model_ready": False,
        }
        try:
            listed = await asyncio.wait_for(adapters["ollama"].list_models(), timeout=2.5)
            model_ids = [item.get("id", "") for item in listed]
            ollama.update(
                {
                    "online": True,
                    "default_model_ready": any(model_matches_default(model_id) for model_id in model_ids),
                    "model_count": len(model_ids),
                }
            )
        except Exception as exc:
            ollama["error"] = exc.__class__.__name__
        return {
            "ok": True,
            "service": "Local_Agents",
            "default_model": cfg.default_model,
            "web": web_tools.enabled,
            "providers": {"ollama": ollama},
        }

    @app.get("/admin", response_class=HTMLResponse)
    async def admin_page() -> str:
        return ADMIN_HTML

    @app.post(
        "/api/v1/admin/pairing",
        response_model=PairingOut,
        dependencies=[Depends(auth_rate_limited), Depends(require_admin)],
    )
    async def create_pairing() -> PairingOut:
        code = random_pairing_code()
        expires_at = db.create_pairing(code, cfg.pairing_code_minutes)
        query = urlencode({"url": cfg.normalized_public_url, "code": code})
        uri = f"localagents://pair?{query}"
        return PairingOut(
            code=code,
            expires_at=expires_at,
            pairing_uri=uri,
            qr_data_url=_qr_data_url(uri),
        )

    @app.post("/api/v1/pair/exchange", response_model=TokenBundle)
    async def pair(
        body: PairingExchange, _rate_limit: None = Depends(auth_rate_limited)
    ) -> TokenBundle:
        device_id = db.consume_pairing(body.code, body.device_name.strip())
        if not device_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired pairing code")
        return issue_tokens(db, cfg, device_id)

    @app.post("/api/v1/auth/refresh", response_model=TokenBundle)
    async def refresh(
        body: TokenRefresh, _rate_limit: None = Depends(auth_rate_limited)
    ) -> TokenBundle:
        device_id = db.consume_refresh(body.refresh_token)
        if not device_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired refresh token")
        return issue_tokens(db, cfg, device_id)

    @app.get("/api/v1/capabilities", dependencies=[Depends(bearer_device)])
    async def capabilities() -> dict:
        providers = {
            "ollama": ["chat", "stream", "tools", "agent", "pause", "steer"],
        }
        if web_tools.enabled:
            providers["ollama"].append("web")
        if cfg.nova_url:
            providers["nova"] = ["chat", "stream", "cancel"]
        return {
            "providers": providers,
            "event_replay": True,
            "context_compression": True,
            "max_concurrent_runs": 1,
        }

    @app.get("/api/v1/models", response_model=list[ModelOut], dependencies=[Depends(bearer_device)])
    async def models() -> list[dict]:
        result: list[dict] = []
        for provider, adapter in adapters.items():
            try:
                result.extend(await adapter.list_models())
            except Exception:
                if provider == "ollama":
                    result.append(
                        {
                            "id": cfg.default_model,
                            "name": f"{cfg.default_model} (çevrimdışı)",
                            "provider": "ollama",
                            "capabilities": ["unavailable"],
                        }
                    )
        if web_tools.enabled:
            for item in result:
                if item.get("provider") == "ollama" and "unavailable" not in item.get("capabilities", []):
                    capabilities = item.setdefault("capabilities", [])
                    if "web" not in capabilities:
                        capabilities.append("web")
        return result

    @app.get("/api/v1/sessions", response_model=list[SessionOut], dependencies=[Depends(bearer_device)])
    async def sessions() -> list[dict]:
        return db.list_sessions()

    @app.post("/api/v1/sessions", response_model=SessionOut, dependencies=[Depends(bearer_device)])
    async def create_session(body: SessionCreate) -> dict:
        return db.create_session(body.title.strip())

    @app.get("/api/v1/sessions/{session_id}/messages", dependencies=[Depends(bearer_device)])
    async def messages(session_id: str) -> list[dict]:
        if not db.get_session(session_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return db.list_messages(session_id)

    @app.get(
        "/api/v1/sessions/{session_id}/context",
        response_model=SessionContextOut,
        dependencies=[Depends(bearer_device)],
    )
    async def session_context(session_id: str) -> dict:
        if not db.get_session(session_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return manager.context_status(session_id)

    @app.post(
        "/api/v1/sessions/{session_id}/context/compress",
        response_model=SessionContextOut,
        dependencies=[Depends(bearer_device)],
    )
    async def compress_context(session_id: str, body: ContextCompress) -> dict:
        try:
            return await manager.compress_session(
                session_id,
                model=body.model,
                provider=body.provider,
            )
        except KeyError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found") from None
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    @app.get("/api/v1/runs", response_model=list[RunOut], dependencies=[Depends(bearer_device)])
    async def runs(limit: int = 100) -> list[dict]:
        return db.list_runs(limit)

    @app.post(
        "/api/v1/sessions/{session_id}/runs",
        response_model=RunOut,
        dependencies=[Depends(bearer_device)],
    )
    async def create_run(session_id: str, body: RunCreate) -> dict:
        if not db.get_session(session_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        if body.provider not in adapters:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "provider is not configured")
        prompt = body.prompt.strip()
        db.add_message(session_id, "user", prompt)
        run = db.create_run(
            session_id,
            prompt,
            body.model or cfg.default_model,
            body.provider,
        )
        manager.notify()
        return run

    @app.get("/api/v1/runs/{run_id}", response_model=RunOut, dependencies=[Depends(bearer_device)])
    async def get_run(run_id: str) -> dict:
        run = db.get_run(run_id)
        if not run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")
        return run

    @app.post(
        "/api/v1/runs/{run_id}/commands",
        response_model=RunOut,
        dependencies=[Depends(bearer_device)],
    )
    async def run_command(run_id: str, body: RunCommand) -> dict:
        try:
            return await manager.command(run_id, body.command, body.instruction)
        except KeyError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found") from None
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    @app.get("/api/v1/runs/{run_id}/events", dependencies=[Depends(bearer_device)])
    async def events(run_id: str, request: Request, last_event_id: int | None = Header(default=None)):
        if not db.get_run(run_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")

        async def stream():
            cursor = max(0, last_event_id or 0)
            idle_ticks = 0
            while True:
                if await request.is_disconnected():
                    return
                rows = db.list_events(run_id, cursor)
                for row in rows:
                    cursor = row["seq"]
                    payload = EventOut(**row).model_dump(mode="json")
                    yield f"id: {cursor}\nevent: {row['type']}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    idle_ticks = 0
                run = db.get_run(run_id)
                if run and RunStatus(run["status"]) in {
                    RunStatus.COMPLETED,
                    RunStatus.FAILED,
                    RunStatus.CANCELLED,
                } and not db.list_events(run_id, cursor):
                    return
                idle_ticks += 1
                if idle_ticks >= 50:
                    yield ": heartbeat\n\n"
                    idle_ticks = 0
                await asyncio.sleep(0.3)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


ADMIN_HTML = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Local_Agents Yönetim</title><style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#090b0f;color:#edf2f7}
body{margin:0;display:grid;min-height:100vh;place-items:center}.panel{width:min(520px,calc(100% - 32px));border:1px solid #28303a;background:#11151b;padding:24px;border-radius:8px}
h1{font-size:22px;margin:0 0 6px}p{color:#9aa7b5;line-height:1.5}label{font-size:12px;color:#9aa7b5}input{box-sizing:border-box;width:100%;margin:7px 0 14px;padding:12px;border:1px solid #35404b;background:#090b0f;color:#fff;border-radius:6px}
button{width:100%;padding:12px;border:0;border-radius:6px;background:#38d6a3;color:#07110d;font-weight:700;cursor:pointer}img{display:block;width:220px;height:220px;margin:20px auto 10px;background:white;padding:8px;border-radius:6px}.code{word-break:break-all;font-family:monospace;font-size:11px;color:#b6c2cc}
</style></head><body><main class="panel"><h1>Local_Agents</h1><p>Telefon eşleştirmesi için tek kullanımlık QR üret.</p><label>Yönetim anahtarı</label><input id="token" type="password" autocomplete="current-password"><button id="create">Eşleştirme kodu üret</button><div id="out"></div></main><script>
document.querySelector('#create').onclick=async()=>{const out=document.querySelector('#out');out.textContent='Üretiliyor...';const r=await fetch('/api/v1/admin/pairing',{method:'POST',headers:{'X-Admin-Token':document.querySelector('#token').value}});if(!r.ok){out.textContent='Yetkilendirme başarısız.';return}const d=await r.json();out.innerHTML='<img alt="Eşleştirme QR" src="'+d.qr_data_url+'"><div class="code">'+d.code+'</div>'}
</script></body></html>"""

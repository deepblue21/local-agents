from __future__ import annotations

import asyncio
import base64
import contextlib
import io
import json
import logging
import secrets
from dataclasses import dataclass
from contextlib import asynccontextmanager
from time import monotonic
from typing import Annotated
from urllib.parse import urlencode

import qrcode
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

from . import webapp
from .adapters import NovaAdapter, OllamaAdapter
from .agent import AgentManager
from .config import Settings, get_settings
from .database import Database
from .models import (
    CommandType,
    ContextCompress,
    EventOut,
    DeviceOut,
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
    SessionUpdate,
    TokenBundle,
    TokenRefresh,
    WebSessionOut,
    WebSessionStart,
)
from .pairing import random_pairing_code
from .rate_limit import InMemoryRateLimiter, peer_is_trusted_proxy
from .runner_client import RunnerClient
from .security import issue_tokens
from .web_tools import WebToolClient

logger = logging.getLogger(__name__)

REFRESH_COOKIE = "la_refresh"
CSRF_COOKIE = "la_csrf"
CSRF_HEADER = "x-csrf-token"
# Scoping the refresh cookie to the only routes that consume it keeps it off every
# other request, including the SSE stream and all bearer-authenticated API calls.
WEB_AUTH_PATH = "/api/v1/web"

# Titles the clients create a conversation with before the operator has typed
# anything. Seeing one of these means the conversation is still unnamed, so the
# first prompt may name it.
PLACEHOLDER_SESSION_TITLES = {"yeni sohbet", "new chat", "new session", "yeni oturum"}
ACTIVE_RUN_STATUSES = (RunStatus.QUEUED, RunStatus.RUNNING, RunStatus.PAUSED)


@dataclass(frozen=True)
class AuthContext:
    device_id: str
    token: str


class EventStreamLimiter:
    def __init__(self, per_device: int):
        self.per_device = max(1, per_device)
        self._active: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, device_id: str) -> bool:
        async with self._lock:
            active = self._active.get(device_id, 0)
            if active >= self.per_device:
                return False
            self._active[device_id] = active + 1
            return True

    async def release(self, device_id: str) -> None:
        async with self._lock:
            active = self._active.get(device_id, 0)
            if active <= 1:
                self._active.pop(device_id, None)
            else:
                self._active[device_id] = active - 1


class RunEventNotifier:
    def __init__(self):
        self._versions: dict[str, int] = {}
        self._events: dict[str, asyncio.Event] = {}

    def version(self, run_id: str) -> int:
        return self._versions.get(run_id, 0)

    def notify(self, run_id: str) -> None:
        self._versions[run_id] = self.version(run_id) + 1
        event = self._events.pop(run_id, None)
        if event:
            event.set()

    async def wait_for_change(self, run_id: str, version: int, timeout: float) -> bool:
        if self.version(run_id) != version:
            return True
        event = self._events.setdefault(run_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except TimeoutError:
            return self.version(run_id) != version
        return True


class HealthCache:
    """Short-lived cache for the unauthenticated ``/health`` payload.

    ``/health`` reaches out to Ollama, so serving it uncached lets an unauthenticated
    caller turn one cheap request into one upstream request. The window is small
    enough that pairing previews still look live.
    """

    def __init__(self, ttl_seconds: float):
        self.ttl_seconds = max(0.0, ttl_seconds)
        self._value: dict | None = None
        self._stored_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, producer) -> dict:
        if self.ttl_seconds <= 0:
            return await producer()
        async with self._lock:
            now = monotonic()
            if self._value is not None and now - self._stored_at < self.ttl_seconds:
                return self._value
            value = await producer()
            self._value = value
            self._stored_at = now
            return value

    def invalidate(self) -> None:
        self._value = None


def derive_session_title(prompt: str, limit: int = 60) -> str:
    """Build a readable conversation title from the first prompt."""
    collapsed = " ".join(prompt.split())
    if not collapsed:
        return "Yeni sohbet"
    if len(collapsed) <= limit:
        return collapsed
    cut = collapsed[:limit].rstrip()
    boundary = cut.rfind(" ")
    if boundary >= limit // 2:
        cut = cut[:boundary].rstrip()
    return f"{cut}…"


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
    run_event_notifier = RunEventNotifier()
    manager = AgentManager(
        db,
        RunnerClient(cfg.runner_socket),
        adapters,
        cfg.default_model,
        web_tools=web_tools,
        context_window_tokens=cfg.context_window_tokens,
        on_event=run_event_notifier.notify,
    )

    def run_retention_sweep() -> dict[str, int]:
        return db.cleanup_retention(
            revoked_token_grace_days=cfg.retention_revoked_token_grace_days,
            run_event_retention_days=cfg.retention_run_event_days,
        )

    async def retention_loop() -> None:
        """Keep sweeping while the process lives.

        A startup-only sweep never runs again on a companion that stays up for
        weeks, which is the normal case for a desktop service.
        """
        interval = max(600.0, cfg.retention_sweep_hours * 3600.0)
        while True:
            await asyncio.sleep(interval)
            try:
                await asyncio.to_thread(run_retention_sweep)
            except Exception:
                logger.exception("Retention sweep failed")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        db.initialize()
        run_retention_sweep()
        await manager.start()
        retention_task = asyncio.create_task(retention_loop(), name="local-agents-retention")
        yield
        retention_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await retention_task
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
    app.state.run_event_notifier = run_event_notifier
    trusted_proxies = cfg.trusted_proxies
    auth_rate_limiter = InMemoryRateLimiter(
        cfg.auth_rate_limit_per_minute,
        trusted_proxies=trusted_proxies,
    )
    # `/health` is unauthenticated by design, so it gets its own, looser budget
    # instead of sharing the auth bucket.
    health_rate_limiter = InMemoryRateLimiter(
        max(cfg.auth_rate_limit_per_minute * 5, 60),
        trusted_proxies=trusted_proxies,
    )
    health_cache = HealthCache(cfg.health_cache_seconds)
    event_stream_limiter = EventStreamLimiter(cfg.sse_streams_per_device)
    app.state.event_stream_limiter = event_stream_limiter
    app.state.health_cache = health_cache
    console_enabled = cfg.web_console_enabled and webapp.available()
    app.state.web_console_enabled = console_enabled

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        # Routes that render a document set their own policy; everything else is an
        # API response that should be allowed to load nothing at all.
        response.headers.setdefault("Content-Security-Policy", webapp.API_CSP)
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), camera=(), microphone=()")
        if cfg.public_url_is_https:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    def bearer_auth(authorization: Annotated[str | None, Header()] = None) -> AuthContext:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bearer token required")
        token = authorization[7:].strip()
        device_id = db.authenticate(token)
        if not device_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
        return AuthContext(device_id=device_id, token=token)

    def bearer_device(auth: AuthContext = Depends(bearer_auth)) -> str:
        return auth.device_id

    async def acquire_event_stream(device_id: str) -> None:
        if await event_stream_limiter.acquire(device_id):
            return
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "too many active event streams",
        )

    async def release_event_stream(device_id: str) -> None:
        await event_stream_limiter.release(device_id)

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

    async def health_payload() -> dict:
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
            "console": console_enabled,
            "providers": {"ollama": ollama},
        }

    @app.get("/health")
    async def health(request: Request) -> dict:
        await health_rate_limiter.check(request, bucket="health")
        return await health_cache.get(health_payload)

    def asset_response(name: str, request: Request, csp: str | None = None) -> Response:
        asset = webapp.get_asset(name)
        if not asset:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
        headers = {
            "ETag": asset.etag,
            "Cache-Control": asset.cache_control,
            "X-Content-Type-Options": "nosniff",
        }
        if csp:
            headers["Content-Security-Policy"] = csp
        if request.headers.get("if-none-match") == asset.etag:
            return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
        return Response(content=asset.body, media_type=asset.media_type, headers=headers)

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse("/app" if console_enabled else "/admin", status_code=307)

    @app.get("/admin", include_in_schema=False)
    async def admin_page(request: Request) -> Response:
        return asset_response("admin.html", request, csp=webapp.CONSOLE_CSP)

    @app.get("/app", include_in_schema=False)
    async def console_page(request: Request) -> Response:
        if not console_enabled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "web console is disabled")
        return asset_response("index.html", request, csp=webapp.CONSOLE_CSP)

    @app.get("/assets/{name}", include_in_schema=False)
    async def console_asset(name: str, request: Request) -> Response:
        if name in {"index.html", "admin.html"}:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
        return asset_response(name, request)

    @app.get("/sw.js", include_in_schema=False)
    async def service_worker(request: Request) -> Response:
        if not console_enabled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
        return asset_response("sw.js", request, csp=webapp.WORKER_CSP)

    @app.get("/manifest.webmanifest", include_in_schema=False)
    async def web_manifest(request: Request) -> Response:
        if not console_enabled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
        return asset_response("manifest.webmanifest", request)

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

    @app.get(
        "/api/v1/admin/devices",
        response_model=list[DeviceOut],
        dependencies=[Depends(auth_rate_limited), Depends(require_admin)],
    )
    async def list_devices() -> list[dict]:
        return db.list_devices()

    @app.post(
        "/api/v1/admin/devices/{device_id}/revoke",
        response_model=DeviceOut,
        dependencies=[Depends(auth_rate_limited), Depends(require_admin)],
    )
    async def revoke_device(device_id: str) -> dict:
        device = db.revoke_device(device_id)
        if not device:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "device not found")
        return device

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

    def _request_is_https(request: Request) -> bool:
        if request.url.scheme == "https":
            return True
        # A forwarded scheme is only believable from a proxy the operator declared.
        if peer_is_trusted_proxy(request, trusted_proxies):
            return request.headers.get("x-forwarded-proto", "").split(",")[0].strip() == "https"
        return False

    def _cookie_secure(request: Request) -> bool:
        return cfg.cookie_secure_for(_request_is_https(request))

    def _set_web_cookies(
        response: Response,
        refresh_token: str,
        csrf_token: str,
        *,
        secure: bool,
    ) -> None:
        max_age = cfg.refresh_token_days * 24 * 3600
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            max_age=max_age,
            httponly=True,
            secure=secure,
            samesite="strict",
            path=WEB_AUTH_PATH,
        )
        # Readable by the page on purpose: the console echoes it back in a header so
        # the server can prove the request came from its own script and not from a
        # cross-site form or image.
        response.set_cookie(
            CSRF_COOKIE,
            csrf_token,
            max_age=max_age,
            httponly=False,
            secure=secure,
            samesite="strict",
            path="/",
        )

    def _clear_web_cookies(response: Response, *, secure: bool) -> None:
        response.delete_cookie(REFRESH_COOKIE, path=WEB_AUTH_PATH, samesite="strict", secure=secure, httponly=True)
        response.delete_cookie(CSRF_COOKIE, path="/", samesite="strict", secure=secure)

    def _require_console() -> None:
        if not console_enabled:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "web console is disabled")

    def _require_csrf(request: Request) -> None:
        cookie = request.cookies.get(CSRF_COOKIE, "")
        header = request.headers.get(CSRF_HEADER, "")
        if not cookie or not header or not secrets.compare_digest(cookie, header):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "csrf token mismatch")

    def _web_bundle(bundle: TokenBundle) -> tuple[WebSessionOut, str]:
        csrf_token = secrets.token_urlsafe(32)
        return (
            WebSessionOut(
                access_token=bundle.access_token,
                expires_in=bundle.expires_in,
                device_id=bundle.device_id,
                csrf_token=csrf_token,
            ),
            csrf_token,
        )

    @app.post("/api/v1/web/session", response_model=WebSessionOut)
    async def start_web_session(
        request: Request,
        body: WebSessionStart,
        _rate_limit: None = Depends(auth_rate_limited),
    ) -> JSONResponse:
        _require_console()
        device_id = db.consume_pairing(body.code, body.device_name.strip())
        if not device_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired pairing code")
        bundle = issue_tokens(db, cfg, device_id)
        payload, csrf_token = _web_bundle(bundle)
        response = JSONResponse(payload.model_dump())
        _set_web_cookies(
            response,
            bundle.refresh_token,
            csrf_token,
            secure=_cookie_secure(request),
        )
        return response

    @app.post("/api/v1/web/refresh", response_model=WebSessionOut)
    async def refresh_web_session(
        request: Request,
        _rate_limit: None = Depends(auth_rate_limited),
    ) -> JSONResponse:
        _require_console()
        _require_csrf(request)
        cookie = request.cookies.get(REFRESH_COOKIE, "")
        device_id = db.consume_refresh(cookie) if cookie else None
        if not device_id:
            # Deliberately does *not* clear the cookies. Two tabs reloading together
            # both present the same refresh token; one rotates it and the other gets
            # this 401. Clearing here would delete the token the winning tab had just
            # been issued and log the whole browser out. The loser simply retries and
            # picks up the rotated cookie from the shared jar.
            return JSONResponse(
                {"detail": "invalid or expired web session"},
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        bundle = issue_tokens(db, cfg, device_id)
        payload, csrf_token = _web_bundle(bundle)
        response = JSONResponse(payload.model_dump())
        _set_web_cookies(
            response,
            bundle.refresh_token,
            csrf_token,
            secure=_cookie_secure(request),
        )
        return response

    @app.post("/api/v1/web/logout")
    async def end_web_session(request: Request) -> JSONResponse:
        _require_console()
        _require_csrf(request)
        cookie = request.cookies.get(REFRESH_COOKIE, "")
        if cookie:
            db.revoke_token(cookie)
        response = JSONResponse({"ok": True})
        _clear_web_cookies(response, secure=_cookie_secure(request))
        return response

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
            "session_rename": True,
            "session_delete": True,
            "web_console": console_enabled,
            "max_concurrent_runs": cfg.max_concurrent_runs,
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

    @app.get("/api/v1/sessions", response_model=list[SessionOut])
    async def sessions(device_id: str = Depends(bearer_device)) -> list[dict]:
        return db.list_sessions(device_id)

    @app.post("/api/v1/sessions", response_model=SessionOut)
    async def create_session(
        body: SessionCreate,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        return db.create_session(body.title.strip(), owner_device_id=device_id)

    @app.patch("/api/v1/sessions/{session_id}", response_model=SessionOut)
    async def rename_session(
        session_id: str,
        body: SessionUpdate,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        session = db.set_session_title(session_id, body.title.strip(), owner_device_id=device_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return session

    @app.delete("/api/v1/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_session(
        session_id: str,
        device_id: str = Depends(bearer_device),
    ) -> Response:
        if not db.get_session(session_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        # Stop anything still executing before the rows disappear, otherwise the
        # worker keeps streaming into a conversation that no longer exists.
        for run_id in db.session_run_ids(session_id, ACTIVE_RUN_STATUSES):
            with contextlib.suppress(KeyError, ValueError):
                await manager.command(run_id, CommandType.CANCEL, None)
        if not db.delete_session(session_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/v1/sessions/{session_id}/messages")
    async def messages(session_id: str, device_id: str = Depends(bearer_device)) -> list[dict]:
        if not db.get_session(session_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return db.list_messages(session_id)

    @app.get(
        "/api/v1/sessions/{session_id}/context",
        response_model=SessionContextOut,
    )
    async def session_context(
        session_id: str,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        if not db.get_session(session_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        return manager.context_status(session_id)

    @app.post(
        "/api/v1/sessions/{session_id}/context/compress",
        response_model=SessionContextOut,
    )
    async def compress_context(
        session_id: str,
        body: ContextCompress,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        if not db.get_session(session_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
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

    @app.get("/api/v1/runs", response_model=list[RunOut])
    async def runs(
        limit: int = 100,
        session_id: str | None = None,
        device_id: str = Depends(bearer_device),
    ) -> list[dict]:
        return db.list_runs(limit, device_id, session_id=session_id)

    @app.post(
        "/api/v1/sessions/{session_id}/runs",
        response_model=RunOut,
    )
    async def create_run(
        session_id: str,
        body: RunCreate,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        session = db.get_session(session_id, device_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")
        if body.provider not in adapters:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "provider is not configured")
        prompt = body.prompt.strip()
        if not prompt:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "prompt is required")
        # Name the conversation after the first thing asked of it, so session lists
        # are readable instead of a column of identical placeholder titles.
        if str(session.get("title", "")).strip().lower() in PLACEHOLDER_SESSION_TITLES:
            db.set_session_title(session_id, derive_session_title(prompt), owner_device_id=device_id)
        db.add_message(session_id, "user", prompt)
        run = db.create_run(
            session_id,
            prompt,
            body.model or cfg.default_model,
            body.provider,
        )
        run_event_notifier.notify(run["id"])
        manager.notify()
        return run

    @app.get("/api/v1/runs/{run_id}", response_model=RunOut)
    async def get_run(
        run_id: str,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        run = db.get_run(run_id, device_id)
        if not run:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")
        return run

    @app.post(
        "/api/v1/runs/{run_id}/commands",
        response_model=RunOut,
    )
    async def run_command(
        run_id: str,
        body: RunCommand,
        device_id: str = Depends(bearer_device),
    ) -> dict:
        if not db.get_run(run_id, device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")
        try:
            return await manager.command(run_id, body.command, body.instruction)
        except KeyError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found") from None
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    @app.get("/api/v1/runs/{run_id}/events")
    async def events(
        run_id: str,
        request: Request,
        auth: AuthContext = Depends(bearer_auth),
        last_event_id: int | None = Header(default=None),
    ):
        if not db.get_run(run_id, auth.device_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "run not found")
        await acquire_event_stream(auth.device_id)

        async def stream():
            cursor = max(0, last_event_id or 0)
            last_reauth = 0.0
            try:
                while True:
                    if await request.is_disconnected():
                        return
                    current_time = monotonic()
                    if current_time - last_reauth >= max(1.0, cfg.sse_reauth_seconds):
                        last_reauth = current_time
                        if db.authenticate(auth.token) != auth.device_id:
                            return
                    version = run_event_notifier.version(run_id)
                    rows = db.list_events(run_id, cursor)
                    for row in rows:
                        cursor = row["seq"]
                        payload = EventOut(**row).model_dump(mode="json")
                        yield f"id: {cursor}\nevent: {row['type']}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                    run = db.get_run(run_id)
                    if run and RunStatus(run["status"]) in {
                        RunStatus.COMPLETED,
                        RunStatus.FAILED,
                        RunStatus.CANCELLED,
                    } and not db.list_events(run_id, cursor):
                        return
                    reauth_due_in = max(0.1, cfg.sse_reauth_seconds - (monotonic() - last_reauth))
                    if not await run_event_notifier.wait_for_change(
                        run_id,
                        version,
                        timeout=min(15.0, reauth_due_in),
                    ):
                        yield ": heartbeat\n\n"
            finally:
                await release_event_stream(auth.device_id)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app

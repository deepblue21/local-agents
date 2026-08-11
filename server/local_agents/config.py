from __future__ import annotations

import ipaddress
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


INSECURE_ADMIN_TOKEN = "development-admin-token-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_prefix="LOCAL_AGENTS_",
        extra="ignore",
    )

    host: str = "127.0.0.1"
    port: int = 8787
    database: Path = Path("data/local_agents.db")
    public_url: str = "http://10.0.2.2:8787"
    admin_token: str = Field(default=INSECURE_ADMIN_TOKEN)
    allow_insecure_admin: bool = False
    auth_rate_limit_per_minute: int = 12
    ollama_url: str = "http://127.0.0.1:11434"
    default_model: str = "qwen3.6"
    nova_url: str | None = None
    nova_token: str | None = None
    runner_socket: Path = Path("/run/local-agents/runner.sock")
    workspace: Path = Path(".")
    max_concurrent_runs: int = 1
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    pairing_code_minutes: int = 240
    retention_revoked_token_grace_days: int = 7
    retention_run_event_days: int = 30
    sse_streams_per_device: int = 2
    sse_reauth_seconds: float = 30.0
    web_search_provider: str = "duckduckgo"
    brave_search_api_key: str | None = None
    web_search_timeout_seconds: float = 10.0
    web_fetch_allow_private: bool = False
    context_window_tokens: int = 8192
    # Browser console served by the companion itself. Same API, same device
    # ownership model as Android; only the credential storage differs.
    web_console_enabled: bool = True
    web_session_cookie_secure: bool | None = None
    # Only peers inside these networks may set client-IP forwarding headers.
    # Empty means "trust nobody", which is correct for a directly exposed port.
    trusted_proxy_networks: str = ""
    health_cache_seconds: float = 5.0
    retention_sweep_hours: float = 12.0

    @field_validator("web_session_cookie_secure", mode="before")
    @classmethod
    def _blank_is_unset(cls, value):
        """Treat a blank value as "not configured".

        `.env` files are hand-edited, and writing `LOCAL_AGENTS_X=` to mean "leave the
        default" is the natural thing to do. Without this, an empty optional boolean
        fails validation and the companion refuses to start.
        """
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def normalized_public_url(self) -> str:
        return self.public_url.rstrip("/")

    @property
    def public_url_is_https(self) -> bool:
        return self.normalized_public_url.lower().startswith("https://")

    def cookie_secure_for(self, request_is_https: bool) -> bool:
        """Whether web-session cookies should carry the ``Secure`` attribute.

        Derived from the scheme the browser actually used, not from ``public_url``.
        A companion is commonly reached over HTTPS through the tunnel *and* over plain
        HTTP on a tailnet or loopback address; pinning ``Secure`` on would silently
        break the console on the plain-HTTP path, because the browser would refuse to
        store or return the cookie.
        """
        if self.web_session_cookie_secure is not None:
            return self.web_session_cookie_secure
        return request_is_https

    @property
    def trusted_proxies(self) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
        networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
        for raw in self.trusted_proxy_networks.split(","):
            candidate = raw.strip()
            if not candidate:
                continue
            try:
                networks.append(ipaddress.ip_network(candidate, strict=False))
            except ValueError:
                continue
        return tuple(networks)

    @property
    def admin_token_is_insecure(self) -> bool:
        token = self.admin_token.strip()
        return token == INSECURE_ADMIN_TOKEN or len(token) < 32

    def validate_admin_token(self) -> None:
        if self.allow_insecure_admin or not self.admin_token_is_insecure:
            return
        raise RuntimeError(
            "LOCAL_AGENTS_ADMIN_TOKEN must be changed to at least 32 random "
            "characters before the companion can start. For isolated local "
            "development only, set LOCAL_AGENTS_ALLOW_INSECURE_ADMIN=1."
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()

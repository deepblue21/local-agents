"""Settings parsing, including the shapes a hand-edited `.env` actually produces."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from local_agents.config import INSECURE_ADMIN_TOKEN, Settings

ROOT = Path(__file__).resolve().parents[2]


def test_blank_optional_boolean_is_treated_as_unset(monkeypatch):
    """`LOCAL_AGENTS_X=` in a .env file must not stop the companion from starting."""
    monkeypatch.setenv("LOCAL_AGENTS_WEB_SESSION_COOKIE_SECURE", "")
    settings = Settings(admin_token="a" * 40)

    assert settings.web_session_cookie_secure is None


def test_env_example_parses(monkeypatch, tmp_path):
    """Every non-comment line in .env.example must be accepted as configuration.

    Operators copy this file verbatim; a value the settings model rejects turns into a
    refusal to boot, with a validation error rather than a hint about the offending line.
    """
    for line in (ROOT / ".env.example").read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        if not name.startswith("LOCAL_AGENTS_"):
            continue
        monkeypatch.setenv(name, value)

    monkeypatch.setenv("LOCAL_AGENTS_ADMIN_TOKEN", "b" * 40)
    settings = Settings()
    settings.validate_admin_token()

    assert settings.web_console_enabled is True


def test_env_example_documents_every_setting():
    """A setting nobody can discover is a setting nobody uses."""
    documented = set(re.findall(r"^#?(LOCAL_AGENTS_[A-Z0-9_]+)=", (ROOT / ".env.example").read_text(
        encoding="utf-8"
    ), re.MULTILINE))
    # Internal knobs that have sensible defaults and are documented in ARCHITECTURE.md.
    exempt = {
        "LOCAL_AGENTS_ACCESS_TOKEN_MINUTES",
        "LOCAL_AGENTS_REFRESH_TOKEN_DAYS",
        "LOCAL_AGENTS_RETENTION_REVOKED_TOKEN_GRACE_DAYS",
        "LOCAL_AGENTS_RETENTION_RUN_EVENT_DAYS",
        "LOCAL_AGENTS_SSE_STREAMS_PER_DEVICE",
        "LOCAL_AGENTS_SSE_REAUTH_SECONDS",
        "LOCAL_AGENTS_CONTEXT_WINDOW_TOKENS",
    }
    expected = {f"LOCAL_AGENTS_{name.upper()}" for name in Settings.model_fields} - exempt

    assert expected - documented == set()


@pytest.mark.parametrize("token", ["", "short", INSECURE_ADMIN_TOKEN, "a" * 31])
def test_weak_admin_tokens_are_refused(token):
    with pytest.raises(RuntimeError, match="LOCAL_AGENTS_ADMIN_TOKEN"):
        Settings(admin_token=token).validate_admin_token()


def test_trusted_proxy_networks_parsing():
    settings = Settings(
        admin_token="a" * 40,
        trusted_proxy_networks=" 172.16.0.0/12 , 10.0.0.1 , nonsense , ",
    )
    networks = [str(item) for item in settings.trusted_proxies]

    # A malformed entry is skipped rather than failing startup, and a bare address
    # becomes a single-host network.
    assert networks == ["172.16.0.0/12", "10.0.0.1/32"]


def test_trusted_proxies_defaults_to_trusting_nobody():
    assert Settings(admin_token="a" * 40).trusted_proxies == ()


@pytest.mark.parametrize(
    ("public_url", "request_is_https", "expected"),
    [
        ("https://agents.example.test", False, False),
        ("https://agents.example.test", True, True),
        ("http://127.0.0.1:8787", True, True),
        ("http://127.0.0.1:8787", False, False),
    ],
)
def test_cookie_secure_follows_the_request_not_the_public_url(public_url, request_is_https, expected):
    settings = Settings(admin_token="a" * 40, public_url=public_url)

    assert settings.cookie_secure_for(request_is_https) is expected


@pytest.mark.parametrize("forced", [True, False])
def test_cookie_secure_can_be_forced(forced):
    settings = Settings(admin_token="a" * 40, web_session_cookie_secure=forced)

    assert settings.cookie_secure_for(not forced) is forced

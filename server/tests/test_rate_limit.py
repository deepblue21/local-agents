"""Rate limiter: client keying, proxy trust, and bucket eviction."""

from __future__ import annotations

import ipaddress

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from local_agents.rate_limit import InMemoryRateLimiter, client_key, peer_is_trusted_proxy


def make_request(path="/api/v1/pair/exchange", peer="203.0.113.5", headers=None) -> Request:
    raw_headers = [
        (key.lower().encode(), value.encode()) for key, value in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": raw_headers,
        "client": (peer, 50000) if peer else None,
        "scheme": "http",
        "server": ("testserver", 80),
    }
    return Request(scope)


def networks(*values):
    return tuple(ipaddress.ip_network(value) for value in values)


def test_forwarded_headers_are_ignored_from_an_untrusted_peer():
    request = make_request(headers={"CF-Connecting-IP": "198.51.100.9"})
    assert client_key(request) == "203.0.113.5"
    assert client_key(request, networks("192.0.2.0/24")) == "203.0.113.5"


def test_forwarded_headers_are_used_from_a_trusted_peer():
    trusted = networks("203.0.113.0/24")
    assert peer_is_trusted_proxy(make_request(), trusted) is True
    assert client_key(
        make_request(headers={"CF-Connecting-IP": "198.51.100.9"}), trusted
    ) == "198.51.100.9"


def test_x_forwarded_for_uses_the_left_most_entry():
    trusted = networks("203.0.113.0/24")
    request = make_request(headers={"X-Forwarded-For": "198.51.100.9, 203.0.113.5"})
    assert client_key(request, trusted) == "198.51.100.9"


def test_malformed_forwarded_values_fall_back_to_the_peer():
    trusted = networks("203.0.113.0/24")
    request = make_request(headers={"CF-Connecting-IP": "not-an-ip"})
    assert client_key(request, trusted) == "203.0.113.5"


def test_missing_peer_is_keyed_as_unknown():
    assert client_key(make_request(peer=None)) == "unknown"


@pytest.mark.anyio
async def test_limit_is_per_client_and_per_path():
    limiter = InMemoryRateLimiter(1)
    await limiter.check(make_request(peer="203.0.113.1"))
    with pytest.raises(HTTPException) as excinfo:
        await limiter.check(make_request(peer="203.0.113.1"))
    assert excinfo.value.status_code == 429
    assert excinfo.value.headers["Retry-After"]

    # A different client, and the same client on a different path, are unaffected.
    await limiter.check(make_request(peer="203.0.113.2"))
    await limiter.check(make_request(peer="203.0.113.1", path="/api/v1/auth/refresh"))


@pytest.mark.anyio
async def test_zero_limit_disables_throttling():
    limiter = InMemoryRateLimiter(0)
    for _ in range(5):
        await limiter.check(make_request())


@pytest.mark.anyio
async def test_elapsed_buckets_are_evicted():
    """Otherwise the map grows by one entry per distinct client address, forever."""
    limiter = InMemoryRateLimiter(5, window_seconds=0.01)
    for index in range(50):
        await limiter.check(make_request(peer=f"203.0.113.{index % 250}"))
    assert len(limiter._hits) <= 50

    import asyncio

    await asyncio.sleep(0.02)
    await limiter.check(make_request(peer="198.51.100.1"))
    assert len(limiter._hits) == 1


@pytest.mark.anyio
async def test_tracked_keys_are_capped():
    limiter = InMemoryRateLimiter(5, window_seconds=600, max_tracked_keys=10)
    for index in range(40):
        await limiter.check(make_request(peer=f"198.51.100.{index}"))
    assert len(limiter._hits) <= 10


@pytest.fixture
def anyio_backend():
    return "asyncio"

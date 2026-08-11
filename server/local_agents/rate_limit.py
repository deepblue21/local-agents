from __future__ import annotations

import asyncio
import ipaddress
import time
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status


IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network

# Headers a reverse proxy may use to report the real client address. They are only
# read when the immediate peer is itself a trusted proxy: otherwise any caller could
# rotate the header value and get a fresh rate-limit bucket for every request.
FORWARDED_HEADERS = ("cf-connecting-ip", "x-forwarded-for", "x-real-ip")


def _peer_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _peer_is_trusted(peer: str, trusted_proxies: Sequence[IpNetwork]) -> bool:
    if not trusted_proxies or not peer:
        return False
    try:
        address = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(address in network for network in trusted_proxies)


def _forwarded_client(request: Request) -> str | None:
    for header in FORWARDED_HEADERS:
        raw = request.headers.get(header)
        if not raw:
            continue
        # `X-Forwarded-For` is a client-to-proxy chain; the left-most entry is the
        # originating client as reported by the closest trusted proxy.
        candidate = raw.split(",")[0].strip()
        if not candidate:
            continue
        try:
            ipaddress.ip_address(candidate)
        except ValueError:
            continue
        return candidate
    return None


def peer_is_trusted_proxy(request: Request, trusted_proxies: Sequence[IpNetwork] = ()) -> bool:
    """Whether the immediate peer may speak for another client.

    Anything a caller sends about itself — its address, the scheme it used — is only
    believable when it arrived through a proxy the operator declared.
    """
    return _peer_is_trusted(_peer_ip(request), trusted_proxies)


def client_key(request: Request, trusted_proxies: Sequence[IpNetwork] = ()) -> str:
    peer = _peer_ip(request)
    if _peer_is_trusted(peer, trusted_proxies):
        forwarded = _forwarded_client(request)
        if forwarded:
            return forwarded
    return peer or "unknown"


@dataclass
class InMemoryRateLimiter:
    limit: int
    window_seconds: float = 60.0
    trusted_proxies: tuple[IpNetwork, ...] = ()
    max_tracked_keys: int = 10_000
    _hits: dict[tuple[str, str], deque[float]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def check(self, request: Request, bucket: str | None = None) -> None:
        if self.limit <= 0:
            return

        now = time.monotonic()
        key = (bucket or request.url.path, client_key(request, self.trusted_proxies))

        async with self._lock:
            hits = self._hits.setdefault(key, deque())
            cutoff = now - self.window_seconds
            while hits and hits[0] <= cutoff:
                hits.popleft()

            if len(hits) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (now - hits[0])))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "too many authentication attempts",
                    headers={"Retry-After": str(retry_after)},
                )

            hits.append(now)
            self._prune(now)

    def _prune(self, now: float) -> None:
        """Drop buckets whose window has fully elapsed.

        Without this the map grows once per distinct client address forever, which
        a caller behind a large address pool can turn into unbounded memory use.
        """
        cutoff = now - self.window_seconds
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            self._hits.pop(key, None)
        if len(self._hits) <= self.max_tracked_keys:
            return
        overflow = sorted(self._hits.items(), key=lambda item: item[1][-1] if item[1] else 0.0)
        for key, _ in overflow[: len(self._hits) - self.max_tracked_keys]:
            self._hits.pop(key, None)

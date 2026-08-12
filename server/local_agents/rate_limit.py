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
#
# These two are *overwritten* by the proxy on every request, so their whole value is
# the proxy's own statement about the client.
OVERWRITING_HEADERS = ("cf-connecting-ip", "x-real-ip")
# `X-Forwarded-For` is different: proxies **append** to it (nginx's
# `$proxy_add_x_forwarded_for` is the common case), so a client can seed the list by
# sending the header itself. Only the entries the infrastructure appended can be
# believed, which means reading from the right, not the left.
FORWARDED_FOR_HEADER = "x-forwarded-for"


def _peer_ip(request: Request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return ""


def _peer_is_trusted(peer: str, trusted_proxies: Sequence[IpNetwork]) -> bool:
    if not trusted_proxies or not peer:
        return False
    address = _parse_address(peer)
    return bool(address) and _in_networks(address, trusted_proxies)


def _parse_address(value: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _in_networks(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address,
    networks: Sequence[IpNetwork],
) -> bool:
    return any(address in network for network in networks)


def _forwarded_client(request: Request, trusted_proxies: Sequence[IpNetwork]) -> str | None:
    for header in OVERWRITING_HEADERS:
        address = _parse_address(request.headers.get(header) or "")
        if address:
            return str(address)

    raw = request.headers.get(FORWARDED_FOR_HEADER)
    if not raw:
        return None
    # Walk the chain right to left, discarding hops that are themselves trusted
    # proxies. The first remaining entry is the closest address the infrastructure
    # actually observed; everything to its left was supplied by the caller and must
    # not be allowed to key the rate-limit bucket.
    for entry in reversed(raw.split(",")):
        address = _parse_address(entry)
        if not address:
            continue
        if _in_networks(address, trusted_proxies):
            continue
        return str(address)
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
        forwarded = _forwarded_client(request, trusted_proxies)
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
    _next_sweep: float = 0.0

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

            over_limit = len(hits) >= self.limit
            if not over_limit:
                hits.append(now)

            # Sweeping is O(number of tracked clients), so it runs on a timer rather
            # than on every request. The cap is still enforced immediately, which is
            # what actually bounds memory; the timer only reclaims idle buckets.
            # Throttled requests sweep too, or a flood of 429s would never reclaim.
            if now >= self._next_sweep or len(self._hits) > self.max_tracked_keys:
                self._prune(now)

            if over_limit:
                retry_after = max(1, int(self.window_seconds - (now - hits[0])))
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "too many authentication attempts",
                    headers={"Retry-After": str(retry_after)},
                )

    def _prune(self, now: float) -> None:
        """Drop buckets whose window has fully elapsed.

        Without this the map grows once per distinct client address forever, which
        a caller behind a large address pool can turn into unbounded memory use.
        """
        self._next_sweep = now + self.window_seconds
        cutoff = now - self.window_seconds
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] <= cutoff]
        for key in stale:
            self._hits.pop(key, None)
        if len(self._hits) <= self.max_tracked_keys:
            return
        overflow = sorted(self._hits.items(), key=lambda item: item[1][-1] if item[1] else 0.0)
        for key, _ in overflow[: len(self._hits) - self.max_tracked_keys]:
            self._hits.pop(key, None)

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status


def _client_key(request: Request) -> str:
    cloudflare_ip = request.headers.get("cf-connecting-ip")
    if cloudflare_ip:
        return cloudflare_ip.strip()
    if request.client:
        return request.client.host
    return "unknown"


@dataclass
class InMemoryRateLimiter:
    limit: int
    window_seconds: float = 60.0
    _hits: dict[tuple[str, str], deque[float]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def check(self, request: Request, bucket: str | None = None) -> None:
        if self.limit <= 0:
            return

        now = time.monotonic()
        key = (bucket or request.url.path, _client_key(request))

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

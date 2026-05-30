"""Tiny WebSocket fan-out manager."""

from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any

from fastapi import WebSocket


class Channel:
    def __init__(self, name: str) -> None:
        self.name = name
        self.clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def add(self, ws: WebSocket) -> None:
        async with self._lock:
            self.clients.add(ws)

    async def remove(self, ws: WebSocket) -> None:
        async with self._lock:
            self.clients.discard(ws)

    async def broadcast(self, payload: Any) -> None:
        data = json.dumps(payload, default=str)
        dead: list[WebSocket] = []
        for ws in list(self.clients):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.remove(ws)


class Hub:
    def __init__(self) -> None:
        self._channels: dict[str, Channel] = defaultdict(lambda: Channel(""))

    def channel(self, name: str) -> Channel:
        ch = self._channels.get(name)
        if ch is None:
            ch = Channel(name)
            self._channels[name] = ch
        return ch

    async def broadcast(self, channel: str, payload: Any) -> None:
        await self.channel(channel).broadcast(payload)


hub = Hub()

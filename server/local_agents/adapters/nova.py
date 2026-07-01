from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .base import AdapterChunk, ModelAdapter


class NovaAdapter(ModelAdapter):
    def __init__(self, base_url: str, token: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}

    async def list_models(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=5, headers=self.headers) as client:
            response = await client.get(f"{self.base_url}/models")
            response.raise_for_status()
            raw = response.json().get("data", response.json().get("models", []))
            return [
                {
                    "id": item.get("id", str(item)),
                    "name": item.get("name", item.get("id", str(item))),
                    "provider": "nova",
                    "capabilities": ["chat", "stream"],
                }
                for item in raw
            ]

    async def stream_chat(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterator[AdapterChunk]:
        payload = {"model": model, "messages": messages, "stream": True}
        async with httpx.AsyncClient(timeout=None, headers=self.headers) as client:
            async with client.stream(
                "POST", f"{self.base_url}/chat/completions", json=payload
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    value = line[5:].strip()
                    if value == "[DONE]":
                        yield AdapterChunk(done=True)
                        return
                    data = json.loads(value)
                    delta = data.get("choices", [{}])[0].get("delta", {})
                    yield AdapterChunk(content=delta.get("content") or "")

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .base import AdapterChunk, ModelAdapter


class OllamaAdapter(ModelAdapter):
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    async def list_models(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            return [
                {
                    "id": item["name"],
                    "name": item["name"],
                    "provider": "ollama",
                    "capabilities": ["chat", "stream", "tools", "agent"],
                }
                for item in response.json().get("models", [])
            ]

    async def stream_chat(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterator[AdapterChunk]:
        payload: dict = {
            "model": model,
            "messages": messages,
            "stream": True,
            # Thinking-capable local models can otherwise spend the whole response
            # budget in Ollama's hidden `thinking` field and return no final
            # content. The app is an operational console and must never expose raw
            # chain-of-thought, so request final-answer-only streams by default.
            "think": False,
        }
        if tools:
            payload["tools"] = tools
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    message = data.get("message") or {}
                    yield AdapterChunk(
                        content=message.get("content") or "",
                        thinking=message.get("thinking") or "",
                        tool_calls=message.get("tool_calls") or [],
                        done=bool(data.get("done")),
                    )

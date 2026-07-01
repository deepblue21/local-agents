from __future__ import annotations

import pytest

from local_agents.adapters import ollama as ollama_module


class FakeStreamResponse:
    def __init__(self, lines: list[str]):
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def raise_for_status(self) -> None:
        return None

    async def aiter_lines(self):
        for line in self._lines:
            yield line


class FakeAsyncClient:
    captured_payload: dict | None = None

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def stream(self, method: str, url: str, json: dict):
        FakeAsyncClient.captured_payload = json
        return FakeStreamResponse(
            [
                '{"message":{"content":"TEST_OK"},"done":false}',
                '{"message":{},"done":true}',
            ]
        )


@pytest.mark.asyncio
async def test_ollama_stream_disables_hidden_thinking(monkeypatch):
    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", FakeAsyncClient)
    adapter = ollama_module.OllamaAdapter("http://ollama")

    chunks = [
        chunk
        async for chunk in adapter.stream_chat(
            model="thinking-model",
            messages=[{"role": "user", "content": "reply directly"}],
        )
    ]

    assert "".join(chunk.content for chunk in chunks) == "TEST_OK"
    assert FakeAsyncClient.captured_payload is not None
    assert FakeAsyncClient.captured_payload["think"] is False

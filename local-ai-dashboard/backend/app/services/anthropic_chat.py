"""Anthropic Claude streaming chat — used by the chat playground."""

from __future__ import annotations

import time
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from ..config import get_settings


_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        cfg = get_settings()
        _client = AsyncAnthropic(api_key=cfg.anthropic_api_key or None)
    return _client


async def stream_chat(
    messages: list[dict],
    system: str | None,
    model: str | None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
    top_p: float = 0.9,
) -> AsyncIterator[dict]:
    """Yield streaming events.

    Each yielded dict is one of:
        {"type": "delta",  "text": "..."}
        {"type": "metrics","tps": 142.4, "time": 2.71, "tokens": 386, "model": "...", "nodes": [...]}
        {"type": "done"}
    """
    cfg = get_settings()
    use_model = model or cfg.anthropic_model
    client = _get_client()

    # Filter to user/assistant turns; Anthropic takes `system` separately.
    api_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m["role"] in ("user", "assistant")
    ]

    started = time.perf_counter()
    full_text_chars = 0

    if not cfg.anthropic_api_key:
        # No key — emit a friendly synthetic response so the UI still works.
        synthetic = (
            "_(No `ANTHROPIC_API_KEY` configured — set one in `.env` "
            "to get real Claude responses.)_"
        )
        for chunk in synthetic.split(" "):
            yield {"type": "delta", "text": chunk + " "}
        elapsed = max(0.01, time.perf_counter() - started)
        tokens = max(1, len(synthetic) // 4)
        yield {
            "type": "metrics",
            "tps": round(tokens / elapsed, 1),
            "time": round(elapsed, 2),
            "tokens": tokens,
            "model": use_model,
            "nodes": [],
        }
        yield {"type": "done"}
        return

    async with client.messages.stream(
        model=use_model,
        messages=api_messages,
        system=system or "You are a helpful assistant. Be concise and accurate.",
        max_tokens=max_tokens,
        temperature=temperature,
        top_p=top_p,
    ) as stream:
        async for text in stream.text_stream:
            full_text_chars += len(text)
            yield {"type": "delta", "text": text}
        final = await stream.get_final_message()

    elapsed = max(0.01, time.perf_counter() - started)
    out_tokens = final.usage.output_tokens if final and final.usage else max(1, full_text_chars // 4)
    yield {
        "type": "metrics",
        "tps": round(out_tokens / elapsed, 1),
        "time": round(elapsed, 2),
        "tokens": out_tokens,
        "model": final.model if final else use_model,
        "nodes": [],
    }
    yield {"type": "done"}

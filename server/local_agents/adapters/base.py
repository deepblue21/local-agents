from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class AdapterChunk:
    content: str = ""
    thinking: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    done: bool = False


class ModelAdapter:
    async def list_models(self) -> list[dict]:
        raise NotImplementedError

    async def stream_chat(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict] | None = None,
    ) -> AsyncIterator[AdapterChunk]:
        raise NotImplementedError

"""Async Ollama client — talks to localhost:11434."""

from __future__ import annotations

import json
import re
from typing import Any, AsyncIterator

import httpx

from ..config import get_settings


_FAMILY_HINTS = {
    "deepseek": "DeepSeek",
    "qwen": "Qwen",
    "llama": "Meta",
    "gemma": "Gemma",
    "mistral": "Mistral",
    "phi": "Microsoft",
    "hermes": "NousRes",
    "command": "Cohere",
    "yi": "01.AI",
}


def _family(name: str) -> str:
    base = name.split(":")[0].split("/")[-1].lower()
    for key, label in _FAMILY_HINTS.items():
        if key in base:
            return label
    return base.split("-")[0].capitalize() or "Local"


def _params_label(name: str, parameter_size: str | None) -> str:
    if parameter_size:
        return parameter_size
    m = re.search(r"(\d+(?:\.\d+)?[bB])", name)
    return m.group(1).upper() if m else "—"


def _short_id(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower() or "model"


class OllamaClient:
    def __init__(self) -> None:
        self.base = get_settings().ollama_base.rstrip("/")
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(60, read=None))

    async def aclose(self) -> None:
        await self._client.aclose()

    # ── Model registry ───────────────────────────────────────────────────
    async def list_models(self) -> list[dict[str, Any]]:
        try:
            r = await self._client.get(f"{self.base}/api/tags")
            r.raise_for_status()
            data = r.json()
        except Exception:
            return []
        models = []
        for m in data.get("models", []):
            name = m["name"]
            details = m.get("details", {}) or {}
            size_gb = m.get("size", 0) / 1024**3
            models.append(
                {
                    "id": _short_id(name),
                    "name": name,
                    "family": details.get("family") or _family(name),
                    "params": _params_label(name, details.get("parameter_size")),
                    "quant": details.get("quantization_level", "—"),
                    "size": round(size_gb, 2),
                    "totalLayers": int(details.get("num_layers", 32) or 32),
                    "contextWindow": int(details.get("context_length", 4096) or 4096),
                    "vramFootprint": round(size_gb, 1),
                    "lastUsed": m.get("modified_at", ""),
                }
            )
        return models

    async def show(self, name: str) -> dict[str, Any]:
        r = await self._client.post(f"{self.base}/api/show", json={"name": name})
        r.raise_for_status()
        return r.json()

    async def delete(self, name: str) -> None:
        # Ollama uses DELETE with a JSON body.
        r = await self._client.request(
            "DELETE", f"{self.base}/api/delete", json={"name": name}
        )
        r.raise_for_status()

    async def pull(self, name: str) -> AsyncIterator[dict[str, Any]]:
        """Yield progress events as Ollama streams them."""
        async with self._client.stream(
            "POST", f"{self.base}/api/pull", json={"name": name, "stream": True}
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.strip():
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    async def ps(self) -> list[dict[str, Any]]:
        try:
            r = await self._client.get(f"{self.base}/api/ps")
            r.raise_for_status()
            return r.json().get("models", [])
        except Exception:
            return []

    # ── Search the public registry (HuggingFace) ────────────────────────
    async def search_hf(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        """Best-effort search of HuggingFace model hub for GGUF models."""
        q = query.strip() or "gguf"
        try:
            r = await self._client.get(
                "https://huggingface.co/api/models",
                params={"search": q, "filter": "gguf", "limit": limit, "full": "true"},
                timeout=10,
            )
            r.raise_for_status()
            items = r.json()
        except Exception:
            return []
        out = []
        for it in items:
            model_id = it.get("modelId") or it.get("id") or ""
            if not model_id:
                continue
            siblings = it.get("siblings") or []
            gguf_sizes = [s.get("size") for s in siblings if (s.get("rfilename", "").lower().endswith(".gguf")) and s.get("size")]
            size_gb = round((max(gguf_sizes) if gguf_sizes else 0) / 1024**3, 2)
            out.append(
                {
                    "name": model_id,
                    "family": _family(model_id),
                    "params": _params_label(model_id, None),
                    "size": size_gb,
                    "quant": "gguf",
                    "downloads": str(it.get("downloads", 0)),
                    "desc": (it.get("description") or "").strip()[:200],
                }
            )
        return out

    async def chat_stream(
        self,
        model_name: str,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.9,
    ) -> AsyncIterator[dict]:
        """Yield streaming chat events from Ollama's /api/chat endpoint."""
        ollama_messages = [
            {"role": m["role"], "content": m["content"]}
            for m in messages
            if m["role"] in ("user", "assistant", "system")
        ]

        options = {
            "temperature": temperature,
            "top_p": top_p,
            "num_predict": max_tokens,
        }

        async with self._client.stream(
            "POST",
            f"{self.base}/api/chat",
            json={
                "model": model_name,
                "messages": ollama_messages,
                "options": options,
                "stream": True,
            }
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if "message" in data and "content" in data["message"]:
                    yield {"type": "delta", "text": data["message"]["content"]}

                if data.get("done"):
                    eval_duration = data.get("eval_duration") or 0
                    eval_count = data.get("eval_count") or 0
                    total_duration = data.get("total_duration") or 0

                    tps = round(eval_count * 1e9 / eval_duration, 1) if eval_duration > 0 else 0.0
                    elapsed = round(total_duration / 1e9, 2) if total_duration > 0 else 0.0

                    yield {
                        "type": "metrics",
                        "tps": tps,
                        "time": elapsed,
                        "tokens": eval_count,
                        "model": model_name,
                        "nodes": [],
                    }
                    yield {"type": "done"}


_singleton: OllamaClient | None = None


def get_ollama() -> OllamaClient:
    global _singleton
    if _singleton is None:
        _singleton = OllamaClient()
    return _singleton

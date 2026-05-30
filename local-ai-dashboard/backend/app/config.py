"""Runtime configuration loaded from environment / .env."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class NodeSpec(BaseModel):
    """One node in the cluster as declared in NODES_JSON.

    `host:port` is reached for `/agent/telemetry`. For the master node,
    the local in-process collector is used regardless of host.
    """

    id: str
    role: str = "worker"  # "master" | "worker"
    name: str
    host: str = "127.0.0.1"
    port: int = 7879
    icon: str = "Server"
    os: str = "auto"  # "auto" — let the agent fill in


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Master HTTP server
    host: str = "0.0.0.0"
    port: int = 7878

    # Storage
    db_path: str = "data/dashboard.db"
    data_dir: str = "data"

    # Cluster
    nodes_json: str = "[]"

    # Chat provider
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Ollama
    ollama_base: str = "http://localhost:11434"

    # Vector store / RAG
    qdrant_url: str = "http://localhost:6333"
    kb_collection: str = "kb"
    embedding_model: str = "BAAI/bge-large-en-v1.5"
    chunk_size: int = 600
    chunk_overlap: int = 60

    # Energy
    price_per_kwh: float = 0.18
    carbon_per_kwh: float = 0.42
    energy_poll_seconds: int = 10

    # Worker mode
    worker_host: str = "0.0.0.0"
    worker_port: int = 7879

    # ── Derived ────────────────────────────────────────────────────────────
    @property
    def nodes(self) -> List[NodeSpec]:
        try:
            raw = json.loads(self.nodes_json)
        except json.JSONDecodeError:
            raw = []
        if not raw:
            # Sane fallback: just localhost as master.
            return [
                NodeSpec(
                    id="n1",
                    role="master",
                    name="localhost",
                    host="127.0.0.1",
                    port=self.worker_port,
                    icon="Monitor",
                )
            ]
        return [NodeSpec(**n) for n in raw]

    @property
    def data_path(self) -> Path:
        p = Path(self.data_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def db_file(self) -> Path:
        p = Path(self.db_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

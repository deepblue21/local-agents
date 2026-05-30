"""Pydantic schemas mirroring the React `useCluster` state."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class CPU(BaseModel):
    name: str
    cores: str
    pct: float
    temp: float


class RAM(BaseModel):
    name: str
    used: float
    total: float


class Accelerator(BaseModel):
    kind: str  # "gpu" | "soc"
    name: str
    vramUsed: float
    vramTotal: float
    pct: float
    temp: float
    isVramTight: bool = False
    powerW: float = 0.0


class Node(BaseModel):
    id: str
    role: str
    name: str
    os: str
    icon: str
    host: str
    latency: float = 0
    cpu: CPU
    ram: RAM
    accelerators: list[Accelerator] = []
    unifiedTotal: float
    unifiedUsed: float
    task: str = "idle"
    layersHosted: int = 0
    status: str = "online"
    throughput: float = 0
    runningModelId: str | None = None
    runningModelName: str | None = None
    powerW: float = 0.0


class Totals(BaseModel):
    memTotal: float
    memUsed: float
    ramTotal: float
    ramUsed: float
    tps: float
    online: int


class Model(BaseModel):
    id: str
    name: str
    family: str
    params: str
    quant: str
    size: float
    totalLayers: int
    contextWindow: int
    vramFootprint: float
    lastUsed: str = ""


class Deployment(BaseModel):
    activeModelId: str | None = None
    strategy: str = "shard"
    pinnedNodeId: str | None = None
    perNode: dict[str, str] = Field(default_factory=dict)


class ClusterState(BaseModel):
    nodes: list[Node]
    totals: Totals
    model: Model | None = None
    installedModels: list[Model] = []
    deployment: Deployment = Field(default_factory=Deployment)


class PromptTemplate(BaseModel):
    id: str
    name: str
    tag: str
    icon: str
    sys: str


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant" | "system"
    content: str
    metrics: dict[str, Any] | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    template_id: str | None = None
    max_tokens: int = 2048
    temperature: float = 0.7
    top_p: float = 0.9
    session_id: str | None = None


class KBDoc(BaseModel):
    id: str
    name: str
    source: str  # "markdown" | "pdf" | "obsidian"
    size: str
    chunks: int
    status: str  # "indexing" | "active"
    progress: float = 0

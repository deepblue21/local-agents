from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CommandType(StrEnum):
    PAUSE = "pause"
    RESUME = "resume"
    CANCEL = "cancel"
    STEER = "steer"


class PairingExchange(BaseModel):
    code: str = Field(min_length=20, max_length=256)
    device_name: str = Field(min_length=1, max_length=80)


class TokenRefresh(BaseModel):
    refresh_token: str = Field(min_length=20)


class TokenBundle(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    device_id: str


class SessionCreate(BaseModel):
    title: str = Field(default="Yeni sohbet", min_length=1, max_length=120)


class SessionOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    tool_count: int = 0


class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    created_at: datetime


class SessionContextOut(BaseModel):
    session_id: str
    token_estimate: int
    max_tokens: int
    usage_ratio: float
    usage_percent: int
    message_count: int
    summarized_message_count: int
    summary_token_estimate: int
    unsummarized_token_estimate: int
    has_summary: bool
    can_compress: bool


class ContextCompress(BaseModel):
    model: str | None = None
    provider: str = Field(default="ollama", pattern="^(ollama|nova|openai_compatible)$")


class RunCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=100_000)
    model: str | None = None
    provider: str = Field(default="ollama", pattern="^(ollama|nova|openai_compatible)$")


class RunOut(BaseModel):
    id: str
    session_id: str
    status: RunStatus
    model: str
    provider: str
    prompt: str
    created_at: datetime
    updated_at: datetime


class RunCommand(BaseModel):
    command: CommandType
    instruction: str | None = Field(default=None, max_length=20_000)


class EventOut(BaseModel):
    seq: int
    run_id: str
    type: str
    payload: dict
    created_at: datetime


class ModelOut(BaseModel):
    id: str
    name: str
    provider: str
    capabilities: list[str] = Field(default_factory=list)


class PairingOut(BaseModel):
    code: str
    expires_at: datetime
    pairing_uri: str
    qr_data_url: str

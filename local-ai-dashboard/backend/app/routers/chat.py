"""Chat playground backend — Anthropic stream + sessions + prompt templates."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..db import get_conn
from ..schemas import ChatMessage, ChatRequest, PromptTemplate
from ..services.anthropic_chat import stream_chat

router = APIRouter(prefix="/api", tags=["chat"])


# ── Prompt templates ─────────────────────────────────────────────────────


@router.get("/prompts", response_model=list[PromptTemplate])
def list_prompts() -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, name, tag, icon, sys FROM prompts ORDER BY created_at"
    ).fetchall()
    return [dict(r) for r in rows]


class PromptIn(BaseModel):
    id: str | None = None
    name: str
    tag: str = "general"
    icon: str = "Sparkles"
    sys: str


@router.post("/prompts", response_model=PromptTemplate)
def create_prompt(body: PromptIn) -> dict:
    pid = body.id or f"tpl-{uuid.uuid4().hex[:8]}"
    get_conn().execute(
        "INSERT OR REPLACE INTO prompts (id, name, tag, icon, sys) VALUES (?, ?, ?, ?, ?)",
        (pid, body.name, body.tag, body.icon, body.sys),
    )
    return {"id": pid, **body.model_dump(exclude={"id"})}


@router.patch("/prompts/{prompt_id}", response_model=PromptTemplate)
def update_prompt(prompt_id: str, body: PromptIn) -> dict:
    cur = get_conn().execute("SELECT 1 FROM prompts WHERE id=?", (prompt_id,)).fetchone()
    if not cur:
        raise HTTPException(status_code=404, detail="prompt not found")
    get_conn().execute(
        "UPDATE prompts SET name=?, tag=?, icon=?, sys=? WHERE id=?",
        (body.name, body.tag, body.icon, body.sys, prompt_id),
    )
    return {"id": prompt_id, **body.model_dump(exclude={"id"})}


@router.delete("/prompts/{prompt_id}")
def delete_prompt(prompt_id: str) -> dict:
    get_conn().execute("DELETE FROM prompts WHERE id=?", (prompt_id,))
    return {"deleted": prompt_id}


# ── Chat streaming ───────────────────────────────────────────────────────


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """SSE stream — each line is one JSON event."""
    # Resolve system prompt from the template (if any).
    system = None
    if req.template_id:
        row = get_conn().execute(
            "SELECT sys FROM prompts WHERE id=?", (req.template_id,)
        ).fetchone()
        if row:
            system = row["sys"]
    if system is None:
        # If the first message is a system message, use that.
        for m in req.messages:
            if m.role == "system":
                system = m.content
                break

    session_id = req.session_id or f"sess-{uuid.uuid4().hex[:8]}"

    async def gen():
        full_text = ""
        last_metrics = None
        async for event in stream_chat(
            messages=[m.model_dump() for m in req.messages],
            system=system,
            model=None,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            top_p=req.top_p,
        ):
            if event["type"] == "delta":
                full_text += event["text"]
            elif event["type"] == "metrics":
                last_metrics = {k: v for k, v in event.items() if k != "type"}
            yield f"data: {json.dumps(event)}\n\n"

        # Persist messages.
        conn = get_conn()
        with conn:
            conn.execute(
                "INSERT OR IGNORE INTO chat_sessions (id, title, template) VALUES (?, ?, ?)",
                (session_id, (req.messages[0].content if req.messages else "")[:80], req.template_id),
            )
            for m in req.messages:
                if m.role != "user":
                    continue
                conn.execute(
                    "INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)",
                    (session_id, m.role, m.content),
                )
            conn.execute(
                "INSERT INTO chat_messages (session_id, role, content, metrics_json) "
                "VALUES (?, 'assistant', ?, ?)",
                (session_id, full_text, json.dumps(last_metrics) if last_metrics else None),
            )

    return StreamingResponse(gen(), media_type="text/event-stream")


# ── Sessions ─────────────────────────────────────────────────────────────


@router.get("/chat/sessions")
def list_sessions() -> list[dict]:
    rows = get_conn().execute(
        "SELECT id, title, template, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


@router.get("/chat/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    row = get_conn().execute(
        "SELECT id, title, template FROM chat_sessions WHERE id=?", (session_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="session not found")
    messages = get_conn().execute(
        "SELECT role, content, metrics_json FROM chat_messages "
        "WHERE session_id=? ORDER BY id",
        (session_id,),
    ).fetchall()
    return {
        **dict(row),
        "messages": [
            {
                "role": m["role"],
                "content": m["content"],
                "metrics": json.loads(m["metrics_json"]) if m["metrics_json"] else None,
            }
            for m in messages
        ],
    }


@router.delete("/chat/sessions/{session_id}")
def delete_session(session_id: str) -> dict:
    get_conn().execute("DELETE FROM chat_sessions WHERE id=?", (session_id,))
    return {"deleted": session_id}

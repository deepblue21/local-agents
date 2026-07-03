from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable

from .adapters.base import ModelAdapter
from .context import build_model_messages, context_stats, estimate_message_tokens
from .database import Database
from .models import CommandType, RunStatus
from .runner_client import RUNNER_TOOL_SCHEMAS, RunnerClient
from .web_tools import WebToolClient


TERMINAL = {RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED}
GENERIC_AGENT_ERROR = "agent execution failed"
GENERIC_TOOL_ERROR = "tool execution failed"
logger = logging.getLogger(__name__)


class AgentPublicError(RuntimeError):
    """Run failure message that is safe to persist and show to the controller."""


class AgentManager:
    def __init__(
        self,
        db: Database,
        runner: RunnerClient,
        adapters: dict[str, ModelAdapter],
        default_model: str,
        web_tools: WebToolClient | None = None,
        context_window_tokens: int = 8192,
        on_event: Callable[[str], None] | None = None,
    ):
        self.db = db
        self.runner = runner
        self.adapters = adapters
        self.default_model = default_model
        self.web_tools = web_tools
        self.context_window_tokens = context_window_tokens
        self._on_event = on_event or (lambda _: None)
        self._wake = asyncio.Event()
        self._worker: asyncio.Task | None = None
        self._active: dict[str, asyncio.Task] = {}

    async def start(self) -> None:
        if not self._worker:
            self._worker = asyncio.create_task(self._loop(), name="local-agents-run-queue")

    async def stop(self) -> None:
        if self._worker:
            self._worker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._worker
            self._worker = None
        for task in self._active.values():
            task.cancel()

    def notify(self) -> None:
        self._wake.set()

    def _add_event(self, run_id: str, event_type: str, payload: dict) -> int:
        seq = self.db.add_event(run_id, event_type, payload)
        self._on_event(run_id)
        return seq

    async def command(self, run_id: str, command: CommandType, instruction: str | None) -> dict:
        run = self.db.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        status = RunStatus(run["status"])
        if status in TERMINAL:
            return run
        if command == CommandType.CANCEL:
            self.db.set_run_status(run_id, RunStatus.CANCELLED)
            self._add_event(run_id, "run.cancelled", {})
            task = self._active.get(run_id)
            if task:
                task.cancel()
        elif command == CommandType.PAUSE:
            self.db.set_run_status(run_id, RunStatus.PAUSED)
            self._add_event(run_id, "run.paused", {"mode": "after_current_step"})
        elif command == CommandType.RESUME:
            if run_id not in self._active:
                self.db.set_run_status(run_id, RunStatus.QUEUED)
            else:
                self.db.set_run_status(run_id, RunStatus.RUNNING)
            self._add_event(run_id, "run.resumed", {})
            self.notify()
        elif command == CommandType.STEER:
            if not instruction or not instruction.strip():
                raise ValueError("steer requires an instruction")
            self.db.set_steering(run_id, instruction.strip())
            self._add_event(run_id, "steering.accepted", {"instruction": instruction.strip()})
        return self.db.get_run(run_id)

    def context_status(self, session_id: str) -> dict:
        messages = self.db.list_messages(session_id)
        context = self.db.get_session_context(session_id)
        return context_stats(
            session_id=session_id,
            messages=messages,
            context=context,
            max_tokens=self.context_window_tokens,
        ).as_dict()

    async def compress_session(
        self,
        session_id: str,
        *,
        model: str | None = None,
        provider: str = "ollama",
    ) -> dict:
        if not self.db.get_session(session_id):
            raise KeyError(session_id)
        adapter = self.adapters.get(provider)
        if not adapter:
            raise ValueError("provider is not configured")
        messages = self.db.list_messages(session_id)
        if not messages:
            return self.context_status(session_id)
        existing = self.db.get_session_context(session_id)
        summarized_count = min(
            int(existing.get("summarized_message_count") or 0) if existing else 0,
            len(messages),
        )
        if existing and existing.get("summary") and summarized_count >= len(messages):
            return self.context_status(session_id)
        summary = await self._summarize_messages(
            adapter=adapter,
            model=model or self.default_model,
            existing_summary=str(existing.get("summary") or "") if existing else "",
            messages=messages[summarized_count:],
        )
        self.db.upsert_session_context(
            session_id=session_id,
            summary=summary,
            summarized_message_count=len(messages),
            source_token_estimate=estimate_message_tokens(messages),
        )
        return self.context_status(session_id)

    async def _loop(self) -> None:
        while True:
            run = self.db.next_queued_run()
            if not run:
                self._wake.clear()
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=1.0)
                except TimeoutError:
                    pass
                continue
            task = asyncio.create_task(self._execute(run), name=f"run-{run['id']}")
            self._active[run["id"]] = task
            try:
                await task
            except asyncio.CancelledError:
                current = self.db.get_run(run["id"])
                if current and current["status"] != RunStatus.CANCELLED:
                    raise
            finally:
                self._active.pop(run["id"], None)

    async def _wait_if_paused(self, run_id: str) -> bool:
        while True:
            row = self.db.get_run(run_id)
            if not row or row["status"] == RunStatus.CANCELLED:
                return False
            if row["status"] != RunStatus.PAUSED:
                return True
            await asyncio.sleep(0.3)

    async def _execute(self, run: dict) -> None:
        run_id = run["id"]
        adapter = self.adapters.get(run["provider"])
        if not adapter:
            self.db.set_run_status(run_id, RunStatus.FAILED, "provider unavailable")
            self._add_event(run_id, "run.failed", {"error": "provider unavailable"})
            return
        self.db.set_run_status(run_id, RunStatus.RUNNING)
        self._add_event(run_id, "run.started", {"model": run["model"]})
        messages = self._model_messages(run["session_id"])
        self._add_event(run_id, "context.status", self.context_status(run["session_id"]))
        try:
            final_text = await self._agent_loop(run, adapter, messages)
            current = self.db.get_run(run_id)
            if not current or current["status"] == RunStatus.CANCELLED:
                return
            self.db.add_message(run["session_id"], "assistant", final_text)
            self.db.set_run_status(run_id, RunStatus.COMPLETED)
            self._add_event(run_id, "assistant.final", {"content": final_text})
            self._add_event(run_id, "run.completed", {})
        except asyncio.CancelledError:
            raise
        except AgentPublicError as exc:
            message = str(exc)
            self.db.set_run_status(run_id, RunStatus.FAILED, message)
            self._add_event(run_id, "run.failed", {"error": message})
        except Exception as exc:
            logger.exception("Agent run %s failed", run_id)
            self.db.set_run_status(run_id, RunStatus.FAILED, GENERIC_AGENT_ERROR)
            self._add_event(
                run_id,
                "run.failed",
                {"error": GENERIC_AGENT_ERROR, "error_type": exc.__class__.__name__},
            )

    async def _agent_loop(
        self,
        run: dict,
        adapter: ModelAdapter,
        messages: list[dict],
    ) -> str:
        run_id = run["id"]
        supports_tools = run["provider"] == "ollama"
        for round_index in range(8):
            if not await self._wait_if_paused(run_id):
                return ""
            steering = self.db.pop_steering(run_id)
            if steering:
                messages.append({"role": "user", "content": f"Additional direction: {steering}"})
            content_parts: list[str] = []
            tool_calls: list[dict] = []
            thinking_started = False
            async for chunk in adapter.stream_chat(
                model=run["model"],
                messages=messages,
                tools=self._tool_schemas() if supports_tools else None,
            ):
                current = self.db.get_run(run_id)
                if not current or current["status"] == RunStatus.CANCELLED:
                    raise asyncio.CancelledError
                if chunk.thinking and not thinking_started:
                    thinking_started = True
                    self._add_event(run_id, "run.thinking", {"active": True})
                if chunk.content:
                    content_parts.append(chunk.content)
                    self._add_event(run_id, "assistant.delta", {"content": chunk.content})
                tool_calls.extend(chunk.tool_calls)
            content = "".join(content_parts)
            assistant_message: dict = {"role": "assistant", "content": content}
            if tool_calls:
                assistant_message["tool_calls"] = tool_calls
            messages.append(assistant_message)
            if not tool_calls:
                return content or "(boş yanıt)"
            for call in tool_calls:
                if not await self._wait_if_paused(run_id):
                    return ""
                function = call.get("function") or {}
                name = function.get("name") or "unknown"
                arguments = function.get("arguments") or {}
                if isinstance(arguments, str):
                    arguments = json.loads(arguments)
                self._add_event(
                    run_id,
                    "tool.started",
                    {"name": name, "arguments": arguments, "round": round_index + 1},
                )
                try:
                    result = await self._call_tool(name, arguments)
                    self._add_event(run_id, "tool.finished", {"name": name, "result": result})
                    self._add_source_events(run_id, name, result)
                except Exception as exc:
                    logger.exception("Tool %s failed for run %s", name, run_id)
                    result = {"ok": False, "error": GENERIC_TOOL_ERROR}
                    self._add_event(
                        run_id,
                        "tool.failed",
                        {
                            "name": name,
                            "error": GENERIC_TOOL_ERROR,
                            "error_type": exc.__class__.__name__,
                        },
                    )
                messages.append(
                    {"role": "tool", "tool_name": name, "content": json.dumps(result, ensure_ascii=False)}
                )
        raise AgentPublicError("agent stopped after reaching the 8-round tool limit")

    def _model_messages(self, session_id: str) -> list[dict]:
        messages = self.db.list_messages(session_id)
        return build_model_messages(messages, self.db.get_session_context(session_id))

    async def _summarize_messages(
        self,
        *,
        adapter: ModelAdapter,
        model: str,
        existing_summary: str,
        messages: list[dict],
    ) -> str:
        content_parts: list[str] = []
        async for chunk in adapter.stream_chat(
            model=model,
            messages=self._summary_prompt(existing_summary, messages),
            tools=None,
        ):
            content_parts.append(chunk.content)
        summary = "".join(content_parts).strip()
        if summary:
            return summary
        return self._fallback_summary(existing_summary, messages)

    def _summary_prompt(self, existing_summary: str, messages: list[dict]) -> list[dict]:
        transcript = "\n\n".join(
            f"{item['role'].upper()}:\n{item['content']}" for item in messages
        )
        prior = existing_summary.strip() or "No previous summary."
        return [
            {
                "role": "system",
                "content": (
                    "Compress this Local_Agents conversation for future agent runs. "
                    "Preserve goals, constraints, decisions, files, tool outcomes, and "
                    "open next steps. Do not include hidden chain-of-thought. Return only "
                    "a concise operational memory summary."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Previous memory summary:\n{prior}\n\n"
                    f"New conversation segment:\n{transcript}"
                ),
            },
        ]

    def _fallback_summary(self, existing_summary: str, messages: list[dict]) -> str:
        tail = "\n".join(
            f"- {item['role']}: {str(item['content'])[:500]}" for item in messages[-8:]
        )
        if existing_summary.strip():
            return f"{existing_summary.strip()}\n\nRecent unsummarized messages:\n{tail}"
        return f"Recent conversation messages:\n{tail}"

    def _tool_schemas(self) -> list[dict]:
        schemas = list(RUNNER_TOOL_SCHEMAS)
        if self.web_tools and self.web_tools.enabled:
            schemas.extend(self.web_tools.schemas)
        return schemas

    async def _call_tool(self, name: str, arguments: dict) -> dict:
        if self.web_tools and self.web_tools.handles(name):
            return await self.web_tools.call(name, arguments)
        return await self.runner.call(name, arguments)

    def _add_source_events(self, run_id: str, tool_name: str, result: dict) -> None:
        if tool_name == "web_search":
            for index, item in enumerate(result.get("results") or [], start=1):
                self._add_event(
                    run_id,
                    "source.found",
                    {
                        "title": item.get("title") or item.get("url") or "Untitled source",
                        "url": item.get("url") or "",
                        "snippet": item.get("snippet") or "",
                        "rank": index,
                        "provider": result.get("provider"),
                    },
                )
        elif tool_name == "fetch_url":
            self._add_event(
                run_id,
                "source.fetched",
                {
                    "title": result.get("title") or result.get("url") or "Fetched source",
                    "url": result.get("url") or "",
                    "content_type": result.get("content_type") or "",
                    "truncated": bool(result.get("truncated")),
                },
            )

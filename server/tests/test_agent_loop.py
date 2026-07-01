"""Unit tests for the agent run executor.

The executor is driven directly with in-memory fakes for the model adapter and the
runner client, so the full tool-calling loop, the round limit, provider errors, and
the command transitions can be asserted without a model server or the runner socket.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from local_agents.adapters.base import AdapterChunk
from local_agents.agent import AgentManager
from local_agents.database import Database
from local_agents.models import CommandType, RunStatus


class ScriptedAdapter:
    """Yields a pre-scripted list of chunks per ``stream_chat`` call."""

    def __init__(self, scripts: list[list[AdapterChunk]]):
        self._scripts = scripts
        self._index = 0
        self.calls: list[dict] = []

    async def stream_chat(self, *, model, messages, tools=None):
        self.calls.append({"model": model, "messages": [dict(item) for item in messages], "tools": tools})
        script = self._scripts[min(self._index, len(self._scripts) - 1)]
        self._index += 1
        for chunk in script:
            yield chunk


class AlwaysToolAdapter:
    """Always asks for one tool call, to exercise the round limit."""

    async def stream_chat(self, *, model, messages, tools=None):
        yield AdapterChunk(
            tool_calls=[{"function": {"name": "list_files", "arguments": {"path": "."}}}]
        )


class FakeRunner:
    def __init__(self, result=None):
        self.calls: list[tuple[str, dict]] = []
        self._result = result or {"ok": True, "items": []}

    async def call(self, tool: str, arguments: dict) -> dict:
        self.calls.append((tool, arguments))
        return self._result


class FakeWebTools:
    enabled = True
    schemas = [
        {
            "type": "function",
            "function": {
                "name": "web_search",
                "description": "Search the web.",
                "parameters": {"type": "object", "properties": {"query": {"type": "string"}}},
            },
        }
    ]

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def handles(self, tool: str) -> bool:
        return tool == "web_search"

    async def call(self, tool: str, arguments: dict) -> dict:
        self.calls.append((tool, arguments))
        return {
            "ok": True,
            "provider": "fake",
            "query": arguments["query"],
            "results": [
                {
                    "title": "Example Source",
                    "url": "https://example.com/source",
                    "snippet": "A useful source.",
                }
            ],
        }


def make_db(tmp_path: Path) -> Database:
    db = Database(tmp_path / "agent.db")
    db.initialize()
    return db


def seed_run(db: Database, provider: str = "ollama") -> dict:
    session = db.create_session("S")
    run = db.create_run(session["id"], "hello", "qwen3", provider)
    db.add_message(session["id"], "user", "hello")
    return run


def event_types(db: Database, run_id: str) -> list[str]:
    return [e["type"] for e in db.list_events(run_id)]


async def test_run_without_tools_completes(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    adapter = ScriptedAdapter([[AdapterChunk(content="final answer")]])
    manager = AgentManager(db, FakeRunner(), {"ollama": adapter}, "qwen3")

    await manager._execute(db.get_run(run["id"]))

    assert db.get_run(run["id"])["status"] == RunStatus.COMPLETED
    types = event_types(db, run["id"])
    assert "assistant.final" in types and "run.completed" in types
    messages = [(m["role"], m["content"]) for m in db.list_messages(run["session_id"])]
    assert ("assistant", "final answer") in messages


async def test_run_invokes_tool_then_completes(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    adapter = ScriptedAdapter(
        [
            [AdapterChunk(tool_calls=[{"function": {"name": "list_files", "arguments": {"path": "."}}}])],
            [AdapterChunk(content="done")],
        ]
    )
    runner = FakeRunner({"ok": True, "items": [{"name": "a.txt"}]})
    manager = AgentManager(db, runner, {"ollama": adapter}, "qwen3")

    await manager._execute(db.get_run(run["id"]))

    assert runner.calls == [("list_files", {"path": "."})]
    types = event_types(db, run["id"])
    assert "tool.started" in types and "tool.finished" in types
    assert db.get_run(run["id"])["status"] == RunStatus.COMPLETED


async def test_run_invokes_web_tool_and_emits_source_events(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    adapter = ScriptedAdapter(
        [
            [AdapterChunk(tool_calls=[{"function": {"name": "web_search", "arguments": {"query": "news"}}}])],
            [AdapterChunk(content="done with source")],
        ]
    )
    runner = FakeRunner()
    web_tools = FakeWebTools()
    manager = AgentManager(db, runner, {"ollama": adapter}, "qwen3", web_tools=web_tools)

    await manager._execute(db.get_run(run["id"]))

    assert runner.calls == []
    assert web_tools.calls == [("web_search", {"query": "news"})]
    events = db.list_events(run["id"])
    types = [event["type"] for event in events]
    assert "source.found" in types
    source = next(event for event in events if event["type"] == "source.found")
    assert source["payload"]["url"] == "https://example.com/source"


async def test_context_compression_is_used_by_future_runs(tmp_path):
    db = make_db(tmp_path)
    session = db.create_session("Long chat")
    for index in range(4):
        db.add_message(session["id"], "user", f"old user detail {index}")
        db.add_message(session["id"], "assistant", f"old assistant answer {index}")
    adapter = ScriptedAdapter(
        [
            [AdapterChunk(content="compressed memory")],
            [AdapterChunk(content="fresh answer")],
        ]
    )
    manager = AgentManager(db, FakeRunner(), {"ollama": adapter}, "qwen3")

    status = await manager.compress_session(session["id"], model="qwen3")
    assert status["has_summary"] is True
    assert status["summarized_message_count"] == 8

    db.add_message(session["id"], "user", "after compression")
    run = db.create_run(session["id"], "after compression", "qwen3", "ollama")
    await manager._execute(db.get_run(run["id"]))

    prompt_messages = adapter.calls[1]["messages"]
    assert prompt_messages[0]["role"] == "system"
    assert "compressed memory" in prompt_messages[0]["content"]
    assert prompt_messages[-1]["content"] == "after compression"
    assert "old user detail 0" not in [item["content"] for item in prompt_messages[1:]]
    assert "context.status" in event_types(db, run["id"])


async def test_tool_round_limit_fails_run(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    manager = AgentManager(db, FakeRunner(), {"ollama": AlwaysToolAdapter()}, "qwen3")

    await manager._execute(db.get_run(run["id"]))

    row = db.get_run(run["id"])
    assert row["status"] == RunStatus.FAILED
    assert "8-round" in (row["error"] or "")
    assert "run.failed" in event_types(db, run["id"])


async def test_unconfigured_provider_marks_failed(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db, provider="ollama")
    manager = AgentManager(db, FakeRunner(), {}, "qwen3")  # no adapters registered

    await manager._execute(db.get_run(run["id"]))

    row = db.get_run(run["id"])
    assert row["status"] == RunStatus.FAILED
    assert row["error"] == "provider unavailable"


async def test_steer_command_is_stored_and_consumed_once(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    manager = AgentManager(db, FakeRunner(), {"ollama": ScriptedAdapter([[]])}, "qwen3")

    await manager.command(run["id"], CommandType.STEER, "focus on tests")
    assert db.pop_steering(run["id"]) == "focus on tests"
    assert db.pop_steering(run["id"]) is None  # consumed
    assert "steering.accepted" in event_types(db, run["id"])


async def test_steer_requires_instruction(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    manager = AgentManager(db, FakeRunner(), {"ollama": ScriptedAdapter([[]])}, "qwen3")
    with pytest.raises(ValueError):
        await manager.command(run["id"], CommandType.STEER, "   ")


async def test_command_on_terminal_run_is_noop(tmp_path):
    db = make_db(tmp_path)
    run = seed_run(db)
    db.set_run_status(run["id"], RunStatus.COMPLETED)
    manager = AgentManager(db, FakeRunner(), {"ollama": ScriptedAdapter([[]])}, "qwen3")

    result = await manager.command(run["id"], CommandType.CANCEL, None)
    assert result["status"] == RunStatus.COMPLETED
    assert "run.cancelled" not in event_types(db, run["id"])

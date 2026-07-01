from __future__ import annotations

from local_agents.database import Database


def test_events_are_ordered_and_replayable(tmp_path):
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    session = db.create_session("Test")
    run = db.create_run(session["id"], "task", "qwen3", "ollama")
    first = db.add_event(run["id"], "assistant.delta", {"content": "a"})
    second = db.add_event(run["id"], "assistant.delta", {"content": "b"})

    replay = db.list_events(run["id"], first)
    assert [event["seq"] for event in replay] == [second]
    assert replay[0]["payload"] == {"content": "b"}


def test_sessions_include_persisted_tool_count(tmp_path):
    db = Database(tmp_path / "db.sqlite")
    db.initialize()
    session = db.create_session("Tools")
    run = db.create_run(session["id"], "task", "qwen3.6", "ollama")
    db.add_event(run["id"], "tool.started", {"name": "web_search"})
    db.add_event(run["id"], "tool.finished", {"name": "web_search", "result": {}})
    db.add_event(run["id"], "tool.started", {"name": "fetch_url"})

    assert db.get_session(session["id"])["tool_count"] == 2
    assert db.list_sessions()[0]["tool_count"] == 2

"""Security and behaviour tests for the isolated runner tool service.

These focus on the runner's only real trust boundary: every file path must stay
inside the configured workspace, regex/search input is bounded, and command
execution is validated and time-limited.
"""

from __future__ import annotations

import sys

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from runner_app import main


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    ws = tmp_path / "workspace"
    ws.mkdir()
    resolved = ws.resolve()
    monkeypatch.setattr(main, "WORKSPACE", resolved)
    return resolved


# --- path containment ---------------------------------------------------------

def test_safe_path_rejects_parent_escape(workspace):
    with pytest.raises(HTTPException):
        main.safe_path("../secret.txt")


def test_safe_path_rejects_absolute_escape(workspace):
    # WORKSPACE / "/etc/passwd" collapses to /etc/passwd in pathlib; the resolved
    # check must still reject it.
    with pytest.raises(HTTPException) as exc:
        main.safe_path("/etc/passwd")
    assert exc.value.status_code == 400


def test_safe_path_rejects_symlink_escape(workspace, tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("top secret", encoding="utf-8")
    (workspace / "link").symlink_to(outside, target_is_directory=True)
    with pytest.raises(HTTPException):
        main.safe_path("link/secret.txt")


def test_safe_path_allows_nested_workspace_path(workspace):
    (workspace / "sub").mkdir()
    resolved = main.safe_path("sub/file.txt")
    assert str(resolved).startswith(str(workspace))


# --- list / read --------------------------------------------------------------

def test_list_files_lists_workspace_entries(workspace):
    (workspace / "a.txt").write_text("a", encoding="utf-8")
    (workspace / "sub").mkdir()
    result = main.list_files({"path": "."})
    assert result["ok"] is True
    names = {item["name"] for item in result["items"]}
    assert {"a.txt", "sub"} <= names


def test_read_file_roundtrip_and_missing(workspace):
    main.write_file({"path": "notes/demo.txt", "content": "hello"})
    assert main.read_file({"path": "notes/demo.txt"})["content"] == "hello"
    with pytest.raises(HTTPException):
        main.read_file({"path": "missing.txt"})


def test_read_file_rejects_oversize(workspace, monkeypatch):
    monkeypatch.setattr(main, "MAX_TEXT_BYTES", 8)
    # Write directly to bypass the write-side limit and exercise the read guard.
    (workspace / "big.txt").write_text("x" * 64, encoding="utf-8")
    with pytest.raises(HTTPException) as exc:
        main.read_file({"path": "big.txt"})
    assert exc.value.status_code == 413


# --- write --------------------------------------------------------------------

def test_write_file_rejects_escape(workspace):
    with pytest.raises(HTTPException):
        main.write_file({"path": "../escape.txt", "content": "x"})


def test_write_file_reports_byte_count(workspace):
    result = main.write_file({"path": "out.txt", "content": "héllo"})
    assert result["ok"] is True
    assert result["bytes"] == len("héllo".encode("utf-8"))


# --- search -------------------------------------------------------------------

def test_search_files_finds_matches(workspace):
    (workspace / "f.txt").write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
    result = main.search_files({"query": "be.a", "path": "."})
    assert result["ok"] is True
    assert any(match["text"] == "beta" for match in result["matches"])


def test_search_files_rejects_invalid_regex(workspace):
    with pytest.raises(HTTPException) as exc:
        main.search_files({"query": "("})
    assert exc.value.status_code == 400


def test_search_files_rejects_overlong_query(workspace):
    with pytest.raises(HTTPException):
        main.search_files({"query": "a" * 501})


def test_search_files_uses_ripgrep_instead_of_python_regex(workspace, monkeypatch):
    (workspace / "f.txt").write_text("alpha\nbeta\n", encoding="utf-8")
    original_run = main.subprocess.run
    calls = []

    def capture_run(command, *args, **kwargs):
        calls.append(command)
        return original_run(command, *args, **kwargs)

    monkeypatch.setattr(main.subprocess, "run", capture_run)
    result = main.search_files({"query": "alpha", "path": "."})
    assert result["ok"] is True
    assert calls and calls[0][0] == "rg"
    assert result["matches"][0]["line"] == 1
    assert result["matches"][0]["text"] == "alpha"


# --- run_command --------------------------------------------------------------

async def test_run_command_executes_and_captures_output(workspace):
    result = await main.run_command({"argv": [sys.executable, "-c", "print('hi', end='')"]})
    assert result["ok"] is True
    assert result["exit_code"] == 0
    assert result["stdout"] == "hi"


async def test_run_command_rejects_empty_argv(workspace):
    with pytest.raises(HTTPException):
        await main.run_command({"argv": []})


async def test_run_command_rejects_non_string_argv(workspace):
    with pytest.raises(HTTPException):
        await main.run_command({"argv": ["echo", 5]})


async def test_run_command_times_out(workspace):
    with pytest.raises(HTTPException) as exc:
        await main.run_command(
            {"argv": [sys.executable, "-c", "import time; time.sleep(5)"], "timeout_seconds": 1}
        )
    assert exc.value.status_code == 408


async def test_run_command_reports_missing_executable_as_bad_request(workspace):
    with pytest.raises(HTTPException) as exc:
        await main.run_command({"argv": ["local-agents-definitely-missing-command"]})
    assert exc.value.status_code == 400
    assert "executable not found" in str(exc.value.detail)


# --- tool allowlist at the schema layer --------------------------------------

def test_execute_endpoint_rejects_unknown_tool(workspace):
    client = TestClient(main.app)
    response = client.post("/tools/execute", json={"tool": "rm_rf", "arguments": {}})
    assert response.status_code == 422  # pydantic pattern rejects unknown tools

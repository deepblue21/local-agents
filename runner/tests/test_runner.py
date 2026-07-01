from __future__ import annotations

import pytest
from fastapi import HTTPException

from runner_app import main


def test_safe_path_rejects_workspace_escape(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(main, "WORKSPACE", workspace.resolve())

    with pytest.raises(HTTPException):
        main.safe_path("../secret.txt")


def test_write_and_read_stay_in_workspace(tmp_path, monkeypatch):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.setattr(main, "WORKSPACE", workspace.resolve())

    result = main.write_file({"path": "notes/demo.txt", "content": "hello"})
    assert result["ok"] is True
    assert main.read_file({"path": "notes/demo.txt"})["content"] == "hello"

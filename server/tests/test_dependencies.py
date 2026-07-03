from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_server_dependencies_do_not_include_unused_langgraph_packages():
    files = [
        ROOT / "server/requirements.txt",
        ROOT / "server/pyproject.toml",
    ]

    for path in files:
        content = path.read_text(encoding="utf-8").lower()
        assert "langgraph" not in content


def test_dev_dependencies_include_vulnerability_audit_tool():
    requirements = (ROOT / "server/requirements-dev.txt").read_text(encoding="utf-8")

    assert "pip-audit" in requirements

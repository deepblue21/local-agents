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


def test_python_dependency_lockfiles_exist_for_ci_and_containers():
    lockfiles = [
        ROOT / "server/requirements.lock",
        ROOT / "server/requirements-dev.lock",
        ROOT / "runner/requirements.lock",
    ]

    for path in lockfiles:
        assert path.exists()
        content = path.read_text(encoding="utf-8")
        assert "uv pip compile" in content
        assert "==" in content


def test_ci_and_docker_install_from_python_lockfiles():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    server_dockerfile = (ROOT / "server/Dockerfile").read_text(encoding="utf-8")
    runner_dockerfile = (ROOT / "runner/Dockerfile").read_text(encoding="utf-8")

    assert "server/requirements-dev.lock" in workflow
    assert "runner/requirements.lock" in workflow
    assert "pip install -r requirements-dev.lock -r ../runner/requirements.lock" in workflow
    assert "pip-audit -r requirements-dev.lock -r ../runner/requirements.lock" in workflow

    assert "COPY requirements.lock ." in server_dockerfile
    assert "pip install --no-cache-dir -r requirements.lock" in server_dockerfile
    assert "COPY requirements.lock ." in runner_dockerfile
    assert "pip install --no-cache-dir -r requirements.lock" in runner_dockerfile

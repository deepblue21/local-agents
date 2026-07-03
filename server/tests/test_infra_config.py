from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_compose_uses_healthchecks_and_runner_seccomp_profile():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "condition: service_healthy" in compose
    assert "healthcheck:" in compose
    assert "seccomp:./docker/seccomp/local-agents-runner.json" in compose
    assert (ROOT / "docker/seccomp/local-agents-runner.json").exists()


def test_optional_gvisor_compose_override_is_documented():
    override = ROOT / "docker-compose.gvisor.yml"
    setup = (ROOT / "docs/SETUP.md").read_text(encoding="utf-8")

    assert override.exists()
    content = override.read_text(encoding="utf-8")
    assert "runner:" in content
    assert "runtime: runsc" in content
    assert "gVisor" in setup
    assert "docker-compose.gvisor.yml" in setup


def test_github_actions_runs_server_runner_and_android_unit_tests():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "ruff check . ../runner" in workflow
    assert "pytest -q" in workflow
    assert "testDebugUnitTest" in workflow


def test_github_actions_audits_python_dependencies():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "pip-audit" in workflow
    assert "requirements-dev.lock" in workflow
    assert "../runner/requirements.lock" in workflow

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_compose_uses_healthchecks_and_runner_seccomp_profile():
    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    assert "condition: service_healthy" in compose
    assert "healthcheck:" in compose
    assert "seccomp:./docker/seccomp/local-agents-runner.json" in compose
    assert (ROOT / "docker/seccomp/local-agents-runner.json").exists()


def test_github_actions_runs_server_runner_and_android_unit_tests():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "ruff check . ../runner" in workflow
    assert "pytest -q" in workflow
    assert "testDebugUnitTest" in workflow

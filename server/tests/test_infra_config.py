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


def test_github_actions_runs_the_web_console_end_to_end_suite():
    """The console is a shipped client; a browser regression must fail CI."""
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "e2e/web-console" in workflow
    assert "playwright install" in workflow
    assert (ROOT / "e2e/web-console/playwright.config.ts").exists()
    assert (ROOT / "e2e/web-console/tests/console.spec.ts").exists()


def test_github_actions_installs_ripgrep_for_the_runner_tests():
    """`search_files` shells out to ripgrep, and the tests assert its real behaviour.

    Without the binary on the CI host those tests fail with a 503, so the ReDoS
    control they exist to pin (M3) goes unverified on every run.
    """
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "install -y --no-install-recommends ripgrep" in workflow


def test_gradle_wrapper_is_executable():
    """CI invokes ./gradlew directly; a non-executable mode fails the Android job."""
    wrapper = ROOT / "android/gradlew"

    assert wrapper.exists()
    assert wrapper.stat().st_mode & 0o111, "android/gradlew must be committed with the executable bit"


def test_github_actions_audits_python_dependencies():
    workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")

    assert "pip-audit" in workflow
    assert "requirements-dev.lock" in workflow
    assert "../runner/requirements.lock" in workflow

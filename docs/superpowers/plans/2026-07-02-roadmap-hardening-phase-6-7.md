# Roadmap Hardening Phase 6-7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining repo-local roadmap/security gaps, then extend the roadmap with production hardening and reliability phases.

**Architecture:** Keep the Android app as the controller and the PC companion as the credential/tool boundary. Implement retention and SSE controls in the FastAPI companion, pairing confirmation in Android state/UI, and infra hygiene in Compose/GitHub Actions without changing the public session/run API shape.

**Tech Stack:** FastAPI, SQLite, pytest, Kotlin/Compose JVM tests, Docker Compose, GitHub Actions.

---

### Task 1: Database Retention Cleanup

**Files:**
- Modify: `server/local_agents/database.py`
- Test: `server/tests/test_database.py`

- [ ] **Step 1: Write the failing test**

Add a test that creates expired/used pairing codes, expired/revoked auth tokens, and old run events; it should call `cleanup_retention()` and assert only active/current records remain.

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_database.py::test_cleanup_retention_purges_expired_auth_pairing_and_old_events -q`
Expected: fail because `Database.cleanup_retention` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add `cleanup_retention()` to delete expired tokens, revoked tokens older than a grace window, used/expired pairing codes, and terminal run events older than the configured retention window.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_database.py::test_cleanup_retention_purges_expired_auth_pairing_and_old_events -q`
Expected: pass.

### Task 2: SSE Stream Guardrails

**Files:**
- Modify: `server/local_agents/config.py`
- Modify: `server/local_agents/app.py`
- Test: `server/tests/test_sse_events.py`

- [ ] **Step 1: Write the failing tests**

Add tests for per-device SSE stream caps and access token revalidation before a stream is opened.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest server/tests/test_sse_events.py -q`
Expected: the stream cap test fails because no cap exists.

- [ ] **Step 3: Write minimal implementation**

Track active stream counts by `device_id`, return `429` when the configured cap is exceeded, and re-authenticate the bearer token in the stream loop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest server/tests/test_sse_events.py -q`
Expected: pass.

### Task 3: Android Pairing Deep-Link Confirmation

**Files:**
- Modify: `android/app/src/main/java/com/localagents/app/LocalAgentsViewModel.kt`
- Modify: `android/app/src/main/java/com/localagents/app/ui/Screens.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Test: `android/app/src/test/java/com/localagents/app/ui/UiLogicTest.kt`

- [ ] **Step 1: Write the failing JVM test**

Add a pure helper test showing deep-link pairing requires host confirmation when the link host differs from the saved/base host.

- [ ] **Step 2: Run test to verify it fails**

Run: `.\gradlew.bat testDebugUnitTest --tests "com.localagents.app.ui.UiLogicTest"`
Expected: fail because no confirmation helper/state exists.

- [ ] **Step 3: Write minimal implementation**

Introduce helper/state for pending deep-link confirmation and render a compact warning panel on the pairing screen before enabling pairing.

- [ ] **Step 4: Run test to verify it passes**

Run: `.\gradlew.bat testDebugUnitTest --tests "com.localagents.app.ui.UiLogicTest"`
Expected: pass.

### Task 4: Infra Hygiene

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `docker/seccomp/local-agents-runner.json`
- Modify: `docker-compose.yml`
- Modify: `docs/SECURITY_AUDIT.md`

- [ ] **Step 1: Add static coverage**

Add CI for server/runner ruff+pytest and Android unit tests.

- [ ] **Step 2: Harden compose**

Wire `/health` healthchecks, change API `depends_on` to `service_healthy`, and attach the runner seccomp profile.

- [ ] **Step 3: Update audit status**

Mark L3/L4/L7 progress and document the remaining gVisor/AppArmor option under H4.

### Task 5: Roadmap Phase 6-7

**Files:**
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Update roadmap**

Add Faz 6 production hardening and Faz 7 reliability/observability with concrete repo state and external-service blockers.

- [ ] **Step 2: Update architecture**

Document retention cleanup, SSE guardrails, CI, compose healthchecks, and runner sandbox notes.

- [ ] **Step 3: Run final verification**

Run: `ruff check . ..\runner`, `pytest -q`, and `.\gradlew.bat testDebugUnitTest`.
Expected: all pass.

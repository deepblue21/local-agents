"""Shared pytest fixtures.

The companion reads configuration from the process environment and from a `.env`
file, both of which are ambient state that differs between a developer machine, a
container, and CI. Tests construct `Settings` explicitly, so any `LOCAL_AGENTS_*`
variable that leaks in can silently override a value a test depends on — for
example `LOCAL_AGENTS_ALLOW_INSECURE_ADMIN=1` turning the insecure-admin-token
guard off and making its test fail for reasons unrelated to the code.
"""

from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def isolated_settings_environment(monkeypatch):
    for name in list(__import__("os").environ):
        if name.startswith("LOCAL_AGENTS_"):
            monkeypatch.delenv(name, raising=False)
    yield

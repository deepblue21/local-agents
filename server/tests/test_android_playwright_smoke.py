from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_android_playwright_smoke_harness_is_documented_and_opt_in():
    package_json = ROOT / "e2e/android-smoke/package.json"
    spec = ROOT / "e2e/android-smoke/tests/android-smoke.spec.ts"
    docs = ROOT / "docs/ANDROID_PLAYWRIGHT_SMOKE.md"

    assert package_json.exists()
    assert spec.exists()
    assert docs.exists()

    package = json.loads(package_json.read_text(encoding="utf-8"))
    assert package["scripts"]["android:smoke"] == "playwright test --config=playwright.config.ts"
    assert "@playwright/test" in package["devDependencies"]
    assert "playwright" in package["devDependencies"]

    spec_text = spec.read_text(encoding="utf-8")
    assert "_android" in spec_text
    assert "LOCAL_AGENTS_ANDROID_SMOKE" in spec_text
    assert "com.localagents.app" in spec_text
    assert "localagents://pair" in spec_text
    assert "BAĞLANTI ONAYI" in spec_text

    docs_text = docs.read_text(encoding="utf-8")
    assert "experimental" in docs_text.lower()
    assert "ADB" in docs_text
    assert "LOCAL_AGENTS_ANDROID_SMOKE=1" in docs_text
    assert "CI" in docs_text

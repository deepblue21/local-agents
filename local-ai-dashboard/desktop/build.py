"""One-shot build helper: pip install -> PyInstaller -> dist/.

Usage:
    python desktop/build.py
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "desktop" / "local-ai-dashboard.spec"
DIST = ROOT / "dist"
BUILD = ROOT / "build"


def run(*args: str) -> None:
    print(f"$ {' '.join(args)}")
    subprocess.check_call(list(args))


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    if BUILD.exists():
        shutil.rmtree(BUILD)
    # Install both requirement files (idempotent).
    run(sys.executable, "-m", "pip", "install", "-r", str(ROOT / "backend" / "requirements.txt"))
    run(sys.executable, "-m", "pip", "install", "-r", str(ROOT / "desktop" / "requirements.txt"))
    run(sys.executable, "-m", "PyInstaller", "--clean", "--noconfirm", str(SPEC))
    print(f"\nBuilt → {DIST / 'local-ai-dashboard'}")


if __name__ == "__main__":
    main()

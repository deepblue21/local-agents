"""Cross-platform 'start on boot' — Windows registry + Linux .desktop file."""

from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "LocalAIDashboard"


# ── Windows ────────────────────────────────────────────────────────────────


def _win_set(enabled: bool, command: str) -> None:
    import winreg

    key = winreg.OpenKey(
        winreg.HKEY_CURRENT_USER,
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        0,
        winreg.KEY_SET_VALUE,
    )
    try:
        if enabled:
            winreg.SetValueEx(key, APP_NAME, 0, winreg.REG_SZ, command)
        else:
            try:
                winreg.DeleteValue(key, APP_NAME)
            except FileNotFoundError:
                pass
    finally:
        winreg.CloseKey(key)


def _win_get() -> bool:
    import winreg

    try:
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_QUERY_VALUE,
        )
    except FileNotFoundError:
        return False
    try:
        try:
            winreg.QueryValueEx(key, APP_NAME)
            return True
        except FileNotFoundError:
            return False
    finally:
        winreg.CloseKey(key)


# ── Linux ──────────────────────────────────────────────────────────────────

_LINUX_DESKTOP_TEMPLATE = """[Desktop Entry]
Type=Application
Name=Local AI Dashboard
Comment=Distributed local LLM control panel
Exec={exec_path}
X-GNOME-Autostart-enabled=true
NoDisplay=false
"""


def _linux_path() -> Path:
    return Path.home() / ".config" / "autostart" / f"{APP_NAME}.desktop"


def _linux_set(enabled: bool, command: str) -> None:
    path = _linux_path()
    if enabled:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(_LINUX_DESKTOP_TEMPLATE.format(exec_path=command), encoding="utf-8")
        try:
            os.chmod(path, 0o755)
        except OSError:
            pass
    else:
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def _linux_get() -> bool:
    return _linux_path().exists()


# ── Public API ─────────────────────────────────────────────────────────────


def _current_exec_command() -> str:
    """Return a command line that starts the dashboard.

    When frozen by PyInstaller, `sys.executable` IS the bundled app.
    Otherwise we synthesise: `<python> <path-to-launcher.py>`.
    """
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    launcher = Path(__file__).resolve().parent / "launcher.py"
    return f'"{sys.executable}" "{launcher}"'


def set_autostart(enabled: bool) -> None:
    cmd = _current_exec_command()
    if sys.platform.startswith("win"):
        _win_set(enabled, cmd)
    elif sys.platform.startswith("linux"):
        _linux_set(enabled, cmd)
    else:
        raise RuntimeError(f"autostart not supported on {sys.platform}")


def is_autostart_enabled() -> bool:
    if sys.platform.startswith("win"):
        return _win_get()
    if sys.platform.startswith("linux"):
        return _linux_get()
    return False

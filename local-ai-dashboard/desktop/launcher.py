"""Local AI Dashboard — desktop launcher.

Boots the FastAPI backend in-process, opens a PyWebView window pointed at it,
runs a system-tray icon on a side thread, exposes auto-start toggling.

Dev:
    python -m desktop.launcher
PyInstaller:
    pyinstaller desktop/local-ai-dashboard.spec
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path

# Make sibling modules importable when run via `python -m desktop.launcher`
# AND when frozen.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))
if str(_HERE.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent))

from desktop import autostart, tray as tray_mod  # noqa: E402
from desktop.backend_runner import start_backend  # noqa: E402


logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("launcher")


class App:
    """Single source of truth for window + tray + backend lifecycle."""

    def __init__(self) -> None:
        self._backend = None  # BackendThread
        self._window = None   # webview.Window
        self._tray = None
        self._tray_thread: threading.Thread | None = None
        self._status = "starting"
        self._quitting = False

    # ── status ────────────────────────────────────────────────────────────
    def _set_status(self, s: str) -> None:
        self._status = s
        log.info("status: %s", s)

    def _get_status(self) -> str:
        return self._status

    # ── window ────────────────────────────────────────────────────────────
    def show_window(self) -> None:
        if self._window is None:
            return
        try:
            self._window.show()
            self._window.restore()
        except Exception:
            pass

    def on_window_closed(self) -> None:
        # User pressed the [X] — keep running in the tray, don't quit.
        if self._quitting:
            return
        log.info("window closed; staying alive in tray")

    # ── quit ──────────────────────────────────────────────────────────────
    def quit(self) -> None:
        if self._quitting:
            return
        self._quitting = True
        self._set_status("shutting down")
        try:
            if self._tray:
                self._tray.stop()
        except Exception:
            pass
        try:
            if self._window is not None:
                self._window.destroy()
        except Exception:
            pass
        try:
            if self._backend is not None:
                self._backend.stop(timeout=4.0)
        except Exception:
            pass
        # Belt-and-braces — make sure we actually exit.
        os._exit(0)

    # ── boot ──────────────────────────────────────────────────────────────
    def boot(self) -> None:
        # 1. Start backend.
        self._set_status("backend starting")
        try:
            self._backend = start_backend(preferred_port=7878)
        except Exception as e:
            log.exception("backend failed to start: %s", e)
            self._set_status(f"error: {e}")
            sys.exit(1)
        self._set_status(f"running · :{self._backend.port}")

        # 2. Start tray on its own thread.
        self._tray = tray_mod.Tray(
            on_show=self.show_window,
            on_quit=self.quit,
            get_autostart=autostart.is_autostart_enabled,
            set_autostart=autostart.set_autostart,
            get_status=self._get_status,
        )
        self._tray_thread = threading.Thread(
            target=self._tray.run, name="tray", daemon=True
        )
        self._tray_thread.start()

        # 3. Open PyWebView window — this blocks.
        import webview

        url = f"http://127.0.0.1:{self._backend.port}/"
        self._window = webview.create_window(
            "Local AI Dashboard",
            url=url,
            width=1440,
            height=900,
            min_size=(1080, 720),
            background_color="#0a0f1e",
        )
        self._window.events.closed += self.on_window_closed
        # Trap SIGINT so Ctrl+C in dev mode shuts everything cleanly.
        signal.signal(signal.SIGINT, lambda *_: self.quit())
        try:
            webview.start()  # blocks
        finally:
            # If start() returns (all windows closed), keep tray alive.
            # User must explicitly Quit from the tray.
            while not self._quitting:
                time.sleep(0.5)


def main() -> None:
    App().boot()


if __name__ == "__main__":
    main()

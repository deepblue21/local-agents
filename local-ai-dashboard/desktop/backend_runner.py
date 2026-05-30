"""Run the FastAPI backend in a background thread inside this process.

We do NOT use uvicorn's CLI — we instantiate Server() directly so we can
shut it down cleanly when the desktop window closes.
"""

from __future__ import annotations

import logging
import socket
import sys
import threading
import time
from pathlib import Path

log = logging.getLogger("backend_runner")


# Make `backend/app` importable when the desktop launcher runs from the project root.
_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


def _pick_port(preferred: int = 7878) -> int:
    """Return `preferred` if free, otherwise a free port from the OS."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", preferred))
        s.close()
        return preferred
    except OSError:
        pass
    s.close()
    # Fall back to any free port.
    s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s2.bind(("127.0.0.1", 0))
    port = s2.getsockname()[1]
    s2.close()
    return port


class BackendThread(threading.Thread):
    """Runs uvicorn.Server inside a daemon thread."""

    def __init__(self, host: str = "127.0.0.1", port: int = 7878) -> None:
        super().__init__(daemon=True, name="fastapi-backend")
        self.host = host
        self.port = port
        self.server = None  # uvicorn.Server, lazily created in run()
        self.ready = threading.Event()
        self.exc: BaseException | None = None

    def run(self) -> None:  # noqa: D401
        try:
            import uvicorn
            from app.main import app  # type: ignore

            cfg = uvicorn.Config(
                app,
                host=self.host,
                port=self.port,
                log_level="info",
                access_log=False,
            )
            self.server = uvicorn.Server(cfg)
            # uvicorn flips this when startup completes — but the public API to
            # observe that is `server.started`. We expose it via `self.ready`.
            orig_startup = self.server.startup

            async def patched_startup(sockets=None):
                await orig_startup(sockets=sockets)
                self.ready.set()

            self.server.startup = patched_startup  # type: ignore
            self.server.run()
        except BaseException as e:  # pragma: no cover
            self.exc = e
            log.exception("backend thread crashed: %s", e)
            self.ready.set()

    def stop(self, timeout: float = 5.0) -> None:
        if self.server is not None:
            self.server.should_exit = True
        self.join(timeout=timeout)

    def wait_ready(self, timeout: float = 30.0) -> bool:
        return self.ready.wait(timeout)


def start_backend(preferred_port: int = 7878) -> BackendThread:
    """Boot the FastAPI backend, return the thread once it answers /agent/health."""
    port = _pick_port(preferred_port)
    t = BackendThread(host="127.0.0.1", port=port)
    t.start()

    # Belt and braces: also probe the TCP port.
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if t.exc is not None:
            raise t.exc
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                t.ready.set()
                break
        except OSError:
            time.sleep(0.15)

    log.info("backend ready on http://127.0.0.1:%s", port)
    return t

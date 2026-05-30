"""System-tray icon for the desktop shell."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Callable

log = logging.getLogger("tray")


def _make_icon():
    """Return a small PIL.Image as the tray icon."""
    from PIL import Image, ImageDraw

    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # Deep-sea accent: cyan dot on a dark rounded rect.
    d.rounded_rectangle((4, 4, 60, 60), radius=14, fill=(20, 27, 45, 255))
    d.ellipse((20, 20, 44, 44), fill=(95, 232, 255, 255))
    return img


class Tray:
    def __init__(
        self,
        on_show: Callable[[], None],
        on_quit: Callable[[], None],
        get_autostart: Callable[[], bool],
        set_autostart: Callable[[bool], None],
        get_status: Callable[[], str],
    ) -> None:
        self._on_show = on_show
        self._on_quit = on_quit
        self._get_autostart = get_autostart
        self._set_autostart = set_autostart
        self._get_status = get_status
        self._icon = None

    def _build_menu(self):
        from pystray import Menu, MenuItem

        return Menu(
            MenuItem(lambda _: f"● {self._get_status()}", None, enabled=False),
            Menu.SEPARATOR,
            MenuItem("Show dashboard", lambda *_: self._on_show(), default=True),
            MenuItem(
                "Start on boot",
                lambda *_: self._toggle_autostart(),
                checked=lambda _: self._get_autostart(),
            ),
            Menu.SEPARATOR,
            MenuItem("Quit", lambda *_: self._on_quit()),
        )

    def _toggle_autostart(self) -> None:
        try:
            self._set_autostart(not self._get_autostart())
        except Exception as e:
            log.error("toggle autostart failed: %s", e)
        if self._icon:
            self._icon.update_menu()

    def run(self) -> None:
        import pystray

        self._icon = pystray.Icon(
            "local-ai-dashboard",
            _make_icon(),
            "Local AI Dashboard",
            self._build_menu(),
        )
        # `run()` blocks; the caller invokes this on its own thread.
        self._icon.run()

    def stop(self) -> None:
        if self._icon:
            self._icon.stop()

"""Static asset serving for the browser console.

Assets are enumerated once at import time into an exact-name map. Requests are
matched against that map rather than being joined onto a filesystem path, so no
request string ever reaches the filesystem and path traversal is impossible by
construction.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parent / "web"

MEDIA_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
}

# The console is a small, self-contained bundle; long-lived caching would strand
# operators on a stale build after an upgrade, so assets revalidate every load.
IMMUTABLE_SUFFIXES = {".png", ".ico"}


@dataclass(frozen=True)
class WebAsset:
    name: str
    body: bytes
    media_type: str
    etag: str
    cache_control: str


def _load_assets(root: Path = WEB_ROOT) -> dict[str, WebAsset]:
    assets: dict[str, WebAsset] = {}
    if not root.is_dir():
        return assets
    for item in sorted(root.iterdir()):
        if not item.is_file():
            continue
        media_type = MEDIA_TYPES.get(item.suffix.lower())
        if not media_type:
            continue
        body = item.read_bytes()
        digest = hashlib.sha256(body).hexdigest()[:32]
        assets[item.name] = WebAsset(
            name=item.name,
            body=body,
            media_type=media_type,
            etag=f'"{digest}"',
            cache_control=(
                "public, max-age=604800"
                if item.suffix.lower() in IMMUTABLE_SUFFIXES
                else "no-cache"
            ),
        )
    return assets


ASSETS: dict[str, WebAsset] = _load_assets()


def get_asset(name: str) -> WebAsset | None:
    return ASSETS.get(name)


def available() -> bool:
    return "index.html" in ASSETS


# The console is a same-origin page that loads only its own files and talks only to
# its own API. Everything else is denied, including inline script and style, so an
# injected string cannot become executable content.
CONSOLE_CSP = (
    "default-src 'none'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "manifest-src 'self'; "
    "worker-src 'self'; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "frame-ancestors 'none'"
)

# API responses are never rendered as documents. Nothing may load, and nothing may
# frame them.
API_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

# A service worker runs under the CSP of its own script response, and its whole job is
# to call fetch(). Serving it under API_CSP would leave connect-src at 'none', which
# blocks every fetch inside the worker and breaks navigation for the installed app.
WORKER_CSP = "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'"

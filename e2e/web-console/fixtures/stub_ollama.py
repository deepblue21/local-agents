"""Minimal Ollama stand-in for browser end-to-end tests.

Implements just enough of the Ollama HTTP surface for the companion to list models
and stream a chat response, so the console's pairing → prompt → streaming → completed
path can be exercised without a GPU or a real model.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = ["qwen3.6", "llama3.2:latest"]
REPLY_CHUNKS = ["Merhaba", ", ", "bu ", "bir ", "test ", "yanıtıdır."]


class StubHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):  # noqa: D102 - silence per-request stderr noise
        return

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        if self.path.startswith("/api/tags"):
            payload = {"models": [{"name": name} for name in MODELS]}
            self._send(200, json.dumps(payload).encode(), "application/json")
            return
        self._send(404, b"{}", "application/json")

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        if not self.path.startswith("/api/chat"):
            self._send(404, b"{}", "application/json")
            return
        length = int(self.headers.get("Content-Length", "0"))
        self.rfile.read(length)

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        for chunk in REPLY_CHUNKS:
            self._write_chunk({"message": {"content": chunk}, "done": False})
        self._write_chunk({"message": {"content": ""}, "done": True})
        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()

    def _write_chunk(self, payload: dict) -> None:
        body = (json.dumps(payload) + "\n").encode()
        self.wfile.write(f"{len(body):X}\r\n".encode())
        self.wfile.write(body)
        self.wfile.write(b"\r\n")
        self.wfile.flush()


def main() -> None:
    port = int(os.getenv("STUB_OLLAMA_PORT", "11500"))
    ThreadingHTTPServer(("127.0.0.1", port), StubHandler).serve_forever()


if __name__ == "__main__":
    main()

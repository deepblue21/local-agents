"""Minimal worker agent — runs on each non-master node.

Exposes one endpoint:

    GET /agent/telemetry  -> JSON snapshot of this machine's CPU/RAM/accelerators

Run with:
    python -m app.worker.agent --host 0.0.0.0 --port 7879
"""

from __future__ import annotations

import argparse

from fastapi import FastAPI

from ..services import telemetry_local

app = FastAPI(title="local-ai-dashboard worker", version="0.1.0")


@app.get("/agent/health")
def health() -> dict:
    return {"ok": True, "hostname": telemetry_local.static_info()["hostname"]}


@app.get("/agent/telemetry")
def telemetry() -> dict:
    return telemetry_local.snapshot()


def main() -> None:
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=7879)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()

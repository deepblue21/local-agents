"""Energy series & totals — reads samples persisted by the poller."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

from ..config import get_settings
from ..db import get_conn


def _bucket_seconds(range_: str) -> int:
    return {"24h": 3600, "7d": 86400, "30d": 86400, "90d": 86400}.get(range_, 86400)


def _window_seconds(range_: str) -> int:
    return {"24h": 86400, "7d": 7 * 86400, "30d": 30 * 86400, "90d": 90 * 86400}.get(
        range_, 86400
    )


def series(range_: str = "24h") -> dict[str, Any]:
    """Return the same shape the energy.jsx chart expects."""
    cfg = get_settings()
    now = time.time()
    window = _window_seconds(range_)
    bucket = _bucket_seconds(range_)
    since = now - window

    conn = get_conn()
    rows = conn.execute(
        "SELECT node_id, ts, watts FROM energy_samples WHERE ts >= ? ORDER BY ts",
        (since,),
    ).fetchall()

    if not rows:
        # No data yet — return an empty chart skeleton the UI can still draw.
        return {
            "points": [],
            "unitLabel": "kWh / hour" if range_ == "24h" else "kWh / day",
            "xTickEvery": 3 if range_ == "24h" else 1,
        }

    nodes = sorted({r["node_id"] for r in rows})
    bucket_count = max(1, window // bucket)

    # Aggregate watts → kWh per bucket per node.
    grid: dict[int, dict[str, list[float]]] = {}
    for r in rows:
        idx = int((r["ts"] - since) // bucket)
        if idx < 0 or idx >= bucket_count:
            continue
        slot = grid.setdefault(idx, {n: [] for n in nodes})
        slot.setdefault(r["node_id"], []).append(float(r["watts"]))

    points: list[dict[str, Any]] = []
    for i in range(bucket_count):
        slot = grid.get(i, {n: [] for n in nodes})
        ts = since + (i + 1) * bucket
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        label = (
            f"{dt.hour:02d}"
            if range_ == "24h"
            else dt.strftime("%b %d")
        )
        # Average watts in the bucket → kWh per bucket
        hours = bucket / 3600
        pt: dict[str, Any] = {"label": label, "t": ts}
        for n in nodes:
            samples = slot.get(n, [])
            avg_w = sum(samples) / len(samples) if samples else 0.0
            pt[n] = round((avg_w / 1000) * hours, 3)
        points.append(pt)

    return {
        "points": points,
        "unitLabel": "kWh / hour" if range_ == "24h" else "kWh / day",
        "xTickEvery": 3 if range_ == "24h" else 1,
    }


def totals(range_: str = "24h") -> dict[str, Any]:
    cfg = get_settings()
    data = series(range_)
    kWh = 0.0
    peak_w = 0.0
    peak_when = "—"
    for p in data["points"]:
        per_point = sum(v for k, v in p.items() if k not in ("label", "t"))
        kWh += per_point
        # Peak: convert kWh-in-bucket back to avg watts in that bucket
        hours = _bucket_seconds(range_) / 3600
        watts = (per_point / hours) * 1000 if hours else 0
        if watts > peak_w:
            peak_w = watts
            peak_when = p["label"]
    return {
        "kWh": round(kWh, 2),
        "cost": round(kWh * cfg.price_per_kwh, 2),
        "kgCO2": round(kWh * cfg.carbon_per_kwh, 2),
        "peakW": round(peak_w, 0),
        "peakWhen": peak_when,
        "trendPct": 0.0,
        "trendUp": False,
    }

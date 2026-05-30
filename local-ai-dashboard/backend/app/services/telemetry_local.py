"""Collect telemetry for the LOCAL machine — runs on the master and on each worker."""

from __future__ import annotations

import os
import platform
import re
import shutil
import subprocess
from typing import Any

import psutil

try:
    import pynvml  # type: ignore
    pynvml.nvmlInit()
    _NVML_OK = True
except Exception:
    _NVML_OK = False


# ── Static info, cached once ──────────────────────────────────────────────


def _os_string() -> str:
    s = platform.system()
    rel = platform.release()
    if s == "Darwin":
        ver = platform.mac_ver()[0]
        return f"macOS · {ver}"
    if s == "Linux":
        try:
            with open("/etc/os-release") as f:
                lines = {k: v.strip('"\n') for k, v in (line.split("=", 1) for line in f if "=" in line)}
            return f"Linux · {lines.get('PRETTY_NAME', rel)}"
        except Exception:
            return f"Linux · {rel}"
    if s == "Windows":
        return f"Windows · {rel}"
    return f"{s} · {rel}"


def _cpu_name() -> str:
    s = platform.system()
    try:
        if s == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.startswith("model name"):
                        return line.split(":", 1)[1].strip()
        if s == "Darwin":
            out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True, text=True, timeout=2,
            )
            if out.returncode == 0 and out.stdout.strip():
                return out.stdout.strip()
        if s == "Windows":
            return platform.processor() or "CPU"
    except Exception:
        pass
    return platform.processor() or "CPU"


_STATIC: dict[str, Any] = {}


def static_info() -> dict[str, Any]:
    if _STATIC:
        return _STATIC
    cpu_cores_p = psutil.cpu_count(logical=False) or 1
    cpu_cores_l = psutil.cpu_count(logical=True) or 1
    _STATIC.update(
        {
            "os": _os_string(),
            "cpu_name": _cpu_name(),
            "cpu_cores": f"{cpu_cores_p}c / {cpu_cores_l}t",
            "ram_total_gb": round(psutil.virtual_memory().total / 1024**3, 1),
            "host": _primary_ip(),
            "hostname": platform.node(),
        }
    )
    return _STATIC


def _primary_ip() -> str:
    import socket

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── CPU / RAM ─────────────────────────────────────────────────────────────


def cpu_temp_c() -> float | None:
    try:
        temps = psutil.sensors_temperatures()
    except Exception:
        return None
    if not temps:
        return None
    for key in ("coretemp", "k10temp", "cpu_thermal", "soc_thermal", "acpitz"):
        if key in temps and temps[key]:
            return float(temps[key][0].current)
    # Fallback: first reading from any sensor.
    for entries in temps.values():
        if entries:
            return float(entries[0].current)
    return None


def cpu_block() -> dict[str, Any]:
    info = static_info()
    return {
        "name": info["cpu_name"],
        "cores": info["cpu_cores"],
        "pct": float(psutil.cpu_percent(interval=None)),
        "temp": float(cpu_temp_c() or 50.0),
    }


def ram_block() -> dict[str, Any]:
    vm = psutil.virtual_memory()
    s = platform.system()
    name = "DDR5" if s == "Linux" else ("Unified Memory" if s == "Darwin" else "System RAM")
    return {
        "name": name,
        "used": round((vm.total - vm.available) / 1024**3, 2),
        "total": round(vm.total / 1024**3, 1),
    }


# ── Accelerators ──────────────────────────────────────────────────────────


def accelerators() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if _NVML_OK:
        try:
            count = pynvml.nvmlDeviceGetCount()
            for i in range(count):
                h = pynvml.nvmlDeviceGetHandleByIndex(i)
                mem = pynvml.nvmlDeviceGetMemoryInfo(h)
                util = pynvml.nvmlDeviceGetUtilizationRates(h)
                try:
                    temp = pynvml.nvmlDeviceGetTemperature(h, pynvml.NVML_TEMPERATURE_GPU)
                except Exception:
                    temp = 60
                try:
                    power_mw = pynvml.nvmlDeviceGetPowerUsage(h)
                    power_w = power_mw / 1000.0
                except Exception:
                    power_w = 0.0
                name = pynvml.nvmlDeviceGetName(h)
                if isinstance(name, bytes):
                    name = name.decode()
                vram_used = mem.used / 1024**3
                vram_total = mem.total / 1024**3
                out.append(
                    {
                        "kind": "gpu",
                        "name": name,
                        "vramUsed": round(vram_used, 2),
                        "vramTotal": round(vram_total, 1),
                        "pct": float(util.gpu),
                        "temp": float(temp),
                        "isVramTight": vram_used / vram_total > 0.90 if vram_total else False,
                        "powerW": round(power_w, 1),
                    }
                )
        except Exception:
            pass

    # Apple Silicon: try to detect via system_profiler.
    if platform.system() == "Darwin" and not out:
        try:
            r = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True, text=True, timeout=4,
            )
            m = re.search(r"Chipset Model: (.+)", r.stdout)
            chip = m.group(1).strip() if m else "Apple GPU"
            vm = psutil.virtual_memory()
            out.append(
                {
                    "kind": "soc",
                    "name": chip,
                    # On Apple Silicon, GPU shares unified memory with the CPU.
                    "vramUsed": round((vm.total - vm.available) / 1024**3, 2),
                    "vramTotal": round(vm.total / 1024**3, 1),
                    "pct": float(psutil.cpu_percent()),
                    "temp": float(cpu_temp_c() or 55.0),
                    "isVramTight": False,
                    "powerW": 0.0,
                }
            )
        except Exception:
            pass

    return out


# ── Power (best-effort) ───────────────────────────────────────────────────


def rapl_cpu_power_w() -> float | None:
    """Read Intel/AMD CPU package power via Linux RAPL. Returns *instantaneous* watts."""
    base = "/sys/class/powercap/intel-rapl"
    if not os.path.isdir(base):
        return None
    try:
        # Reading is per-microjoule counter; caller may sample twice.
        # For simplicity we report TDP fraction here.
        pkg = os.path.join(base, "intel-rapl:0")
        with open(os.path.join(pkg, "constraint_0_max_power_uw")) as f:
            tdp = int(f.read()) / 1_000_000
        pct = psutil.cpu_percent() / 100.0
        return round(tdp * (0.30 + 0.70 * pct), 1)
    except Exception:
        return None


def node_power_w(accs: list[dict[str, Any]]) -> float:
    cpu_w = rapl_cpu_power_w()
    if cpu_w is None:
        # Estimate from cpu util alone.
        cpu_w = round(20 + 80 * (psutil.cpu_percent() / 100.0), 1)
    gpu_w = sum(a.get("powerW", 0.0) for a in accs)
    return round(cpu_w + gpu_w, 1)


# ── Public snapshot ───────────────────────────────────────────────────────


def snapshot() -> dict[str, Any]:
    info = static_info()
    cpu = cpu_block()
    ram = ram_block()
    accs = accelerators()
    unified_total = sum(a["vramTotal"] for a in accs) or ram["total"]
    unified_used = sum(a["vramUsed"] for a in accs) or ram["used"]
    return {
        "hostname": info["hostname"],
        "host": info["host"],
        "os": info["os"],
        "cpu": cpu,
        "ram": ram,
        "accelerators": accs,
        "unifiedTotal": round(unified_total, 1),
        "unifiedUsed": round(unified_used, 2),
        "powerW": node_power_w(accs),
    }

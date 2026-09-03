"""Host system stats for the TV dashboard.

Reads /proc directly (the container shares the host kernel, so CPU / load /
memory / uptime reflect the whole box) plus disk usage from a bind-mounted
host path. A tiny background sampler keeps a rolling history so the frontend
can draw a CPU / memory trend without doing its own bookkeeping.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import time
from collections import deque
from typing import Any

# Prefer a bind-mounted host path so disk usage reflects the real volume, not
# the container overlay. Falls back to "/" if the mount is missing.
DISK_PATH = os.getenv("DISK_PATH", "/homework")
if not os.path.isdir(DISK_PATH):
    DISK_PATH = "/"

_HISTORY_MAX = 60  # ~4 min at 4s cadence
_SAMPLE_SECONDS = 4.0

_cpu_history: deque[float] = deque(maxlen=_HISTORY_MAX)
_mem_history: deque[float] = deque(maxlen=_HISTORY_MAX)
_prev_cpu: dict[str, int] = {"total": 0, "idle": 0}
_latest: dict[str, Any] = {}
_sampler_task: asyncio.Task | None = None


def _read_cpu_times() -> tuple[int, int]:
    """Return (total, idle) jiffies from /proc/stat's aggregate cpu line."""
    with open("/proc/stat", "r", encoding="utf-8") as fh:
        line = fh.readline()
    fields = [int(x) for x in line.split()[1:]]
    # user nice system idle iowait irq softirq steal ...
    idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
    return sum(fields), idle


def _cpu_percent() -> float:
    total, idle = _read_cpu_times()
    d_total = total - _prev_cpu["total"]
    d_idle = idle - _prev_cpu["idle"]
    _prev_cpu["total"], _prev_cpu["idle"] = total, idle
    if d_total <= 0:
        return 0.0
    return round(max(0.0, min(100.0, (1.0 - d_idle / d_total) * 100.0)), 1)


def _mem() -> tuple[int, int]:
    info: dict[str, int] = {}
    with open("/proc/meminfo", "r", encoding="utf-8") as fh:
        for line in fh:
            key, _, rest = line.partition(":")
            info[key] = int(rest.strip().split()[0]) * 1024  # kB -> bytes
    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    return max(0, total - avail), total


def _uptime_seconds() -> float:
    try:
        with open("/proc/uptime", "r", encoding="utf-8") as fh:
            return float(fh.readline().split()[0])
    except Exception:
        return 0.0


def _snapshot(cpu_pct: float) -> dict[str, Any]:
    mem_used, mem_total = _mem()
    mem_pct = round(mem_used / mem_total * 100, 1) if mem_total else 0.0
    try:
        load1, load5, load15 = os.getloadavg()
    except (OSError, AttributeError):
        load1 = load5 = load15 = 0.0
    disk = shutil.disk_usage(DISK_PATH)
    return {
        "cpu_pct": cpu_pct,
        "cpu_cores": os.cpu_count() or 1,
        "load": [round(load1, 2), round(load5, 2), round(load15, 2)],
        "mem_used": mem_used,
        "mem_total": mem_total,
        "mem_pct": mem_pct,
        "disk_used": disk.used,
        "disk_total": disk.total,
        "disk_pct": round(disk.used / disk.total * 100, 1) if disk.total else 0.0,
        "uptime_seconds": _uptime_seconds(),
        "cpu_history": list(_cpu_history),
        "mem_history": list(_mem_history),
        "updated_at": time.time(),
    }


async def _sample_loop() -> None:
    # Prime the CPU counters, then wait a beat before the first real reading.
    _prev_cpu["total"], _prev_cpu["idle"] = _read_cpu_times()
    await asyncio.sleep(1.0)
    while True:
        try:
            cpu_pct = _cpu_percent()
            _cpu_history.append(cpu_pct)
            mem_used, mem_total = _mem()
            _mem_history.append(
                round(mem_used / mem_total * 100, 1) if mem_total else 0.0
            )
            _latest.clear()
            _latest.update(_snapshot(cpu_pct))
        except Exception:
            pass
        await asyncio.sleep(_SAMPLE_SECONDS)


def start_sampler() -> None:
    """Kick off the background sampler. Call from an async context (FastAPI
    startup) so a running event loop is available."""
    global _sampler_task
    if _sampler_task is None or _sampler_task.done():
        _sampler_task = asyncio.ensure_future(_sample_loop())


def get_stats() -> dict[str, Any]:
    if _latest:
        return _latest
    # Sampler hasn't produced a reading yet — return a best-effort snapshot.
    try:
        _prev_cpu["total"], _prev_cpu["idle"] = _read_cpu_times()
    except Exception:
        pass
    return _snapshot(0.0)

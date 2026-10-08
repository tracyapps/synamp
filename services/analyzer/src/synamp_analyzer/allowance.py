"""How much memory analysis may use right now (Settings → Analysis on your Mac).

The owner chooses an amount for normal use, and optionally more at set hours or
while they're away from the Mac. The worker works out "right now" itself,
because it knows the Mac's clock and whether anyone is using it. The amount
decides how many songs are analysed at once (pipeline.analysis_processes).
"""

from __future__ import annotations

import re
import subprocess
import sys
from datetime import datetime

from .pipeline import PER_SONG_GB, analysis_processes, machine, recommended_memory_gb

DEFAULT = {"mode": "steady", "normal_gb": None, "more_gb": None, "from": "22:00", "to": "07:00", "away_minutes": 10}


def recommended_more_gb(total_gb: float) -> int:
    """For the "more" times: half the Mac, keeping 8 GB for macOS and whatever is left open."""
    return int(max(PER_SONG_GB, min(total_gb - 8.0, total_gb * 0.5)))


def _minutes(clock: str) -> int:
    hours, minutes = clock.split(":")
    return int(hours) * 60 + int(minutes)


def in_hours(now: datetime, start: str, end: str) -> bool:
    """Is `now` within start–end on the Mac's clock? The span may run past midnight (22:00–07:00)."""
    minute, a, b = now.hour * 60 + now.minute, _minutes(start), _minutes(end)
    return a <= minute < b if a < b else (minute >= a or minute < b)


def idle_seconds() -> float | None:
    """Seconds since the last keyboard, mouse or trackpad input on this Mac (None elsewhere)."""
    if sys.platform != "darwin":
        return None
    try:
        out = subprocess.run(["ioreg", "-c", "IOHIDSystem", "-d", "4"], capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    match = re.search(r'"HIDIdleTime"\s*=\s*(\d+)', out)
    return int(match.group(1)) / 1e9 if match else None


def allowance(settings: dict | None, info: dict, now: datetime, idle: float | None, cap: int = 16) -> dict:
    """{gb, songs, why} for this moment. `why` is "normal", "hours" or "away"."""
    s = {**DEFAULT, **(settings or {})}
    total = float(info["memory_gb"])
    normal = float(s["normal_gb"]) if s["normal_gb"] else float(recommended_memory_gb(total))
    more = float(s["more_gb"]) if s["more_gb"] else float(recommended_more_gb(total))
    more = max(more, normal)  # "more" is never less than normal
    why = "normal"
    if s["mode"] == "hours" and in_hours(now, s["from"], s["to"]):
        why = "hours"
    elif s["mode"] == "away" and idle is not None and idle >= 60 * int(s["away_minutes"]):
        why = "away"
    gb = more if why != "normal" else normal
    gb = min(gb, max(PER_SONG_GB, total - 4.0))
    return {"gb": round(gb, 1), "songs": analysis_processes(cap, gb, info), "why": why}


class Allowance:
    """The worker's view: the latest setting from the web app, applied to the present moment."""

    def __init__(self, cap: int = 16, info: dict | None = None, clock=datetime.now, idle=idle_seconds):
        self.settings: dict = dict(DEFAULT)
        self.cap = cap
        self.info = info or machine()
        self.clock = clock
        self.idle = idle

    def update(self, settings: object) -> None:
        if isinstance(settings, dict):
            self.settings = {**DEFAULT, **settings}

    def now(self) -> dict:
        idle = self.idle() if self.settings.get("mode") == "away" else None
        return allowance(self.settings, self.info, self.clock(), idle, self.cap)

    def gb(self) -> float:
        return self.now()["gb"]

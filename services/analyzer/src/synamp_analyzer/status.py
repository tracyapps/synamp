"""What the analyzer has done, is doing, and has left — for people, not just logs.

`snapshot()` summarises the SQLite store (catalog, queue, per-stage coverage,
recent failures, fingerprint coverage). `ProgressReporter` sends that, plus the
live state of the current run, to the brain so the web app can show progress
while the worker runs on another machine. Reporting is best-effort by design:
an unreachable brain never slows down or stops analysis.
"""

from __future__ import annotations

import json
import socket
import time
from collections import deque
import urllib.error
import urllib.request
from pathlib import Path

from . import __version__
from .models import STAGES
from .store import Database

REPORT_FORMAT = "synamp.analysis-progress/1"


def snapshot(db: Database, library_root: Path, failures: int = 20) -> dict:
    conn = db.conn
    catalog = conn.execute("SELECT COUNT(*) AS total, COALESCE(SUM(missing), 0) AS missing FROM tracks").fetchone()
    # Songs no longer on disk keep their jobs (so a moved song keeps its history); leave them out.
    queue = {row["state"]: row["n"] for row in conn.execute(
        "SELECT j.state, COUNT(*) AS n FROM jobs j JOIN tracks t ON t.path = j.track_path WHERE t.missing = 0 GROUP BY j.state"
    )}
    redo: dict[str, set[str]] = {}
    for row in conn.execute(
        "SELECT u.track_path, u.stage FROM stage_updates u JOIN tracks t ON t.path = u.track_path WHERE t.missing = 0"
    ):
        redo.setdefault(row["track_path"], set()).add(row["stage"])
    stages = {stage: 0 for stage in STAGES}
    updates = {stage: {"total": 0, "waiting": 0} for stage in STAGES}
    complete = 0
    once = 0
    for row in conn.execute(
        "SELECT j.track_path, j.stages_done FROM jobs j JOIN tracks t ON t.path = j.track_path WHERE t.missing = 0"
    ):
        done = set(json.loads(row["stages_done"] or "[]"))
        for stage in done & stages.keys():
            stages[stage] += 1
        being_redone = redo.get(row["track_path"], set()) & stages.keys()
        for stage in being_redone:
            updates[stage]["total"] += 1
            if stage not in done:
                updates[stage]["waiting"] += 1
        if set(STAGES) <= done:
            complete += 1
        if set(STAGES) <= done | being_redone:
            once += 1
    fingerprints: dict[str, int] = {}
    try:
        for row in conn.execute(
            "SELECT COALESCE(json_extract(payload, '$.fingerprint_status'), 'not_run') AS s, COUNT(*) AS n FROM results GROUP BY s"
        ):
            fingerprints[row["s"]] = row["n"]
    except Exception:  # SQLite built without JSON support: leave it out rather than fail
        fingerprints = {}
    recent = []
    for row in conn.execute(
        "SELECT track_path, error, attempts, updated_at FROM jobs WHERE state = 'failed' ORDER BY updated_at DESC LIMIT ?",
        (failures,),
    ):
        path = Path(row["track_path"])
        try:
            shown = path.relative_to(library_root).as_posix()
        except ValueError:
            shown = path.name
        recent.append({"path": shown, "error": (row["error"] or "")[:300], "attempts": row["attempts"], "at": row["updated_at"]})
    present = catalog["total"] - catalog["missing"]
    return {
        "catalog": {"tracks": catalog["total"], "present": present, "missing": catalog["missing"]},
        "queue": {state: queue.get(state, 0) for state in ("pending", "running", "done", "failed")},
        "stages": stages,
        "stage_order": list(STAGES),
        "fully_analysed": complete,
        # Every stage done at least once (some may be getting redone with newer code).
        "analysed_once": once,
        "updates": {stage: counts for stage, counts in updates.items() if counts["total"]},
        "fingerprints": fingerprints,
        "recent_failures": recent,
    }


class RunClock:
    """Rate and time-left for the current run, from jobs actually finished in it.

    The rate is taken over the last `window` seconds, not the whole run: speed
    changes during a run (memory settings, "while I'm away" mode, a pause for a
    library update), and an all-run average lags behind for hours.
    """

    def __init__(self, now=time.time, window: float = 30 * 60):
        self.now = now
        self.started = now()
        self.finished = 0
        self.window = window
        self.recent: deque[float] = deque()

    def tick(self) -> None:
        self.finished += 1
        self.recent.append(self.now())

    def rate_per_minute(self) -> float | None:
        now = self.now()
        while self.recent and now - self.recent[0] >= self.window:
            self.recent.popleft()
        span = min(self.window, now - self.started)
        if len(self.recent) >= 3 and span > 0:
            return len(self.recent) / span * 60
        elapsed = now - self.started
        return (self.finished / elapsed) * 60 if self.finished >= 3 and elapsed > 0 else None

    def eta_seconds(self, remaining: int) -> float | None:
        rate = self.rate_per_minute()
        return None if not rate else remaining / rate * 60


class ProgressReporter:
    """Posts progress to the brain at most every `interval` seconds (plus forced updates)."""

    def __init__(self, brain_url: str | None, token: str | None, library_root: Path, interval: float = 15.0, now=time.time):
        self.url = brain_url.rstrip("/") + "/api/v1/analysis/progress" if brain_url else None
        self.token = token
        self.library_root = library_root
        self.interval = interval
        self.now = now
        self.last_sent = 0.0
        self.last_error: str | None = None
        self.sent = 0

    @property
    def enabled(self) -> bool:
        return self.url is not None

    def payload(self, db: Database, state: str, run: dict) -> dict:
        return {
            "format": REPORT_FORMAT,
            "analyzer_version": __version__,
            "host": socket.gethostname(),
            "sent_at": self.now(),
            "state": state,
            "run": run,
            **snapshot(db, self.library_root),
        }

    def report(self, db: Database, state: str, run: dict, force: bool = False) -> bool:
        if not self.enabled or (not force and self.now() - self.last_sent < self.interval):
            return False
        self.last_sent = self.now()
        body = json.dumps(self.payload(db, state, run)).encode("utf-8")
        request = urllib.request.Request(self.url, data=body, method="POST", headers={
            "content-type": "application/json",
            **({"authorization": f"Bearer {self.token}"} if self.token else {}),
        })
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                ok = 200 <= response.status < 300
        except (urllib.error.URLError, OSError, ValueError) as error:
            self.last_error = str(error)
            return False
        if ok:
            self.sent += 1
            self.last_error = None
        return ok

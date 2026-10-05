"""Progress reporting: the snapshot, the time-left estimate, and best-effort delivery."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.pipeline import run_analyze, run_scan
from synamp_analyzer.status import ProgressReporter, RunClock, snapshot
from synamp_analyzer.store import Database

from synth import corrupt, sine


def quiet(*_args: object, **_kwargs: object) -> None:
    """Swallow progress output."""


class Brain:
    """A stand-in brain that records what it was sent."""

    def __init__(self, status: int = 200):
        received: list[tuple[str, dict]] = []
        code = status

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                body = self.rfile.read(int(self.headers["content-length"]))
                received.append((self.headers.get("authorization", ""), json.loads(body)))
                self.send_response(code)
                self.end_headers()

            def log_message(self, *_args: object) -> None:
                pass

        self.received = received
        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self) -> None:
        self.server.shutdown()


def library_with(tmp_path: Path) -> AnalyzerConfig:
    library = tmp_path / "music"
    (library / "A").mkdir(parents=True)
    sine(library / "A" / "one.flac")
    sine(library / "A" / "two.flac", frequency=550.0)
    corrupt(library / "A" / "broken.flac")
    return AnalyzerConfig(library_path=library, database_url="postgres://unused", cache_dir=tmp_path / "cache",
                          db_path=tmp_path / "analyzer.sqlite3", workers=1)


def test_snapshot_counts_stage_coverage_and_failures(tmp_path: Path) -> None:
    config = library_with(tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    with Database(config.db_path) as db:
        snap = snapshot(db, config.library_path)
    assert snap["catalog"] == {"tracks": 3, "present": 3, "missing": 0}
    assert snap["queue"]["done"] == 2
    assert snap["queue"]["pending"] + snap["queue"]["failed"] == 1
    assert snap["stages"] == {"identity": 2, "dsp_core": 2, "beat": 2}
    assert snap["fully_analysed"] == 2
    assert snap["fingerprints"].get("tool_missing", 0) + snap["fingerprints"].get("measured", 0) == 2
    if snap["recent_failures"]:
        assert snap["recent_failures"][0]["path"] == "A/broken.flac", "paths are shown relative to the library"


def test_time_left_needs_a_few_finished_tracks() -> None:
    now = [1000.0]
    clock = RunClock(now=lambda: now[0])
    clock.tick(); clock.tick()
    now[0] += 60
    assert clock.eta_seconds(100) is None, "two tracks is too few to estimate from"
    clock.tick(); clock.tick()
    assert clock.rate_per_minute() == 4.0
    assert clock.eta_seconds(100) == 1500.0


def test_progress_reaches_the_brain_with_the_token(tmp_path: Path) -> None:
    brain = Brain()
    try:
        config = library_with(tmp_path)
        config = AnalyzerConfig(**{**config.__dict__, "brain_url": brain.url, "brain_token": "secret"})
        run_scan(config, progress=quiet)
        run_analyze(config, progress=quiet)
        states = [body["state"] for _, body in brain.received]
        assert states[0] == "idle" and "last_scan" in brain.received[0][1]["run"], "scan reports when it finishes"
        assert "analyzing" in states and states[-1] == "idle"
        auth, final = brain.received[-1]
        assert auth == "Bearer secret"
        assert final["format"] == "synamp.analysis-progress/1"
        assert final["run"]["completed"] == 2 and final["run"]["remaining"] == 0
        assert final["catalog"]["present"] == 3
    finally:
        brain.close()


def test_an_unreachable_or_failing_brain_never_stops_analysis(tmp_path: Path) -> None:
    config = library_with(tmp_path)
    config = AnalyzerConfig(**{**config.__dict__, "brain_url": "http://127.0.0.1:9"})
    run_scan(config, progress=quiet)
    assert run_analyze(config, progress=quiet)["completed"] == 2
    failing = Brain(status=500)
    try:
        reporter = ProgressReporter(failing.url, None, config.library_path)
        with Database(config.db_path) as db:
            assert reporter.report(db, "idle", {}, force=True) is False
    finally:
        failing.close()


def test_reports_are_throttled_unless_forced(tmp_path: Path) -> None:
    brain = Brain()
    try:
        config = library_with(tmp_path)
        run_scan(config, progress=quiet)
        now = [100.0]
        reporter = ProgressReporter(brain.url, None, config.library_path, interval=15, now=lambda: now[0])
        with Database(config.db_path) as db:
            assert reporter.report(db, "analyzing", {}) is True
            now[0] += 5
            assert reporter.report(db, "analyzing", {}) is False
            assert reporter.report(db, "idle", {}, force=True) is True
            now[0] += 20
            assert reporter.report(db, "analyzing", {}) is True
        assert len(brain.received) == 3
    finally:
        brain.close()

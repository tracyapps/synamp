"""The analyzer as a background worker driven from the web app (no real brain needed)."""

from __future__ import annotations

import json
from pathlib import Path

from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.worker import ACTIONS, AGENT_LABEL, BrainError, Worker, agent_plist

from synth import sine


class FakeBrain:
    """Hands out queued commands like the brain does, and records what comes back."""

    base = "http://brain"

    def __init__(self, commands, stop_after_checks: int | None = None, down: bool = False):
        self.commands = list(commands)
        self.reports: dict[str, dict] = {}
        self.hellos: list[dict] = []
        self.checks = 0
        self.stop_after_checks = stop_after_checks
        self.down = down

    def post(self, path: str, body: dict) -> dict:
        if self.down:
            raise BrainError("can't reach the brain")
        if path == "/api/v1/analyzer/claim":
            self.hellos.append(body["worker"])
            return {"command": self.commands.pop(0) if self.commands else None}
        if path.endswith("/check"):
            self.checks += 1
            return {"stop": self.stop_after_checks is not None and self.checks >= self.stop_after_checks}
        self.reports[path.rsplit("/", 1)[1]] = body
        return {}


def library(tmp_path: Path, count: int = 3) -> tuple[AnalyzerConfig, Path]:
    music = tmp_path / "music" / "library"
    (music / "Artist" / "Album").mkdir(parents=True)
    for n in range(count):
        sine(music / "Artist" / "Album" / f"{n + 1:02d} - tone.flac", seconds=0.5)
    cfg = AnalyzerConfig(library_path=music, database_url="postgres://unused", cache_dir=tmp_path / "cache",
                         db_path=tmp_path / "analyzer.sqlite3", workers=1)
    return cfg, music


class Clock:
    def __init__(self) -> None:
        self.t = 1000.0

    def __call__(self) -> float:
        self.t += 30.0  # every look at the clock moves time on, so checks happen
        return self.t


def make(cfg, brain, **kwargs) -> tuple[Worker, list[str]]:
    lines: list[str] = []
    worker = Worker(cfg, brain, log=lines.append, sleep=lambda _s: None, keep_awake=lambda: None,
                    mount=lambda _url: False, **kwargs)
    return worker, lines


def test_update_scans_and_exports_beside_the_library(tmp_path: Path) -> None:
    cfg, music = library(tmp_path)
    brain = FakeBrain([{"id": "a_000000000001", "action": "update", "requested_by": "the librarian"}])
    worker, lines = make(cfg, brain)
    assert worker.export_path == music.parent / ".synamp" / "library-signals.json", "where the brain reads it on the NAS"
    assert worker.once() == "done"
    report = brain.reports["a_000000000001"]
    assert report["status"] == "done"
    assert report["summary"].startswith("scan: 3 files, 3 new")
    assert "library list updated: 3 tracks" in report["summary"]
    assert json.loads(worker.export_path.read_text())["counts"]["exported"] == 3
    hello = brain.hellos[0]
    assert hello["library_ok"] is True and hello["export_path"] == str(worker.export_path)
    assert worker.once() == "idle"


def test_analysis_runs_until_paused_then_exports(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path, count=4)
    brain = FakeBrain([{"id": "a_000000000002", "action": "scan"}, {"id": "a_000000000003", "action": "analyze"}],
                      stop_after_checks=2)
    worker, _lines = make(cfg, brain, now=Clock())
    assert worker.once() == "done"
    assert worker.once() == "stopped", "Pause pressed in the web app"
    report = brain.reports["a_000000000003"]
    assert report["status"] == "stopped"
    assert "analysed 1 tracks" in report["summary"] or "analysed 2 tracks" in report["summary"]
    assert worker.export_path.exists(), "what was analysed is exported straight away"


def test_unreachable_music_is_reported_in_plain_words(tmp_path: Path) -> None:
    cfg = AnalyzerConfig(library_path=tmp_path / "not-mounted" / "library", database_url="x", cache_dir=tmp_path,
                         db_path=tmp_path / "a.sqlite3", workers=1)
    brain = FakeBrain([{"id": "a_000000000004", "action": "update"}])
    worker, _lines = make(cfg, brain)
    assert worker.once() == "failed"
    assert "isn't reachable" in brain.reports["a_000000000004"]["summary"]
    assert "Finder" in brain.reports["a_000000000004"]["summary"]
    assert brain.hellos[0]["library_ok"] is False and "problem" in brain.hellos[0]


def test_unknown_actions_and_a_missing_brain(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path, count=1)
    assert set(ACTIONS) == {"update", "scan", "export", "analyze"}
    brain = FakeBrain([{"id": "a_000000000005", "action": "delete-everything"}])
    worker, _ = make(cfg, brain)
    assert worker.once() == "failed"
    assert "unknown action" in brain.reports["a_000000000005"]["summary"]
    down, _ = make(cfg, FakeBrain([], down=True))
    try:
        down.once()
        raise AssertionError("expected BrainError")
    except BrainError:
        pass


def test_login_item_runs_the_worker_with_the_settings_file() -> None:
    plist = agent_plist(Path("/Users/tapps/SynAmp/services/analyzer"), Path("/Users/tapps/SynAmp-data/env.sh"),
                        "/opt/homebrew/bin/uv", Path("/Users/tapps/SynAmp-data/worker.log"))
    assert f"<string>{AGENT_LABEL}</string>" in plist
    assert "source '/Users/tapps/SynAmp-data/env.sh' &amp;&amp; cd '/Users/tapps/SynAmp/services/analyzer' &amp;&amp; exec '/opt/homebrew/bin/uv' run synamp-analyze worker" in plist
    assert "<key>RunAtLoad</key><true/>" in plist and "<key>KeepAlive</key><true/>" in plist

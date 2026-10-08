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
        self.check_bodies: list[dict] = []
        self.memory = {"mode": "steady", "normal_gb": 3}
        self.stop_after_checks = stop_after_checks
        self.down = down

    def post(self, path: str, body: dict) -> dict:
        if self.down:
            raise BrainError("can't reach the brain")
        if path == "/api/v1/analyzer/claim":
            self.hellos.append(body["worker"])
            return {"command": self.commands.pop(0) if self.commands else None, "memory": self.memory}
        if path.endswith("/check"):
            self.checks += 1
            self.check_bodies.append(body)
            return {"stop": self.stop_after_checks is not None and self.checks >= self.stop_after_checks, "memory": self.memory}
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
    assert "source '/Users/tapps/SynAmp-data/env.sh' &amp;&amp; cd '/Users/tapps/SynAmp/services/analyzer' &amp;&amp; exec '/opt/homebrew/bin/uv' run --extra listen synamp-analyze worker" in plist
    assert "<key>RunAtLoad</key><true/>" in plist and "<key>KeepAlive</key><true/>" in plist


def test_a_new_version_on_disk_restarts_the_worker_and_analysis_carries_on(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path, count=4)
    brain = FakeBrain([{"id": "a_000000000003", "action": "update"}, {"id": "a_000000000004", "action": "analyze"}])
    brain.requests = []
    original_post = brain.post

    def post(path: str, body: dict) -> dict:
        if path == "/api/v1/analyzer/request":
            brain.requests.append(body)
            return {}
        return original_post(path, body)

    brain.post = post
    version = {"stamp": "v1"}
    worker, lines = make(cfg, brain, now=Clock(), stamp=lambda: version["stamp"])
    assert worker.once() == "done"
    assert not worker.code_changed()

    version["stamp"] = "v2"  # a new version of the analyzer was copied onto the Mac
    assert worker.once() == "restart"
    report = brain.reports["a_000000000004"]
    assert report["status"] == "stopped", "stops after the current track, like Pause"
    assert "restarting to use the new version" in report["summary"]
    assert brain.requests == [{"action": "analyze"}], "the analysis is queued again for the new version"
    worker.run_forever()  # returns at once: launchd starts the new version
    assert lines[-1] == "worker: restarting to use the new version of the analyzer"


def test_fingerprints_are_filled_in_once_chromaprint_is_installed(tmp_path: Path, monkeypatch) -> None:
    from synamp_analyzer import pipeline
    from synamp_analyzer.store import Database, load_result

    cfg, music = library(tmp_path, count=2)
    monkeypatch.setattr(pipeline, "find_fpcalc", lambda: None)
    monkeypatch.setattr("synamp_analyzer.identity.find_fpcalc", lambda: None)
    pipeline.run_scan(cfg, progress=lambda *_: None)
    pipeline.run_analyze(cfg, progress=lambda *_: None)
    track = next(music.rglob("01*.flac"))
    with Database(cfg.db_path) as db:
        assert load_result(db, track).fingerprint_status == "tool_missing"

    # Now "installed": a stand-in fpcalc that prints a fingerprint.
    fake = tmp_path / "fpcalc"
    fake.write_text('#!/bin/sh\necho \'{"fingerprint": "AQAAfake"}\'\n')
    fake.chmod(0o755)
    monkeypatch.setattr(pipeline, "find_fpcalc", lambda: str(fake))
    with Database(cfg.db_path) as db:
        assert pipeline.backfill_fingerprints(db, progress=lambda *_: None) == 2
        result = load_result(db, track)
        assert (result.fingerprint, result.fingerprint_status) == ("AQAAfake", "measured")
        assert pipeline.backfill_fingerprints(db, progress=lambda *_: None) == 0, "only once"


def test_export_tells_the_web_app_how_far_it_is(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path)
    brain = FakeBrain([{"id": "a_000000000009", "action": "update"}])
    sent: list[dict | None] = []
    original = brain.post

    def post(path: str, body: dict) -> dict:
        if path.endswith("/activity"):
            assert path == "/api/v1/analyzer/commands/a_000000000009/activity"
            sent.append(body["activity"])
            return {}
        return original(path, body)

    brain.post = post  # type: ignore[method-assign]
    worker, _lines = make(cfg, brain)
    assert worker.once() == "done"
    assert sent[0] == {"kind": "export"}
    assert {"kind": "export", "done": 0, "total": 3} in sent, "tags to read: announced with the count"
    assert {"kind": "export", "done": 3, "total": 3} in sent
    assert sent[-1] is None, "cleared when the export is done"
    assert worker.current is None


def test_activity_never_stops_the_work_when_the_brain_is_old_or_away(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path)
    brain = FakeBrain([{"id": "a_00000000000a", "action": "export"}])
    original = brain.post

    def post(path: str, body: dict) -> dict:
        if path.endswith("/activity"):
            raise BrainError("the brain answered HTTP 404")
        return original(path, body)

    brain.post = post  # type: ignore[method-assign]
    worker, _lines = make(cfg, brain)
    assert worker.once() == "done"
    assert brain.reports["a_00000000000a"]["status"] == "done"


def test_the_worker_says_what_this_mac_has_and_follows_the_memory_setting(tmp_path: Path) -> None:
    cfg, _music = library(tmp_path, count=4)
    brain = FakeBrain([{"id": "a_000000000002", "action": "scan"}, {"id": "a_000000000003", "action": "analyze"}],
                      stop_after_checks=2)
    worker, _lines = make(cfg, brain, now=Clock())
    worker.once()
    hello = brain.hellos[0]
    assert hello["memory_gb"] > 0 and hello["cores"] >= 1, "the web app shows how much memory this Mac has"
    assert worker.allowance.settings["normal_gb"] == 3, "picked up with the command"
    assert hello["memory_now"]["why"] == "normal"
    brain.memory = {"mode": "steady", "normal_gb": 6}
    worker.once()
    assert brain.check_bodies and "memory_now" in brain.check_bodies[0], "it reports what it's using while it works"
    assert worker.allowance.settings["normal_gb"] == 6, "a change arrives during analysis"


def test_open_in_finder_only_inside_the_music_folders(tmp_path: Path) -> None:
    from synamp_analyzer.worker import reveal_target
    cfg, music = library(tmp_path)
    (music.parent / "incoming" / "_duplicates").mkdir(parents=True)
    assert reveal_target(str(music / "Artist" / "Album"), music) == music / "Artist" / "Album"
    assert reveal_target(str(music / "Artist" / "Album (2003)"), music) == music / "Artist", "not there yet: the folder above"
    assert reveal_target(str(music.parent / "incoming" / "_duplicates"), music) == music.parent / "incoming" / "_duplicates"
    assert reveal_target(str(music / ".." / ".." / "secrets"), music) is None
    assert reveal_target("/Users/me/Documents", music) is None
    assert reveal_target("relative/path", music) is None

    opened: list[Path] = []

    class Brain(FakeBrain):
        def post(self, path: str, body: dict) -> dict:
            if path == "/api/v1/analyzer/reveals":
                return {"paths": [str(music / "Artist" / "Album"), "/etc"]}
            return super().post(path, body)

    worker, lines = make(cfg, Brain([]), reveal=lambda folder: opened.append(folder) or True)
    assert worker.reveal_once() == 1
    assert opened == [music / "Artist" / "Album"]
    assert any("not opening '/etc'" in line for line in lines)

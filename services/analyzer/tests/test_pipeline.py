"""End-to-end pipeline behaviour: scanning, analysing, and surviving bad files."""

from __future__ import annotations

from pathlib import Path

from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.pipeline import run_analyze, run_scan
from synamp_analyzer.store import Database, load_result

from synth import corrupt, sine


def config_for(library: Path, tmp_path: Path) -> AnalyzerConfig:
    return AnalyzerConfig(
        library_path=library,
        database_url="postgres://unused",
        cache_dir=tmp_path / "cache",
        db_path=tmp_path / "analyzer.sqlite3",
        workers=1,
    )


def quiet(*_args: object, **_kwargs: object) -> None:
    """Swallow progress output in tests."""


def test_scan_follows_file_symlinks(tmp_path: Path) -> None:
    """A sample is a tree of symlinks. If the scanner ignored file links, every
    sampled run would silently analyse nothing and report success."""
    library = tmp_path / "music"
    library.mkdir()
    sine(library / "one.flac")

    sample = tmp_path / "sample"
    sample.mkdir()
    (sample / "one.flac").symlink_to(library / "one.flac")

    config = config_for(sample, tmp_path)
    scan = run_scan(config, progress=quiet)
    assert scan["scanned"] == 1
    assert scan["enqueued"] == 1


def test_scan_then_analyze_produces_measured_values(tmp_path: Path) -> None:
    library = tmp_path / "music"
    library.mkdir()
    sine(library / "one.flac", amplitude=0.5)
    sine(library / "two.flac", amplitude=0.25)
    config = config_for(library, tmp_path)

    scan = run_scan(config)
    assert scan["scanned"] == 2
    assert scan["enqueued"] == 2

    summary = run_analyze(config, progress=quiet)
    assert summary["completed"] == 2
    assert summary["failed"] == 0

    db = Database(config.db_path)
    try:
        first = load_result(db, library / "one.flac")
        second = load_result(db, library / "two.flac")
    finally:
        db.close()

    assert first is not None and second is not None
    assert first.lufs_integrated is not None
    assert first.stages_done == {"identity", "dsp_core", "beat", "tonal"}
    # The louder file must measure louder — the whole point of the stage.
    assert first.lufs_integrated > second.lufs_integrated


def test_analyze_is_incremental(tmp_path: Path) -> None:
    """Nothing changed means nothing to do."""
    library = tmp_path / "music"
    library.mkdir()
    sine(library / "one.flac")
    config = config_for(library, tmp_path)

    run_scan(config)
    run_analyze(config, progress=quiet)

    second_scan = run_scan(config)
    assert second_scan["enqueued"] == 0
    assert second_scan["requeued"] == 0

    second_run = run_analyze(config, progress=quiet)
    assert second_run["claimed"] == 0


def test_changed_file_is_reanalysed(tmp_path: Path) -> None:
    library = tmp_path / "music"
    library.mkdir()
    track = library / "one.flac"
    sine(track, amplitude=0.5)
    config = config_for(library, tmp_path)

    run_scan(config)
    run_analyze(config, progress=quiet)

    # Replace the audio with something much quieter.
    sine(track, amplitude=0.05)
    rescan = run_scan(config)
    assert rescan["changed"] == 1
    assert rescan["requeued"] == 1

    summary = run_analyze(config, progress=quiet)
    assert summary["completed"] == 1

    db = Database(config.db_path)
    try:
        updated = load_result(db, track)
    finally:
        db.close()
    assert updated is not None and updated.lufs_integrated is not None
    assert updated.lufs_integrated < -20.0, "the quieter replacement must show up"


def test_one_bad_file_does_not_stop_the_run(tmp_path: Path) -> None:
    """A corrupt track fails visibly while its neighbours still complete."""
    library = tmp_path / "music"
    library.mkdir()
    sine(library / "good.flac")
    corrupt(library / "broken.mp3")
    config = config_for(library, tmp_path)

    run_scan(config)
    summary = run_analyze(config, progress=quiet)

    assert summary["completed"] == 1
    assert summary["failed"] == 1

    db = Database(config.db_path)
    try:
        row = db.conn.execute(
            "SELECT state, attempts, error FROM jobs WHERE track_path LIKE '%broken%'"
        ).fetchone()
    finally:
        db.close()
    assert row["state"] == "failed"
    assert row["attempts"] == 1
    assert row["error"]


def test_missing_file_is_marked_not_deleted(tmp_path: Path) -> None:
    """A deleted file stays in the catalog, flagged, so history survives."""
    library = tmp_path / "music"
    library.mkdir()
    track = library / "one.flac"
    sine(track)
    config = config_for(library, tmp_path)

    run_scan(config)
    track.unlink()
    rescan = run_scan(config)

    assert rescan["missing"] == 1
    assert rescan["scanned"] == 0


def test_a_changed_stage_is_redone_and_only_that_stage(tmp_path: Path) -> None:
    """dsp_core moved to revision 2: tracks analysed before redo just dsp_core."""
    import json as _json
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    sine(library / "one.flac", seconds=3.0)
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    assert run_analyze(config, progress=quiet)["completed"] == 1

    db = Database(config.db_path)
    row = db.conn.execute("SELECT payload FROM results").fetchone()
    payload = _json.loads(row["payload"])
    assert payload["stage_revisions"]["dsp_core"] == 2, "new results record the revision they ran at"
    # Pretend it ran at revision 1 (results from before stage revisions existed).
    payload.pop("stage_revisions")
    db.conn.execute("UPDATE results SET payload = ?", (_json.dumps(payload),))
    db.conn.commit()
    identity_hash = payload["audio_hash"]
    db.close()

    summary = run_analyze(config, progress=quiet)
    assert summary["outdated"] == 1 and summary["completed"] == 1
    db = Database(config.db_path)
    redone = load_result(db, library / "one.flac")
    assert redone.stage_revisions["dsp_core"] == 2
    assert redone.audio_hash == identity_hash, "identity was kept, not recomputed"
    assert {"identity", "dsp_core", "beat"} <= redone.stages_done
    db.close()
    assert run_analyze(config, progress=quiet)["outdated"] == 0, "nothing left to redo"
    assert pipeline.analysis_processes(1, 30.0) == 1, "ANALYZER_WORKERS=1 still means one at a time"


def test_several_tracks_at_once(tmp_path: Path, monkeypatch) -> None:
    """With more than one process, every track is analysed once and results match the serial run."""
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    for n in range(5):
        sine(library / f"{n}.flac", seconds=2.0, frequency=220.0 + 50 * n)
    corrupt(library / "bad.flac")
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    monkeypatch.setattr(pipeline, "analysis_processes", lambda *_args: 3)
    lines: list[str] = []
    summary = run_analyze(config, progress=lines.append)
    assert summary["processes"] == 3
    assert summary["completed"] == 5 and summary["failed"] == 1
    assert any("3 tracks at a time" in line for line in lines)
    db = Database(config.db_path)
    states = dict(db.conn.execute("SELECT state, COUNT(*) FROM jobs GROUP BY state").fetchall())
    assert states.get("done") == 5 and not states.get("running")
    for n in range(5):
        result = load_result(db, library / f"{n}.flac")
        assert result is not None and result.spectral_centroid is not None
    db.close()


def test_pause_with_several_processes_lets_started_tracks_finish(tmp_path: Path, monkeypatch) -> None:
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    for n in range(8):
        sine(library / f"{n}.flac", seconds=2.0)
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    monkeypatch.setattr(pipeline, "analysis_processes", lambda *_args: 2)
    asked = {"n": 0}

    def stop_after_first_round() -> bool:
        asked["n"] += 1
        return asked["n"] > 1

    summary = run_analyze(config, progress=quiet, should_stop=stop_after_first_round)
    assert summary.get("stopped") == 1
    assert summary["claimed"] == 2 and summary["completed"] == 2, "the two started tracks finish; nothing new starts"
    db = Database(config.db_path)
    assert db.conn.execute("SELECT COUNT(*) FROM jobs WHERE state = 'running'").fetchone()[0] == 0
    db.close()


def test_a_long_recording_is_analysed_on_its_own(tmp_path: Path, monkeypatch) -> None:
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    for n in range(6):
        sine(library / f"{n}.flac", seconds=2.0)
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    monkeypatch.setattr(pipeline, "analysis_processes", lambda *_args: 3)
    monkeypatch.setattr(pipeline, "is_long_recording", lambda path: path.name == "2.flac")
    lines: list[str] = []
    summary = run_analyze(config, progress=lines.append)
    assert summary["completed"] == 6 and summary["failed"] == 0
    db = Database(config.db_path)
    assert db.conn.execute("SELECT COUNT(*) FROM jobs WHERE state != 'done'").fetchone()[0] == 0
    db.close()
    if any("long recording" in line for line in lines):
        held_at = next(i for i, line in enumerate(lines) if "long recording" in line)
        assert "2.flac" in lines[held_at - 1]


def test_memory_setting_decides_how_many_songs_at_once() -> None:
    from synamp_analyzer import pipeline

    mac = {"memory_gb": 48.0, "cores": 14}
    assert pipeline.recommended_memory_gb(48.0) == 12 and pipeline.recommended_memory_gb(8.0) == 3
    assert pipeline.analysis_processes(16, None, mac) == 4, "recommended on a 48 GB Mac: 12 GB → 4 songs"
    assert pipeline.analysis_processes(16, 3, mac) == 1
    assert pipeline.analysis_processes(16, 30, mac) == 10
    assert pipeline.analysis_processes(16, 200, mac) == 12, "never more than the cores minus two"
    assert pipeline.analysis_processes(16, 2, {"memory_gb": 8.0, "cores": 8}) == 1, "always at least one"
    assert pipeline.analysis_processes(16, 100, {"memory_gb": 16.0, "cores": 10}) == 4, "never past the Mac's memory minus 4 GB"


def test_a_change_of_memory_setting_applies_during_a_run(tmp_path: Path, monkeypatch) -> None:
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    for n in range(8):
        sine(library / f"{n}.flac", seconds=2.0)
    import dataclasses
    config = dataclasses.replace(config_for(library, tmp_path), workers=16)
    run_scan(config, progress=quiet)
    monkeypatch.setattr(pipeline, "machine", lambda: {"memory_gb": 64.0, "cores": 16})
    asked = {"n": 0}

    def setting() -> float:
        asked["n"] += 1
        return 3.0 if asked["n"] < 3 else 9.0  # one song at first, then three

    lines: list[str] = []
    summary = run_analyze(config, progress=lines.append, memory_gb=setting)
    assert summary["completed"] == 8 and summary["processes"] == 3
    assert any("3 tracks at a time from now on" in line for line in lines)


def test_tonal_stage_names_the_key_of_a_chord_progression(tmp_path) -> None:
    import numpy as np
    import soundfile as sf
    from synamp_analyzer.tonal import extract_tonal
    sr = 22050

    def chord(notes, seconds=1.0):
        t = np.arange(int(sr * seconds)) / sr
        return sum(0.15 / h * np.sin(2 * np.pi * 440 * 2 ** ((n - 69) / 12) * h * t) for n in notes for h in range(1, 5)) * np.exp(-t)

    # i–iv–V–i in A minor, then in Eb major; and noise, which has no key.
    a_minor = np.concatenate([chord(c) for _ in range(6) for c in ([57, 60, 64], [50, 53, 57], [52, 56, 59], [57, 60, 64])])
    sf.write(tmp_path / "am.wav", a_minor.astype(np.float32), sr)
    e_flat = np.concatenate([chord(c) for _ in range(6) for c in ([51, 55, 58], [56, 60, 63], [58, 62, 65], [51, 55, 58])])
    sf.write(tmp_path / "eb.wav", e_flat.astype(np.float32), sr)
    sf.write(tmp_path / "noise.wav", np.random.default_rng(0).normal(0, 0.1, sr * 20).astype(np.float32), sr)
    sf.write(tmp_path / "short.wav", a_minor[: sr * 5].astype(np.float32), sr)
    am = extract_tonal(tmp_path / "am.wav")
    assert (am["key"], am["mode"], am["camelot"], am["key_status"]) == ("A minor", "minor", "8A", "measured")
    eb = extract_tonal(tmp_path / "eb.wav")
    assert (eb["key"], eb["camelot"]) == ("Eb major", "5B")
    noise = extract_tonal(tmp_path / "noise.wav")
    assert noise["key_status"] == "unclear" and noise["key"] is None, "no key rather than a guess"
    assert extract_tonal(tmp_path / "short.wav")["key_status"] == "too_short"


def test_more_memory_during_a_busy_run_starts_more_songs_at_once(tmp_path: Path, monkeypatch) -> None:
    """Raising the setting while songs are going must grow the pool straight away,
    not wait for a moment when nothing is in flight (on a big library that never comes)."""
    import concurrent.futures
    import dataclasses
    from synamp_analyzer import pipeline

    library = tmp_path / "music"
    library.mkdir()
    for n in range(12):  # different lengths, like real songs: they rarely all finish at once
        sine(library / f"{n}.flac", seconds=2.0 + 1.5 * (n % 3), frequency=200.0 + 37 * n)
    config = dataclasses.replace(config_for(library, tmp_path), workers=16)
    run_scan(config, progress=quiet)
    monkeypatch.setattr(pipeline, "machine", lambda: {"memory_gb": 64.0, "cores": 16})
    lines: list[str] = []
    started_when_made: dict[int, int] = {}
    real = concurrent.futures.ProcessPoolExecutor

    class Recording(real):  # type: ignore[misc, valid-type]
        def __init__(self, max_workers=None, **kwargs):
            started = sum(1 for line in lines if line.strip().endswith(".flac") and line.startswith("  ") and not line.startswith("    "))
            started_when_made.setdefault(max_workers, started)
            super().__init__(max_workers=max_workers, **kwargs)

    monkeypatch.setattr(concurrent.futures, "ProcessPoolExecutor", Recording)
    asked = {"n": 0}

    def setting() -> float:
        asked["n"] += 1
        return 6.0 if asked["n"] < 3 else 12.0  # two songs at first, then four

    summary = run_analyze(config, progress=lines.append, memory_gb=setting)
    assert summary["completed"] == 12 and summary["processes"] == 4
    assert started_when_made.get(2) == 0, "starts with two at a time"
    assert 4 in started_when_made and started_when_made[4] <= 4, (
        f"four at a time should start within the first few songs, not at the end (pools made after: {started_when_made})")

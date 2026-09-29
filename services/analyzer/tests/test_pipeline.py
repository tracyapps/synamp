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
    assert first.stages_done == {"dsp_core"}
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

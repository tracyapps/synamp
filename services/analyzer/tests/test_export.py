"""The analyzer → brain export contract (AGENT-ROADMAP P1, deliverable 5)."""

from __future__ import annotations

import json
from dataclasses import fields
from pathlib import Path, PurePosixPath

from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.export import (
    EXPORT_FORMAT, EXPORTED_SIGNALS, STATUS_FIELDS, build_export, describe_from_path, track_id, write_export,
)
from synamp_analyzer.metrics import extract_dsp_core
from synamp_analyzer.beat import extract_beat
from synamp_analyzer.models import STAGES, AnalysisResult
from synamp_analyzer.pipeline import run_analyze, run_scan
from synamp_analyzer.queue import JobQueue
from synamp_analyzer.store import Database

from synth import clicks, sine


def config_for(library: Path, tmp_path: Path) -> AnalyzerConfig:
    return AnalyzerConfig(library_path=library, database_url="postgres://unused",
                          cache_dir=tmp_path / "cache", db_path=tmp_path / "analyzer.sqlite3", workers=1)


def quiet(*_args: object, **_kwargs: object) -> None:
    """Swallow progress output."""


def analysed_library(tmp_path: Path) -> tuple[AnalyzerConfig, Path]:
    library = tmp_path / "music"
    (library / "Some Artist" / "First Album").mkdir(parents=True)
    clicks(library / "Some Artist" / "First Album" / "01 - Click Track.flac", seconds=12.0, sample_rate=44100, bpm=120.0)
    sine(library / "loose tone.flac")
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    return config, library


def by_path(document: dict) -> dict[str, dict]:
    return {track["path"]: track for track in document["tracks"]}


def test_every_exported_name_is_declared_and_every_stage_is_covered() -> None:
    declared = {f.name for f in fields(AnalysisResult)}
    for stage, names in {**EXPORTED_SIGNALS}.items():
        assert stage in STAGES, f"{stage} is not a pipeline stage"
        for name in names + STATUS_FIELDS.get(stage, ()):
            assert name in declared, f"{name} is exported but AnalysisResult does not declare it"
    assert set(EXPORTED_SIGNALS) == set(STAGES), "a stage exists that the export does not describe"


def test_stage_outputs_are_either_exported_or_deliberately_internal(tmp_path: Path) -> None:
    """A new field from an extractor must be classified, not silently dropped."""
    internal = {"production", "beat_diagnostics", "beat_count", "true_peak_dbtp", "spectral_rolloff",
                "spectral_flux", "zero_crossing_rate"}
    path = tmp_path / "clicks.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    produced = set(extract_dsp_core(path)) | set(extract_beat(path))
    known = {name for names in EXPORTED_SIGNALS.values() for name in names} | \
        {name for names in STATUS_FIELDS.values() for name in names} | internal
    assert not produced - known, f"unclassified stage outputs: {sorted(produced - known)}"


def test_export_writes_current_measured_values(tmp_path: Path) -> None:
    config, _ = analysed_library(tmp_path)
    with Database(config.db_path) as db:
        document = build_export(db, config.library_path)
    assert document["format"] == EXPORT_FORMAT
    assert document["counts"]["exported"] == 2
    track = by_path(document)["Some Artist/First Album/01 - Click Track.flac"]
    assert track["title"] == "Click Track"
    assert track["artist"] == "Some Artist" and track["album"] == "First Album"
    assert track["metadata_source"] == "path"
    assert track["stages_done"] == ["beat", "dsp_core"]
    assert track["signals"]["lufs_integrated"] < 0
    assert 0 <= track["signals"]["pulse_clarity"] <= 1
    assert track["beat_status"]
    loose = by_path(document)["loose tone.flac"]
    assert "artist" not in loose
    # Null is absence: nothing is exported as a stand-in zero.
    for entry in document["tracks"]:
        assert all(isinstance(value, float) for value in entry["signals"].values())


def test_changed_file_withholds_its_old_values(tmp_path: Path) -> None:
    config, library = analysed_library(tmp_path)
    target = library / "loose tone.flac"
    sine(target, amplitude=0.1, seconds=3.0)  # new bytes, new mtime
    run_scan(config, progress=quiet)
    with Database(config.db_path) as db:
        document = build_export(db, config.library_path)
    loose = by_path(document)["loose tone.flac"]
    assert loose["signals"] == {} and loose["stages_done"] == []
    assert document["counts"]["withheld_stale"] == 1


def test_redo_stage_withholds_only_that_stage(tmp_path: Path) -> None:
    config, _ = analysed_library(tmp_path)
    with Database(config.db_path) as db:
        JobQueue(db).clear_stage("beat")
        track = by_path(build_export(db, config.library_path))["Some Artist/First Album/01 - Click Track.flac"]
    assert track["stages_done"] == ["dsp_core"]
    assert "bpm" in track["signals"]
    assert not set(EXPORTED_SIGNALS["beat"]) & set(track["signals"])
    assert "beat_status" not in track


def test_ids_match_between_a_sample_and_the_full_library(tmp_path: Path) -> None:
    config, library = analysed_library(tmp_path)
    sample = tmp_path / "sample" / "Some Artist" / "First Album"
    sample.mkdir(parents=True)
    (sample / "01 - Click Track.flac").symlink_to(library / "Some Artist" / "First Album" / "01 - Click Track.flac")
    sample_config = config_for(tmp_path / "sample", tmp_path / "s")
    run_scan(sample_config, progress=quiet)
    with Database(config.db_path) as full_db, Database(sample_config.db_path) as sample_db:
        full = build_export(full_db, config.library_path)
        part = build_export(sample_db, sample_config.library_path)
    wanted = "Some Artist/First Album/01 - Click Track.flac"
    assert by_path(full)[wanted]["id"] == by_path(part)[wanted]["id"]


def test_missing_files_are_not_exported_and_write_is_atomic(tmp_path: Path) -> None:
    config, library = analysed_library(tmp_path)
    (library / "loose tone.flac").unlink()
    run_scan(config, progress=quiet)
    out = tmp_path / "out" / "library-signals.json"
    with Database(config.db_path) as db:
        counts = write_export(db, config.library_path, out)
    assert counts["missing_on_disk"] == 1 and counts["exported"] == 1
    document = json.loads(out.read_text())
    assert [track["path"] for track in document["tracks"]] == ["Some Artist/First Album/01 - Click Track.flac"]
    assert not list(out.parent.glob("*.tmp"))


def test_path_metadata_and_ids() -> None:
    assert describe_from_path(PurePosixPath("Compilations/Hits/03. Song.mp3")) == \
        {"title": "Song", "metadata_source": "path", "album": "Hits"}
    assert describe_from_path(PurePosixPath("A/B/1-07 Name - Part 2.flac"))["title"] == "Name - Part 2"
    assert describe_from_path(PurePosixPath("A/B/1999.flac"))["title"] == "1999"
    assert track_id(PurePosixPath("A/b.flac")) != track_id(PurePosixPath("a/b.flac"))
    assert track_id(PurePosixPath("A/b.flac")).startswith("p:")

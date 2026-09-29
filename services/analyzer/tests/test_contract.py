"""The contract between the extractors and the stored record.

A field that an extractor computes but the model does not declare is silently
dropped when the record is serialised — the stage appears to have run, the value
appears nowhere, and nothing errors. That is how a "measured" metric ends up null
in every row, so it is tested rather than trusted.
"""

from __future__ import annotations

from dataclasses import fields
from pathlib import Path

from synamp_analyzer.beat import extract_beat
from synamp_analyzer.metrics import extract_dsp_core
from synamp_analyzer.models import AnalysisResult

from synth import clicks, layered, sine


def declared_fields() -> set[str]:
    return {f.name for f in fields(AnalysisResult)}


def test_dsp_core_only_returns_declared_fields(tmp_path: Path) -> None:
    path = tmp_path / "tone.flac"
    sine(path)
    produced = set(extract_dsp_core(path))
    undeclared = produced - declared_fields()
    assert not undeclared, (
        f"extract_dsp_core computes {sorted(undeclared)}, which AnalysisResult does "
        "not declare — these values would be dropped on save"
    )


def test_beat_only_returns_declared_fields(tmp_path: Path) -> None:
    path = tmp_path / "clicks.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    produced = set(extract_beat(path))
    undeclared = produced - declared_fields()
    assert not undeclared, (
        f"extract_beat computes {sorted(undeclared)}, which AnalysisResult does "
        "not declare — these values would be dropped on save"
    )


def test_stage_fields_survive_a_save_and_load_round_trip(tmp_path: Path) -> None:
    """The values that carried a bug once: computed, then discarded in silence."""
    from synamp_analyzer.store import Database, load_result, save_result

    path = tmp_path / "tone.flac"
    sine(path, amplitude=0.9)
    fields = extract_dsp_core(path)
    result = AnalysisResult(track_path=path)
    for key, value in fields.items():
        setattr(result, key, value)
    result.stages_done.add("dsp_core")

    db = Database(tmp_path / "roundtrip.sqlite3")
    try:
        save_result(db, result, "test")
        loaded = load_result(db, path)
    finally:
        db.close()

    assert loaded is not None
    assert loaded.clipping_density is not None, "a computed field must survive the save"
    assert loaded.spectral_tilt is not None
    assert loaded.production, "the era cue must survive too"


def test_layered_and_swing_fields_are_present_after_the_beat_stage(tmp_path: Path) -> None:
    path = tmp_path / "laidback.flac"
    layered(path, seconds=12.0, sample_rate=44100, bpm=120.0, offset_ms=30.0)
    result = AnalysisResult(track_path=path)
    for key, value in extract_beat(path).items():
        setattr(result, key, value)
    assert result.microtiming_signed is not None
    assert result.beat_grid_strength is not None

"""Beat-grid and microtiming behaviour.

The synthetic patterns here are built so the *right answer is known from the
signal itself*: a click track's grid, a layered track's offset, a swung track's
offbeat position. If these drift, the numbers describing a real performance are
fiction.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from synamp_analyzer.beat import extract_beat

from synth import clicks, layered, noise, swung


def test_straight_click_track_is_found_and_is_tight(tmp_path: Path) -> None:
    path = tmp_path / "straight.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    fields = extract_beat(path)

    assert fields["beat_count"] is not None and fields["beat_count"] > 15
    assert fields["beat_grid_strength"] > 0.4, "a metronome is almost all on-grid energy"
    # A metronome is machine-perfect, so the deviation measured is really the
    # detector's own resolution. Anything above a frame or two is a bug.
    assert 0.0 <= fields["microtiming_tightness"] < 15.0
    assert abs(fields["microtiming_signed"]) < 10.0


def test_laid_back_layer_reads_as_behind(tmp_path: Path) -> None:
    """Weak onsets consistently after the beat must read as negative (late)."""
    path = tmp_path / "laidback.flac"
    layered(path, seconds=12.0, sample_rate=44100, bpm=120.0, offset_ms=30.0)
    fields = extract_beat(path)

    assert fields["microtiming_signed"] is not None
    assert fields["microtiming_signed"] < -8.0, "late onsets must be negative"
    assert fields["microtiming_tightness"] is not None
    assert fields["microtiming_tightness"] > 5.0


def test_pushing_layer_reads_as_ahead(tmp_path: Path) -> None:
    """The same construction, played early, must flip the sign."""
    path = tmp_path / "pushing.flac"
    layered(path, seconds=12.0, sample_rate=44100, bpm=120.0, offset_ms=-30.0)
    fields = extract_beat(path)

    assert fields["microtiming_signed"] is not None
    assert fields["microtiming_signed"] > 8.0, "early onsets must be positive"


def test_swing_ratio_recovers_a_triplet_feel(tmp_path: Path) -> None:
    path = tmp_path / "swung.flac"
    swung(path, seconds=12.0, sample_rate=44100, bpm=120.0, offbeat=0.667)
    fields = extract_beat(path)

    assert fields["swing_ratio"] is not None
    assert fields["swing_ratio"] == pytest.approx(0.667, abs=0.06)


def test_straight_offbeats_are_not_reported_as_swing(tmp_path: Path) -> None:
    """Eighth notes at 0.5 must not be mistaken for a swung feel."""
    path = tmp_path / "eighths.flac"
    swung(path, seconds=12.0, sample_rate=44100, bpm=120.0, offbeat=0.5)
    fields = extract_beat(path)

    assert fields["swing_ratio"] is not None
    assert fields["swing_ratio"] == pytest.approx(0.5, abs=0.06)


def test_a_track_with_no_offbeats_reports_no_swing(tmp_path: Path) -> None:
    """An absent value is not the same as a straight feel."""
    path = tmp_path / "onbeat.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    assert extract_beat(path)["swing_ratio"] is None


def test_unpitched_noise_yields_no_grid(tmp_path: Path) -> None:
    """No usable tempo means no grid, and the stage must say so rather than
    invent one and report the track as perfectly on-beat."""
    path = tmp_path / "noise.flac"
    noise(path, seconds=8.0, sample_rate=44100)
    fields = extract_beat(path)
    assert fields["microtiming_tightness"] is None
    assert fields["microtiming_signed"] is None
    assert fields["swing_ratio"] is None

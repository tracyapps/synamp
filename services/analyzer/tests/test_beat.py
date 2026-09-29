"""Beat-grid and microtiming behaviour.

The synthetic patterns here are built so the *right answer is known from the
signal itself*: a click track's pulse, a layered track's offset, a swung track's
offbeat position, a ramped track's direction of drift. If these drift, the
numbers describing a real performance are fiction.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from synamp_analyzer.beat import extract_beat

from synth import clicks, drifting, layered, noise, swung


def test_straight_click_track_is_found_and_is_tight(tmp_path: Path) -> None:
    path = tmp_path / "straight.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    fields = extract_beat(path)

    assert fields["beat_count"] is not None and fields["beat_count"] > 15
    assert fields["beat_grid_strength"] > 0.5, "a metronome has an unmistakable pulse"
    # A metronome is machine-perfect, so what is measured here is really the
    # detector's own resolution. Anything above a few milliseconds is a bug.
    assert 0.0 <= fields["microtiming_tightness"] < 15.0
    assert abs(fields["microtiming_signed"]) < 10.0
    # Machine timing means the intervals barely vary.
    assert fields["beat_interval_cv"] is not None
    assert fields["beat_interval_cv"] < 0.05


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
    # Straight eighths are antipodal within the beat, so a beat-period measure of
    # periodicity collapses. The stage must still call this material rhythmic.
    assert fields["beat_grid_strength"] > 0.5


def test_a_track_with_no_offbeats_reports_no_swing(tmp_path: Path) -> None:
    """An absent value is not the same as a straight feel."""
    path = tmp_path / "onbeat.flac"
    clicks(path, seconds=12.0, sample_rate=44100, bpm=120.0)
    assert extract_beat(path)["swing_ratio"] is None


def test_a_ramped_track_is_tracked_and_its_drift_reported(tmp_path: Path) -> None:
    """The reason this stage uses dynamic programming rather than a grid.

    A track that speeds up has no single tempo, so a fixed-tempo grid either
    fails it entirely or reports a fictitious "feel" made of drift. The tracker
    must follow it and the drift must show up as a number.
    """
    path = tmp_path / "ramp.flac"
    drifting(path, seconds=20.0, sample_rate=44100, start_bpm=100.0, end_bpm=140.0)
    fields = extract_beat(path)

    assert fields["beat_grid_strength"] is not None, "a ramped click track is still rhythmic"
    assert fields["tempo_drift"] is not None
    # For a linear 100→140 ramp the first-half and second-half median intervals
    # differ by ~0.15, so that is what a correct tracker reports here.
    assert fields["tempo_drift"] > 0.10, "speeding up must read as positive drift"
    # A ramp is not metronomic, so interval variability must be visible too.
    assert fields["beat_interval_cv"] is not None
    assert fields["beat_interval_cv"] > 0.02


def test_unpitched_noise_yields_no_grid(tmp_path: Path) -> None:
    """No pulse means no grid, and the stage must say so rather than invent one
    and report the track as perfectly on-beat."""
    path = tmp_path / "noise.flac"
    noise(path, seconds=8.0, sample_rate=44100)
    fields = extract_beat(path)
    assert fields["microtiming_tightness"] is None
    assert fields["microtiming_signed"] is None
    assert fields["swing_ratio"] is None
    assert fields["beat_grid_strength"] is None


@pytest.mark.parametrize("seed,bpm", [(7, 90), (21, 120), (42, 150)])
def test_dense_accompaniment_does_not_erase_a_known_pulse(tmp_path, seed, bpm):
    from synth import dense_pulse

    path = tmp_path / "dense.flac"
    dense_pulse(path, seed=seed, bpm=bpm)
    fields = extract_beat(path)
    assert fields["beat_status"] == "tracked"
    assert fields["beat_count"] == pytest.approx(15 * bpm / 60, abs=3)
    assert fields["beat_grid_strength"] >= 0.5


def test_drift_is_not_reported_as_microtiming(tmp_path):
    path = tmp_path / "drift.flac"
    drifting(path, start_bpm=100, end_bpm=140)
    fields = extract_beat(path)
    assert fields["beat_status"] == "tracked"
    assert fields["timing_status"] == "unstable_reference"
    assert fields["microtiming_signed"] is None
    assert fields["microtiming_tightness"] is None
    assert fields["swing_ratio"] is None


@pytest.mark.parametrize("seed", [1, 7, 19, 41])
def test_random_dense_envelope_does_not_gain_a_grid_from_optimization(seed):
    import numpy as np
    from synamp_analyzer.beat import predictive_grid_strength, track_beats

    envelope = np.random.default_rng(seed).exponential(size=8000)
    beats = track_beats(envelope, 200, 120)
    assert predictive_grid_strength(envelope, beats, 200) < 0.5


def test_short_centered_envelope_preserves_length():
    import numpy as np
    from synamp_analyzer.beat import centered_envelope

    assert centered_envelope(np.ones(16), 689).shape == (16,)


def test_decimated_tracker_preserves_beat_times(monkeypatch):
    import numpy as np
    import synamp_analyzer.beat as beat

    envelope = np.zeros(8000)
    envelope[100::100] = 1
    full = beat.track_beats(envelope, 200, 120)
    monkeypatch.setattr(beat, "MAX_DP_FRAMES", 2000)
    decimated = beat.track_beats(envelope, 200, 120)
    assert len(full) == len(decimated)
    assert np.max(np.abs(full - decimated)) <= 4


def test_tempo_drift_is_fractional_bpm_change():
    import numpy as np
    from synamp_analyzer.beat import tempo_drift

    # Half at 120 BPM, half at 150 BPM: a 25% tempo increase.
    beats = np.r_[np.arange(5) * 0.5, 2.5 + np.arange(5) * 0.4]
    assert tempo_drift(beats) == pytest.approx(0.25)


def test_coarse_tracker_resolution_cannot_claim_fine_timing(tmp_path, monkeypatch):
    import synamp_analyzer.beat as beat

    path = tmp_path / "long-resolution.flac"
    clicks(path, seconds=12, sample_rate=44100)
    # Force the resolution a long recording would receive without a huge file.
    monkeypatch.setattr(beat, "MAX_DP_FRAMES", 500)
    fields = beat.extract_beat(path)
    assert fields["beat_status"] == "tracked"
    assert fields["timing_status"] == "insufficient_timing_resolution"
    assert fields["microtiming_signed"] is None

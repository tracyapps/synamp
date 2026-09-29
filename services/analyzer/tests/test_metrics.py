"""Metric correctness.

These tests check the measurements against properties that are known from the
signal itself — a sine's crest factor, the 6 dB step from halving amplitude, the
period of a click track — rather than against remembered constants.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from synamp_analyzer.metrics import (
    clipping_density,
    decode_mono,
    extract_dsp_core,
    loudness_metrics,
    tempo_estimate,
)

from synth import clicks, clipped, corrupt, sine


def test_crest_factor_of_a_sine_is_about_3_db(tmp_path: Path) -> None:
    """A pure sine has a peak-to-RMS ratio of ~3.01 dB. If this drifts, the
    RMS or peak path is wrong and every 'punchy vs squashed' reading is wrong
    with it."""
    path = tmp_path / "tone.flac"
    sine(path, amplitude=0.5)
    mono, sr = decode_mono(path)
    metrics = loudness_metrics(mono, sr)
    assert metrics["crest_factor"] is not None
    assert metrics["crest_factor"] == pytest.approx(3.01, abs=0.6)


def test_loudness_tracks_amplitude_by_six_db_per_halving(tmp_path: Path) -> None:
    """Doubling amplitude is +6.02 dB of level; a loudness meter must show it."""
    loud_path, quiet_path = tmp_path / "loud.flac", tmp_path / "quiet.flac"
    sine(loud_path, amplitude=0.5)
    sine(quiet_path, amplitude=0.25)

    loud, sr = decode_mono(loud_path)
    quiet, _ = decode_mono(quiet_path)
    loud_lufs = loudness_metrics(loud, sr)["lufs_integrated"]
    quiet_lufs = loudness_metrics(quiet, sr)["lufs_integrated"]

    assert loud_lufs is not None and quiet_lufs is not None
    assert loud_lufs - quiet_lufs == pytest.approx(6.02, abs=0.3)
    # Sanity band: a half-scale tone lands well below 0 LUFS, nowhere near silence.
    assert -14.0 < loud_lufs < -6.0


def test_silence_has_no_loudness_rather_than_zero(tmp_path: Path) -> None:
    """'Not computed' and 'computed as zero' must stay distinguishable."""
    path = tmp_path / "silence.flac"
    sf.write(str(path), np.zeros(44100, dtype=np.float32), 44100)
    mono, sr = decode_mono(path)
    assert loudness_metrics(mono, sr)["lufs_integrated"] is None


def test_clipping_density_separates_clean_from_square(tmp_path: Path) -> None:
    clean, square = tmp_path / "clean.flac", tmp_path / "square.flac"
    sine(clean, amplitude=0.5)
    clipped(square)

    clean_mono, _ = decode_mono(clean)
    square_mono, _ = decode_mono(square)
    assert clipping_density(clean_mono) == 0.0
    assert clipping_density(square_mono) > 0.5


def test_click_track_tempo_is_recovered(tmp_path: Path) -> None:
    """120 BPM clicks must come back as ~120 BPM, not 60 or 240."""
    path = tmp_path / "clicks.flac"
    clicks(path, sample_rate=44100, bpm=120.0)
    mono, sr = decode_mono(path)
    result = tempo_estimate(mono, sr)
    assert result["bpm"] is not None
    assert result["bpm"] == pytest.approx(120.0, rel=0.12)
    assert result["tempo_confidence"] is not None
    assert result["tempo_confidence"] > 0.2, "a metronome should read as confident"


def test_pulse_clarity_is_higher_for_a_metronome_than_for_noise(tmp_path: Path) -> None:
    """The proxy has to separate periodic from unperiodic material, or it is
    decoration."""
    metronome, noise = tmp_path / "metronome.flac", tmp_path / "noise.flac"
    clicks(metronome, sample_rate=44100)
    rng = np.random.default_rng(7)
    sf.write(str(noise), (rng.normal(0, 0.2, 44100 * 8)).astype(np.float32), 44100)

    periodic, sr = decode_mono(metronome)
    aperiodic, _ = decode_mono(noise)
    periodic_clarity = tempo_estimate(periodic, sr)["pulse_clarity"]
    noise_clarity = tempo_estimate(aperiodic, sr)["pulse_clarity"]

    assert periodic_clarity is not None and noise_clarity is not None
    assert periodic_clarity > noise_clarity


def test_dynamic_complexity_is_higher_when_the_level_moves(tmp_path: Path) -> None:
    steady, moving = tmp_path / "steady.flac", tmp_path / "moving.flac"
    sine(steady, seconds=6.0, amplitude=0.5)

    t = np.linspace(0.0, 6.0, 44100 * 6, endpoint=False)
    envelope = 0.5 * (0.2 + 0.8 * np.abs(np.sin(2 * np.pi * 0.5 * t)))
    sf.write(str(moving), (envelope * np.sin(2 * np.pi * 440 * t)).astype(np.float32), 44100)

    steady_features = extract_dsp_core(steady)
    moving_features = extract_dsp_core(moving)
    assert steady_features["dynamic_complexity"] is not None
    assert moving_features["dynamic_complexity"] is not None
    assert moving_features["dynamic_complexity"] > steady_features["dynamic_complexity"]


def test_extract_returns_the_production_era_cue(tmp_path: Path) -> None:
    path = tmp_path / "tone.flac"
    sine(path)
    fields = extract_dsp_core(path)
    production = fields["production"]
    assert isinstance(production, dict)
    # The era cue is assembled from mastering measures, never from the year tag.
    assert "crest_factor" in production
    assert "clipping_density" in production


def test_decode_falls_back_when_the_primary_decoder_fails(tmp_path: Path, monkeypatch) -> None:
    """AAC/M4A is invisible to libsndfile, and on a real library that was one
    file in seven — all of them reported as failures. The fallback path is what
    stops a format gap from looking like corruption."""
    import synamp_analyzer.metrics as metrics

    path = tmp_path / "tone.wav"
    sine(path, seconds=1.0, sample_rate=22050, amplitude=0.5)

    def unreadable(*_args, **_kwargs):
        raise RuntimeError("this decoder cannot read the file")

    monkeypatch.setattr(metrics.sf, "read", unreadable)
    mono, sample_rate = metrics.decode_mono(path)

    assert sample_rate == 22050
    assert mono.size > 0
    assert float(np.max(np.abs(mono))) > 0.1, "the fallback must return real audio"


def test_corrupt_file_raises_rather_than_returning_junk(tmp_path: Path) -> None:
    """A failed decode must be an error the queue can record, not a row of
    nulls that looks like a legitimate measurement."""
    path = corrupt(tmp_path / "broken.mp3")
    with pytest.raises(Exception):
        decode_mono(path)


def test_fft_tempo_matches_direct_correlation(monkeypatch):
    import synamp_analyzer.metrics as metrics

    rng = np.random.default_rng(18)
    envelope = rng.uniform(0, 0.2, 5000)
    envelope[::100] += 1
    monkeypatch.setattr(metrics, "onset_envelope", lambda *_: (envelope, 200.0))
    audio = np.zeros(20000)
    fft_result = metrics.tempo_estimate(audio, 44100)
    monkeypatch.setattr(metrics.signal, "correlate",
                        lambda a, b, **_: np.correlate(a, b, mode="full"))
    direct_result = metrics.tempo_estimate(audio, 44100)
    assert fft_result == pytest.approx(direct_result, abs=1e-10)

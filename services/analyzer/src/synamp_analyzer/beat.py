"""The beat-grid stage.

`dsp_core` answers "how fast does this feel?" with an autocorrelation number.
This stage answers the question the tempo number cannot: **where are the beats,
and how do the played notes sit relative to them?**

That distinction is the whole point. The owner's own hypothesis — that a track's
energy often comes from the beat sitting slightly ahead of or behind the grid
rather than from its BPM — only becomes measurable once there is a grid to
deviate from. So this stage produces:

* `beat_count` — beats found, not inferred from an onset rate.
* `beat_grid_strength` — how much better the best grid explains the onset energy
  than a random phase does. Near 0 means the "grid" is fiction and the
  microtiming numbers must be thrown away; near 1 means the grid is real.
* `microtiming_tightness` — mean absolute deviation of onsets from the grid, ms.
  Tight/programmed versus loose/human.
* `microtiming_signed` — mean signed deviation, ms. **Positive means onsets land
  early (pushing); negative means late (laid back).**
* `swing_ratio` — position of the offbeat inside the beat, as a fraction. 0.5 is
  straight eighths, ~0.667 is triplet swing.

Method, and its honest limits: the tempo is treated as fixed for the whole track
(no metrical model, no tempo curve), the grid phase is chosen by maximising
onset energy on grid positions, and the microtiming measurements are made
against that *rigid* grid — which is what "deviation from the grid" means.
Material with real tempo changes, free-time playing, or a beat the detector
cannot hear will produce numbers that must be rejected on `beat_grid_strength`
and `tempo_confidence`, never trusted.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from .metrics import (
    decode_mono,
    detect_onset_frames,
    frame_to_time,
    onset_envelope,
    tempo_estimate,
)

# How far from a grid line an onset may sit and still count as "on" it. Beyond
# this it is an off-grid note (a syncopation, a fill), and including it would
# punish the track for being interesting.
GRID_TOLERANCE_FRACTION = 0.25

# Window in which an onset counts as the offbeat, for swing.
SWING_WINDOW = (0.35, 0.85)
MIN_SWING_OBSERVATIONS = 6

# Below this contrast there is no grid worth reporting. Calibrated against
# synthetic patterns: a metronome scores near 0.9, unperiodic noise near 0.1.
MIN_GRID_CONTRAST = 0.25


def grid_score(envelope: np.ndarray, phase: float, period: float) -> float:
    """Onset energy landing on a rigid grid of the given phase and period.

    Each grid position takes its own frame plus half of each neighbour, so a
    beat landing between two frames is not penalised for the quantisation.
    """
    positions = np.arange(phase, envelope.size, period)
    indices = np.round(positions).astype(int)
    indices = indices[(indices >= 0) & (indices < envelope.size)]
    if indices.size == 0:
        return 0.0
    energy = envelope[indices].sum()
    energy += 0.5 * envelope[np.maximum(indices - 1, 0)].sum()
    energy += 0.5 * envelope[np.minimum(indices + 1, envelope.size - 1)].sum()
    return float(energy)


def estimate_grid(
    envelope: np.ndarray, frame_rate: float, bpm: float
) -> tuple[float, float, float] | None:
    """Best (phase, period, contrast) in frames for a fixed tempo.

    The period comes from the tempo estimate; only the phase is searched, which
    is the one unknown a rigid grid leaves. The returned contrast compares the
    best phase against the average phase: it is what separates "a grid exists"
    from "a line was drawn across some noise".
    """
    if bpm <= 0 or not np.isfinite(bpm):
        return None
    period = frame_rate * 60.0 / bpm
    if period < 2.0 or period > envelope.size:
        return None

    phases = np.arange(0.0, period, 0.5)
    if phases.size == 0:
        return None
    scores = np.array([grid_score(envelope, phase, period) for phase in phases])
    if not np.any(scores > 0):
        return None

    best_index = int(np.argmax(scores))
    best = float(scores[best_index])
    mean = float(np.mean(scores))
    contrast = 1.0 - (mean / best if best > 0 else 1.0)
    return float(phases[best_index]), float(period), float(max(0.0, min(1.0, contrast)))


def grid_times(
    phase: float, period: float, sample_rate: int, duration: float
) -> np.ndarray:
    """Beat times in seconds covering the track, in the same time base as
    detected onsets — otherwise every comparison between them carries a
    constant offset that looks like a systematic timing feel."""
    if period <= 0 or sample_rate <= 0:
        return np.zeros(0, dtype=np.float64)
    count = int(np.ceil((duration * sample_rate + 1) / period)) + 1
    frames = phase + period * np.arange(max(count, 0))
    times = frame_to_time(frames, sample_rate)
    return times[(times >= 0) & (times <= duration)]


def microtiming_stats(
    onset_times: np.ndarray,
    beats: np.ndarray,
    period_seconds: float,
    tolerance_fraction: float = GRID_TOLERANCE_FRACTION,
) -> tuple[float | None, float | None, int]:
    """(tightness_ms, signed_ms, observations) of onsets relative to the grid.

    Only onsets close to a grid line count. Everything else is an off-grid note
    and says nothing about how the beat is being played.
    """
    if beats.size < 2 or onset_times.size == 0 or period_seconds <= 0:
        return None, None, 0

    anchor = beats[0]
    indices = np.round((onset_times - anchor) / period_seconds)
    nearest = anchor + indices * period_seconds
    deviations = onset_times - nearest
    tolerance = tolerance_fraction * period_seconds
    deviations = deviations[np.abs(deviations) <= tolerance]
    if deviations.size == 0:
        return None, None, 0

    tightness = float(np.mean(np.abs(deviations)) * 1000.0)
    # Positive = the note arrives before the grid line = pushing ahead.
    signed = float(-np.mean(deviations) * 1000.0)
    return tightness, signed, int(deviations.size)


def swing_position(
    onset_times: np.ndarray, beats: np.ndarray, period_seconds: float
) -> tuple[float | None, int]:
    """Median position of the offbeat inside the beat, as a fraction of it.

    Returns None when there is not enough evidence — a track with no offbeats
    genuinely has no swing ratio, and reporting 0.5 for it would be a lie.
    """
    if beats.size < 3 or onset_times.size == 0 or period_seconds <= 0:
        return None, 0

    positions: list[float] = []
    low, high = SWING_WINDOW
    for start in beats[:-1]:
        window_start = start + low * period_seconds
        window_end = start + high * period_seconds
        candidates = onset_times[(onset_times >= window_start) & (onset_times <= window_end)]
        if candidates.size:
            positions.append(float((candidates[0] - start) / period_seconds))
    if len(positions) < MIN_SWING_OBSERVATIONS:
        return None, len(positions)
    return float(np.median(positions)), len(positions)


def extract_beat(path: Path) -> dict[str, object]:
    """Run the beat stage for one file.

    Returns nothing usable (all None) when there is no grid to find — an absent
    grid is a fact, not a failure, and it must not be written as though the track
    were perfectly on-beat.
    """
    empty: dict[str, object] = {
        "beat_count": None,
        "beat_grid_strength": None,
        "microtiming_tightness": None,
        "microtiming_signed": None,
        "swing_ratio": None,
    }

    mono, sample_rate = decode_mono(path)
    envelope, frame_rate = onset_envelope(mono, sample_rate)
    if envelope.size < 16 or not np.any(envelope > 0):
        return empty

    tempo = tempo_estimate(mono, sample_rate)
    bpm, confidence = tempo["bpm"], tempo["tempo_confidence"]
    if bpm is None or confidence is None or confidence < 0.25:
        return empty

    grid = estimate_grid(envelope, frame_rate, bpm)
    if grid is None:
        return empty
    phase, period, contrast = grid
    if contrast < MIN_GRID_CONTRAST:
        # A grid drawn across material with no beat is worse than no grid: it
        # would report confident microtiming numbers about a pulse that is not
        # there.
        return empty

    period_seconds = period / frame_rate
    duration = mono.size / sample_rate
    beats = grid_times(phase, period, sample_rate, duration)
    if beats.size < 4:
        return empty

    frames = detect_onset_frames(envelope, frame_rate)
    onset_times = frame_to_time(frames, sample_rate)
    tightness, signed, _ = microtiming_stats(onset_times, beats, period_seconds)
    swing, _ = swing_position(onset_times, beats, period_seconds)

    return {
        "beat_count": int(beats.size),
        "beat_grid_strength": contrast,
        "microtiming_tightness": tightness,
        "microtiming_signed": signed,
        "swing_ratio": swing,
    }

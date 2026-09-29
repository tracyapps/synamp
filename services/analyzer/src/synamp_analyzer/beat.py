"""The beat-grid stage.

`dsp_core` answers "how fast does this feel?" with an autocorrelation number.
This stage answers the question the tempo number cannot: **where are the beats,
and how do the played notes sit relative to them?**

That distinction is the whole point. The owner's own hypothesis — that a track's
energy often comes from the beat sitting slightly ahead of or behind the grid
rather than from its BPM — only becomes measurable once there is a grid to
deviate from.

**Why dynamic programming rather than a rigid grid.** A fixed grid assumes one
tempo for the whole recording. Live and acoustic material drifts, speeds up into
choruses and sags at endings, and a rigid grid either rejects it outright or
reports a fictitious "feel" made of drift. The tracker here is the classic
dynamic-programming formulation: each beat is chosen to sit on onset energy while
paying a penalty for departing from the expected interval. That permits tempo to
vary smoothly without any explicit tempo curve, so a drifting performance can
still be tracked and described.

What the stage produces:

* `beat_count` — beats found, not inferred from an onset rate.
* `beat_grid_strength` — local predicted-pulse contrast times supported-beat
  fraction. A heuristic evidence score, not a calibrated probability.
* `beat_interval_cv` — variability of the beat intervals, relative to their mean.
  Programmed material sits near 0; a human performance does not.
* `tempo_drift` — fractional change in tempo from the first half of the track to
  the second. Positive = it speeds up; negative = it sags.
* `microtiming_tightness` — mean absolute deviation of onsets from the fitted
  grid, ms.
* `microtiming_signed` — mean signed deviation, ms. **Positive means onsets land
  early (pushing); negative means late (laid back).**
* `swing_ratio` — position of the offbeat inside the beat. 0.5 is straight
  eighths, ~0.667 is triplet swing.

Microtiming is a descriptive residual relative to a fitted pulse, not an
instrument-specific or perceptual verdict. A whole-track fit is used only when
its RMS residual is at most 15 ms and the onset population is concentrated.
Drifting or ambiguous recordings retain beat diagnostics but abstain from
microtiming and swing until an independent local reference is available.
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

# Window in which an onset counts as the offbeat, for swing. The lower bound
# reaches below a third of the beat on purpose: when a tracker locks onto the
# offbeat cluster instead of the downbeat, the remaining onsets sit near 0.33, and
# returning nothing there would be less honest than returning the measured value.
SWING_WINDOW = (0.30, 0.85)
MIN_SWING_OBSERVATIONS = 6

# A provisional tempo candidate needs a second, local pulse-evidence gate.
MIN_TEMPO_CONFIDENCE = 0.25
MIN_PREDICTIVE_STRENGTH = 0.5
MAX_REFERENCE_RMS_MS = 15.0
MIN_TIMING_CONCENTRATION = 0.3
BEAT_METHOD = "dp_predictive_contrast_v1"

# How hard the tracker is pushed to keep a steady interval. Higher = more rigid.
#
# With peak-normalized onset scores, 6 follows the constructed 100→140 BPM
# ramp; the previous value 20 inserted unsupported beats in its slower half.
DP_TIGHTNESS = 6.0

# The tracker is a Python-level dynamic program, so it scales with the number of
# envelope frames. Decimate long tracks rather than let a single file stall a run;
# Timing eligibility separately checks the resulting resolution.
MAX_DP_FRAMES = 200_000


def centered_envelope(envelope: np.ndarray, frame_rate: float) -> np.ndarray:
    """Onset envelope with its local mean removed, then normalised.

    This is what makes one set of tracker parameters work on both a metronome and
    a dense mix. A click track's envelope is mostly zeros with occasional spikes;
    real music's is a busy baseline with peaks on top. Without removing that
    baseline, a beat placed anywhere on the baseline still collects score, and the
    tracker answers by placing a beat on almost every onset — measured at up to
    five beats a second on real material. Subtracting the local mean leaves only
    what actually stands out, which is what a beat is.
    """
    if envelope.size == 0:
        return envelope
    window = min(envelope.size, max(3, int(0.5 * frame_rate)))
    kernel = np.ones(window) / window
    local_mean = np.convolve(envelope, kernel, mode="same")
    centered = envelope - local_mean
    centered[centered < 0] = 0.0
    peak = float(np.max(centered))
    return centered / peak if peak > 0 else centered


def track_beats(
    envelope: np.ndarray, frame_rate: float, bpm: float, tightness: float = DP_TIGHTNESS
) -> np.ndarray:
    """Beat frame indices chosen by dynamic programming.

    Each candidate beat takes the onset energy at its position plus the best
    achievable score from a preceding beat, minus a penalty that grows with the
    square of the log ratio between the actual interval and the expected one.
    That penalty is what lets the tempo wander instead of forcing a single grid.

    Returns frames in ascending order (empty if no tempo is usable).
    """
    if envelope.size < 16 or bpm <= 0 or not np.isfinite(bpm):
        return np.zeros(0, dtype=np.int64)

    decimation = max(1, int(np.ceil(envelope.size / MAX_DP_FRAMES)))
    if decimation > 1:
        usable = (envelope.size // decimation) * decimation
        envelope = envelope[:usable].reshape(-1, decimation).mean(axis=1)
    scored_frame_rate = frame_rate / decimation

    onset = centered_envelope(envelope, scored_frame_rate)
    frames = onset.size
    period = scored_frame_rate * 60.0 / bpm
    if period < 2.0 or frames < period * 2:
        return np.zeros(0, dtype=np.int64)

    low_offset = max(1, int(round(0.5 * period)))
    high_offset = max(low_offset + 1, int(round(2.0 * period)))
    offsets = np.arange(low_offset, high_offset + 1)
    penalty = -tightness * np.log(offsets / period) ** 2

    cumulative = onset.astype(np.float64).copy()
    previous = np.full(frames, -1, dtype=np.int64)

    # Sequentially over frames, because a beat's best predecessor must itself be
    # final before it is used. Processing offset-by-offset would be faster and
    # would quietly read half-updated scores.
    for frame in range(low_offset, frames):
        start = max(0, frame - high_offset)
        stop = frame - low_offset + 1
        if stop <= start:
            continue
        candidates = cumulative[start:stop] + penalty[frame - np.arange(start, stop) - low_offset]
        best = int(np.argmax(candidates))
        if candidates[best] <= 0:
            continue
        cumulative[frame] += candidates[best]
        previous[frame] = start + best

    # Backtrack from the best final beat.
    beats: list[int] = []
    cursor = int(np.argmax(cumulative))
    while cursor >= 0 and len(beats) <= frames:
        beats.append(cursor)
        cursor = int(previous[cursor])
    beats.reverse()
    return np.array(beats, dtype=np.int64) * decimation


def predictive_grid_strength(
    envelope: np.ndarray, beats: np.ndarray, frame_rate: float
) -> float:
    """Local pulse contrast at positions predicted by adjacent beats.

    Predict each interior beat from its neighbours, rather than score the peak
    the tracker just selected. Compare equal-width windows at that position and
    shifted phases within the same local interval. Use amplitude, not the number
    of detected peaks: quiet dense accompaniment must not erase a strong pulse.
    This is a heuristic evidence score, not a calibrated probability.
    """
    if beats.size < 8:
        return 0.0
    predicted = (beats[:-2] + beats[2:]) / 2.0
    periods = (beats[2:] - beats[:-2]) / 2.0
    radius = max(1, int(round(0.015 * frame_rate)))
    offsets = np.arange(-radius, radius + 1)

    def energy(centers):
        indices = np.rint(centers[:, None] + offsets).astype(int)
        return envelope[np.clip(indices, 0, envelope.size - 1)].mean(axis=1)

    on = energy(predicted)
    controls = np.array([energy(predicted + shift * periods)
                         for shift in (-0.4, -0.3, -0.2, 0.2, 0.3, 0.4)])
    baseline = np.median(controls, axis=0)
    total = float(on.sum())
    if total <= 0:
        return 0.0
    contrast = np.clip((on.sum() - baseline.sum()) / total, 0.0, 1.0)
    support = np.mean(on > np.maximum(2 * baseline, 0.05 * on.max()))
    return float(contrast * support)


def fitted_grid(beat_frames: np.ndarray, frame_rate: float) -> tuple[float, float] | None:
    """Least-squares (phase, period) in frames for a set of tracked beats.

    The fit is a descriptive reference for stable material only. It is still
    derived from the same audio and is not independent timing ground truth.
    """
    if beat_frames.size < 4:
        return None
    indices = np.arange(beat_frames.size, dtype=np.float64)
    period, phase = np.polyfit(indices, beat_frames.astype(np.float64), 1)
    if period <= 1.0:
        return None
    return float(phase), float(period)


def phase_concentration(
    onset_frames: np.ndarray, anchor: float, period: float
) -> float:
    """Mean resultant length of onset phases within the beat.

    0 means onset phases cancel or are spread across the beat. 1 means they
    all sit at one position. Dense unrelated onsets dilute this statistic, so
    it gates timing eligibility only, never the existence of a pulse.

    It cancels *antipodal* clusters, so a track of straight eighth notes scores 0
    at the beat period even though it is perfectly periodic. Callers therefore
    take the best of the beat period and its first subdivision — see
    `grid_strength`.
    """
    if onset_frames.size < 8 or period <= 0:
        return 0.0
    phases = ((onset_frames - anchor) / period) % 1.0
    return float(abs(np.mean(np.exp(2j * np.pi * phases))))


def grid_strength(
    onset_frames: np.ndarray, anchor: float, period: float
) -> float:
    """How periodic the onsets are at this tempo or at its first subdivision.

    Taking the maximum over the two metrical levels is what keeps a track of
    straight eighths — which is periodic but antipodal within the beat — from
    being mistaken for material with no pulse at all.
    """
    return max(
        phase_concentration(onset_frames, anchor, period),
        phase_concentration(onset_frames, anchor, period / 2.0),
    )


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


def tempo_drift(beat_times: np.ndarray) -> float | None:
    """Fractional tempo change from the first half of the track to the second.

    Positive means it ends faster than it began. Reported because it explains a
    lot: material like this is exactly what a fixed-tempo grid cannot describe,
    and it is a musical property worth having, not an error to hide.
    """
    if beat_times.size < 8:
        return None
    half = beat_times.size // 2
    first = np.median(np.diff(beat_times[:half]))
    second = np.median(np.diff(beat_times[half:]))
    if first <= 0 or second <= 0:
        return None
    return float(first / second - 1.0)


def interval_variability(beat_times: np.ndarray) -> float | None:
    """Inter-beat interval spread relative to the mean. 0 = metronomic."""
    if beat_times.size < 4:
        return None
    intervals = np.diff(beat_times)
    mean = float(np.mean(intervals))
    if mean <= 0:
        return None
    return float(np.std(intervals) / mean)


def extract_beat(path: Path) -> dict[str, object]:
    """Run the beat stage for one file.

    Unreliable measurements stay None with an explicit reason. Rejection is
    insufficient evidence from this method, never proof of an absent pulse.
    """
    diagnostics: dict[str, float | int | None] = {}
    empty: dict[str, object] = {
        "beat_diagnostics": diagnostics,
        "beat_status": "insufficient_pulse_evidence",
        "timing_status": "no_reliable_grid",
        "beat_method": BEAT_METHOD,
        "beat_count": None,
        "beat_grid_strength": None,
        "beat_interval_cv": None,
        "tempo_drift": None,
        "microtiming_tightness": None,
        "microtiming_signed": None,
        "swing_ratio": None,
    }

    mono, sample_rate = decode_mono(path)
    envelope, frame_rate = onset_envelope(mono, sample_rate)
    if envelope.size < 16 or not np.any(envelope > 0):
        return {**empty, "beat_status": "insufficient_audio"}

    tempo = tempo_estimate(mono, sample_rate)
    bpm, confidence = tempo["bpm"], tempo["tempo_confidence"]
    diagnostics.update(candidate_bpm=bpm, tempo_confidence=confidence,
                       frame_resolution_ms=1000 / frame_rate)
    if bpm is None or confidence is None or confidence < MIN_TEMPO_CONFIDENCE:
        return {**empty, "beat_status": "unusable_tempo"}

    onset_frames = detect_onset_frames(envelope, frame_rate)
    diagnostics["onset_count"] = int(onset_frames.size)
    if onset_frames.size < 8:
        return {**empty, "beat_status": "insufficient_onsets"}

    beats = track_beats(envelope, frame_rate, bpm)
    strength = predictive_grid_strength(envelope, beats, frame_rate)
    diagnostics["predictive_strength"] = strength
    if strength < MIN_PREDICTIVE_STRENGTH:
        return {**empty, "beat_status": "insufficient_pulse_evidence"}
    grid = fitted_grid(beats, frame_rate)
    if grid is None:
        return empty
    phase, period = grid

    duration = mono.size / sample_rate
    seconds_per_frame = 1.0 / frame_rate
    period_seconds = period * seconds_per_frame

    # Timing *description* comes from the beats the tracker actually found; the
    # fitted line is only the reference microtiming is measured against. Using
    # the fitted line for drift would make drift zero by construction.
    tracked_times = frame_to_time(beats.astype(np.float64), sample_rate)
    tracked_times = tracked_times[(tracked_times >= 0) & (tracked_times <= duration)]

    count = int(np.ceil(duration / period_seconds)) + 2
    beat_times = frame_to_time(phase + period * np.arange(max(count, 0)), sample_rate)
    beat_times = beat_times[(beat_times >= 0) & (beat_times <= duration)]
    if beat_times.size < 4:
        return empty

    onset_times = frame_to_time(onset_frames, sample_rate)
    # A fitted whole-track line is usable only when it represents the track.
    # Otherwise drift would masquerade as push/drag and offbeat placement.
    residual_frames = beats - (phase + period * np.arange(beats.size))
    residual_ms = float(np.sqrt(np.mean(residual_frames ** 2)) / frame_rate * 1000)
    timing_status = "measured_relative_to_fitted_grid"
    tightness = signed = swing = None
    concentration = grid_strength(onset_frames, phase, period)
    tracking_resolution = max(1, int(np.ceil(envelope.size / MAX_DP_FRAMES))) / frame_rate * 1000
    diagnostics.update(reference_rms_ms=residual_ms,
                       tracking_resolution_ms=tracking_resolution,
                       timing_concentration=concentration)
    if tracking_resolution > MAX_REFERENCE_RMS_MS:
        timing_status = "insufficient_timing_resolution"
    elif residual_ms > MAX_REFERENCE_RMS_MS:
        timing_status = "unstable_reference"
    elif concentration < MIN_TIMING_CONCENTRATION:
        timing_status = "ambiguous_onset_population"
    else:
        tightness, signed, _ = microtiming_stats(onset_times, beat_times, period_seconds)
        swing, _ = swing_position(onset_times, beat_times, period_seconds)

    return {
        "beat_diagnostics": diagnostics,
        "beat_status": "tracked",
        "timing_status": timing_status,
        "beat_method": BEAT_METHOD,
        "beat_count": int(tracked_times.size),
        "beat_grid_strength": strength,
        "beat_interval_cv": interval_variability(tracked_times),
        "tempo_drift": tempo_drift(tracked_times),
        "microtiming_tightness": tightness,
        "microtiming_signed": signed,
        "swing_ratio": swing,
    }

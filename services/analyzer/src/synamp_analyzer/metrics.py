"""The model-free metric block ('dsp_core').

Everything here is a *measurement*, not a judgement. These are the signals that
beat file metadata: loudness and dynamics (which encode mastering practice and
therefore era), spectral shape (brightness, noisiness), rhythmic activity, and
provisional tempo/pulse measures.

Two honesty rules:

* **Nothing here is validated against human perception.** `pulse_clarity` and
  `tempo` in particular are *provisional* — they are computed from the onset
  envelope without a proper beat tracker, and the field docstrings say so. They
  are useful for ranking and for spotting obvious cases, not for asserting that
  a track "is" steady.
* **Full-track computation, no sampling.** Loudness range, crest factor and
  clipping density are properties of the whole recording; measuring them on a
  short window would produce numbers that look fine and mean nothing. The
  expensive model stages that come later will use the configured sample window
  instead; this stage deliberately does not.

Known limitation: the whole track is decoded into memory. For ordinary songs
this is tens of megabytes; a multi-hour DJ set would be heavy. If the library
turns out to contain such files, this stage should stream instead.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy import signal

# Analysis geometry. ~23 ms per frame at 44.1 kHz: fine enough for onset
# counting, coarse enough to keep a long track's spectrogram in memory.
N_FFT = 2048
HOP = 1024
ROLLOFF_FRACTION = 0.85
CLIPPING_LEVEL = 0.9995


def decode_mono(path: Path) -> tuple[np.ndarray, int]:
    """Read an audio file as mono float32. Raises on an unreadable file."""
    data, sample_rate = sf.read(str(path), always_2d=True, dtype="float32")
    if data.size == 0:
        raise ValueError("empty audio stream")
    return data.mean(axis=1), int(sample_rate)


def _db(amplitude: float) -> float | None:
    """Amplitude ratio to dB, or None for silence (which has no meaningful level)."""
    if amplitude <= 0:
        return None
    return float(20.0 * math.log10(amplitude))


def loudness_metrics(mono: np.ndarray, sample_rate: int) -> dict[str, float | None]:
    """Programme loudness, loudness range, true peak, RMS and crest factor.

    Integrated loudness and LRA follow ITU-R BS.1770 / EBU R 128 via pyloudnorm.
    True peak is estimated with 4x oversampling, which is the standard
    approximation; it is not a certified meter.
    """
    out: dict[str, float | None] = {
        "lufs_integrated": None,
        "loudness_range": None,
        "true_peak_dbtp": None,
        "crest_factor": None,
    }

    meter = pyln.Meter(sample_rate)
    try:
        integrated = float(meter.integrated_loudness(mono))
    except Exception:
        integrated = float("-inf")
    out["lufs_integrated"] = integrated if math.isfinite(integrated) else None

    loudness_range = getattr(meter, "loudness_range", None)
    if callable(loudness_range):
        try:
            value = float(loudness_range(mono))
            out["loudness_range"] = value if math.isfinite(value) else None
        except Exception:
            out["loudness_range"] = None

    oversampled = signal.resample_poly(mono, 4, 1)
    peak = float(np.max(np.abs(oversampled))) if oversampled.size else 0.0
    out["true_peak_dbtp"] = _db(peak)

    rms = float(np.sqrt(np.mean(np.square(mono, dtype=np.float64))))
    peak_linear = float(np.max(np.abs(mono))) if mono.size else 0.0
    rms_db, peak_db = _db(rms), _db(peak_linear)
    if rms_db is not None and peak_db is not None:
        out["crest_factor"] = peak_db - rms_db
    return out


def dynamic_complexity(mono: np.ndarray, sample_rate: int) -> float | None:
    """Variability of short-term level, in dB.

    A proxy, not a standard descriptor: per-second RMS in dB, then its standard
    deviation. High = the track breathes; low = it sits at one level.
    """
    window = sample_rate
    if mono.size < window * 2:
        return None
    frames = mono[: (mono.size // window) * window].reshape(-1, window)
    rms = np.sqrt(np.mean(np.square(frames.astype(np.float64)), axis=1))
    rms = rms[rms > 0]
    if rms.size < 2:
        return None
    levels = 20.0 * np.log10(rms)
    return float(np.std(levels))


def clipping_density(mono: np.ndarray) -> float:
    """Proportion of samples pinned at or beyond full scale.

    A mastering fingerprint: brick-walled modern masters clip; older or
    audiophile masters do not. Feeds the era cue.
    """
    if mono.size == 0:
        return 0.0
    return float(np.mean(np.abs(mono) >= CLIPPING_LEVEL))


def spectral_features(mono: np.ndarray, sample_rate: int) -> dict[str, float | None]:
    """Spectral shape, flux, zero-crossing rate, onset rate and percussiveness."""
    out: dict[str, float | None] = {
        "spectral_centroid": None,
        "spectral_rolloff": None,
        "spectral_flatness": None,
        "spectral_flux": None,
        "zero_crossing_rate": None,
        "onset_rate": None,
        "percussiveness": None,
        "spectral_tilt": None,
    }
    if mono.size < N_FFT * 2:
        return out

    frequencies, _, spectrum = signal.stft(
        mono, fs=sample_rate, nperseg=N_FFT, noverlap=N_FFT - HOP, boundary=None
    )
    magnitude = np.abs(spectrum)  # (bins, frames)
    if magnitude.size == 0:
        return out

    power_sum = magnitude.sum(axis=0)
    valid = power_sum > 0
    if np.any(valid):
        centroid = (frequencies[:, None] * magnitude).sum(axis=0)[valid] / power_sum[valid]
        out["spectral_centroid"] = float(np.mean(centroid))

        cumulative = np.cumsum(magnitude[:, valid], axis=0)
        total = cumulative[-1]
        threshold = ROLLOFF_FRACTION * total
        idx = np.argmax(cumulative >= threshold, axis=0)
        out["spectral_rolloff"] = float(np.mean(frequencies[idx]))

        flatness = np.exp(np.log(magnitude[:, valid] + 1e-12).mean(axis=0)) / (
            magnitude[:, valid].mean(axis=0) + 1e-12
        )
        out["spectral_flatness"] = float(np.mean(flatness))

    flux = np.diff(magnitude, axis=1)
    flux[flux < 0] = 0.0
    onset_envelope = flux.sum(axis=0)
    out["spectral_flux"] = float(np.mean(onset_envelope)) if onset_envelope.size else None

    frames = 1 + (mono.size - N_FFT) // HOP
    if frames > 1:
        framed = np.lib.stride_tricks.sliding_window_view(mono, N_FFT)[::HOP]
        signs = np.signbit(framed)
        crossings = np.count_nonzero(signs[:, 1:] != signs[:, :-1], axis=1)
        out["zero_crossing_rate"] = float(np.mean(crossings) / N_FFT)

    # Percussive vs harmonic energy by median filtering the magnitude
    # spectrogram: percussive content is transient (median across time filters
    # it out), harmonic content is stable (median across frequency does).
    if magnitude.shape[1] > 8:
        harmonic = signal.medfilt(magnitude, kernel_size=(1, 9))
        percussive = signal.medfilt(magnitude, kernel_size=(15, 1))
        h_energy, p_energy = float(harmonic.sum()), float(percussive.sum())
        if h_energy + p_energy > 0:
            out["percussiveness"] = p_energy / (h_energy + p_energy)

    if onset_envelope.size:
        onsets = _count_onsets(onset_envelope, sample_rate)
        duration = mono.size / sample_rate
        out["onset_rate"] = float(onsets / duration) if duration > 0 else None

    positive = magnitude[:, magnitude.shape[1] // 4 :] if magnitude.shape[1] > 4 else magnitude
    band = positive.mean(axis=1)
    usable = (band > 0) & (frequencies > 20)
    if np.count_nonzero(usable) > 8:
        slope = np.polyfit(np.log10(frequencies[usable]), 20 * np.log10(band[usable]), 1)[0]
        out["spectral_tilt"] = float(slope)

    return out


def _count_onsets(onset_envelope: np.ndarray, sample_rate: int) -> int:
    """Peak-pick an onset envelope with an adaptive threshold.

    Threshold is a moving average plus a margin, which is the standard cheap
    approach: a fixed threshold either misses quiet passages or fires on noise.
    """
    if onset_envelope.size < 3:
        return 0
    normalised = onset_envelope / (np.max(onset_envelope) + 1e-12)
    window = max(3, int(0.2 * sample_rate / HOP))
    kernel = np.ones(window) / window
    local_mean = np.convolve(normalised, kernel, mode="same")
    threshold = local_mean + 0.25 * float(np.std(normalised))
    peaks, _ = signal.find_peaks(normalised, height=threshold, distance=max(1, window // 2))
    return int(peaks.size)


def tempo_estimate(mono: np.ndarray, sample_rate: int) -> dict[str, float | None]:
    """Provisional tempo, tempo confidence and a pulse-clarity proxy.

    PROVISIONAL. This is autocorrelation of the spectral-flux onset envelope —
    a classic cheap method, not a beat tracker. It has no metrical model: a log
    -Gaussian prior centred at 120 BPM resolves the most common octave error, but
    it will still report a confident nonsense number for free-time, rubato or
    very sparse material. `tempo_confidence` exists precisely so that callers can
    refuse to trust it.

    `pulse_clarity` here is the normalised autocorrelation height at the winning
    lag, i.e. "how periodic is the onset envelope at this tempo". The published
    PulseClarity descriptor is entropy of the fluctuation spectrum; this is a
    cheaper relative, and is named a *proxy* for that reason.
    """
    out: dict[str, float | None] = {
        "bpm": None,
        "tempo_confidence": None,
        "pulse_clarity": None,
    }
    if mono.size < N_FFT * 4:
        return out

    _, _, spectrum = signal.stft(
        mono, fs=sample_rate, nperseg=N_FFT, noverlap=N_FFT - HOP, boundary=None
    )
    magnitude = np.abs(spectrum)
    flux = np.diff(magnitude, axis=1)
    flux[flux < 0] = 0.0
    envelope = flux.sum(axis=0)
    if envelope.size < 16 or not np.any(envelope > 0):
        return out

    envelope = envelope - envelope.mean()
    correlation = np.correlate(envelope, envelope, mode="full")[envelope.size - 1 :]
    if correlation[0] <= 0:
        return out
    correlation = correlation / correlation[0]

    frame_rate = sample_rate / HOP
    min_lag = max(1, int(frame_rate * 60.0 / 240.0))  # 240 BPM ceiling
    max_lag = min(correlation.size - 1, int(frame_rate * 60.0 / 40.0))  # 40 BPM floor
    if max_lag <= min_lag:
        return out

    window = correlation[min_lag : max_lag + 1]

    # Tempo prior. Autocorrelation peaks at every multiple of the beat period,
    # so the tallest peak is often the octave *below* the true tempo — a
    # 120 BPM click track reads as 60. Weighting the search by a log-Gaussian
    # centred on 120 BPM resolves most of that, and 120 is not arbitrary: it is
    # the perceptual centre of tempo.
    lags = np.arange(min_lag, max_lag + 1, dtype=np.float64)
    bpm_at_lag = 60.0 * frame_rate / lags
    prior = np.exp(-0.5 * (np.log2(bpm_at_lag / 120.0) / 0.8) ** 2)

    best = int(np.argmax(window * prior))
    lag = int(lags[best])
    peak = float(window[best])
    if peak <= 0:
        return out

    out["bpm"] = float(60.0 * frame_rate / lag)
    spread = float(np.std(window)) + 1e-9
    out["tempo_confidence"] = float(min(1.0, max(0.0, (peak - float(np.mean(window))) / spread / 4.0)))
    out["pulse_clarity"] = float(min(1.0, max(0.0, peak)))
    return out


def extract_dsp_core(path: Path) -> dict[str, object]:
    """Run the whole model-free block for one file.

    Returns field values for `AnalysisResult`, plus a `production` mapping (the
    sound-based era cue) and a `beat_count` estimate. Raises on decode failure —
    the caller turns that into a failed job rather than a half-written record.
    """
    mono, sample_rate = decode_mono(path)

    fields: dict[str, object] = {}
    fields.update(loudness_metrics(mono, sample_rate))
    fields.update(spectral_features(mono, sample_rate))
    fields.update(tempo_estimate(mono, sample_rate))
    fields["dynamic_complexity"] = dynamic_complexity(mono, sample_rate)
    fields["clipping_density"] = clipping_density(mono)

    duration = mono.size / sample_rate if sample_rate else 0.0
    onset_rate = fields.get("onset_rate")
    fields["beat_count"] = (
        int(round(float(onset_rate) * duration)) if isinstance(onset_rate, float) else None
    )

    # The era cue, assembled from measures that actually track mastering
    # practice. Sound-based on purpose: the release year is poisoned by
    # remasters, compilations and reissues.
    production: dict[str, float] = {}
    for key in ("loudness_range", "crest_factor", "clipping_density", "spectral_tilt"):
        value = fields.get(key)
        if isinstance(value, (int, float)):
            production[key] = float(value)
    fields["production"] = production

    return fields

"""The `tonal` stage: a song's musical key, for DJ mode (harmonic mixing).

How (no model, numpy/scipy only):

* Decode to mono, resample to 11,025 Hz (keys live well below 2 kHz).
* Short-time spectrum (4,096-sample frames, 50 % overlap), "whitened": each
  bin minus the median of its neighbours (31 bins), so drums, hiss and other
  broadband sound fall away and the notes stand out. Each bin between 55 Hz
  and 1,760 Hz (A1–A6) then adds its magnitude to its pitch class, weighted
  by how close it is to the pitch's centre. That's a chroma vector per frame:
  how much C, C#, D… is sounding.
* Frames are weighted by their energy (quiet intros and fades count less),
  averaged over up to 60 slices of the song, and normalised.
* The averaged chroma is correlated with a major and a minor key profile in
  all 12 positions (24 keys). The best match is the key; its correlation is
  `key_strength` (−1…1), and `key_margin` is how far ahead it is of the best
  key a DJ couldn't mix with it (its relative major/minor and its neighbours
  on the wheel share most notes, so mistaking one for another does no harm).

Profiles: Krumhansl–Kessler (1982), from listening experiments; free to use.

Checked on 150 random songs from the owner's library against Essentia's key
extractor (a well-known reference; not ground truth): 122 got a key; of those
80 % agree exactly, 11 % more are DJ-compatible (relative or one step on the
wheel) and 9 % disagree. 28 were left with no clear key rather than a guess.
(A log-compressed chroma and Temperley's profiles both did clearly worse on
real music.) Keys with key_strength below 0.8 agree less often, so DJ mode
trusts them less.

Status: measured | unclear (no key stands out: drones, noise, spoken word,
atonal or very chromatic music) | too_short. An unclear song gets no key
rather than a confident wrong one, the same rule as tempo.

Camelot ("8A") is the DJ wheel: neighbours on it (same number, or ±1 with the
same letter) mix without clashing.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from scipy import signal
from scipy.ndimage import median_filter

from .metrics import decode_mono

METHOD = "chroma11k-whitened/krumhansl/v1"
TARGET_RATE = 11025
FRAME = 4096
HOP = 2048
LOW_HZ, HIGH_HZ = 55.0, 1760.0
MAX_SLICES = 60
SLICE_S = 6.0
MIN_SECONDS = 12.0
MIN_STRENGTH = 0.72
MIN_MARGIN = 0.03
WHITEN_BINS = 31

NOTES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
# Krumhansl–Kessler (1982) key profiles; index 0 = tonic.
MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Camelot wheel: number for each tonic (A = minor, B = major).
_CAMELOT_MAJOR = {"B": 1, "F#": 2, "C#": 3, "Ab": 4, "Eb": 5, "Bb": 6, "F": 7, "C": 8, "G": 9, "D": 10, "A": 11, "E": 12}
_CAMELOT_MINOR = {"Ab": 1, "Eb": 2, "Bb": 3, "F": 4, "C": 5, "G": 6, "D": 7, "A": 8, "E": 9, "B": 10, "F#": 11, "C#": 12}


def camelot(tonic: str, mode: str) -> str:
    return f"{(_CAMELOT_MAJOR if mode == 'major' else _CAMELOT_MINOR)[tonic]}{'B' if mode == 'major' else 'A'}"


def _pitch_weights(sample_rate: int) -> np.ndarray:
    """(12, bins) matrix: how much each FFT bin counts towards each pitch class."""
    freqs = np.fft.rfftfreq(FRAME, 1.0 / sample_rate)
    weights = np.zeros((12, freqs.size))
    usable = (freqs >= LOW_HZ) & (freqs <= HIGH_HZ)
    midi = 69.0 + 12.0 * np.log2(np.where(usable, freqs, 1.0) / 440.0)
    nearest = np.round(midi)
    closeness = np.cos(np.clip(midi - nearest, -0.5, 0.5) * np.pi) ** 2  # 1 at the pitch centre, 0 half-way
    classes = (nearest.astype(int) % 12)
    for index in np.flatnonzero(usable):
        weights[classes[index], index] = closeness[index]
    return weights


def chroma(mono: np.ndarray, sample_rate: int) -> np.ndarray | None:
    """Energy-weighted average chroma (12 numbers summing to 1), or None for silence."""
    if sample_rate != TARGET_RATE:
        from math import gcd
        g = gcd(TARGET_RATE, sample_rate)
        mono = signal.resample_poly(mono, TARGET_RATE // g, sample_rate // g).astype(np.float32)
        sample_rate = TARGET_RATE
    slice_len = int(SLICE_S * sample_rate)
    if mono.size > MAX_SLICES * slice_len:
        starts = np.linspace(0, mono.size - slice_len, MAX_SLICES).astype(int)
        mono = np.concatenate([mono[s:s + slice_len] for s in starts])
    if mono.size < FRAME:
        return None
    frames = np.lib.stride_tricks.sliding_window_view(mono, FRAME)[::HOP]
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(FRAME), axis=1))
    weights = _pitch_weights(sample_rate)
    # Only the bins that count (plus room for the median window), whitened.
    used = np.flatnonzero(weights.any(axis=0))
    lo, hi = max(0, used[0] - WHITEN_BINS), min(spectrum.shape[1], used[-1] + WHITEN_BINS + 1)
    band = spectrum[:, lo:hi]
    whitened = np.clip(band - median_filter(band, size=(1, WHITEN_BINS)), 0.0, None)
    per_frame = whitened @ weights[:, lo:hi].T  # (frames, 12)
    energy = np.sqrt(np.mean(frames ** 2, axis=1))
    if not np.any(energy > 1e-4):
        return None
    totals = per_frame.sum(axis=1, keepdims=True)
    per_frame = np.divide(per_frame, totals, out=np.zeros_like(per_frame), where=totals > 0)
    average = (per_frame * energy[:, None]).sum(axis=0) / energy.sum()
    return average / average.sum() if average.sum() > 0 else None


def key_scores(profile: np.ndarray) -> list[tuple[float, str, str]]:
    """(correlation, tonic, mode) for all 24 keys, best first."""
    scores = []
    for shift in range(12):
        rotated = np.roll(profile, -shift)
        for mode, template in (("major", MAJOR), ("minor", MINOR)):
            scores.append((float(np.corrcoef(rotated, template)[0, 1]), NOTES[shift], mode))
    return sorted(scores, reverse=True)


def _compatible(a: str, b: str) -> bool:
    """Same key, relative major/minor, or one step round the Camelot wheel."""
    na, la, nb, lb = int(a[:-1]), a[-1], int(b[:-1]), b[-1]
    step = min(abs(na - nb), 12 - abs(na - nb))
    return (la == lb and step <= 1) or (la != lb and step == 0)


def _relative(tonic: str, mode: str) -> tuple[str, str]:
    index = NOTES.index(tonic)
    return (NOTES[(index + 3) % 12], "major") if mode == "minor" else (NOTES[(index - 3) % 12], "minor")


def detect_key(mono: np.ndarray, sample_rate: int) -> dict[str, object]:
    fields: dict[str, object] = {"key_method": METHOD, "key": None, "mode": None, "camelot": None, "key_strength": None, "key_margin": None}
    if mono.size < MIN_SECONDS * sample_rate:
        fields["key_status"] = "too_short"
        return fields
    profile = chroma(mono, sample_rate)
    if profile is None:
        fields["key_status"] = "unclear"
        return fields
    scores = key_scores(profile)
    best, tonic, mode = scores[0]
    # The rival is the best key a DJ couldn't mix with this one: its relative
    # major/minor and its wheel neighbours share most notes, so mistaking one
    # for another does no harm.
    home = camelot(tonic, mode)
    rival = next(score for score, t, m in scores[1:] if not _compatible(home, camelot(t, m)))
    fields["key_strength"] = round(best, 4)
    fields["key_margin"] = round(best - rival, 4)
    if best < MIN_STRENGTH or best - rival < MIN_MARGIN:
        fields["key_status"] = "unclear"
        return fields
    fields.update(key=f"{tonic} {mode}", mode=mode, camelot=camelot(tonic, mode), key_status="measured")
    return fields


def extract_tonal(path: Path) -> dict[str, object]:
    mono, sample_rate = decode_mono(path)
    return detect_key(mono, sample_rate)

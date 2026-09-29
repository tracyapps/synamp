"""Synthetic audio helpers for tests.

Everything the tests analyse is generated here, so the suite depends on no
audio assets and on nothing whose licence we would have to track.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf


def sine(
    path: Path,
    seconds: float = 2.0,
    sample_rate: int = 44100,
    frequency: float = 440.0,
    amplitude: float = 0.5,
) -> np.ndarray:
    """A pure tone. Useful because its crest factor is a known ~3.01 dB."""
    t = np.linspace(0.0, seconds, int(sample_rate * seconds), endpoint=False)
    signal = (amplitude * np.sin(2.0 * np.pi * frequency * t)).astype(np.float32)
    sf.write(str(path), signal, sample_rate)
    return signal


def clicks(
    path: Path,
    seconds: float = 8.0,
    sample_rate: int = 22050,
    bpm: float = 120.0,
) -> np.ndarray:
    """A click track at a known tempo — a periodic onset envelope on purpose."""
    total = int(sample_rate * seconds)
    signal = np.zeros(total, dtype=np.float32)
    period = int(sample_rate * 60.0 / bpm)
    click = (np.hanning(64) * 0.8).astype(np.float32)
    for start in range(0, total - click.size, period):
        signal[start : start + click.size] += click
    sf.write(str(path), signal, sample_rate)
    return signal


def layered(
    path: Path,
    seconds: float = 12.0,
    sample_rate: int = 44100,
    bpm: float = 120.0,
    offset_ms: float = 30.0,
) -> np.ndarray:
    """Two layers: a strong click on the beat, and a weaker one systematically
    late (or early, with a negative offset).

    This is the shape a real performance has — the drums hold the grid while
    another player sits behind or ahead of it — and it is the only shape in which
    a *signed* microtiming measurement means anything. A constant offset applied
    to every onset is absorbed by the grid phase and correctly reads as zero.
    """
    total = int(sample_rate * seconds)
    signal = np.zeros(total, dtype=np.float32)
    period = int(sample_rate * 60.0 / bpm)
    strong = (np.hanning(64) * 0.9).astype(np.float32)
    weak = (np.hanning(64) * 0.35).astype(np.float32)
    shift = int(sample_rate * offset_ms / 1000.0)
    for start in range(0, total - strong.size, period):
        signal[start : start + strong.size] += strong
        placed = start + shift
        if 0 <= placed <= total - weak.size:
            signal[placed : placed + weak.size] += weak
    sf.write(str(path), signal, sample_rate)
    return signal


def swung(
    path: Path,
    seconds: float = 12.0,
    sample_rate: int = 44100,
    bpm: float = 120.0,
    offbeat: float = 0.667,
) -> np.ndarray:
    """On-beat click plus an offbeat click at a fixed fraction of the beat.

    0.5 is straight eighths; 0.667 is triplet swing. The offbeat is deliberately
    *weaker* than the beat, as it is in most real playing: with two equally loud
    clicks the pattern is phase-ambiguous — a tracker can lock onto either cluster
    — and then 'where is the offbeat' has no single answer to test against.
    """
    total = int(sample_rate * seconds)
    signal = np.zeros(total, dtype=np.float32)
    period = int(sample_rate * 60.0 / bpm)
    strong = (np.hanning(64) * 0.8).astype(np.float32)
    weak = (np.hanning(64) * 0.45).astype(np.float32)
    offset = int(period * offbeat)
    for start in range(0, total - strong.size, period):
        signal[start : start + strong.size] += strong
        placed = start + offset
        if 0 <= placed <= total - weak.size:
            signal[placed : placed + weak.size] += weak
    sf.write(str(path), signal, sample_rate)
    return signal


def drifting(
    path: Path,
    seconds: float = 20.0,
    sample_rate: int = 44100,
    start_bpm: float = 100.0,
    end_bpm: float = 140.0,
) -> np.ndarray:
    """Click track that gradually speeds up.

    This is the pattern a fixed-tempo grid cannot describe and a dynamic-programming
    tracker can: the beat is unambiguous throughout, but there is no single tempo
    that fits the whole file. It is also what live acoustic material does.
    """
    total = int(sample_rate * seconds)
    signal = np.zeros(total, dtype=np.float32)
    click = (np.hanning(64) * 0.85).astype(np.float32)
    position = 0.0
    beat = 0
    while position < total - click.size:
        progress = position / total
        bpm = start_bpm + (end_bpm - start_bpm) * progress
        start = int(position)
        signal[start : start + click.size] += click
        position += sample_rate * 60.0 / bpm
        beat += 1
        if beat > 5000:
            break
    sf.write(str(path), signal, sample_rate)
    return signal


def noise(path: Path, seconds: float = 8.0, sample_rate: int = 22050) -> np.ndarray:
    """Unpitched, unperiodic — there is no grid here to find."""
    rng = np.random.default_rng(11)
    signal = rng.normal(0, 0.2, int(sample_rate * seconds)).astype(np.float32)
    sf.write(str(path), signal, sample_rate)
    return signal


def clipped(path: Path, seconds: float = 2.0, sample_rate: int = 22050) -> np.ndarray:
    """A deliberately over-driven tone, so clipping density is non-zero."""
    t = np.linspace(0.0, seconds, int(sample_rate * seconds), endpoint=False)
    signal = np.clip(3.0 * np.sin(2.0 * np.pi * 220.0 * t), -1.0, 1.0).astype(np.float32)
    sf.write(str(path), signal, sample_rate)
    return signal


def corrupt(path: Path) -> Path:
    """A file with an audio extension and no audio in it."""
    path.write_bytes(b"this is not audio, it only claims to be\n" * 32)
    return path


def dense_pulse(path: Path, seed: int = 7, bpm: float = 120.0) -> np.ndarray:
    """Strong known pulse amid many quiet, randomly placed pitched transients."""
    sr, seconds = 44100, 16.0
    rng = np.random.default_rng(seed)
    audio = np.zeros(int(sr * seconds), dtype=np.float32)
    click = (np.hanning(64) * 0.85).astype(np.float32)
    for time in np.arange(0.5, seconds - 0.1, 60 / bpm):
        start = int(time * sr)
        audio[start:start + len(click)] += click
    for time in rng.uniform(0, seconds - 0.1, 700):
        t = np.arange(2205) / sr
        note = 0.025 * np.sin(2 * np.pi * rng.uniform(300, 4000) * t) * np.exp(-t * 100)
        start = int(time * sr)
        audio[start:start + len(note)] += note
    sf.write(path, audio, sr)
    return audio

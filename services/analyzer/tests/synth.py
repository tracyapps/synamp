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

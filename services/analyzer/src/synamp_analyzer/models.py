"""Domain records.

These are the *signals* that let a natural-language prompt become a concrete
playlist. See docs/synamp/ARCHITECTURE.md §6.2 — no single signal is enough.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Track:
    """A file on disk, as discovered during a scan."""

    path: Path
    size_bytes: int
    mtime: float
    """Used for incremental scans: unchanged (size, mtime) means skip."""


@dataclass
class AnalysisResult:
    """Everything the worker learns about one track.

    Deliberately nullable: a resumable pipeline fills these in over time, and a
    partially-analysed library must still be usable.
    """

    track_path: Path

    # --- audio embeddings -------------------------------------------------
    embedding: list[float] | None = None
    """CLAP-class audio embedding — powers 'sounds like this' and free-text
    vibe queries. This is the signal behind the Ani DiFranco example."""

    # --- objective features ----------------------------------------------
    bpm: float | None = None
    key: str | None = None
    """Musical key, for harmonic mixing in DJ mode (Camelot wheel)."""
    energy: float | None = None
    danceability: float | None = None
    mood: str | None = None

    instrumental: float | None = None
    """0..1 confidence the track has no vocals — the 'no words' filter."""

    instruments: dict[str, float] = field(default_factory=dict)
    """Per-instrument confidences, e.g. {"piano": 0.82}. The 'no piano' filter."""

    # --- text --------------------------------------------------------------
    lyrics: str | None = None
    lyric_embedding: list[float] | None = None
    """Powers thematic prompts (social justice, feminist, etc.)."""

    # --- provenance ---------------------------------------------------------
    model_versions: dict[str, str] = field(default_factory=dict)
    """Which model produced which signal — required for re-analysis decisions."""

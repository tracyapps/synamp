"""Domain records.

These are the *signals* that let a natural-language prompt become a concrete
playlist. See docs/synamp/ARCHITECTURE.md §6.2 — no single signal is enough.

Two rules govern this file:

1. **Every measurement is nullable, and null means "not computed yet"** — never
   "computed as zero". A partially-analysed library must stay usable, and a
   missing signal must never be silently read as a negative one.
2. **Nothing here is a verdict.** `pulse_clarity` is a number, not a claim that
   a track is "steady"; that mapping is learned later and is the reason the
   provenance fields exist.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


# Stages run in this order. A track resumes at the first stage missing from
# `stages_done`, so adding a stage is the only change needed to back-fill it.
STAGES: tuple[str, ...] = ("dsp_core",)


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

    Fields are grouped by the family of signal they belong to, and each group
    names the stage that fills it. Fields whose stage has not been built yet are
    declared here anyway so that the query layer (the "brain") can be written
    against the final shape instead of being rewritten once per stage.
    """

    track_path: Path

    # --- audio embeddings -------------------------------------------------
    # Filled by: a future `embedding` stage (permissive encoder only).
    embedding: list[float] | None = None
    """CLAP-class audio embedding — powers 'sounds like this' and free-text
    vibe queries. This is the signal behind the Ani DiFranco example."""

    # --- rhythm / timing --------------------------------------------------
    # Filled by: dsp_core (provisional tempo/pulse), a future `beat` stage
    # (the grid-based measures).
    tempo_confidence: float | None = None
    """0..1 — how strongly periodic the onset envelope is at the estimated
    tempo. A tempo without its confidence is not usable: octave errors
    (60/120/240 BPM) are common and the confidence is what exposes them."""
    beat_count: int | None = None
    onset_rate: float | None = None
    """Onsets per second — 'busyness'."""
    pulse_clarity: float | None = None
    """0..1 — how stable and easy to follow the beat is. Separates groovable
    from floating, which tempo alone cannot do."""
    percussiveness: float | None = None
    """0..1 — percussive-to-harmonic energy ratio."""
    microtiming_tightness: float | None = None
    """Mean absolute deviation of onsets from the metric grid. Requires a beat
    grid; `None` until the `beat` stage exists."""
    microtiming_signed: float | None = None
    """Signed lead/lag: positive = playing ahead of the grid (urgent), negative
    = behind it (laid back). The user's own hypothesis about 'energy' lives
    here, not in bpm."""
    swing_ratio: float | None = None
    """0.5 = straight eighths, ~0.667 = triplet swing."""

    # --- tonality / harmony ----------------------------------------------
    # Filled by: a future `tonal` stage.
    mode: str | None = None
    """'major' | 'minor' — a more reliable affect cue than the absolute key."""
    chord_change_rate: float | None = None
    """Chords per second — harmonic rhythm, a strong mood carrier."""
    harmonic_complexity: float | None = None
    dissonance: float | None = None
    """Sensory dissonance / roughness from beating of nearby partials."""

    # --- timbre / spectrum ------------------------------------------------
    spectral_centroid: float | None = None
    """Hz — brightness."""
    spectral_rolloff: float | None = None
    spectral_flatness: float | None = None
    """Noise-like vs tone-like spectrum; feeds distortion detection."""
    spectral_flux: float | None = None
    zero_crossing_rate: float | None = None
    roughness: float | None = None

    # --- loudness / dynamics ---------------------------------------------
    # Filled by: dsp_core. These are also the era/production fingerprint.
    lufs_integrated: float | None = None
    """Integrated programme loudness per ITU-R BS.1770 (LUFS)."""
    loudness_range: float | None = None
    """EBU R128 LRA (LU) — spread of short-term loudness. Needs the full track."""
    true_peak_dbtp: float | None = None
    crest_factor: float | None = None
    """Peak minus RMS in dB — transient headroom."""
    dynamic_complexity: float | None = None
    """Variability of the short-term loudness curve."""

    # --- vocal / instrumental --------------------------------------------
    instrumental: float | None = None
    """0..1 confidence the track has no vocals — the 'no words' filter."""
    vocal_fraction: float | None = None
    """Fraction of frames containing singing. Filled by a future `voice` stage."""

    instruments: dict[str, float] = field(default_factory=dict)
    """Per-instrument confidences, e.g. {"piano": 0.82}. The 'no piano' filter."""

    # --- high-level semantic ---------------------------------------------
    # Filled by: a future `semantic` stage (learned heads).
    bpm: float | None = None
    key: str | None = None
    """Musical key, for harmonic mixing in DJ mode (Camelot wheel)."""
    energy: float | None = None
    danceability: float | None = None
    mood: str | None = None
    arousal: float | None = None
    valence: float | None = None

    # --- structure --------------------------------------------------------
    structure_boundaries: list[float] | None = None
    """Section boundary times in seconds."""
    structure_repetition: float | None = None
    """0..1 — repetitive/loop-based vs through-composed."""

    # --- production / era -------------------------------------------------
    production: dict[str, float] = field(default_factory=dict)
    """Mastering fingerprint used as an *era* cue, e.g.
    {"clipping_density": .., "spectral_tilt": .., "loudness_range": ..}.
    Sound-based, unlike the release year, which remasters and compilations
    poison."""

    # --- text --------------------------------------------------------------
    lyrics: str | None = None
    lyric_embedding: list[float] | None = None
    """Powers thematic prompts (social justice, feminist, etc.)."""

    # --- provenance ---------------------------------------------------------
    analyzer_version: str | None = None
    stages_done: set[str] = field(default_factory=set)
    """Which stages have completed for this track. Drives resumption."""
    computed_at: float | None = None
    """Unix timestamp of the last write."""

    model_versions: dict[str, str] = field(default_factory=dict)
    """Which model produced which signal — required for re-analysis decisions."""

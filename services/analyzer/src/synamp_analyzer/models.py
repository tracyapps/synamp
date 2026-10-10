"""Domain records.

These are the *signals* that let a natural-language prompt become a concrete
playlist. See docs/synamp/ARCHITECTURE.md §6.2 — no single signal is enough.

Two rules govern this file:

1. **Every measurement is nullable: not computed or insufficient evidence** — never
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
# `identity` runs first so a retagged or moved file can reuse earlier analysis.
STAGES: tuple[str, ...] = ("identity", "dsp_core", "beat", "tonal", "voice")

# The method each stage runs at. Raise a stage's number when its measurements
# change meaning (a better algorithm, a fixed bug): tracks done at an older
# revision get just that stage redone (pipeline.requeue_outdated). Missing = 1.
STAGE_REVISIONS: dict[str, int] = {"identity": 1, "dsp_core": 2, "beat": 1, "tonal": 1, "voice": 3}


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

    stage_revisions: dict[str, int] = field(default_factory=dict)
    """The STAGE_REVISIONS each finished stage ran at (missing = 1)."""

    # --- identity -----------------------------------------------------------
    # Filled by: identity (see identity.py). Not a signal: never used to rank.
    audio_hash: str | None = None
    """sha256 over this analyzer's decoded samples — unchanged by tags or renames."""
    audio_hash_method: str | None = None
    audio_duration_s: float | None = None
    fingerprint: str | None = None
    """Chromaprint fingerprint (fpcalc). Null when the tool is missing or failed."""
    fingerprint_status: str | None = None
    """measured | tool_missing | failed."""

    # --- audio embeddings -------------------------------------------------
    # Filled by: a future `embedding` stage (permissive encoder only).
    embedding: list[float] | None = None
    """CLAP-class audio embedding — powers 'sounds like this' and free-text
    vibe queries. This is the signal behind the Ani DiFranco example."""

    # --- rhythm / timing --------------------------------------------------
    # Filled by: dsp_core (provisional tempo/pulse) and beat (grid measures).
    tempo_confidence: float | None = None
    """0..1 — how strongly periodic the onset envelope is at the estimated
    tempo. A tempo without its confidence is not usable: octave errors
    (60/120/240 BPM) are common and the confidence is what exposes them."""
    beat_status: str | None = None
    timing_status: str | None = None
    beat_method: str | None = None
    beat_diagnostics: dict[str, float | int | None] = field(default_factory=dict)
    beat_count: int | None = None
    """Tracked beats. Before the beat stage, dsp_core still supplies a legacy
    onset-count estimate; consumers must require beat_status == "tracked"."""
    beat_grid_strength: float | None = None
    """0..1 local predictive contrast × support fraction (beat_method versions
    the definition). A heuristic, not the probability that a beat exists."""
    beat_interval_cv: float | None = None
    """Inter-beat interval spread relative to the mean. Near 0 = metronomic;
    a human performance is not."""
    tempo_drift: float | None = None
    """Fractional tempo change from the first half of the track to the second.
    Positive = it ends faster than it began. This is why a fixed-tempo grid
    cannot describe live material, so it is reported rather than hidden."""
    onset_rate: float | None = None
    """Onsets per second — 'busyness'."""
    pulse_clarity: float | None = None
    """0..1 — how strongly the music repeats at a beat-like period (median over
    8-second windows). Separates groovable from floating, which tempo alone
    cannot do. dsp_core revision 2; revision 1 used a whole-track
    autocorrelation that read sustained pads as "periodic"."""
    pulse_steadiness: float | None = None
    """0..1 — share of 8-second windows that agree on the same tempo (octaves
    allowed). A song with a steady beat agrees with itself; ambient and
    free-time music doesn't."""
    tempo_status: str | None = None
    """dsp_core: "measured", "no_steady_beat" (bpm and tempo_confidence are then
    left empty on purpose) or "too_short"."""
    percussiveness: float | None = None
    """0..1 — percussive-to-harmonic energy ratio."""
    microtiming_tightness: float | None = None
    """Mean absolute deviation of onsets from the metric grid, in ms. Tight /
    programmed versus loose / human."""
    microtiming_signed: float | None = None
    """Mean signed deviation in ms. **Positive = onsets land early (pushing
    ahead of the grid); negative = late (laid back).** This is where the user's
    own hypothesis about 'energy' lives, not in bpm."""
    swing_ratio: float | None = None
    """Position of the offbeat inside the beat, as a fraction: 0.5 is straight
    eighths, ~0.667 is triplet swing. None when the track has no offbeats to
    measure — an absent value, not a straight feel."""

    # --- tonality / harmony ----------------------------------------------
    # Filled by: tonal (key and mode, see tonal.py); chords and harmony later.
    mode: str | None = None
    """'major' | 'minor' — a more reliable affect cue than the absolute key."""
    camelot: str | None = None
    """The key on the DJ (Camelot) wheel, e.g. '8A' for A minor."""
    key_strength: float | None = None
    """How well the best key fits (correlation, −1…1)."""
    key_margin: float | None = None
    """How far the best key is ahead of the next one that isn't its relative major/minor."""
    key_status: str | None = None
    """measured | unclear | too_short."""
    key_method: str | None = None
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
    spectral_tilt: float | None = None
    """Slope of the spectrum on log-log axes (dB per log-Hz). Negative values
    mean energy concentrated low; a mastering/brightness cue."""
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
    clipping_density: float | None = None
    """Proportion of samples pinned at full scale. A mastering fingerprint:
    brick-walled modern masters clip, older or audiophile masters do not."""

    # --- vocal / instrumental --------------------------------------------
    instrumental: float | None = None
    """1 − vocal_fraction — the 'no words' filter."""
    vocal_fraction: float | None = None
    """Share of 10-second windows with singing or speech (the `voice` stage, listen.py)."""
    voice_peak: float | None = None
    """The strongest singing/speech probability in any window (for calibration)."""
    voice_method: str | None = None
    voice_windows: int | None = None
    sound_vector: str | None = None
    """128 signed bytes (base64): the song's sound, for "sounds like these songs" (listen.py)."""

    instruments: dict[str, float] = field(default_factory=dict)
    """Share of windows where each instrument is heard, e.g. {"piano": 0.82}. The 'no piano' filter."""

    moods: dict[str, float] = field(default_factory=dict)
    """AudioSet's seven music-mood classes, averaged over the song (voice stage rev 3), e.g.
    {"sad": 0.12, "happy": 0.03, …}. Raw readings: the brain derives arousal/valence from them."""

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

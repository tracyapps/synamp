/**
 * Signal registry — the brain's side of the analyzer contract (AGENT-ROADMAP P1/P2).
 *
 * Every field a query plan may mention is listed here exactly once, under its
 * canonical name (the analyzer's `AnalysisResult` attribute, or a metadata
 * field). A plan field that is not in this table is never guessed at: the
 * validator turns it into a structured "unsupported" ask instead.
 *
 * `status` is honest about what exists today:
 *   - "produced"  an analyzer stage computes it now (values can still be null).
 *   - "declared"  the analyzer model reserves the field but no stage fills it yet,
 *                 so every real track is "unknown" for it until a producer lands.
 *   - "metadata"  comes from tags / the library core, not from audio analysis.
 *
 * Null is never zero. A missing value is "unknown", and each predicate states
 * what unknown means for it (see `unknown_policy` in plan.ts).
 */

export const REGISTRY_VERSION = "signals/1";

export type SignalKind = "number" | "category" | "categories";
export type SignalStatus = "produced" | "declared" | "metadata";

export type SignalSpec = {
  field: string;
  kind: SignalKind;
  status: SignalStatus;
  /** Analyzer stage that fills it, or "tags" for metadata. */
  stage: string;
  unit?: string;
  /** Inclusive bounds a plan value must sit inside. */
  range?: [number, number];
  /** Closed vocabulary for category fields (undefined = free text). */
  values?: readonly string[];
  /** Distance outside a numeric threshold that still counts as a near miss. */
  nearMiss?: number;
  /** Measured from audio (true) vs read from tags (false). */
  audio: boolean;
  /**
   * A weak hint that may only corroborate. It is allowed a "neutral" unknown
   * policy even inside an explicit exclusion (the measured proxy must lead).
   */
  corroborating?: boolean;
  /** What a null means for this field. */
  nullMeaning: string;
  /** Status gate: the value only counts when the track's status field matches. */
  eligibleWhen?: { field: "beat_status" | "timing_status"; equals: readonly string[] };
  note?: string;
};

const TRACKED = { field: "beat_status", equals: ["tracked"] } as const;
const TIMED = { field: "timing_status", equals: ["measured_relative_to_fitted_grid"] } as const;

/** Instruments a plan may name. Each one becomes `instruments.<name>`. */
export const INSTRUMENTS = [
  "piano", "guitar", "acoustic_guitar", "electric_guitar", "bass", "drums",
  "strings", "violin", "cello", "brass", "trumpet", "saxophone", "synthesizer",
  "organ", "flute", "harp", "choir",
] as const;

export const MOODS = [
  "relaxing", "meditative", "sleepy", "happy", "sad", "dark", "epic",
  "party", "aggressive", "romantic", "uplifting", "melancholic",
] as const;

const SPECS: SignalSpec[] = [
  // --- rhythm / timing ---------------------------------------------------
  { field: "bpm", kind: "number", status: "produced", stage: "dsp_core", unit: "BPM", range: [20, 300], nearMiss: 6, audio: true,
    nullMeaning: "no steady beat to measure", note: "dsp_core revision 2 gives a tempo only when there is a steady beat (tempo_status \"measured\"); beatless music is left empty. Octave errors (60/120/240) are still possible. Check tempo_confidence." },
  { field: "tempo_confidence", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.1, audio: true, nullMeaning: "no steady beat to measure" },
  { field: "pulse_clarity", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.08, audio: true, nullMeaning: "not measured",
    note: "Revision 2: median beat-period repetition over 8-second windows (around 0.5 for beat-led songs, under 0.2 for ambient and most classical)." },
  { field: "pulse_steadiness", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.08, audio: true, nullMeaning: "not measured",
    note: "Share of 8-second windows agreeing on one tempo (double/half time count as the same). A steady beat: pulse_clarity ≥ 0.30 and pulse_steadiness ≥ 0.50." },
  { field: "onset_rate", kind: "number", status: "produced", stage: "dsp_core", unit: "onsets/s", range: [0, 50], nearMiss: 0.5, audio: true, nullMeaning: "not measured" },
  { field: "percussiveness", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.08, audio: true, nullMeaning: "not measured" },
  { field: "beat_grid_strength", kind: "number", status: "produced", stage: "beat", range: [0, 1], nearMiss: 0.08, audio: true, eligibleWhen: TRACKED,
    nullMeaning: "no tracked beat grid (abstained or not run)" },
  { field: "beat_interval_cv", kind: "number", status: "produced", stage: "beat", range: [0, 5], nearMiss: 0.02, audio: true, eligibleWhen: TRACKED, nullMeaning: "no tracked beat grid" },
  { field: "tempo_drift", kind: "number", status: "produced", stage: "beat", range: [-1, 1], nearMiss: 0.02, audio: true, eligibleWhen: TRACKED, nullMeaning: "no tracked beat grid" },
  { field: "microtiming_tightness", kind: "number", status: "produced", stage: "beat", unit: "ms", range: [0, 200], nearMiss: 3, audio: true, eligibleWhen: TIMED,
    nullMeaning: "timing abstained (no reliable reference grid)" },
  { field: "microtiming_signed", kind: "number", status: "produced", stage: "beat", unit: "ms", range: [-200, 200], nearMiss: 3, audio: true, eligibleWhen: TIMED,
    nullMeaning: "timing abstained (no reliable reference grid)", note: "Positive = early / pushing; negative = late / laid back." },
  { field: "swing_ratio", kind: "number", status: "produced", stage: "beat", range: [0.3, 0.8], nearMiss: 0.03, audio: true, eligibleWhen: TIMED,
    nullMeaning: "no offbeats to measure — not the same as straight" },

  // --- loudness / production ---------------------------------------------
  { field: "lufs_integrated", kind: "number", status: "produced", stage: "dsp_core", unit: "LUFS", range: [-70, 5], nearMiss: 1.5, audio: true, nullMeaning: "not measured" },
  { field: "loudness_range", kind: "number", status: "produced", stage: "dsp_core", unit: "LU", range: [0, 40], nearMiss: 1, audio: true, nullMeaning: "not measured" },
  { field: "crest_factor", kind: "number", status: "produced", stage: "dsp_core", unit: "dB", range: [0, 40], nearMiss: 1, audio: true, nullMeaning: "not measured" },
  { field: "dynamic_complexity", kind: "number", status: "produced", stage: "dsp_core", range: [0, 20], nearMiss: 0.5, audio: true, nullMeaning: "not measured" },
  { field: "clipping_density", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.001, audio: true, nullMeaning: "not measured" },

  // --- timbre / spectrum ---------------------------------------------------
  { field: "spectral_centroid", kind: "number", status: "produced", stage: "dsp_core", unit: "Hz", range: [0, 22050], nearMiss: 150, audio: true, nullMeaning: "not measured" },
  { field: "spectral_flatness", kind: "number", status: "produced", stage: "dsp_core", range: [0, 1], nearMiss: 0.02, audio: true, nullMeaning: "not measured" },
  { field: "spectral_tilt", kind: "number", status: "produced", stage: "dsp_core", unit: "dB/log-Hz", range: [-60, 20], nearMiss: 1, audio: true, nullMeaning: "not measured" },

  // --- voice stage (singing/speech and instruments) ----------------------
  { field: "vocal_fraction", kind: "number", status: "produced", stage: "voice", range: [0, 1], nearMiss: 0.08, audio: true, nullMeaning: "not listened to yet",
    note: "Share of 10-second windows where an AudioSet tagger (PANNs CNN14) hears singing or speech above 0.10. Wordless choirs count as voice; a voice buried deep in the mix can be missed." },
  { field: "instrumental", kind: "number", status: "produced", stage: "voice", range: [0, 1], nearMiss: 0.1, audio: true, nullMeaning: "not listened to yet",
    note: "1 − vocal_fraction." },
  ...INSTRUMENTS.map((name): SignalSpec => ({
    field: `instruments.${name}`, kind: "number", status: "produced", stage: "voice", range: [0, 1], nearMiss: 0.2, audio: true,
    nullMeaning: "not listened to yet — absence is NOT evidence of no " + name.replace(/_/g, " "),
    note: "Share of 10-second windows where the tagger hears this instrument above 0.10.",
  })),
  // --- declared, no producer yet -------------------------------------------
  { field: "arousal", kind: "number", status: "declared", stage: "semantic", range: [0, 1], nearMiss: 0.05, audio: true, nullMeaning: "semantic stage not run" },
  { field: "valence", kind: "number", status: "declared", stage: "semantic", range: [0, 1], nearMiss: 0.05, audio: true, nullMeaning: "semantic stage not run" },
  { field: "danceability", kind: "number", status: "declared", stage: "semantic", range: [0, 1], nearMiss: 0.05, audio: true, nullMeaning: "semantic stage not run" },
  { field: "mood", kind: "category", status: "declared", stage: "semantic", values: MOODS, audio: true, corroborating: true,
    nullMeaning: "no mood estimate", note: "Categorical mood heads are weak; arousal leads, mood only corroborates." },
  { field: "mode", kind: "category", status: "produced", stage: "tonal", values: ["major", "minor"], audio: true, nullMeaning: "key not measured yet, or no clear key",
    note: "From the song's key (chroma matched against Temperley's key profiles). Songs with no clear key (drones, noise, spoken word) have none." },
  { field: "chord_change_rate", kind: "number", status: "declared", stage: "tonal", unit: "chords/s", range: [0, 10], nearMiss: 0.1, audio: true, nullMeaning: "tonal stage not run" },
  { field: "dissonance", kind: "number", status: "declared", stage: "tonal", range: [0, 1], nearMiss: 0.05, audio: true, nullMeaning: "tonal stage not run" },
  { field: "structure_repetition", kind: "number", status: "declared", stage: "structure", range: [0, 1], nearMiss: 0.05, audio: true, nullMeaning: "structure stage not run" },

  // --- metadata -------------------------------------------------------------
  { field: "artist", kind: "category", status: "metadata", stage: "tags", audio: false, nullMeaning: "untagged" },
  { field: "album", kind: "category", status: "metadata", stage: "tags", audio: false, nullMeaning: "untagged" },
  { field: "genre", kind: "categories", status: "metadata", stage: "tags", audio: false,
    nullMeaning: "untagged — NOT evidence the track is outside a genre" },
  { field: "year", kind: "number", status: "metadata", stage: "tags", range: [1877, 2100], nearMiss: 2, audio: false,
    nullMeaning: "untagged", note: "Release year, not sonic era. Remasters and compilations poison it." },
  { field: "duration_s", kind: "number", status: "metadata", stage: "tags", unit: "s", range: [0, 36000], nearMiss: 15, audio: false, nullMeaning: "unknown length" },
];

/**
 * Research-document spellings mapped to canonical names. Anything not here and
 * not canonical is rejected — aliases are never inferred.
 */
export const ALIASES: Readonly<Record<string, string>> = {
  "microtiming_deviation.signed": "microtiming_signed",
  "microtiming_deviation.tightness": "microtiming_tightness",
  "instrumental_score": "instrumental",
  "production_vec.loudness_range": "loudness_range",
  "production_vec.crest_factor": "crest_factor",
  "production_vec.clipping_density": "clipping_density",
  "production.loudness_range": "loudness_range",
  "production.crest_factor": "crest_factor",
  "production.clipping_density": "clipping_density",
  "production.spectral_tilt": "spectral_tilt",
  "structure.repetition": "structure_repetition",
  "mood_tag": "mood",
  ...Object.fromEntries(INSTRUMENTS.map((name) => [`instrument.${name}`, `instruments.${name}`])),
  "instrument.synth": "instruments.synthesizer",
  "instruments.synth": "instruments.synthesizer",
};

/**
 * Fields the research names that have no producer and no plan to fake one.
 * The validator returns these as unsupported asks with the nearest honest option.
 */
export const KNOWN_UNSUPPORTED: Readonly<Record<string, { reason: string; nearest?: string }>> = {
  punk_proxy: { reason: "No audio texture proxy for punk has a producer yet.", nearest: "genre (tags only; untagged tracks stay unverified)" },
  country_proxy: { reason: "No audio texture proxy for country has a producer yet.", nearest: "genre (tags only; untagged tracks stay unverified)" },
  distortion_index: { reason: "No distortion producer yet.", nearest: "spectral_flatness" },
  "production_vec.stereo_width": { reason: "Analysis decodes mono; stereo width needs a stereo decode." },
  "production_vec.reverb_decay": { reason: "No reverb producer exists." },
  "production_vec.noise_floor": { reason: "No noise-floor producer exists." },
  production_era: { reason: "Per-track sonic era is a candidate signal, not validated.", nearest: "loudness_range / crest_factor / clipping_density" },
  chord_emb: { reason: "No chord-progression producer yet.", nearest: "chord_change_rate (declared, not produced)" },
  harmonic_complexity: { reason: "No tonal producer yet." },
  "structure.boundaries": { reason: "Boundaries are a timeline, not a filterable value." },
  "structure.novelty": { reason: "No structure producer yet." },
  audio_embedding: { reason: "Embeddings are a ranking signal (exemplar_pos), not a constraint field." },
  lyric_embedding: { reason: "No lyrics producer yet." },
  has_lyrics: { reason: "No lyrics producer yet.", nearest: "vocal_fraction" },
  lyric_lang: { reason: "No lyrics producer yet." },
  plays: { reason: "Playback events are not captured yet (P3)." },
  last_played_days: { reason: "Playback events are not captured yet (P3)." },
  subgenre: { reason: "No subgenre source; genre tags are already weak evidence.", nearest: "genre" },
  decade: { reason: "Use year directly; sonic era is a different, unvalidated signal.", nearest: "year" },
  key: { reason: "Key is reserved for DJ-mode harmonic mixing, not filtering.", nearest: "mode" },
  energy: { reason: "\"Energy\" is not one number. Name the proxy instead.", nearest: "arousal, pulse_clarity, or microtiming_signed" },
};

export const SIGNALS: ReadonlyMap<string, SignalSpec> = new Map(SPECS.map((spec) => [spec.field, spec]));

export type FieldLookup =
  | { ok: true; spec: SignalSpec; alias?: string }
  | { ok: false; reason: string; nearest?: string };

export function lookupField(name: string): FieldLookup {
  const direct = SIGNALS.get(name);
  if (direct) return { ok: true, spec: direct };
  const canonical = ALIASES[name];
  if (canonical) {
    const spec = SIGNALS.get(canonical);
    if (spec) return { ok: true, spec, alias: name };
  }
  const known = KNOWN_UNSUPPORTED[name];
  if (known) return { ok: false, ...known };
  if (/^instruments?\./.test(name)) {
    return { ok: false, reason: `No detector is planned for "${name.split(".")[1]}".`, nearest: `one of: ${INSTRUMENTS.join(", ")}` };
  }
  return { ok: false, reason: `Unknown field "${name}".` };
}

/** What each not-yet-built analysis stage would tell us, in plain words (for "SynAmp can't hear … yet"). */
export const STAGE_ABOUT: Readonly<Record<string, string>> = {
  voice: "whether a song has singing or words",
  instruments: "which instruments are playing",
  semantic: "a song’s mood and energy",
  tonal: "key, chords and harmony",
  structure: "how a song is built (verses, repeats, changes)",
};

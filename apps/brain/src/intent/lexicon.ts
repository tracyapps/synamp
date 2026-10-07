/**
 * Goal lexicon — the deterministic, rule-based stand-in for "what does this
 * goal language mean in features?" (A1 music-psychology pack §2–§3, A2 culture
 * & reliability pack §4; frozen decisions in the fast-learning-brain plan).
 *
 * Conventions (mirrored from A1 §2.0 and the A2 product rules):
 *  - SOFT ONLY. Every constraint is a soft weighted preference; nothing here
 *    filters tracks. Hard constraints are the user's own explicit words
 *    (draft.ts), never a research bundle.
 *  - Declared fields (no analyzer producer yet) are emitted with
 *    unknown_policy "neutral" and carry the note "no producer yet — inert on
 *    real data" (see `declared: true`; the plan schema has no per-constraint
 *    note slot, so the marker travels in `mechanism` and in the reading's
 *    shared assumption line).
 *  - Weights: `researchWeight` is exactly the number published in A1 §2.
 *    Bundles F (1.70), P (2.10), D (2.00) and S (2.15 calm / 2.35 sleep)
 *    exceed the A1 convention "bundle total ≤ 1.0", so their *emitted* weights
 *    are floor-normalised (scale = 1/total) to satisfy that convention. The
 *    evaluator scores soft terms as a weighted average (sum(w·sat)/sum(w)),
 *    so normalisation is score-neutral — it only keeps the published relative
 *    weights while honouring the dominance rule.
 *  - Bands are labelled starting points, never laws: tempo octave errors are a
 *    named MIR failure class and listener enculturation shapes what "works"
 *    (A2 CC-29/30/36/37). Never hard-enforce Western metre/tempo conventions.
 *  - `quantile` bands are library-relative (A1 §2.0); they resolve from the
 *    current library and are skipped, with a note, when fewer than
 *    MIN_QUANTILE_SAMPLES tracks have measured values.
 *  - Refs [MP-n] / [CC-n] point at the A1 / A2 source appendices.
 */

import type { Library } from "../query/evaluate.ts";

export const LEXICON_VERSION = "goal-lexicon/1";

/** Minimum measured tracks before a library-relative band is usable. */
export const MIN_QUANTILE_SAMPLES = 3;

export type Arc = "flat" | "build" | "cooldown" | "peak" | "wave";

export type GoalId =
  | "focus" | "pump_up" | "dance" | "calm" | "sleep"
  | "catharsis" | "nostalgia" | "drive" | "chores";

export type LexOp = "lt" | "lte" | "gt" | "gte" | "between" | "in";

export type LexBand =
  | { kind: "abs"; value: number | [number, number] }
  | { kind: "quantile"; q: number | [number, number] }
  | { kind: "values"; values: string[] }
  /** A window the system cannot know without the user (cohort years). Always skips with a note. */
  | { kind: "cohort" };

export type LexConstraint = {
  /** Stable bundle position (A1 §2 row number); emitted id is `goal_<goal>_<n>`. */
  n: number;
  field: string;
  op: LexOp;
  band: LexBand;
  /** Exactly the suggestion in A1 §2 (research suggestion, not a tuned value). */
  researchWeight: number;
  mechanism: string;
  refs: string[];
  /** The field has no producer yet; emitted with unknown_policy "neutral", inert on real data. */
  declared?: boolean;
  /** Which measurable a polysemous phrase compiled to (A1 §2 / registry convention). */
  proxy?: string;
};

export type Goal = {
  id: GoalId;
  label: string;
  /** EN trigger phrases; matched with word boundaries, longest first, negation-guarded. */
  triggers: string[];
  constraints: LexConstraint[];
  arc: Arc;
  arcNote: string;
  /** Plain-language assumptions shown with a reading. */
  assumptions: string[];
  caveats: string[];
  culture: string[];
  /** Draft constraint ids to drop when this goal fires (the draft's cruder proxies). */
  supersedes: string[];
  /** Prefixes of draft plan assumptions that describe the superseded proxies. */
  supersedeAssumptions: string[];
  /** Provable goal-opposition pairs (both directions listed). */
  opposes?: GoalId[];
  /** Natural combinations; a blend hint for copy/UI, not a gate. */
  blendsWith?: GoalId[];
  blendNote?: string;
};

export type Modifier = {
  id: "fast" | "slow";
  label: string;
  triggers: string[];
  constraint: LexConstraint;
  note: string;
};

/* --------------------------------------------------------------------------
 * Bundles (A1 §2). Numbers match the pack exactly; see header for weights.
 * ------------------------------------------------------------------------ */

const focus: Goal = {
  id: "focus",
  label: "focus",
  triggers: [
    "i need to focus", "need to focus", "focus", "focused", "focusing",
    "concentrate", "concentrating", "concentration", "study", "studying",
    "deep work", "homework", "work session", "get work done",
  ],
  constraints: [
    { n: 1, field: "vocal_fraction", op: "lte", band: { kind: "abs", value: 0.1 }, researchWeight: 0.45, declared: true,
      proxy: "no-words → low vocal_fraction",
      mechanism: "Lyrics/voice are the reliable distraction lever for verbal work (irrelevant-speech effect); liking it doesn't rescue it; no producer yet — inert on real data.", refs: ["MP-20", "MP-21", "MP-22"] },
    { n: 2, field: "bpm", op: "between", band: { kind: "abs", value: [85, 125] }, researchWeight: 0.15,
      mechanism: "Mid-arousal optimum; avoid extremes that over/under-stimulate. Band = design assumption.", refs: ["MP-32", "MP-22"] },
    { n: 3, field: "pulse_clarity", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.15,
      mechanism: "Predictability / low surprise supports sustained attention. Design assumption.", refs: ["MP-22"] },
    { n: 4, field: "onset_rate", op: "lte", band: { kind: "abs", value: 4 }, researchWeight: 0.15,
      mechanism: "Lower event density = fewer attention grabs. Number = design assumption.", refs: ["MP-21", "MP-22"] },
    { n: 5, field: "dynamic_complexity", op: "lte", band: { kind: "abs", value: 8 }, researchWeight: 0.1,
      mechanism: "Low surprise / slow change. Design assumption.", refs: ["MP-22"] },
    { n: 6, field: "lufs_integrated", op: "between", band: { kind: "quantile", q: [0.25, 0.75] }, researchWeight: 0.1,
      mechanism: "Loud = arousing; high-arousal music raised felt effort. Library-relative band; design assumption.", refs: ["MP-32"] },
    { n: 7, field: "spectral_flatness", op: "lte", band: { kind: "abs", value: 0.3 }, researchWeight: 0.1,
      mechanism: "Tonal (not noisy/harsh) fits verbal work. Design assumption.", refs: ["MP-21"] },
    { n: 8, field: "spectral_centroid", op: "between", band: { kind: "quantile", q: [0.2, 0.8] }, researchWeight: 0.1,
      mechanism: "Avoid extreme brightness (harsh) and extreme darkness (muffled). Library-relative band; design assumption.", refs: ["MP-31"] },
    { n: 9, field: "beat_interval_cv", op: "lte", band: { kind: "abs", value: 0.05 }, researchWeight: 0.15,
      mechanism: "Temporal predictability; steady grid (counts only when a beat was tracked). Design assumption.", refs: ["MP-22"] },
    { n: 10, field: "arousal", op: "between", band: { kind: "abs", value: [0.3, 0.65] }, researchWeight: 0.25, declared: true,
      proxy: "focus → arousal (moderate band)",
      mechanism: "Mid-arousal dip; higher on hard tasks; no producer yet — inert on real data.", refs: ["MP-32"] },
  ],
  arc: "flat",
  arcNote: "Steady mid-energy: stability beats variation for attention (kept flat deliberately).",
  assumptions: [
    "“Focus” is a soft preference bundle: mid tempo, a steady pulse, low distraction, no mood imposition — nothing in it excludes a track.",
  ],
  caveats: [
    "No retrieved study shows “focus music” helps globally — lyrics harm verbal tasks and instrumental is neutral (MP-21/22).",
    "Weights are research suggestions, not tuned values.",
  ],
  culture: [
    "Tempo bands are starting points: tempo estimation is unreliable on non-Western material (octave errors) and enculturation shapes preferred tempo (CC-29/30/37).",
  ],
  supersedes: ["focus_arousal", "focus_pulse"],
  supersedeAssumptions: ["“Focus” is not measurable"],
  blendsWith: ["chores"],
  blendNote: "Admin/desk chores converge on the focus rules (A1 §2 W branch).",
};

const pump_up: Goal = {
  id: "pump_up",
  label: "pump up",
  triggers: [
    "pump me up", "pump it up", "pumped up", "pumped", "pump up", "hype me up",
    "hype me", "hyped up", "hyped", "amped up", "amped", "motivate me",
    "get me motivated", "psyched up", "psyched", "psych me up", "workout",
    "work out", "gym", "lifting weights", "lift weights", "weights", "cardio",
    "jogging", "go for a run", "going for a run", "game day", "win this game",
    "before the game", "pre-game", "pregame", "training session", "get me going",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [125, 140] }, researchWeight: 0.35,
      proxy: "pump up → exercise tempo band",
      mechanism: "Sustained 40–90 % max-HRR asynchronous band; fast tempo moderates performance gains.", refs: ["MP-1", "MP-2"] },
    { n: 2, field: "percussiveness", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.3,
      mechanism: "“Prominent percussive and rhythmical features” for the stimulative effect.", refs: ["MP-1"] },
    { n: 3, field: "pulse_clarity", op: "gte", band: { kind: "abs", value: 0.55 }, researchWeight: 0.25,
      mechanism: "Synchronisation benefits; steady beat for movement. Threshold = design assumption.", refs: ["MP-1"] },
    { n: 4, field: "beat_grid_strength", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.2,
      mechanism: "Synchronous use gives larger benefits (gated: only when a beat grid was tracked).", refs: ["MP-1"] },
    { n: 5, field: "onset_rate", op: "gte", band: { kind: "quantile", q: 0.6 }, researchWeight: 0.2,
      mechanism: "Higher event density drives energy. Design assumption.", refs: ["MP-2"] },
    { n: 6, field: "lufs_integrated", op: "gte", band: { kind: "quantile", q: 0.6 }, researchWeight: 0.2,
      mechanism: "Loud/energising; kept ≤ 0.3 to avoid a loudness-war bias. Design assumption.", refs: ["MP-2"] },
    { n: 7, field: "spectral_centroid", op: "gte", band: { kind: "quantile", q: 0.6 }, researchWeight: 0.15,
      mechanism: "Bright timbre = energetic. Design assumption.", refs: ["MP-2"] },
    { n: 8, field: "beat_interval_cv", op: "lte", band: { kind: "abs", value: 0.06 }, researchWeight: 0.15,
      mechanism: "Steady tempo for synchronisation. Design assumption.", refs: ["MP-1"] },
    { n: 9, field: "arousal", op: "gte", band: { kind: "abs", value: 0.6 }, researchWeight: 0.3, declared: true,
      proxy: "pump up → arousal",
      mechanism: "Arousal optimisation, pre-task and in-task; no producer yet — inert on real data.", refs: ["MP-1", "MP-2", "MP-3"] },
  ],
  arc: "build",
  arcNote: "Two or three tracks ascending into the band, then hold. Short pre-game windows may prefer an “instant max” variant.",
  assumptions: [
    "“Pump up” becomes an exercise/pre-task bundle: fast steady tempo, prominent percussion, loud and bright — preferences, not filters.",
    "Self-selected music outperforms preselected (MP-3). Your loves and repeats re-rank this list as you listen — kept deliberately bounded, so they steer quickly without steamrolling the request.",
  ],
  caveats: [
    "Evidence is strongest for exercise/sport; the gaming extension is a design assumption (MP-1/2/3).",
    "A second “instant max” variant (bpm ≥ 120) exists in the research pack for short/explosive moments — not emitted by default.",
  ],
  culture: [
    "Exercise bands come largely from Western lab samples; treat 125–140 bpm as a starting point only.",
  ],
  supersedes: ["energetic"],
  supersedeAssumptions: ["“Energy” was read as arousal"],
  opposes: ["calm"],
  blendsWith: ["dance", "chores"],
  blendNote: "Movement energy: dance adds groove, chores adds pacing.",
};

const dance: Goal = {
  id: "dance",
  label: "dance",
  triggers: [
    "i want to dance", "want to dance", "let's dance", "lets dance",
    "dance party", "dance", "dancing", "danced", "party", "club", "club music",
    "boogie", "groove", "grooving", "get down",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [115, 130] }, researchWeight: 0.3,
      mechanism: "Perceptual centre ≈ 120 bpm; preferred tempo tracks each listener's internal tempo (SMT). Band = design assumption.", refs: ["MP-1", "MP-13"] },
    { n: 2, field: "pulse_clarity", op: "gte", band: { kind: "abs", value: 0.55 }, researchWeight: 0.3,
      mechanism: "Entrainment precondition. Design assumption.", refs: ["MP-10"] },
    { n: 3, field: "percussiveness", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.3,
      mechanism: "Groove repertoire is percussive.", refs: ["MP-10"] },
    { n: 4, field: "onset_rate", op: "between", band: { kind: "quantile", q: [0.4, 0.9] }, researchWeight: 0.15,
      mechanism: "Moderate-high density; don't over-weight busy-ness — audio entropy was a poor groove predictor.", refs: ["MP-10"] },
    { n: 5, field: "lufs_integrated", op: "gte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.15,
      mechanism: "Party energy. Design assumption.", refs: ["MP-10"] },
    { n: 6, field: "spectral_centroid", op: "gte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.1,
      mechanism: "Bright timbre. Design assumption.", refs: ["MP-10"] },
    { n: 7, field: "beat_grid_strength", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.2,
      mechanism: "Move-along regularity (gated). Design assumption.", refs: ["MP-10"] },
    { n: 8, field: "beat_interval_cv", op: "lte", band: { kind: "abs", value: 0.06 }, researchWeight: 0.1,
      mechanism: "Machine-steady vs live variability both exist in dance — kept weak. Design assumption.", refs: ["MP-10"] },
    { n: 9, field: "danceability", op: "gte", band: { kind: "abs", value: 0.6 }, researchWeight: 0.4, declared: true,
      proxy: "dance → danceability",
      mechanism: "Direct construct; carries the family once a producer lands; no producer yet — inert on real data.", refs: ["MP-10"] },
  ],
  arc: "peak",
  arcNote: "Build to a peak, then vary texture (the pack's build → wave); monotony breeds fatigue, so keep tempo steady and rotate repertoire.",
  assumptions: [
    "“Dance” prefers a ~115–130 bpm groove with a clear pulse and percussion, at moderate complexity — not maximum busy-ness.",
    "Enjoyment beats cultural familiarity for moving together — this bundle is built to yield quickly to your feedback (MP-14).",
  ],
  caveats: [
    "Syncopation itself is not measurable today; the inverted-U is lab evidence on funk drum-breaks (MP-10).",
    "Lab stimuli ≠ party context; no field studies of parties were retrieved.",
  ],
  culture: [
    "Do not export the 4/4 groove optimum: for Western listeners rhythmic-complexity preferences invert outside 4/4; never hard-enforce a metre convention (CC-36).",
  ],
  supersedes: [],
  supersedeAssumptions: [],
  opposes: ["sleep"],
  blendsWith: ["pump_up"],
  blendNote: "A dance set IS a party pump-up; groove terms lead.",
};

const calm: Goal = {
  id: "calm",
  label: "calm",
  triggers: [
    "calm", "calming", "calm down", "relax", "relaxing", "relaxed", "relaxation",
    "chill out", "chill", "chilling", "wind down", "unwind", "soothe", "soothing",
    "mellow", "meditation", "meditative", "breathe", "breathing", "de-stress",
    "destress", "stress relief", "take it easy", "easy listening", "quiet music",
    "peaceful",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [55, 80] }, researchWeight: 0.4,
      mechanism: "Sedative profile: tempo < 80 bpm, simple regular pulsation.", refs: ["MP-1"] },
    { n: 2, field: "percussiveness", op: "lte", band: { kind: "abs", value: 0.35 }, researchWeight: 0.3,
      mechanism: "Inverse of percussive for sedation.", refs: ["MP-1"] },
    { n: 3, field: "onset_rate", op: "lte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.3,
      mechanism: "Sparse events, simple structure. Library-relative band; design assumption.", refs: ["MP-1"] },
    { n: 4, field: "lufs_integrated", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.25,
      mechanism: "Soft volume for wind-down (magnitude = design assumption).", refs: ["MP-1"] },
    { n: 5, field: "loudness_range", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.15,
      mechanism: "Low dynamic swings. Design assumption.", refs: ["MP-1"] },
    { n: 6, field: "spectral_centroid", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.2,
      mechanism: "Dark/warm timbre. Design assumption.", refs: ["MP-1"] },
    { n: 7, field: "spectral_flatness", op: "lte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.1,
      mechanism: "Tonal/repetitive patterns (sedative tradition). Band = design assumption.", refs: ["MP-1"] },
    { n: 8, field: "beat_interval_cv", op: "lte", band: { kind: "abs", value: 0.05 }, researchWeight: 0.15,
      mechanism: "“Regular pulsation” (gated).", refs: ["MP-1"] },
    { n: 9, field: "arousal", op: "lte", band: { kind: "abs", value: 0.4 }, researchWeight: 0.3, declared: true,
      proxy: "calm → arousal (low)",
      mechanism: "Relaxation goal; stress evidence is mixed, so the weight stays moderate; no producer yet — inert on real data.", refs: ["MP-26", "MP-27"] },
  ],
  arc: "cooldown",
  arcNote: "Descend toward the lowest band; starting slightly above target avoids the mismatch jar.",
  assumptions: [
    "“Calm” leans slow, soft and steady — preferences only; it promises no stress reduction (the physiology evidence is mixed).",
  ],
  caveats: [
    "Subjective wind-down benefit is medium evidence (MP-26); objective stress measures are mixed (MP-27).",
    "Vocal music is not penalised for wind-down — the no-lyrics rule is a focus/work rule, not a calm rule.",
  ],
  culture: [
    "Familiar vs unfamiliar relaxing music is explicitly unresolved (MP-26) — feedback decides.",
  ],
  supersedes: ["calm"],
  supersedeAssumptions: [],
  opposes: ["pump_up"],
  blendsWith: ["sleep", "nostalgia"],
  blendNote: "Wind-down family; nostalgia adds familiarity.",
};

const sleep: Goal = {
  id: "sleep",
  label: "sleep",
  triggers: [
    "fall asleep", "to sleep", "sleep", "sleeping", "sleepy", "bedtime",
    "bed time", "go to bed", "off to bed", "good night", "goodnight",
    "lullaby", "nap", "napping", "for bed",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [50, 70] }, researchWeight: 0.45,
      mechanism: "60–70 bpm ≈ resting heart rate (sleep subset of the sedative guidance).", refs: ["MP-1"] },
    { n: 2, field: "percussiveness", op: "lte", band: { kind: "abs", value: 0.35 }, researchWeight: 0.3,
      mechanism: "Inverse of percussive for sedation.", refs: ["MP-1"] },
    { n: 3, field: "onset_rate", op: "lte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.3,
      mechanism: "Sparse events, simple structure. Library-relative band; design assumption.", refs: ["MP-1"] },
    { n: 4, field: "lufs_integrated", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.25,
      mechanism: "Soft volume for sleep (magnitude = design assumption).", refs: ["MP-1"] },
    { n: 5, field: "loudness_range", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.15,
      mechanism: "Low dynamic swings. Design assumption.", refs: ["MP-1"] },
    { n: 6, field: "spectral_centroid", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.2,
      mechanism: "Dark/warm timbre. Design assumption.", refs: ["MP-1"] },
    { n: 7, field: "spectral_flatness", op: "lte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.1,
      mechanism: "Tonal/repetitive patterns. Band = design assumption.", refs: ["MP-1"] },
    { n: 8, field: "beat_interval_cv", op: "lte", band: { kind: "abs", value: 0.05 }, researchWeight: 0.15,
      mechanism: "“Regular pulsation” (gated).", refs: ["MP-1"] },
    { n: 9, field: "vocal_fraction", op: "lte", band: { kind: "abs", value: 0.4 }, researchWeight: 0.15, declared: true,
      proxy: "sleep → less speech-like audio",
      mechanism: "For sleep onset, speech-like audio is the distraction mechanism (extrapolated from the irrelevant-speech effect; design assumption); no producer yet — inert on real data.", refs: ["MP-20"] },
    { n: 10, field: "arousal", op: "lte", band: { kind: "abs", value: 0.4 }, researchWeight: 0.3, declared: true,
      proxy: "sleep → arousal (low)",
      mechanism: "Wind-down to sleep; no producer yet — inert on real data.", refs: ["MP-26"] },
  ],
  arc: "cooldown",
  arcNote: "Descend to the lowest sedative band by the end.",
  assumptions: [
    "“Sleep” uses the sleep subset of the sedative profile (50–70 bpm, soft, sparse) — preferences only.",
    "No mood lift is applied at bedtime; “stay here” is the default and nothing here treats a sleep problem.",
  ],
  caveats: [
    "Objective sleep-stage effects are mostly null; subjective quality improved in a small study (MP-26).",
  ],
  culture: [
    "Sleep-aid studies are small and mostly Western samples; treat the whole profile as a starting point.",
  ],
  supersedes: ["calm"],
  supersedeAssumptions: [],
  opposes: ["dance"],
  blendsWith: ["calm"],
  blendNote: "Sleep is the strictest wind-down; calm is its lighter sibling.",
};

const catharsis: Goal = {
  id: "catharsis",
  label: "catharsis",
  triggers: [
    "catharsis", "cathartic", "sad songs", "sad music", "feeling sad", "feel sad",
    "i'm sad", "im sad", "i am sad", "let it out", "let it all out", "cry it out",
    "crying", "heartbreak", "heartbroken", "breakup songs", "break-up songs",
    "vent", "grieving", "grief", "mourning", "melancholy", "melancholic",
    "angry", "anger", "furious", "rage",
  ],
  constraints: [
    { n: 1, field: "valence", op: "lte", band: { kind: "abs", value: 0.4 }, researchWeight: 0.25, declared: true,
      proxy: "sad → low valence",
      mechanism: "Mood-congruent appreciation, opt-in only; no producer yet — inert on real data.", refs: ["MP-18"] },
    { n: 2, field: "mode", op: "in", band: { kind: "values", values: ["minor"] }, researchWeight: 0.15, declared: true,
      mechanism: "Western sad-repertoire convention — proxy only; no producer yet — inert on real data.", refs: ["MP-17"] },
    { n: 3, field: "bpm", op: "between", band: { kind: "abs", value: [60, 100] }, researchWeight: 0.15,
      mechanism: "Sad repertoire skews slower. Design assumption.", refs: ["MP-17"] },
    { n: 4, field: "spectral_centroid", op: "lte", band: { kind: "quantile", q: 0.45 }, researchWeight: 0.1,
      mechanism: "Darker timbre. Design assumption.", refs: ["MP-17"] },
    { n: 5, field: "lufs_integrated", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.1,
      mechanism: "Intimate dynamics. Design assumption.", refs: ["MP-17"] },
  ],
  arc: "flat",
  arcNote: "Match first; any lift is explicit and revocable — never auto-applied.",
  assumptions: [
    "“Catharsis” runs only because you asked in sad or angry words: it holds the mood first and does not auto-lift at the end.",
    "There's no automatic lift here — if you ever want the mood to shift partway, that would be a future option you ask for explicitly; nothing shifts on its own today.",
  ],
  caveats: [
    "Evidence conflicts: sad music can support regulation and be appreciated (MP-17/18) and has worsened mood in controlled listening (MP-19) — offered, never imposed.",
    "Feature mapping for catharsis is a design assumption; the literature covers psychology, not DSP.",
  ],
  culture: [
    "Minor mode is a Western convention and only a proxy (declared field, no producer).",
  ],
  supersedes: [],
  supersedeAssumptions: [],
  blendsWith: ["nostalgia"],
  blendNote: "Sad-evoked memories are often nostalgic.",
};

const nostalgia: Goal = {
  id: "nostalgia",
  label: "nostalgia",
  triggers: [
    "nostalgia", "nostalgic", "throwback", "throwbacks", "old school",
    "back in the day", "childhood", "memories", "memory lane", "remember when",
    "the old days", "retro",
  ],
  constraints: [
    { n: 1, field: "year", op: "between", band: { kind: "cohort" }, researchWeight: 0.25,
      mechanism: "Cohort effect via personal history. Release year is a tag, not sonic era; missing tag = skip.", refs: ["MP-28", "MP-29"] },
    { n: 2, field: "valence", op: "between", band: { kind: "abs", value: [0.4, 0.8] }, researchWeight: 0.15, declared: true,
      proxy: "nostalgia → bittersweet valence",
      mechanism: "Nostalgia is mixed but approach-oriented; no producer yet — inert on real data.", refs: ["MP-28"] },
    { n: 3, field: "bpm", op: "between", band: { kind: "abs", value: [70, 120] }, researchWeight: 0.1,
      mechanism: "Mid-tempo comfort. Design assumption.", refs: ["MP-28"] },
    { n: 4, field: "mode", op: "in", band: { kind: "values", values: ["major"] }, researchWeight: 0.05, declared: true,
      mechanism: "Gentle positivity flavour; optional; no producer yet — inert on real data.", refs: ["MP-28"] },
  ],
  arc: "flat",
  arcNote: "Gentle and predictable; surprises (genre jumps, novelty) break the effect.",
  assumptions: [
    "Nostalgia is personal: release windows and your favourites do the work — timbre terms are deliberately absent (MP-28/29).",
    "No era is known yet: release-year windows aren't supported yet — say “throwback” or “old school”, and your loves and repeats steer the flavour.",
  ],
  caveats: [
    "“Is familiarity required?” is explicitly open in the literature; feedback (loves/repeats) is the practical lever (MP-28).",
  ],
  culture: [
    "Release year is metadata, not sonic era; compilations and remasters poison it (INT-4).",
  ],
  supersedes: [],
  supersedeAssumptions: [],
  blendsWith: ["calm", "sleep", "catharsis"],
  blendNote: "Comfort families; nostalgia adds self-reference.",
};

const drive: Goal = {
  id: "drive",
  label: "drive",
  triggers: [
    "going for a drive", "for a drive", "long drive", "road trip", "roadtrip",
    "drive", "driving", "commute", "commuting", "in the car", "for the car",
    "highway", "cruising", "cruise", "car ride",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [95, 135] }, researchWeight: 0.3,
      mechanism: "Medium tempo was best for fatigue and attention on a long monotonous drive.", refs: ["MP-31"] },
    { n: 2, field: "lufs_integrated", op: "gte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.1,
      mechanism: "Avoid low-energy sleepiness (fatigue-countermeasure direction). Design assumption.", refs: ["MP-31"] },
    { n: 3, field: "onset_rate", op: "between", band: { kind: "quantile", q: [0.3, 0.8] }, researchWeight: 0.1,
      mechanism: "Maintain engagement without distraction. Design assumption.", refs: ["MP-31"] },
    { n: 4, field: "percussiveness", op: "gte", band: { kind: "quantile", q: 0.4 }, researchWeight: 0.1,
      mechanism: "Alerting texture. Design assumption.", refs: ["MP-31"] },
  ],
  arc: "flat",
  arcNote: "Flat medium; rotate flavour every ~30–45 min on long drives, and avoid sudden tempo jumps.",
  assumptions: [
    "“Drive” keeps a medium, engaged feel: one driving study found slow material can add to fatigue on long trips, though individual differences dominate (MP-31).",
  ],
  caveats: [
    "The medium-tempo experiment used one classical piece on one route — individual differences dominate (MP-31).",
    "The research pack suggests a small negative weight for very slow tempo; plan v2.0 has no negative weights, so it is not emitted.",
  ],
  culture: [
    "Do not generalise “faster = better” — it is not supported; flat arcs suit flagged long-form material (CC-6/13).",
  ],
  supersedes: ["energetic"],
  supersedeAssumptions: ["“Energy” was read as arousal"],
};

const chores: Goal = {
  id: "chores",
  label: "chores",
  triggers: [
    "chores", "chore", "cleaning", "cleaning up", "clean the house",
    "housework", "house work", "do the dishes", "dishes", "laundry", "vacuum",
    "vacuuming", "tidying", "tidy up", "cooking", "cook", "kitchen", "errands",
    "running errands", "power through", "getting stuff done",
    "getting things done", "spring cleaning",
  ],
  constraints: [
    { n: 1, field: "bpm", op: "between", band: { kind: "abs", value: [105, 135] }, researchWeight: 0.25,
      mechanism: "Tempo of background music paces concurrent activity. Band = design assumption.", refs: ["MP-22"] },
    { n: 2, field: "pulse_clarity", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.2,
      mechanism: "Entrainment precondition. Design assumption.", refs: ["MP-22"] },
    { n: 3, field: "percussiveness", op: "gte", band: { kind: "quantile", q: 0.45 }, researchWeight: 0.15,
      mechanism: "Physical-task energy. Design assumption.", refs: ["MP-22"] },
    { n: 4, field: "lufs_integrated", op: "between", band: { kind: "quantile", q: [0.3, 0.8] }, researchWeight: 0.1,
      mechanism: "Avoid fatigue at both ends. Design assumption.", refs: ["MP-22"] },
    { n: 5, field: "onset_rate", op: "between", band: { kind: "quantile", q: [0.35, 0.85] }, researchWeight: 0.1,
      mechanism: "Momentum without clatter. Design assumption.", refs: ["MP-22"] },
    { n: 6, field: "valence", op: "gte", band: { kind: "abs", value: 0.5 }, researchWeight: 0.1, declared: true,
      proxy: "chores → positive affect",
      mechanism: "Background music supports positive emotional reactions (weak); no producer yet — inert on real data.", refs: ["MP-22"] },
  ],
  arc: "flat",
  arcNote: "Flat mid-up; an optional build suits long physical sessions.",
  assumptions: [
    "“Chores” paces a physical task with a steady mid-up tempo; for desk/admin work the focus rules apply instead.",
  ],
  caveats: [
    "Weakest evidence family — extrapolated from one meta-analytic pacing effect; it should lean hardest on feedback (MP-22).",
  ],
  culture: [
    "Task split: admin chores are verbal tasks — obey the lyrics rule (MP-20/21).",
  ],
  supersedes: [],
  supersedeAssumptions: [],
  blendsWith: ["pump_up", "focus"],
  blendNote: "Physical chores take pacing; admin chores take focus rules.",
};

export const GOALS: readonly Goal[] = [focus, pump_up, dance, calm, sleep, catharsis, nostalgia, drive, chores];
export const GOAL_BY_ID: ReadonlyMap<GoalId, Goal> = new Map(GOALS.map((goal) => [goal.id, goal]));

/* --------------------------------------------------------------------------
 * Modifiers — single-feature leanings, not goals (documented in A1 §2 and
 * kept separate so "fast + calm" can be handled as its documented pair).
 * ------------------------------------------------------------------------ */

const fast: Modifier = {
  id: "fast",
  label: "fast-leaning",
  triggers: ["fast", "faster", "fast-paced", "uptempo", "up-tempo", "speedy", "high tempo", "quick"],
  constraint: { n: 1, field: "bpm", op: "gte", band: { kind: "abs", value: 120 }, researchWeight: 0.2,
    proxy: "fast → tempo high side",
    mechanism: "Stimulative tempo threshold from the exercise literature. Design assumption.", refs: ["MP-1", "MP-2"] },
  note: "“fast” was read as a tempo preference (bpm ≥ 120), not a goal.",
};

const slow: Modifier = {
  id: "slow",
  label: "slow-leaning",
  triggers: ["slow", "slower", "slow-paced", "downtempo", "down-tempo"],
  constraint: { n: 1, field: "bpm", op: "lte", band: { kind: "abs", value: 90 }, researchWeight: 0.2,
    proxy: "slow → tempo low side",
    mechanism: "Slow tempo is the failure mode on long drives and the sedative side; a light lean only.", refs: ["MP-31", "MP-1"] },
  note: "“slow” was read as a tempo preference (bpm ≤ 90) — unless you excluded slow music, in which case the exclusion stands alone.",
};

export const MODIFIERS: readonly Modifier[] = [fast, slow];
export const MODIFIER_BY_ID: ReadonlyMap<string, Modifier> = new Map(MODIFIERS.map((m) => [m.id, m]));

/* --------------------------------------------------------------------------
 * The documented "fast + calm/relaxing" contradiction pair.
 *
 * Two readings by design (plan §B1; family: "fast" + calm/sleep wording):
 *   A "energetic but soft": keep the fast side, add low loudness/percussion
 *     (S3/S5 logic applied as a reconciliation), drop the calm bundle.
 *   B "literally calm": drop the fast side, apply the calm/sleep bundle.
 * Neither side is silently chosen.
 * ------------------------------------------------------------------------ */

export const FAST_CALM_PAIR = {
  id: "fast_calm",
  note:
    "Documented pair: “fast” and calm-family wording pull in opposite directions. Reading A keeps the fast tempo and softens texture; reading B drops the fast side and keeps the calm bundle.",
  sideA: {
    label: "energetic but soft",
    dropsGoals: ["calm", "sleep"] as GoalId[],
    dropsDraftConstraints: ["calm"],
    extra: [
      { n: 1, field: "percussiveness", op: "lte", band: { kind: "abs", value: 0.35 }, researchWeight: 0.3,
        mechanism: "Soft texture reconciling with a fast tempo (S3 logic).", refs: ["MP-1"] },
      { n: 2, field: "lufs_integrated", op: "lte", band: { kind: "quantile", q: 0.5 }, researchWeight: 0.25,
        mechanism: "Keep loudness low: the soft half of the pair (S5 logic).", refs: ["MP-1"] },
    ] as LexConstraint[],
  },
  sideB: {
    label: "literally calm",
    dropsModifiers: ["fast"] as Array<Modifier["id"]>,
  },
};

/* --------------------------------------------------------------------------
 * Shared assumption lines (plain language; shown with readings).
 *
 * The per-goal `culture` arrays and SHARED_CULTURE_NOTES below are metadata
 * comments only — nothing renders them yet (open review item, C2 F7/F8).
 * Keep them honest for a future surface; do not present them as shipped copy.
 * ------------------------------------------------------------------------ */

export const SHARED_ASSUMPTIONS = {
  calibration:
    "Tempo/energy bands are research starting points, not universal — they stay soft and learn from your session feedback and spot-check corrections.",
  declared:
    "Some preferences use fields with no producer yet (e.g. vocal_fraction, arousal, danceability): no producer yet — inert on real data until those analyzer stages land. Recorded, not faked.",
};

export const SHARED_CULTURE_NOTES: readonly string[] = [
  "Never hard-enforce Western metre/tempo conventions: tempo octave errors (60/120/240) are a known failure class and listener enculturation shapes what “works” (CC-29/30/36/37).",
  "Every band here is a labelled starting point to be calibrated from this listener's feedback — never presented as universal.",
];

/* --------------------------------------------------------------------------
 * Resolution helpers (pure; take the library explicitly).
 * ------------------------------------------------------------------------ */

/** Nearest-rank quantile over finite values (copies, sorts ascending). q ∈ (0, 1]. */
export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[rank]!;
}

/** Finite, non-null values of one field across the library (produced fields only). */
export function measuredValues(library: Library | undefined, field: string): number[] {
  const out: number[] = [];
  for (const track of library?.tracks ?? []) {
    const value = track.signals?.[field];
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

export type ResolvedLexConstraint =
  | { ok: true; field: string; op: LexOp; value: number | [number, number] | string[] }
  | { ok: false; note: string };

/** Turn a lexicon proposal into concrete plan values (library-relative or skipped). */
export function resolveLexConstraint(c: LexConstraint, library: Library | undefined): ResolvedLexConstraint {
  if (c.band.kind === "values") {
    if (c.op !== "in") return { ok: false, note: `lexicon bug: values band needs op "in" (${c.field})` };
    return { ok: true, field: c.field, op: c.op, value: [...c.band.values] };
  }
  if (c.band.kind === "cohort") {
    return { ok: false, note: "release-year window skipped — year windows aren't supported yet (no cohort known)" };
  }
  if (c.band.kind === "abs") return { ok: true, field: c.field, op: c.op, value: c.band.value };
  const values = measuredValues(library, c.field);
  if (values.length < MIN_QUANTILE_SAMPLES) {
    return { ok: false, note: `library-relative band for ${c.field} skipped — only ${values.length} measured track(s), need ≥ ${MIN_QUANTILE_SAMPLES}` };
  }
  const q = c.band.q;
  const value = Array.isArray(q)
    ? ([quantile(values, q[0]), quantile(values, q[1])] as [number, number])
    : quantile(values, q);
  return { ok: true, field: c.field, op: c.op, value };
}

/** Scale that keeps an emitted bundle's total ≤ 1.0 (A1 convention); 1 when already ≤ 1. */
export function bundleScale(goal: Goal): number {
  const total = goal.constraints.reduce((sum, c) => sum + c.researchWeight, 0);
  return total > 1 ? 1 / total : 1;
}

/** Emitted weight: research weight, floor-normalised so the bundle total ≤ 1.0. */
export function emittedWeight(c: LexConstraint, scale: number): number {
  return Math.floor(c.researchWeight * scale * 1000) / 1000;
}

/** All emitted weights of a bundle (for tests/doc). */
export function emittedBundleWeights(goal: Goal): number[] {
  const scale = bundleScale(goal);
  return goal.constraints.map((c) => emittedWeight(c, scale));
}

/**
 * Goal interpreter — rule-based stand-in for the LLM "understand the ask" step.
 *
 * Composes the existing draft parser (draft.ts) with the goal lexicon
 * (lexicon.ts). Everything stays deterministic, honest, and soft: the draft
 * plan is produced exactly as before, then goal bundles are merged in with
 * namespaced constraint ids (`goal_<goal>_<n>`), draft proxies for the same
 * reading are superseded (never kept twice), and every reading's plan is run
 * through validatePlan() — invalid readings are dropped with a note, never
 * shipped.
 *
 * Accuracy ladder (all rules documented here, in order):
 *   contradictory — a provable conflict exists: an opposing goal pair
 *     (pump_up↔calm, dance↔sleep), the documented "fast + calm/relaxing" pair
 *     (two readings: energetic-but-soft vs literally-calm), or two hard
 *     numeric bounds on one field with an empty intersection
 *     (closed-interval approximation). The first conflict in that order is
 *     resolved into two readings; neither side is silently chosen.
 *   specific — at least one valid reading and no leftover, unmapped content.
 *   partial — at least one valid reading, but some content stayed unmapped.
 *   impossible — nothing enforceable, and the text either produced structured
 *     "unsupported asks" or names something specific we cannot measure.
 *   vague — nothing enforceable and nothing specific to act on: readings may
 *     be [] and the asks must carry the next step. We do not fabricate a plan
 *     just to have one.
 *
 * Two-phase requests: a “then/after” cue between two distinct goal matches
 * (“workout then sleep”) builds ONE reading for the first goal and returns the
 * second as an ask — two cancelling bundles are never merged into one wash
 * (C3 F-A1-3).
 *
 * Invariants:
 *   - Soft only, from the lexicon; hard rules come from the user's own words
 *     (draft) and are never loosened here. Explicit user exclusions can never
 *     be dropped by `supersedes`.
 *   - Declared fields with no producer are emitted with unknown_policy
 *     "neutral" and the inert note; nothing is inferred silently.
 *   - Deterministic: pure function of (text, library). `now` is accepted for
 *     interface stability and is deliberately unused (no time-dependent
 *     content exists yet).
 *   - The 500-char prompt cap mirrors draft.ts / the plan route.
 */

import { draftPlan } from "../query/draft.ts";
import type { Draft } from "../query/draft.ts";
import { validatePlan } from "../query/plan.ts";
import { GOALS, MODIFIERS, FAST_CALM_PAIR, SHARED_ASSUMPTIONS, SHARED_CULTURE_NOTES, bundleScale, emittedWeight, resolveLexConstraint } from "./lexicon.ts";
import type { Arc, Goal, LexConstraint, Modifier } from "./lexicon.ts";
import type { Library } from "../query/evaluate.ts";

export const INTERPRET_VERSION = "intent-v2";
const PARSER = "intent-v2 (rule-based: draftPlan + goal lexicon; no LLM)";
const PROMPT_CAP = 500;
const MAX_GOALS_MERGED = 2;
const MAX_ASKS = 3;

export type Accuracy = "specific" | "partial" | "vague" | "contradictory" | "impossible";
export type Reading = { label: string; confidence: number; plan: unknown; assumptions: string[]; caveats: string[]; culture_notes: string[] };
export type Ask = { ask: string; reason: string; nearest_supported?: string };
export type AuditEntry = { phrase: string; becomes: string; kind: "hard" | "soft" | "goal" | "exclusion" | "unparsed" | "note" };
export type GoalInterpretation = {
  accuracy: Accuracy;
  readings: Reading[];
  chosen_index: number;
  asks: Ask[];
  audit: AuditEntry[];
  parser: string;
};

type RawPlan = Record<string, unknown>;
type RawConstraint = Record<string, unknown>;

type AcceptedMatch =
  | { kind: "goal"; goal: Goal; start: number; end: number; phrase: string }
  | { kind: "modifier"; modifier: Modifier; start: number; end: number; phrase: string };
type RejectedMatch = { phrase: string; start: number; reason: "negated" };

const NEXT_STEP_HINT =
  "activities (focus, workout, wind down), a tempo range like “90–120 bpm”, or a genre your files are tagged with";

/* ------------------------------------------------------------------ */
/* Lexicon matching                                                    */
/* ------------------------------------------------------------------ */

function escapeToken(token: string): string {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary, whitespace-or-hyphen tolerant matcher for one trigger phrase. */
function triggerRegex(trigger: string): RegExp {
  const body = trigger.split(" ").map(escapeToken).join("[\\s\\-]+");
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "g");
}

/**
 * Negation spans. Mirrors draft.ts's negHead (keep in sync) and additionally
 * covers n't forms; anything a lexicon match intersects here is treated as an
 * exclusion the user stated, never as a goal.
 */
const NEG_SCAN = /\b(?:(?:no|not|never|nothing|without|minus|exclude|excluding|avoid|skip)|(?:do|does|did|is|are|was|were|wo|won|would|can|ca|should|could|must|ai)n'?t)\b(?:\s+(?:any|too|more|of|the|a|an|real|really|very|so|just))*\s+([a-z&'\- ]+?(?:\s*(?:\/|,|\bor\b|\band\b|\bnor\b)\s*[a-z&'\-]+)*)(?=[.,;!?]|\s+(?:but|please|though|for|while|thanks)\b|$)/gi;

function negatedSpans(lower: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  for (const match of lower.matchAll(NEG_SCAN)) {
    if (match.index !== undefined) spans.push([match.index, match.index + match[0].length]);
  }
  return spans;
}

type LexScan = { accepted: AcceptedMatch[]; rejected: RejectedMatch[] };

/** Longest match first; consumed spans are not re-matched; negation wins over everything. */
function scanLexicon(lower: string): LexScan {
  const negated = negatedSpans(lower);
  const overlaps = (spans: Array<[number, number]>, start: number, end: number) =>
    spans.some(([s, e]) => start < e && s < end);

  type Candidate = { isGoal: boolean; goal?: Goal; modifier?: Modifier; start: number; end: number; order: number };
  const candidates: Candidate[] = [];
  let order = 0;
  for (const goal of GOALS) {
    for (const trigger of goal.triggers) {
      for (const match of lower.matchAll(triggerRegex(trigger))) {
        if (match.index === undefined) continue;
        candidates.push({ isGoal: true, goal, start: match.index, end: match.index + match[0].length, order: order++ });
      }
    }
  }
  for (const modifier of MODIFIERS) {
    for (const trigger of modifier.triggers) {
      for (const match of lower.matchAll(triggerRegex(trigger))) {
        if (match.index === undefined) continue;
        const after = lower.slice(match.index + match[0].length);
        // "faster than 120 bpm" / "slow 100" belong to the bpm comparators, not the modifier.
        if (/^\s*(?:than\b|\d)/.test(after)) continue;
        candidates.push({ isGoal: false, modifier, start: match.index, end: match.index + match[0].length, order: order++ });
      }
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start || a.order - b.order);

  const accepted: AcceptedMatch[] = [];
  const rejected: RejectedMatch[] = [];
  const taken: Array<[number, number]> = [];
  for (const candidate of candidates) {
    if (overlaps(taken, candidate.start, candidate.end)) continue;
    const phrase = lower.slice(candidate.start, candidate.end);
    if (overlaps(negated, candidate.start, candidate.end)) {
      if (!rejected.some((item) => item.start === candidate.start && item.phrase === phrase)) {
        rejected.push({ phrase, start: candidate.start, reason: "negated" });
      }
      continue;
    }
    taken.push([candidate.start, candidate.end]);
    accepted.push(candidate.isGoal
      ? { kind: "goal", goal: candidate.goal!, start: candidate.start, end: candidate.end, phrase }
      : { kind: "modifier", modifier: candidate.modifier!, start: candidate.start, end: candidate.end, phrase });
  }
  accepted.sort((a, b) => a.start - b.start);
  return { accepted, rejected };
}

/** First (longest) match per goal, in text order. */
function orderedGoals(accepted: AcceptedMatch[]): Array<{ goal: Goal; phrase: string }> {
  const seen = new Set<string>();
  const out: Array<{ goal: Goal; phrase: string }> = [];
  for (const match of accepted) {
    if (match.kind !== "goal" || seen.has(match.goal.id)) continue;
    seen.add(match.goal.id);
    out.push({ goal: match.goal, phrase: match.phrase });
  }
  return out;
}

function orderedModifiers(accepted: AcceptedMatch[]): Array<{ modifier: Modifier; phrase: string }> {
  const seen = new Set<string>();
  const out: Array<{ modifier: Modifier; phrase: string }> = [];
  for (const match of accepted) {
    if (match.kind !== "modifier" || seen.has(match.modifier.id)) continue;
    seen.add(match.modifier.id);
    out.push({ modifier: match.modifier, phrase: match.phrase });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Sequence cues (“workout then sleep” — two phases, one reading now)  */
/* ------------------------------------------------------------------ */

type SequenceCue = {
  first: { goal: Goal; phrase: string };
  second: { goal: Goal; phrase: string };
  cue: string;
  cueStart: number;
  cueEnd: number;
};

/**
 * “then/after” between two distinct goal matches (text order) asks for two
 * phases. Returns the first qualifying pair; null when no such cue exists.
 */
function detectSequenceCue(lower: string, accepted: AcceptedMatch[]): SequenceCue | null {
  const seen = new Set<string>();
  const goals: Array<{ goal: Goal; phrase: string; start: number; end: number }> = [];
  for (const match of accepted) {
    if (match.kind !== "goal" || seen.has(match.goal.id)) continue;
    seen.add(match.goal.id);
    goals.push({ goal: match.goal, phrase: match.phrase, start: match.start, end: match.end });
  }
  goals.sort((a, b) => a.start - b.start);
  for (let index = 0; index + 1 < goals.length; index++) {
    const first = goals[index]!;
    const second = goals[index + 1]!;
    const between = lower.slice(first.end, second.start);
    const cue = /\b(?:then|afterwards|afterward|after|followed by)\b/.exec(between);
    if (cue && cue.index !== undefined) {
      return {
        first: { goal: first.goal, phrase: first.phrase },
        second: { goal: second.goal, phrase: second.phrase },
        cue: cue[0],
        cueStart: first.end + cue.index,
        cueEnd: first.end + cue.index + cue[0].length,
      };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Draft context guard — genre words used as ordinary nouns            */
/* ------------------------------------------------------------------ */

/** “the house”, “my house”: a determiner in front reads the word as a noun, not a genre. */
const GENRE_BEFORE_DETERMINER = /(?:^|[^a-z0-9])(?:the|a|an|this|that|these|those|my|your|his|her|our|their)\s+$/;
/** “cleaning house”: the household-task verbs that precede the noun use. */
const GENRE_BEFORE_TASK = /(?:^|[^a-z0-9])(?:clean|cleaning|cleaned|tidy|tidying|scrub|scrubbing|vacuum|vacuuming)\s+$/;
/** “house music / house track”: an explicit music noun rescues a genre reading. */
const GENRE_AFTER_MUSIC = /^\s*(?:music|track|tracks|song|songs|mix|sets?|beats?|tunes?|remix|anthem|club)\b/;
/** “house work / house plants”: household compounds are never the genre. */
const GENRE_AFTER_HOUSEHOLD = /^\s*(?:work|hold|keeping|plants|warming|hunting)\b/;
/** Genres that legitimately take “the” as musical phrases (“the blues”, “the funk”). */
const GENRE_DETERMINER_EXCEPTIONS = new Set(["blues", "funk"]);

/** Does this occurrence of a genre word read as a music preference rather than an ordinary noun? */
function genreOccurrenceCounts(lower: string, start: number, end: number): boolean {
  const before = lower.slice(Math.max(0, start - 24), start);
  const after = lower.slice(end, end + 24);
  if (GENRE_AFTER_HOUSEHOLD.test(after)) return false; // “house work”
  if (GENRE_AFTER_MUSIC.test(after)) return true; // “house music”
  if (GENRE_BEFORE_DETERMINER.test(before) || GENRE_BEFORE_TASK.test(before)) return false; // “the house”, “cleaning house”
  return true; // bare genre use (“play me some house”)
}

/**
 * Context guard for the draft's genre scan (C3 F-A1-2): a genre value stays in
 * `genre_hint` only when at least one of its occurrences reads as music
 * (“house music”, “some house”), never when it is the ordinary noun (“cleaning
 * the house”). Mutates the draft in place; returns the recognized phrases whose
 * meaning changed (so the audit can mark them as notes, not preferences).
 */
function guardGenreContext(draft: Draft, lower: string): Set<string> {
  const corrected = new Set<string>();
  const constraints = (draft.plan.constraints ?? []) as RawConstraint[];
  const hint = constraints.find((item) => item.id === "genre_hint");
  if (!hint) return corrected;
  const where = hint.where as RawConstraint | undefined;
  const values = Array.isArray(where?.value) ? (where.value as string[]) : [];
  if (!where || !values.length) return corrected;

  const kept: string[] = [];
  const dropped: string[] = [];
  for (const value of values) {
    if (GENRE_DETERMINER_EXCEPTIONS.has(value.toLowerCase())) {
      kept.push(value);
      continue;
    }
    let found = false;
    let music = false;
    for (const match of lower.matchAll(triggerRegex(value))) {
      if (match.index === undefined) continue;
      found = true;
      if (genreOccurrenceCounts(lower, match.index, match.index + match[0].length)) {
        music = true;
        break;
      }
    }
    // No occurrence at all: don't guess against the hint the draft matched.
    (music || !found ? kept : dropped).push(value);
  }
  if (!dropped.length) return corrected;

  const oldPhrase = String(hint.source_phrase ?? "");
  if (kept.length === 0) {
    const index = constraints.indexOf(hint);
    if (index >= 0) constraints.splice(index, 1);
    for (const entry of draft.recognized) {
      if (entry.phrase === oldPhrase) {
        entry.becomes = "read as the ordinary word here (not a genre) — no genre preference added";
        corrected.add(entry.phrase);
      }
    }
  } else {
    where.value = kept;
    hint.source_phrase = kept.join(", ");
    for (const entry of draft.recognized) {
      if (entry.phrase === oldPhrase) {
        entry.becomes = `prefer genre tag ${kept.join(" / ")} (soft — tags are weak evidence; “${dropped.join("”, “")}” read as an ordinary word here)`;
        corrected.add(entry.phrase);
      }
    }
  }
  return corrected;
}

/* ------------------------------------------------------------------ */
/* Conflicts                                                           */
/* ------------------------------------------------------------------ */

type Conflict =
  | { kind: "goals"; a: Goal; b: Goal }
  | { kind: "fast_calm"; fastPhrase: string; calmPhrase: string }
  | { kind: "numeric"; field: string; a: { id: string; phrase: string; bound: string }; b: { id: string; phrase: string; bound: string } };

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Closed-interval approximation of a single numeric predicate (strict bounds treated as closed). */
function numericInterval(predicate: RawConstraint): { field: string; lo: number; hi: number } | null {
  const field = predicate.field;
  const op = predicate.op;
  const value = predicate.value;
  if (typeof field !== "string") return null;
  if (op === "gte" || op === "gt") return isNum(value) ? { field, lo: value, hi: Infinity } : null;
  if (op === "lte" || op === "lt") return isNum(value) ? { field, lo: -Infinity, hi: value } : null;
  if (op === "between" && Array.isArray(value) && value.length === 2) {
    const [lo, hi] = value;
    if (isNum(lo) && isNum(hi)) return { field, lo, hi };
  }
  return null;
}

function boundText(predicate: RawConstraint): string {
  const value = predicate.value;
  const op = predicate.op;
  const unit = predicate.field === "bpm" ? " bpm" : "";
  const shown = Array.isArray(value) ? `${value[0]}–${value[1]}` : String(value);
  const word = op === "gte" || op === "gt" ? "≥" : op === "lte" || op === "lt" ? "≤" : "within";
  return `${word} ${shown}${unit}`;
}

function detectConflicts(draft: Draft, accepted: AcceptedMatch[]): Conflict | null {
  const goals = orderedGoals(accepted);
  // (1) opposing goal pairs.
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const a = goals[i]!.goal;
      const b = goals[j]!.goal;
      if (a.opposes?.includes(b.id) || b.opposes?.includes(a.id)) return { kind: "goals", a, b };
    }
  }
  // (2) documented "fast + calm/relaxing" pair (calm family: calm, sleep).
  const fastMatch = accepted.find((match) => match.kind === "modifier" && match.modifier.id === "fast") as
    | (AcceptedMatch & { kind: "modifier" }) | undefined;
  const calmGoal = goals.find((entry) => entry.goal.id === "calm" || entry.goal.id === "sleep");
  if (fastMatch && calmGoal) {
    return { kind: "fast_calm", fastPhrase: fastMatch.phrase, calmPhrase: calmGoal.phrase };
  }
  // (3) hard numeric bounds on one field with an empty intersection.
  const constraints = (draft.plan.constraints ?? []) as RawConstraint[];
  const hards: Array<{ id: string; phrase: string; predicate: RawConstraint; interval: { field: string; lo: number; hi: number } }> = [];
  for (const constraint of constraints) {
    if (constraint.hard !== true) continue;
    const where = constraint.where;
    if (!where || typeof where !== "object" || Array.isArray(where)) continue;
    const predicate = where as RawConstraint;
    const interval = numericInterval(predicate);
    if (!interval) continue;
    hards.push({
      id: String(constraint.id), phrase: String(constraint.source_phrase ?? constraint.id),
      predicate, interval,
    });
  }
  for (let i = 0; i < hards.length; i++) {
    for (let j = i + 1; j < hards.length; j++) {
      const a = hards[i]!;
      const b = hards[j]!;
      if (a.interval.field !== b.interval.field) continue;
      const lo = Math.max(a.interval.lo, b.interval.lo);
      const hi = Math.min(a.interval.hi, b.interval.hi);
      if (lo > hi) {
        return {
          kind: "numeric", field: a.interval.field,
          a: { id: a.id, phrase: a.phrase, bound: boundText(a.predicate) },
          b: { id: b.id, phrase: b.phrase, bound: boundText(b.predicate) },
        };
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Merging                                                             */
/* ------------------------------------------------------------------ */

function clamp(text: string, max = 299): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function removeConstraint(plan: RawPlan, id: string, force: boolean, notes: AuditEntry[]): boolean {
  const list = (plan.constraints ?? []) as RawConstraint[];
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const constraint = list[index]!;
  if (!force && (constraint.hard === true || constraint.explicit_exclusion === true)) {
    notes.push({ phrase: String(constraint.source_phrase ?? id), becomes: "kept — it is the user's own rule and is never auto-removed", kind: "note" });
    return false;
  }
  list.splice(index, 1);
  const relaxation = plan.relaxation as RawPlan | undefined;
  if (relaxation) {
    if (Array.isArray(relaxation.require_confirmation_for)) {
      relaxation.require_confirmation_for = (relaxation.require_confirmation_for as string[]).filter((item) => item !== id);
    }
    if (Array.isArray(relaxation.ladder)) {
      relaxation.ladder = (relaxation.ladder as RawConstraint[]).filter((step) => step.target !== id);
    }
  }
  return true;
}

type MergeSpec = {
  goals: Array<{ goal: Goal; phrase: string }>;
  modifiers: Array<{ modifier: Modifier; phrase: string }>;
  extra: Array<{ id: string; source_phrase: string; constraint: LexConstraint }>;
  forceDropIds: string[];
  skipArc: boolean;
  /** Interpreter residue (lexicon-aware) — replaces the draft's own unparsed note. */
  residue: string[];
};

type ReadingNotes = { caveats: string[]; culture_notes: string[] };
type MergeResult = { plan: RawPlan; skipped: string[]; notes: AuditEntry[]; readingNotes: ReadingNotes };

function mergePlan(draft: Draft, spec: MergeSpec, library: Library | undefined): MergeResult {
  const plan = structuredClone(draft.plan) as RawPlan;
  const notes: AuditEntry[] = [];
  const skipped: string[] = [];
  const constraints = (plan.constraints ?? []) as RawConstraint[];

  // Supersede draft proxies (soft only) and any forced drops (deliberate, logged).
  for (const entry of spec.goals) {
    for (const id of entry.goal.supersedes) {
      if (removeConstraint(plan, id, false, notes)) {
        notes.push({ phrase: entry.goal.label, becomes: `dropped draft rule “${id}” — replaced by the goal bundle`, kind: "note" });
      }
    }
  }
  for (const id of spec.forceDropIds) {
    if (removeConstraint(plan, id, true, notes)) {
      notes.push({ phrase: id, becomes: "dropped for this reading (provable conflict)", kind: "note" });
    }
  }

  // Emit goal bundles.
  for (const entry of spec.goals) {
    const scale = bundleScale(entry.goal);
    for (const c of entry.goal.constraints) {
      const resolved = resolveLexConstraint(c, library);
      if (!resolved.ok) {
        skipped.push(`“${entry.goal.label}”: ${resolved.note}`);
        continue;
      }
      constraints.push({
        id: `goal_${entry.goal.id}_${c.n}`,
        source_phrase: clamp(entry.phrase, 200),
        hard: false,
        unknown_policy: "neutral",
        weight: emittedWeight(c, scale),
        confidence: c.declared ? 0.3 : 0.5,
        ...(c.proxy ? { proxy: c.proxy } : {}),
        where: { field: resolved.field, op: resolved.op, value: resolved.value },
      });
    }
  }

  // Emit pair reconciliation terms (fast-but-soft) and modifiers.
  for (const item of spec.extra) {
    const resolved = resolveLexConstraint(item.constraint, library);
    if (!resolved.ok) {
      skipped.push(`“${item.source_phrase}”: ${resolved.note}`);
      continue;
    }
    constraints.push({
      id: item.id,
      source_phrase: clamp(item.source_phrase, 200),
      hard: false,
      unknown_policy: "neutral",
      weight: item.constraint.researchWeight,
      confidence: item.constraint.declared ? 0.3 : 0.5,
      ...(item.constraint.proxy ? { proxy: item.constraint.proxy } : {}),
      where: { field: resolved.field, op: resolved.op, value: resolved.value },
    });
  }
  for (const entry of spec.modifiers) {
    const c = entry.modifier.constraint;
    const resolved = resolveLexConstraint(c, library);
    if (!resolved.ok) {
      skipped.push(`“${entry.modifier.label}”: ${resolved.note}`);
      continue;
    }
    constraints.push({
      id: `mod_${entry.modifier.id}`,
      source_phrase: clamp(entry.phrase, 200),
      hard: false,
      unknown_policy: "neutral",
      weight: emittedWeight(c, 1),
      confidence: 0.4,
      ...(c.proxy ? { proxy: c.proxy } : {}),
      where: { field: resolved.field, op: resolved.op, value: resolved.value },
    });
  }

  // The plan schema accepts at most 32 constraints; drop trailing extras if a pathological blend exceeds it.
  while (constraints.length > 32) {
    const dropped = constraints.pop()!;
    notes.push({ phrase: String(dropped.id), becomes: "dropped — the 32-constraint schema cap was reached", kind: "note" });
  }
  plan.constraints = constraints;

  // Arc: goal arcs override the draft's flat; merged by the documented priority.
  if (!spec.skipArc && spec.goals.length) {
    const ARC_PRIORITY: Arc[] = ["peak", "build", "wave", "cooldown", "flat"];
    const arc = ARC_PRIORITY.find((candidate) => spec.goals.some((entry) => entry.goal.arc === candidate));
    if (arc) plan.sequencing = { arc };
  }

  // Assumptions: drop superseded draft lines and the draft's own unparsed note
  // (the interpreter recomputes what stayed unmapped, lexicon-aware), then add
  // goal lines, the recomputed residue line, shared lines, and skip notes.
  const supersededPrefixes = spec.goals.flatMap((entry) => entry.goal.supersedeAssumptions);
  const draftAssumptions = ((plan.assumptions ?? []) as string[]).filter(
    (line) => !line.startsWith("Not understood yet, kept only as text for a future encoder:")
      && !supersededPrefixes.some((prefix) => line.startsWith(prefix)),
  );
  const assembled: string[] = [
    ...spec.goals.flatMap((entry) => entry.goal.assumptions),
    ...draftAssumptions,
    ...(spec.residue.length
      ? [`Not understood yet, kept only as text for a future encoder: “${spec.residue.join("”, “")}”.`]
      : []),
    ...spec.modifiers.map((entry) => entry.modifier.note),
    ...(spec.goals.length || spec.extra.length ? [SHARED_ASSUMPTIONS.calibration] : []),
    ...(hasDeclared(spec) ? [SHARED_ASSUMPTIONS.declared] : []),
  ];
  if (skipped.length) {
    assembled.push(clamp(`Some library-relative bands were skipped for lack of measured data: ${skipped.join("; ")}.`));
  }
  if (assembled.length) plan.assumptions = assembled.slice(0, 20).map((line) => clamp(line));

  return { plan, skipped, notes, readingNotes: {
    caveats: [...new Set(spec.goals.flatMap((entry) => entry.goal.caveats))],
    culture_notes: spec.goals.length ? [...new Set([
      ...spec.goals.flatMap((entry) => entry.goal.culture), ...SHARED_CULTURE_NOTES,
    ])] : [],
  } };
}

function hasDeclared(spec: MergeSpec): boolean {
  return spec.goals.some((entry) => entry.goal.constraints.some((c) => c.declared))
    || spec.extra.some((item) => item.constraint.declared);
}

/* ------------------------------------------------------------------ */
/* Residue (what stayed unmapped, lexicon-aware)                       */
/* ------------------------------------------------------------------ */

const DRAFT_FILLER = /\b(?:and|or|but|please|i|me|a|an|the|some|with|need|want|give|make|playlist|music|songs|tracks)\b/gi;
/** Extra glue stripped when judging whether leftover text is meaningful (playlist-speak, surface verbs, hedges, comparators). */
const EXTRA_FILLER = /\b(?:mix|mixes|list|lists|play|plays|playing|played|put|puts|queue|queues|queued|start|starts|started|starting|sets?|tune|tunes|jam|jams|stuff|things?|vibes?|moods?|please|thanks|now|later|tonight|today|idk|idc|something|anything|everything|good|nice|great|best|cool|awesome|to|do|does|did|doing|this|that|these|those|task|tasks|it|its|is|are|was|were|be|been|being|my|your|our|their|for|of|in|on|at|by|only|just|up|high|low|mid|medium|very|really|too|over|under|above|below|than|faster|slower|tempo|bpm)\b/gi;

function mergeIntervals(spans: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([span[0], span[1]]);
  }
  return out;
}

function markAll(text: string, needle: string, spans: Array<[number, number]>): void {
  if (!needle) return;
  const lower = text.toLowerCase();
  const wanted = needle.toLowerCase();
  let from = 0;
  while (from <= lower.length - wanted.length) {
    const index = lower.indexOf(wanted, from);
    if (index < 0) break;
    spans.push([index, index + wanted.length]);
    from = index + 1;
  }
}

function computeResidue(text: string, draft: Draft, accepted: AcceptedMatch[], extraSpans: Array<[number, number]> = []): string[] {
  const spans: Array<[number, number]> = [];
  for (const entry of draft.recognized) markAll(text, entry.phrase, spans);
  for (const match of accepted) spans.push([match.start, match.end]);
  for (const span of extraSpans) spans.push(span);
  for (const match of text.toLowerCase().matchAll(NEG_SCAN)) {
    if (match.index !== undefined) spans.push([match.index, match.index + match[0].length]);
  }
  for (const item of (draft.plan.unsupported ?? []) as Array<{ ask?: unknown }>) {
    if (typeof item.ask === "string") markAll(text, item.ask, spans);
  }
  const merged = mergeIntervals(spans);
  let rest = "";
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) rest += `${text.slice(cursor, start)} `;
    cursor = Math.max(cursor, end);
  }
  rest += text.slice(cursor);
  const out: string[] = [];
  for (const part of rest.split(/[,;!?/]+|(?<!\d)\.|\.(?!\d)/)) {
    const cleaned = part
      .replace(DRAFT_FILLER, " ")
      .replace(EXTRA_FILLER, " ")
      .replace(/[^a-z0-9'’.–—\-\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if ((/[a-z0-9]{3,}/i.test(cleaned) && /[a-z]/i.test(cleaned) || /\d/.test(cleaned)) && !/^'\w+$/.test(cleaned)) out.push(cleaned);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Readings assembly                                                   */
/* ------------------------------------------------------------------ */

type Candidate = { label: string; confidence: number; plan: RawPlan; extraAssumptions: string[]; readingNotes: ReadingNotes };

function confidenceFor(base: number, residueLength: number, skippedCount: number): number {
  let value = base;
  if (residueLength > 0) value -= 0.1;
  if (skippedCount >= 2) value -= 0.1;
  return Math.max(0.3, Math.round(value * 100) / 100);
}

function finalizeReadings(candidates: Candidate[], audit: AuditEntry[]): { readings: Reading[]; chosen: number } {
  const readings: Reading[] = [];
  const confidences: number[] = [];
  for (const candidate of candidates) {
    const result = validatePlan(candidate.plan);
    if (!result.ok) {
      const first = result.errors[0];
      audit.push({
        phrase: `reading: ${candidate.label}`,
        becomes: `dropped — plan validation failed: ${first ? `${first.path} ${first.message}` : "unknown error"}`,
        kind: "note",
      });
      continue;
    }
    const planAssumptions = ((candidate.plan.assumptions ?? []) as string[]).map((line) => clamp(line));
    readings.push({
      label: candidate.label,
      confidence: candidate.confidence,
      plan: candidate.plan,
      ...candidate.readingNotes,
      assumptions: [...new Set([...planAssumptions, ...candidate.extraAssumptions.map((line) => clamp(line))])].slice(0, 20),
    });
    confidences.push(candidate.confidence);
  }
  let chosen = -1;
  for (let i = 0; i < readings.length; i++) {
    if (chosen < 0 || confidences[i]! > confidences[chosen]!) chosen = i;
  }
  return { readings, chosen };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function interpretGoal(text: string, opts: { library?: Library; now?: number } = {}): GoalInterpretation {
  void opts.now; // interface stability only — no time-dependent content exists yet
  const library = opts.library;
  const normalized = text.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, PROMPT_CAP);
  const lower = normalized.toLowerCase();
  const draft = draftPlan(normalized, library);
  const genreCorrected = guardGenreContext(draft, lower);
  const scan = scanLexicon(lower);
  const goals = orderedGoals(scan.accepted);
  const modifiers = orderedModifiers(scan.accepted);
  const sequence = detectSequenceCue(lower, scan.accepted);
  const residue = computeResidue(normalized, draft, scan.accepted, sequence ? [[sequence.cueStart, sequence.cueEnd]] : []);

  // --- audit: positioned entries (draft recognized + lexicon matches) ---
  const positioned: Array<AuditEntry & { position: number }> = [];
  const constraintById = new Map<string, RawConstraint>();
  for (const item of (draft.plan.constraints ?? []) as RawConstraint[]) constraintById.set(String(item.id), item);
  for (const entry of draft.recognized) {
    const constraint = [...constraintById.values()].find((item) => item.source_phrase === entry.phrase);
    const kind: AuditEntry["kind"] =
      genreCorrected.has(entry.phrase) ? "note"
      : constraint && constraint.hard === true && constraint.explicit_exclusion === true ? "exclusion"
      : constraint && constraint.hard === true ? "hard"
      : "soft";
    const index = lower.indexOf(entry.phrase.toLowerCase());
    positioned.push({ phrase: entry.phrase, becomes: entry.becomes, kind, position: index });
  }
  for (const match of scan.accepted) {
    if (match.kind === "goal") {
      positioned.push({
        phrase: match.phrase,
        becomes: `goal “${match.goal.label}” — ${match.goal.constraints.length} soft preferences, arc ${match.goal.arc}`,
        kind: "goal",
        position: match.start,
      });
    } else {
      positioned.push({
        phrase: match.phrase,
        becomes: `soft preference: ${match.modifier.constraint.field} ${match.modifier.constraint.op === "gte" ? "≥" : "≤"} ${String((match.modifier.constraint.band as { value: unknown }).value)}`,
        kind: "soft",
        position: match.start,
      });
    }
  }
  for (const rejected of scan.rejected) {
    positioned.push({
      phrase: rejected.phrase,
      becomes: "negated by the request — used only as an exclusion, no goal applied",
      kind: "exclusion",
      position: rejected.start,
    });
  }
  positioned.sort((a, b) => (a.position < 0 ? Infinity : a.position) - (b.position < 0 ? Infinity : b.position));
  const audit: AuditEntry[] = positioned.map(({ phrase, becomes, kind }) => ({ phrase, becomes, kind }));
  for (const entry of residue) {
    audit.push({ phrase: entry, becomes: "not understood — kept as text only (not enforced)", kind: "unparsed" });
  }
  for (const item of (draft.plan.unsupported ?? []) as Array<{ ask?: unknown; reason?: unknown }>) {
    if (typeof item.ask === "string") {
      audit.push({
        phrase: item.ask,
        becomes: typeof item.reason === "string" ? item.reason : "No detector covers this yet — returned as an unsupported ask.",
        kind: "note",
      });
    }
  }

  // --- conflict path ---
  const conflict = detectConflicts(draft, scan.accepted);
  if (conflict) {
    return buildContradictory(draft, scan, conflict, residue, audit, library);
  }

  // --- two-phase path: “workout then sleep” builds the first phase only ---
  if (sequence) {
    return buildSequenced(draft, scan, sequence, residue, audit, library);
  }

  // --- merge path ---
  const mergedGoals = capGoals(goals, audit);
  const spec: MergeSpec = {
    goals: mergedGoals,
    modifiers,
    extra: [],
    forceDropIds: [],
    skipArc: false,
    residue,
  };
  const merged = mergePlan(draft, spec, library);
  const label = mergedGoals.length
    ? mergedGoals.map((entry) => entry.goal.label).join(" + ")
    : modifiers.length
      ? modifiers.map((entry) => entry.modifier.label).join(" + ")
      : "what I could parse";
  const base = mergedGoals.length ? 0.7 : 0.5;
  const confidence = confidenceFor(base, residue.length, merged.skipped.length);
  const candidates: Candidate[] = [{ label, confidence, plan: merged.plan, readingNotes: merged.readingNotes, extraAssumptions: [] }];
  const finalized = finalizeReadings(candidates, audit);
  audit.push(...merged.notes);

  if (!finalized.readings.length) {
    const hasClaims = hasContentClaims(draft, residue);
    const accuracy: Accuracy = hasClaims ? "impossible" : "vague";
    audit.push({
      phrase: "request",
      becomes: hasClaims
        ? "Nothing enforceable validated — reported as impossible instead of guessing."
        : "Nothing enforceable found — reported as vague instead of guessing.",
      kind: "note",
    });
    return { accuracy, readings: [], chosen_index: -1, asks: fallbackAsks(accuracy, draft, residue), audit, parser: PARSER };
  }

  const accuracy: Accuracy = residue.length ? "partial" : "specific";
  const asks = residue.length ? [residueAsk(residue)] : [];
  return { accuracy, readings: finalized.readings, chosen_index: finalized.chosen, asks: asks.slice(0, MAX_ASKS), audit, parser: PARSER };
}

/* ------------------------------------------------------------------ */
/* Contradictory readings                                              */
/* ------------------------------------------------------------------ */

function buildContradictory(
  draft: Draft, scan: LexScan, conflict: Conflict, residue: string[], audit: AuditEntry[], library: Library | undefined,
): GoalInterpretation {
  const goals = orderedGoals(scan.accepted);
  const modifiers = orderedModifiers(scan.accepted);
  const candidates: Candidate[] = [];
  let ask: Ask;

  if (conflict.kind === "goals") {
    const a = conflict.a;
    const b = conflict.b;
    const sideA = goals.filter((entry) => entry.goal.id !== b.id);
    const sideB = goals.filter((entry) => entry.goal.id !== a.id);
    // Each reading also drops the other side's draft proxies (their cruder versions).
    const mergedA = mergePlan(draft, { goals: capGoals(sideA, audit), modifiers, extra: [], forceDropIds: b.supersedes, skipArc: false, residue }, library);
    const mergedB = mergePlan(draft, { goals: capGoals(sideB, audit), modifiers, extra: [], forceDropIds: a.supersedes, skipArc: false, residue }, library);
    candidates.push({ label: a.label, confidence: 0.5, plan: mergedA.plan, readingNotes: mergedA.readingNotes,
      extraAssumptions: [`Read as “${a.label}” — the “${b.label}” request was set aside for this reading.`] });
    candidates.push({ label: b.label, confidence: 0.5, plan: mergedB.plan, readingNotes: mergedB.readingNotes,
      extraAssumptions: [`Read as “${b.label}” — the “${a.label}” request was set aside for this reading.`] });
    audit.push({ phrase: `${a.label} ↔ ${b.label}`, becomes: `provable goal opposition: two readings built (kept “${a.label}” / kept “${b.label}”); nothing silently chosen`, kind: "note" });
    audit.push(...mergedA.notes, ...mergedB.notes);
    ask = {
      ask: `You asked for both “${a.label}” and “${b.label}” — they pull in opposite directions. Which should lead?`,
      reason: "One request, two opposite goals; both readings are shown and neither is silently applied.",
      nearest_supported: "Pick one and I will rebuild, or keep both as separate playlists.",
    };
  } else if (conflict.kind === "fast_calm") {
    const pair = FAST_CALM_PAIR;
    const sideAGoals = goals.filter((entry) => !pair.sideA.dropsGoals.includes(entry.goal.id));
    const sideBGoals = goals; // the “fast” side is dropped via the modifiers, the goals stay
    const sideAModifiers = modifiers; // keep “fast”
    const sideBModifiers = modifiers.filter((entry) => !pair.sideB.dropsModifiers.includes(entry.modifier.id));
    const mergedA = mergePlan(draft, {
      goals: capGoals(sideAGoals, audit),
      modifiers: sideAModifiers,
      extra: pair.sideA.extra.map((constraint) => ({
        id: `goal_fastsoft_${constraint.n}`,
        source_phrase: `${conflict.fastPhrase} + ${conflict.calmPhrase}`,
        constraint,
      })),
      forceDropIds: pair.sideA.dropsDraftConstraints,
      skipArc: false,
      residue,
    }, library);
    const mergedB = mergePlan(draft, {
      goals: capGoals(sideBGoals, audit),
      modifiers: sideBModifiers,
      extra: [],
      forceDropIds: [],
      skipArc: false,
      residue,
    }, library);
    candidates.push({ label: pair.sideA.label, confidence: 0.5, plan: mergedA.plan, readingNotes: mergedA.readingNotes,
      extraAssumptions: [`Read as “${pair.sideA.label}”: keep the fast tempo (${conflict.fastPhrase}) and soften the texture — low loudness and light percussion — instead of keeping it calm.`] });
    candidates.push({ label: pair.sideB.label, confidence: 0.5, plan: mergedB.plan, readingNotes: mergedB.readingNotes,
      extraAssumptions: [`Read as “${pair.sideB.label}”: take “${conflict.calmPhrase}” literally; the “${conflict.fastPhrase}” side is set aside.`] });
    audit.push({ phrase: "fast + calm pair", becomes: `documented pair (${pair.id}): two readings — “${pair.sideA.label}” keeps the fast side, “${pair.sideB.label}” drops it`, kind: "note" });
    audit.push(...mergedA.notes, ...mergedB.notes);
    ask = {
      ask: `“${conflict.fastPhrase}” and “${conflict.calmPhrase}” pull opposite ways — should it be fast but soft-edged, or actually calm?`,
      reason: "One request, two opposite directions; both readings are shown and nothing is silently chosen.",
      nearest_supported: "Pick a reading, or say “fast but soft” / “calm only”.",
    };
  } else {
    const a = conflict.a;
    const b = conflict.b;
    const sideA = mergePlan(draft, { goals: capGoals(goals, audit), modifiers, extra: [], forceDropIds: [b.id], skipArc: false, residue }, library);
    const sideB = mergePlan(draft, { goals: capGoals(goals, audit), modifiers, extra: [], forceDropIds: [a.id], skipArc: false, residue }, library);
    candidates.push({ label: `keeps “${a.phrase}”`, confidence: 0.5, plan: sideA.plan, readingNotes: sideA.readingNotes,
      extraAssumptions: [`Read as: “${a.phrase}” (${a.bound}) leads; “${b.phrase}” (${b.bound}) was set aside for this reading.`] });
    candidates.push({ label: `keeps “${b.phrase}”`, confidence: 0.5, plan: sideB.plan, readingNotes: sideB.readingNotes,
      extraAssumptions: [`Read as: “${b.phrase}” (${b.bound}) leads; “${a.phrase}” (${a.bound}) was set aside for this reading.`] });
    audit.push({ phrase: `numeric conflict on ${conflict.field}`, becomes: `“${a.phrase}” and “${b.phrase}” cannot both hold — two readings built` , kind: "note" });
    audit.push(...sideA.notes, ...sideB.notes);
    ask = {
      ask: `“${a.phrase}” and “${b.phrase}” can't both hold — which one wins?`,
      reason: "The two rules have an empty intersection on the same field; neither was silently dropped.",
      nearest_supported: "Restate one of the bounds, or accept one of the two readings.",
    };
  }

  const finalized = finalizeReadings(candidates, audit);
  if (!finalized.readings.length) {
    audit.push({ phrase: "request", becomes: "Neither conflicting reading validated — reported without a plan instead of guessing.", kind: "note" });
    ask = {
      ask: "The request contains a provable conflict and neither reading could be built safely — restate one side.",
      reason: "Both candidate readings failed plan validation; nothing was shipped half-built.",
    };
  }
  const asks = [ask].slice(0, MAX_ASKS);
  return { accuracy: "contradictory", readings: finalized.readings, chosen_index: finalized.chosen, asks, audit, parser: PARSER };
}

/* ------------------------------------------------------------------ */
/* Two-phase sequences                                                 */
/* ------------------------------------------------------------------ */

/**
 * A “then/after” cue between two distinct goals asks for an order of events.
 * One plan carries one arc, so only the FIRST goal is built; the second is
 * handed back as an ask instead of merging cancelling bundles (C3 F-A1-3).
 */
function buildSequenced(
  draft: Draft, scan: LexScan, seq: SequenceCue, residue: string[], audit: AuditEntry[], library: Library | undefined,
): GoalInterpretation {
  const modifiers = orderedModifiers(scan.accepted);
  const spec: MergeSpec = {
    goals: [{ goal: seq.first.goal, phrase: seq.first.phrase }],
    modifiers,
    extra: [],
    // The second phase's draft proxies are set aside, exactly like the conflict
    // readings set aside the other side's cruder rules.
    forceDropIds: seq.second.goal.supersedes,
    skipArc: false,
    residue,
  };
  const merged = mergePlan(draft, spec, library);
  const confidence = confidenceFor(0.6, residue.length, merged.skipped.length);
  const candidates: Candidate[] = [{
    label: seq.first.goal.label,
    confidence,
    plan: merged.plan, readingNotes: merged.readingNotes,
    extraAssumptions: [
      `Read as the first of two phases: “${seq.first.phrase}” — the “${seq.second.phrase}” part comes after and gets its own list.`,
    ],
  }];
  const finalized = finalizeReadings(candidates, audit);
  audit.push(...merged.notes);
  audit.push({
    phrase: `“${seq.first.phrase}” ${seq.cue} “${seq.second.phrase}”`,
    becomes: `sequence cue “${seq.cue}” — built “${seq.first.goal.label}” only; “${seq.second.goal.label}” is left for a follow-up ask instead of being merged`,
    kind: "note",
  });
  if (!finalized.readings.length) {
    audit.push({ phrase: "request", becomes: "The first phase failed plan validation — reported without a plan instead of guessing.", kind: "note" });
    return { accuracy: "impossible", readings: [], chosen_index: -1, asks: [sequenceAsk(seq)], audit, parser: PARSER };
  }
  const asks = [sequenceAsk(seq), ...(residue.length ? [residueAsk(residue)] : [])].slice(0, MAX_ASKS);
  return { accuracy: "partial", readings: finalized.readings, chosen_index: finalized.chosen, asks, audit, parser: PARSER };
}

function sequenceAsk(seq: SequenceCue): Ask {
  return {
    ask: `Two moods in one ask — “${seq.first.phrase}” then “${seq.second.phrase}” reads as two phases. I built a list for the first one (“${seq.first.goal.label}”) only; ask again for “${seq.second.goal.label}” when you get there and I'll build the second.`,
    reason: `“${seq.cue}” describes an order of events, and one list carries one arc — the first phase is built now and the second is left to a follow-up ask rather than merged into one set.`,
    nearest_supported: "Two playlists, one per phase.",
  };
}

function capGoals(goals: Array<{ goal: Goal; phrase: string }>, audit: AuditEntry[]): Array<{ goal: Goal; phrase: string }> {
  if (goals.length <= MAX_GOALS_MERGED) return goals;
  const kept = goals.slice(0, MAX_GOALS_MERGED);
  audit.push({
    phrase: "goals",
    becomes: `more than ${MAX_GOALS_MERGED} goals in one request — kept “${kept.map((entry) => entry.goal.label).join("”, “")}”, skipped “${goals.slice(MAX_GOALS_MERGED).map((entry) => entry.goal.label).join("”, “")}”`,
    kind: "note",
  });
  return kept;
}

/* ------------------------------------------------------------------ */
/* Fallbacks (vague / impossible)                                      */
/* ------------------------------------------------------------------ */

function hasContentClaims(draft: Draft, residue: string[]): boolean {
  const unsupported = draft.plan.unsupported;
  if (Array.isArray(unsupported) && unsupported.length) return true;
  return residue.length > 0;
}

function residueAsk(residue: string[]): Ask {
  const shown = residue.slice(0, 3).map((entry) => clamp(entry, 60)).join("”, “");
  return {
    ask: `I left “${shown}” unused — if it matters, say it as an activity, a tempo range, or a tag.`,
    reason: "These words didn't map to anything measurable and were not guessed at.",
    nearest_supported: NEXT_STEP_HINT,
  };
}

function fallbackAsks(accuracy: Accuracy, draft: Draft, residue: string[]): Ask[] {
  const asks: Ask[] = [];
  if (accuracy === "impossible") {
    if (residue.length) {
      asks.push({
        ask: `“${residue.slice(0, 3).map((entry) => clamp(entry, 60)).join("”, “")}” is too specific for what I can measure today.`,
        reason: "Nothing in it maps to a measured field, and I won't fake one.",
        nearest_supported: NEXT_STEP_HINT,
      });
    }
    for (const item of (draft.plan.unsupported ?? []) as Array<{ ask?: unknown; reason?: unknown; nearest_supported?: unknown }>) {
      if (asks.length >= MAX_ASKS - 1) break;
      if (typeof item.ask !== "string" || typeof item.reason !== "string") continue;
      asks.push({
        ask: clamp(item.ask, 160),
        reason: clamp(item.reason, 200),
        nearest_supported: typeof item.nearest_supported === "string" ? clamp(item.nearest_supported, 160) : NEXT_STEP_HINT,
      });
    }
    if (asks.length < MAX_ASKS) {
      asks.push({
        ask: "Give me one anchor I can measure — an activity, a tempo range, or a tag.",
        reason: "One anchor is enough to build a preview.",
        nearest_supported: NEXT_STEP_HINT,
      });
    }
    return asks.slice(0, MAX_ASKS);
  }
  // vague
  return [
    {
      ask: "What should this be for — focusing, winding down, moving, driving, or something else?",
      reason: "Nothing in the request names a goal or a measurable feature yet.",
      nearest_supported: "“i need to focus”, “wind me down”, “music to dance to”",
    },
    {
      ask: "Or give one anchor: a mood, a tempo range, or an artist you're in the mood for.",
      reason: "One anchor is enough to build a preview.",
    },
  ].slice(0, MAX_ASKS);
}


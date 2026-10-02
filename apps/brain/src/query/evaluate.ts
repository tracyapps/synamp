/**
 * Plan evaluation: validated plan + library signals → explainable tiers.
 *
 * Order of work (dossier ch. 6, corrected by AGENT-ROADMAP P2):
 *   1. Two candidate channels — a filter scan and a similarity ("ANN") pass that
 *      deliberately ignores the filters, the way a real vector index would.
 *   2. Hard guards run on the UNION, so a sonically perfect match that breaks
 *      "no piano" still cannot get in through the similarity door.
 *   3. Under-fill walks only the ladder the plan declared, never across a rule
 *      in require_confirmation_for. Instead it returns a separate, labelled
 *      near-miss tier — never merged into the strict list.
 *   4. Score, then select with diversity caps (and MMR when embeddings exist).
 *   5. Every reason is built from (phrase, field, measured value, threshold).
 *      Nothing here invents a reason or a track.
 */

import { SIGNALS } from "./signals.ts";
import type { SignalSpec } from "./signals.ts";
import type { Constraint, Expr, Predicate, QueryPlan, UnknownPolicy, UnsupportedAsk, ValidatedPlan } from "./plan.ts";
import { feedbackBonus } from "../session/feedback.ts";
import type { FeedbackView } from "../session/feedback.ts";

export type LibraryTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  genre?: string[];
  year?: number;
  duration_s?: number;
  beat_status?: string | null;
  timing_status?: string | null;
  /** Canonical audio fields (see signals.ts), e.g. "bpm", "instruments.piano", "mood". */
  signals?: Record<string, number | string | null | undefined>;
  /** Library-relative file path (from the analyzer export); needed to stream audio. */
  path?: string;
  /** "tags" when names were read from the file; "path" when guessed from folders. */
  metadata_source?: "tags" | "path";
  album_artist?: string;
  /** Audio embedding for similarity (optional). */
  embedding?: number[];
};

export type Library = { version: string; tracks: LibraryTrack[] };

type Outcome = "pass" | "fail" | "unknown";
type Fact = {
  constraint: string;
  phrase: string;
  field: string;
  op: Predicate["op"];
  limit?: Predicate["value"];
  actual?: number | string | string[];
  outcome: Outcome;
  /** How far a numeric failure sits outside the limit. */
  miss?: number;
  policy: UnknownPolicy;
  why?: string;
};

type Verdict = "pass" | "fail" | "drop";
type ConstraintResult = { constraint: Constraint; verdict: Verdict; facts: Fact[]; assumed: boolean; unverified: boolean };

export type ResultTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  score: number;
  channels: Array<"filter" | "similar">;
  reasons: string[];
  /** Rules this track passed only because data was missing (neutral / include). */
  unverified: string[];
  near_miss?: { constraint: string; phrase: string; label: string };
  /** Present when listening feedback moved this track. Base is the request's own score. */
  score_breakdown?: { base: number; feedback: number };
};

export type Evaluation = {
  plan_hash: string;
  registry: string;
  library_version: string;
  strict: ResultTrack[];
  near_miss: ResultTrack[];
  counts: {
    library: number;
    candidates: { filter: number; similar: number; union: number };
    strict_total: number;
    excluded_by: Record<string, number>;
    unknown_by: Record<string, number>;
    unverified_by: Record<string, number>;
    capped: number;
    /** Tracks you removed from this playlist (hidden, restorable). */
    hidden_by_you: number;
  };
  relaxations_applied: Array<{ step: number; action: string; target: string; detail: string }>;
  underfilled: boolean;
  /** Hard asks the system could not enforce. A UI must show these. */
  unenforced: UnsupportedAsk[];
  unsupported: UnsupportedAsk[];
  warnings: string[];
  missing_exemplars: string[];
  /** Feedback policy applied, if any (see session/feedback.ts). */
  feedback_policy?: string;
  hidden: Array<{ id: string; title: string; artist?: string }>;
};

// --- values -------------------------------------------------------------------

type Read = { known: true; value: number | string | string[] } | { known: false; why: string };

function read(track: LibraryTrack, spec: SignalSpec): Read {
  if (spec.eligibleWhen) {
    const status = track[spec.eligibleWhen.field];
    if (!status || !spec.eligibleWhen.equals.includes(status)) {
      return { known: false, why: `${spec.eligibleWhen.field} is ${status ?? "missing"}` };
    }
  }
  let value: unknown;
  if (spec.status === "metadata") value = (track as Record<string, unknown>)[spec.field];
  else value = track.signals?.[spec.field];
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return { known: false, why: spec.nullMeaning };
  if (Array.isArray(value)) {
    const items = value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim().toLowerCase());
    return items.length ? { known: true, value: items } : { known: false, why: spec.nullMeaning };
  }
  if (typeof value === "string") return value.trim() ? { known: true, value: value.trim().toLowerCase() } : { known: false, why: spec.nullMeaning };
  if (typeof value === "number") return { known: true, value };
  return { known: false, why: spec.nullMeaning };
}

function test(pred: Predicate, read: Read): { outcome: Outcome; miss?: number } {
  if (pred.op === "exists") return { outcome: read.known ? "pass" : "fail" };
  if (pred.op === "is_null") return { outcome: read.known ? "fail" : "pass" };
  if (!read.known) return { outcome: "unknown" };
  const actual = read.value;
  if (pred.op === "in" || pred.op === "nin") {
    const have = Array.isArray(actual) ? actual : [String(actual)];
    const hit = have.some((item) => (pred.value as string[]).includes(item));
    return { outcome: (pred.op === "in") === hit ? "pass" : "fail" };
  }
  if (typeof actual !== "number") return { outcome: "unknown" };
  const v = pred.value;
  let miss = 0;
  if (pred.op === "lt") miss = actual < (v as number) ? 0 : actual - (v as number);
  if (pred.op === "lte") miss = actual <= (v as number) ? 0 : actual - (v as number);
  if (pred.op === "gt") miss = actual > (v as number) ? 0 : (v as number) - actual;
  if (pred.op === "gte") miss = actual >= (v as number) ? 0 : (v as number) - actual;
  if (pred.op === "between") {
    const [low, high] = v as [number, number];
    miss = actual < low ? low - actual : actual > high ? actual - high : 0;
  }
  const strictBoundary = (pred.op === "lt" || pred.op === "gt") && miss === 0 && actual === v;
  return miss > 0 || strictBoundary ? { outcome: "fail", miss: Math.max(miss, 0) } : { outcome: "pass" };
}

function evalExpr(expr: Expr, track: LibraryTrack, constraint: Constraint, facts: Fact[]): Verdict {
  if ("all" in expr) {
    const verdicts = expr.all.map((child) => evalExpr(child, track, constraint, facts));
    if (verdicts.includes("fail")) return "fail";
    return verdicts.includes("pass") ? "pass" : "drop";
  }
  if ("any" in expr) {
    const verdicts = expr.any.map((child) => evalExpr(child, track, constraint, facts));
    if (verdicts.includes("pass")) return "pass";
    return verdicts.includes("fail") ? "fail" : "drop";
  }
  const spec = SIGNALS.get(expr.field)!;
  const value = read(track, spec);
  const { outcome, miss } = test(expr, value);
  const policy = expr.unknown_policy ?? constraint.unknown_policy;
  facts.push({
    constraint: constraint.id, phrase: constraint.source_phrase, field: expr.field, op: expr.op, limit: expr.value,
    ...(value.known ? { actual: value.value } : { why: value.why }),
    outcome, ...(miss !== undefined ? { miss } : {}), policy,
  });
  if (outcome !== "unknown") return outcome;
  return policy === "exclude" ? "fail" : policy === "include" ? "pass" : "drop";
}

function evalConstraint(constraint: Constraint, track: LibraryTrack): ConstraintResult {
  const facts: Fact[] = [];
  const verdict = evalExpr(constraint.where, track, constraint, facts);
  const unknowns = facts.filter((fact) => fact.outcome === "unknown");
  return {
    constraint, verdict, facts,
    assumed: unknowns.some((fact) => fact.policy === "include"),
    unverified: verdict !== "fail" && unknowns.some((fact) => fact.policy !== "exclude"),
  };
}

// --- wording -------------------------------------------------------------------

const OP_WORDS: Record<Predicate["op"], string> = {
  lt: "<", lte: "≤", gt: ">", gte: "≥", between: "within", in: "is one of", nin: "is not", exists: "is measured", is_null: "is unmeasured",
};

function fmt(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
  if (Array.isArray(value)) {
    return value.length === 2 && value.every((item) => typeof item === "number") ? `${fmt(value[0])}–${fmt(value[1])}` : value.join(", ");
  }
  return String(value);
}

function factText(fact: Fact): string {
  const unit = SIGNALS.get(fact.field)?.unit;
  const limit = fact.limit === undefined ? "" : ` ${fmt(fact.limit)}${unit && typeof fact.limit !== "object" ? ` ${unit}` : ""}`;
  if (fact.outcome === "unknown") return `${fact.field} not measured (${fact.why})`;
  return `${fact.field} ${fmt(fact.actual)}${unit && typeof fact.actual === "number" ? ` ${unit}` : ""}` +
    (fact.outcome === "pass" ? ` — ${OP_WORDS[fact.op]}${limit}` : ` — needs ${OP_WORDS[fact.op]}${limit}`);
}

function reasonFor(result: ConstraintResult): string {
  const facts = result.verdict === "pass" ? result.facts.filter((fact) => fact.outcome === "pass") : result.facts;
  const shown = (facts.length ? facts : result.facts).slice(0, 3).map(factText).join("; ");
  return `“${result.constraint.source_phrase}”: ${shown}`;
}

/** A failed constraint is a near miss when every failure is close, or only unmeasured. */
function nearMissLabel(result: ConstraintResult): string | null {
  // Neutral/include unknowns did not cause the failure, so they are not part of the label.
  const failed = result.facts.filter((fact) => fact.outcome === "fail" || (fact.outcome === "unknown" && fact.policy === "exclude"));
  if (!failed.length) return null;
  const close = (fact: Fact) => fact.outcome === "unknown" ||
    (fact.miss !== undefined && fact.miss <= (SIGNALS.get(fact.field)?.nearMiss ?? 0));
  const isAny = "any" in result.constraint.where;
  if (isAny ? !failed.some(close) : !failed.every(close)) return null;
  const focus = isAny ? failed.filter(close) : failed;
  const detail = focus.slice(0, 2).map(factText).join("; ");
  return `excluded by your “${result.constraint.source_phrase}” rule: ${detail}`;
}

// --- similarity ----------------------------------------------------------------

function cosine(a: number[], b: number[]): number | null {
  if (a.length !== b.length || !a.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return na && nb ? dot / Math.sqrt(na * nb) : null;
}

function bestSimilarity(track: LibraryTrack, anchors: LibraryTrack[]): { value: number; anchor?: LibraryTrack } {
  let best: { value: number; anchor?: LibraryTrack } = { value: -1 };
  if (!track.embedding) return best;
  for (const anchor of anchors) {
    const sim = anchor.embedding ? cosine(track.embedding, anchor.embedding) : null;
    if (sim !== null && sim > best.value) best = { value: sim, anchor };
  }
  return best;
}

// --- main -------------------------------------------------------------------------

function widen(plan: QueryPlan, target: string, by: number): { plan: QueryPlan; detail: string } {
  const next = structuredClone(plan);
  const constraint = next.constraints.find((item) => item.id === target)!;
  const pred = constraint.where as Predicate;
  const before = fmt(pred.value);
  if (pred.op === "gt" || pred.op === "gte") pred.value = (pred.value as number) - by;
  else if (pred.op === "lt" || pred.op === "lte") pred.value = (pred.value as number) + by;
  else if (pred.op === "between") { const [low, high] = pred.value as [number, number]; pred.value = [low - by, high + by]; }
  return { plan: next, detail: `${pred.field} ${OP_WORDS[pred.op]} ${before} → ${fmt(pred.value)}` };
}

export type EvaluateOptions = {
  /** Listening feedback. Re-ranks within the strict tier and hides removed tracks; never adds a track. */
  feedback?: FeedbackView;
  /** The saved playlist being evaluated, for playlist-scoped feedback. */
  playlistId?: string;
};

export function evaluatePlan(validated: ValidatedPlan, library: Library, options: EvaluateOptions = {}): Evaluation {
  let plan = validated.plan;
  const tracks = library.tracks;
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const positives = (plan.ranking.exemplars?.positive ?? []).map((id) => byId.get(id)).filter((t): t is LibraryTrack => !!t);
  const negatives = (plan.ranking.exemplars?.negative ?? []).map((id) => byId.get(id)).filter((t): t is LibraryTrack => !!t);
  const missing = [...(plan.ranking.exemplars?.positive ?? []), ...(plan.ranking.exemplars?.negative ?? [])].filter((id) => !byId.has(id));
  const target = plan.target_size;
  const relaxations: Evaluation["relaxations_applied"] = [];

  // Channel B — similarity, blind to filters, as an ANN index would be.
  const similar = new Set<string>();
  if (positives.length) {
    tracks.map((track) => ({ track, sim: bestSimilarity(track, positives).value }))
      .filter((item) => item.sim > -1)
      .sort((a, b) => b.sim - a.sim || a.track.id.localeCompare(b.track.id))
      .slice(0, target * 4)
      .forEach((item) => similar.add(item.track.id));
  }

  const run = (current: QueryPlan) => {
    const hard = current.constraints.filter((item) => item.hard);
    const filterPass = new Set<string>();
    const rows = tracks.map((track) => {
      const results = hard.map((constraint) => evalConstraint(constraint, track));
      const failed = results.filter((result) => result.verdict === "fail");
      if (!failed.length) filterPass.add(track.id);
      return { track, results, failed };
    });
    // Union of both channels, then the hard guard applies to every member.
    const union = rows.filter((row) => filterPass.has(row.track.id) || similar.has(row.track.id));
    return { rows, union, strict: union.filter((row) => !row.failed.length), filterPass };
  };

  let pass = run(plan);
  for (const step of plan.relaxation.ladder) {
    if (pass.strict.length >= plan.relaxation.min_results) break;
    if (step.action === "widen_numeric") {
      const widened = widen(plan, step.target, step.by!);
      plan = widened.plan;
      relaxations.push({ step: step.step, action: step.action, target: step.target, detail: widened.detail });
      pass = run(plan);
    } else {
      plan = { ...plan, constraints: plan.constraints.filter((item) => item.id !== step.target) };
      relaxations.push({ step: step.step, action: step.action, target: step.target, detail: "soft preference dropped from scoring" });
    }
  }

  // Removed-from-this-playlist is a hard, playlist-only exclusion applied after the rules.
  const hiddenIds = options.feedback && options.playlistId ? options.feedback.removed(options.playlistId) : new Set<string>();
  const hidden = pass.strict.filter((row) => hiddenIds.has(row.track.id)).map((row) => row.track);
  if (hiddenIds.size) pass = { ...pass, strict: pass.strict.filter((row) => !hiddenIds.has(row.track.id)) };

  // --- scoring ---
  const soft = plan.constraints.filter((item) => !item.hard);
  const signals = plan.ranking.signals.length ? plan.ranking.signals : [{ name: "feature_soft" as const, weight: 1 }];
  const score = (track: LibraryTrack) => {
    const reasons: string[] = [];
    const unverified: string[] = [];
    let total = 0, weights = 0;
    for (const signal of signals) {
      let component: number | null = null;
      if (signal.name === "feature_soft" && soft.length) {
        let sum = 0, w = 0;
        for (const constraint of soft) {
          const result = evalConstraint(constraint, track);
          const weight = constraint.weight ?? 0;
          let sat = 0;
          if (result.verdict === "pass") { sat = result.assumed ? 0.5 : 1; reasons.push(reasonFor(result)); }
          else if (result.verdict === "drop") sat = 0.5;
          else {
            const misses = result.facts.filter((fact) => fact.outcome === "fail" && fact.miss !== undefined);
            sat = misses.length ? Math.max(0, ...misses.map((fact) => 1 - fact.miss! / (4 * (SIGNALS.get(fact.field)?.nearMiss || 1)))) * 0.5 : 0;
          }
          sum += weight * sat; w += weight;
        }
        component = w ? sum / w : null;
      }
      if (signal.name === "exemplar_pos" && positives.length) {
        const best = bestSimilarity(track, positives);
        component = best.value > -1 ? (best.value + 1) / 2 : 0;
        if (best.anchor && best.value > -1) reasons.push(`sounds like “${best.anchor.title}” (similarity ${fmt(best.value)})`);
      }
      if (signal.name === "exemplar_neg" && negatives.length) {
        const worst = bestSimilarity(track, negatives);
        component = worst.value > -1 ? 1 - (worst.value + 1) / 2 : 0.5;
      }
      if (component !== null) { total += signal.weight * component; weights += signal.weight; }
    }
    return { score: weights ? total / weights : 0, reasons, unverified };
  };

  const scored = pass.strict.map((row) => {
    const s: ReturnType<typeof score> & { breakdown?: { base: number; feedback: number } } = score(row.track);
    if (options.feedback) {
      const adj = options.feedback.adjust(row.track.id, options.playlistId);
      if (adj.parts.length) {
        const bonus = feedbackBonus(adj.value);
        s.breakdown = { base: Math.round(s.score * 1000) / 1000, feedback: Math.round(bonus * 1000) / 1000 };
        s.score += bonus;
        s.reasons.push(`your listening: ${adj.parts.map((part) => `${part.label} (${part.value > 0 ? "+" : ""}${part.value.toFixed(1)})`).join(", ")}`);
      }
    }
    for (const result of row.results) {
      if (result.verdict === "pass") s.reasons.unshift(reasonFor(result));
      if (result.unverified) s.unverified.push(`“${result.constraint.source_phrase}”: ${result.facts.filter((f) => f.outcome === "unknown").map((f) => `${f.field} unknown`).join(", ")}`);
    }
    return { row, ...s };
  }).sort((a, b) => b.score - a.score || a.row.track.id.localeCompare(b.row.track.id));

  // --- selection: caps + MMR ---
  const caps = plan.ranking.diversity ?? {};
  const lambda = plan.ranking.mmr_lambda;
  const perArtist = new Map<string, number>();
  const perAlbum = new Map<string, number>();
  const chosen: typeof scored = [];
  let capped = 0;
  const pool = [...scored];
  while (chosen.length < target && pool.length) {
    let pick = 0;
    if (lambda !== undefined && chosen.length) {
      let best = -Infinity;
      pool.forEach((item, index) => {
        const redundancy = Math.max(0, ...chosen.map((other) =>
          item.row.track.embedding && other.row.track.embedding ? cosine(item.row.track.embedding, other.row.track.embedding) ?? 0 : 0));
        const value = lambda * item.score - (1 - lambda) * redundancy;
        if (value > best) { best = value; pick = index; }
      });
    }
    const [item] = pool.splice(pick, 1);
    const track = item!.row.track;
    const artist = track.artist?.toLowerCase();
    const album = track.album ? `${artist ?? ""}\u0000${track.album.toLowerCase()}` : undefined;
    if ((artist && caps.max_per_artist && (perArtist.get(artist) ?? 0) >= caps.max_per_artist) ||
        (album && caps.max_per_album && (perAlbum.get(album) ?? 0) >= caps.max_per_album)) { capped++; continue; }
    if (artist) perArtist.set(artist, (perArtist.get(artist) ?? 0) + 1);
    if (album) perAlbum.set(album, (perAlbum.get(album) ?? 0) + 1);
    chosen.push(item!);
  }

  const toResult = (track: LibraryTrack, s: { score: number; reasons: string[]; unverified: string[]; breakdown?: { base: number; feedback: number } }): ResultTrack => ({
    id: track.id, title: track.title,
    ...(track.artist ? { artist: track.artist } : {}), ...(track.album ? { album: track.album } : {}),
    score: Math.round(s.score * 1000) / 1000,
    channels: [...(pass.filterPass.has(track.id) ? ["filter" as const] : []), ...(similar.has(track.id) ? ["similar" as const] : [])],
    reasons: [...new Set(s.reasons)], unverified: s.unverified,
    ...(s.breakdown ? { score_breakdown: s.breakdown } : {}),
  });

  // --- near misses: fail exactly one hard rule, and only narrowly or for lack of data ---
  const nearMiss: ResultTrack[] = [];
  if (plan.relaxation.tiers === "strict_plus_near_miss") {
    for (const row of pass.rows) {
      if (row.failed.length !== 1 || hiddenIds.has(row.track.id)) continue;
      const label = nearMissLabel(row.failed[0]!);
      if (!label) continue;
      const s = score(row.track);
      nearMiss.push({ ...toResult(row.track, s), near_miss: { constraint: row.failed[0]!.constraint.id, phrase: row.failed[0]!.constraint.source_phrase, label } });
    }
    nearMiss.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  // --- honest counts ---
  const excludedBy: Record<string, number> = {}, unknownBy: Record<string, number> = {}, unverifiedBy: Record<string, number> = {};
  for (const row of pass.rows) for (const result of row.results) {
    const id = result.constraint.id;
    if (result.verdict === "fail") {
      excludedBy[id] = (excludedBy[id] ?? 0) + 1;
      if (result.facts.some((fact) => fact.outcome === "unknown")) unknownBy[id] = (unknownBy[id] ?? 0) + 1;
    }
    if (result.unverified) unverifiedBy[id] = (unverifiedBy[id] ?? 0) + 1;
  }

  const unsupported = plan.unsupported ?? [];
  return {
    plan_hash: validated.hash,
    registry: validated.registry,
    library_version: library.version,
    strict: chosen.map((item) => toResult(item.row.track, item)),
    near_miss: nearMiss.slice(0, target),
    counts: {
      library: tracks.length,
      candidates: { filter: pass.filterPass.size, similar: similar.size, union: pass.union.length },
      strict_total: pass.strict.length,
      excluded_by: excludedBy, unknown_by: unknownBy, unverified_by: unverifiedBy, capped,
      hidden_by_you: hidden.length,
    },
    relaxations_applied: relaxations,
    underfilled: chosen.length < plan.relaxation.min_results,
    unenforced: unsupported.filter((item) => item.unenforced),
    unsupported,
    warnings: validated.warnings,
    missing_exemplars: missing,
    ...(options.feedback ? { feedback_policy: options.feedback.policy_version } : {}),
    hidden: hidden.map((track) => ({ id: track.id, title: track.title, ...(track.artist ? { artist: track.artist } : {}) })),
  };
}

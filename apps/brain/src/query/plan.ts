/**
 * Query plan — the typed, closed object a natural-language prompt becomes
 * (AGENT-ROADMAP P2, Brain dossier ch. 6).
 *
 * The parser (rule-based today, a local LLM later) may only *produce a plan*.
 * It never produces SQL, track lists or invented track IDs. Everything in a plan
 * is validated here against the signal registry before it can touch the library.
 *
 * This is the supported subset of the dossier's v2.0 sketch. Anything the sketch
 * names that is not implemented is rejected or returned as an "unsupported ask" —
 * never silently ignored.
 */

import { createHash } from "node:crypto";
import { REGISTRY_VERSION, lookupField } from "./signals.ts";
import type { SignalSpec } from "./signals.ts";

export const PLAN_VERSION = "2.0";

export type Op = "lt" | "lte" | "gt" | "gte" | "between" | "in" | "nin" | "exists" | "is_null";
/**
 * What a missing value means for one predicate. Null is never zero.
 *  - exclude: unknown fails the predicate (the track cannot be shown as satisfying it).
 *  - include: unknown passes, and the reason says it was assumed.
 *  - neutral: unknown neither passes nor fails — the predicate drops out of its
 *             group and the track is flagged "unverified" for that rule.
 */
export type UnknownPolicy = "exclude" | "include" | "neutral";

export type Predicate = {
  field: string;
  op: Op;
  value?: number | [number, number] | string[];
  unknown_policy?: UnknownPolicy;
};
export type Expr = Predicate | { all: Expr[] } | { any: Expr[] };

export type Constraint = {
  id: string;
  source_phrase: string;
  /** Hard = filter. Soft = weighted score term. */
  hard: boolean;
  /** The user said no / not / exclude / without. Never relaxed without a yes. */
  explicit_exclusion?: boolean;
  where: Expr;
  /** Default policy for predicates that do not set their own. */
  unknown_policy: UnknownPolicy;
  /** Soft constraints only: 0 < weight ≤ 1. */
  weight?: number;
  /** Parser's confidence that this predicate encodes the phrase. */
  confidence: number;
  /** Which measurable a polysemous word compiled to (e.g. "energy → arousal"). */
  proxy?: string;
};

export type LadderStep = { step: number; action: "drop_boost" | "widen_numeric"; target: string; by?: number; note?: string };

export type UnsupportedAsk = { ask: string; reason: string; nearest_supported?: string; unenforced?: boolean };

export type QueryPlan = {
  version: typeof PLAN_VERSION;
  intent: { query_type: "catalog" | "attribute" | "mood" | "activity" | "exemplar" | "era" | "exclusion" | "mixed"; summary?: string };
  target_size: number;
  constraints: Constraint[];
  ranking: {
    signals: Array<{ name: "feature_soft" | "exemplar_pos" | "exemplar_neg"; weight: number }>;
    exemplars?: { positive?: string[]; negative?: string[] };
    diversity?: { max_per_artist?: number; max_per_album?: number };
    mmr_lambda?: number;
  };
  relaxation: {
    min_results: number;
    tiers: "strict" | "strict_plus_near_miss";
    ladder: LadderStep[];
    /** Constraint IDs that may never be loosened without the owner's explicit yes. */
    require_confirmation_for: string[];
  };
  sequencing?: { arc: "flat" | "build" | "cooldown" | "peak" | "wave" };
  /** Affirmative text for a future text–audio encoder. Negations are stripped. */
  retrieval_text?: string;
  assumptions?: string[];
  unsupported?: UnsupportedAsk[];
};

export type PlanIssue = { path: string; message: string };
export type ValidatedPlan = {
  ok: true;
  plan: QueryPlan;
  hash: string;
  registry: string;
  /** Non-fatal notes, e.g. a field that has no producer yet. */
  warnings: string[];
};
export type PlanResult = ValidatedPlan | { ok: false; errors: PlanIssue[]; unsupported: UnsupportedAsk[] };

const OPS_BY_KIND: Record<SignalSpec["kind"], readonly Op[]> = {
  number: ["lt", "lte", "gt", "gte", "between", "exists", "is_null"],
  category: ["in", "nin", "exists", "is_null"],
  categories: ["in", "nin", "exists", "is_null"],
};
const POLICIES: readonly UnknownPolicy[] = ["exclude", "include", "neutral"];
const QUERY_TYPES = ["catalog", "attribute", "mood", "activity", "exemplar", "era", "exclusion", "mixed"];
const SUPPORTED_SIGNALS = ["feature_soft", "exemplar_pos", "exemplar_neg"];
const RESEARCH_SIGNALS = ["clap_text", "mood", "production", "chord", "novelty", "taste"];
const MAX_LEAVES = 8;
const MAX_DEPTH = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

class Checker {
  errors: PlanIssue[] = [];
  warnings: string[] = [];
  fail(path: string, message: string): void { this.errors.push({ path, message }); }

  keys(value: Record<string, unknown>, path: string, allowed: readonly string[]): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) this.fail(`${path}.${key}`, "Unknown property (the plan schema is closed)");
    }
  }

  num(value: unknown, path: string, min: number, max: number, integer = false): number | undefined {
    if (!isNum(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
      this.fail(path, `Expected ${integer ? "an integer" : "a number"} from ${min} to ${max}`);
      return undefined;
    }
    return value;
  }

  str(value: unknown, path: string, max: number): string | undefined {
    if (typeof value !== "string" || !value.trim() || value.length > max) {
      this.fail(path, `Expected a non-empty string of at most ${max} characters`);
      return undefined;
    }
    return value.trim();
  }
}

type Leaf = { spec: SignalSpec; predicate: Predicate; path: string };

/** Returns a canonical Expr, or null when it referenced an unsupported field. */
function checkExpr(c: Checker, value: unknown, path: string, depth: number, leaves: Leaf[], badFields: string[]): Expr | null {
  if (!isRecord(value)) { c.fail(path, "Expected a predicate or an {all}/{any} group"); return null; }
  if ("all" in value || "any" in value) {
    const kind = "all" in value ? "all" : "any";
    c.keys(value, path, [kind]);
    if (depth >= MAX_DEPTH) { c.fail(path, `Groups nest at most ${MAX_DEPTH} deep`); return null; }
    const items = value[kind];
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LEAVES) {
      c.fail(`${path}.${kind}`, `Expected 1–${MAX_LEAVES} items`); return null;
    }
    const children = items.map((item, index) => checkExpr(c, item, `${path}.${kind}[${index}]`, depth + 1, leaves, badFields));
    if (children.some((child) => child === null)) return null;
    // A single-member group is the member itself; keeps hashes stable.
    if (children.length === 1) return children[0]!;
    return kind === "all" ? { all: children as Expr[] } : { any: children as Expr[] };
  }
  c.keys(value, path, ["field", "op", "value", "unknown_policy"]);
  if (typeof value.field !== "string") { c.fail(`${path}.field`, "Expected a field name"); return null; }
  const found = lookupField(value.field);
  if (!found.ok) {
    badFields.push(value.field);
    return null;
  }
  const spec = found.spec;
  const op = value.op as Op;
  if (!OPS_BY_KIND[spec.kind].includes(op)) {
    c.fail(`${path}.op`, `"${String(value.op)}" is not valid for ${spec.field} (${spec.kind}); use ${OPS_BY_KIND[spec.kind].join(", ")}`);
    return null;
  }
  const predicate: Predicate = { field: spec.field, op };
  if (value.unknown_policy !== undefined) {
    if (!POLICIES.includes(value.unknown_policy as UnknownPolicy)) c.fail(`${path}.unknown_policy`, `Expected ${POLICIES.join(", ")}`);
    else predicate.unknown_policy = value.unknown_policy as UnknownPolicy;
  }
  const [min, max] = spec.range ?? [-Infinity, Infinity];
  if (op === "exists" || op === "is_null") {
    if (value.value !== undefined) c.fail(`${path}.value`, `${op} takes no value`);
  } else if (op === "between") {
    const pair = value.value;
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(isNum) || pair[0]! > pair[1]! || pair[0]! < min || pair[1]! > max) {
      c.fail(`${path}.value`, `Expected [low, high] within ${min}…${max}`);
    } else predicate.value = [pair[0]!, pair[1]!];
  } else if (op === "in" || op === "nin") {
    const list = value.value;
    if (!Array.isArray(list) || list.length === 0 || list.length > 50 || !list.every((item) => typeof item === "string" && item.trim() && item.length <= 120)) {
      c.fail(`${path}.value`, "Expected 1–50 strings");
    } else {
      // Category matching is case-insensitive except for names (artist/album keep case for display, compare folded).
      const folded = [...new Set((list as string[]).map((item) => item.trim().toLowerCase()))].sort();
      const unknown = spec.values ? folded.filter((item) => !spec.values!.includes(item)) : [];
      if (unknown.length) c.fail(`${path}.value`, `Not in the ${spec.field} vocabulary: ${unknown.join(", ")}`);
      predicate.value = folded;
    }
  } else {
    if (!isNum(value.value) || value.value < min || value.value > max) c.fail(`${path}.value`, `Expected a number within ${min}…${max} for ${spec.field}`);
    else predicate.value = value.value;
  }
  if (spec.status === "declared") {
    c.warnings.push(`${spec.field} has no analyzer producer yet (stage "${spec.stage}"); real tracks stay unknown for it until one lands.`);
  }
  leaves.push({ spec, predicate, path });
  return predicate;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function planHash(plan: QueryPlan): string {
  return createHash("sha256").update(`${REGISTRY_VERSION}\n${stableStringify(plan)}`).digest("hex");
}

/** Validate untrusted input (LLM output, an API body) into a canonical plan. */
export function validatePlan(input: unknown): PlanResult {
  const c = new Checker();
  if (!isRecord(input)) return { ok: false, errors: [{ path: "$", message: "Expected a plan object" }], unsupported: [] };
  c.keys(input, "$", ["version", "intent", "target_size", "constraints", "ranking", "relaxation", "sequencing", "retrieval_text", "assumptions", "unsupported"]);
  if (input.version !== PLAN_VERSION) c.fail("$.version", `Expected "${PLAN_VERSION}"`);

  let intent: QueryPlan["intent"] = { query_type: "mixed" };
  if (!isRecord(input.intent)) c.fail("$.intent", "Expected an object");
  else {
    c.keys(input.intent, "$.intent", ["query_type", "summary"]);
    if (!QUERY_TYPES.includes(input.intent.query_type as string)) c.fail("$.intent.query_type", `Expected one of ${QUERY_TYPES.join(", ")}`);
    else intent = { query_type: input.intent.query_type as QueryPlan["intent"]["query_type"] };
    if (input.intent.summary !== undefined) {
      const summary = c.str(input.intent.summary, "$.intent.summary", 200);
      if (summary) intent.summary = summary;
    }
  }
  const targetSize = c.num(input.target_size, "$.target_size", 1, 500, true) ?? 1;

  // --- constraints ---------------------------------------------------------
  const constraints: Constraint[] = [];
  const unsupported: UnsupportedAsk[] = [];
  if (!Array.isArray(input.constraints) || input.constraints.length > 32) c.fail("$.constraints", "Expected an array of at most 32 constraints");
  else {
    const ids = new Set<string>();
    input.constraints.forEach((raw, index) => {
      const path = `$.constraints[${index}]`;
      if (!isRecord(raw)) return c.fail(path, "Expected an object");
      c.keys(raw, path, ["id", "source_phrase", "hard", "explicit_exclusion", "where", "unknown_policy", "weight", "confidence", "proxy"]);
      const id = typeof raw.id === "string" && /^[a-z0-9_-]{1,32}$/.test(raw.id) ? raw.id : undefined;
      if (!id) return c.fail(`${path}.id`, "Expected an id of 1–32 lowercase letters, digits, _ or -");
      if (ids.has(id)) return c.fail(`${path}.id`, `Duplicate constraint id "${id}"`);
      ids.add(id);
      const phrase = c.str(raw.source_phrase, `${path}.source_phrase`, 200);
      if (typeof raw.hard !== "boolean") c.fail(`${path}.hard`, "Expected true or false");
      if (raw.explicit_exclusion !== undefined && typeof raw.explicit_exclusion !== "boolean") c.fail(`${path}.explicit_exclusion`, "Expected true or false");
      if (!POLICIES.includes(raw.unknown_policy as UnknownPolicy)) c.fail(`${path}.unknown_policy`, `Expected ${POLICIES.join(", ")}`);
      const confidence = c.num(raw.confidence, `${path}.confidence`, 0, 1);
      let weight: number | undefined;
      if (raw.hard === false) weight = c.num(raw.weight, `${path}.weight`, 0.001, 1);
      else if (raw.weight !== undefined) c.fail(`${path}.weight`, "Hard constraints are filters and take no weight");
      if (raw.explicit_exclusion === true && raw.hard !== true) c.fail(`${path}.explicit_exclusion`, "An explicit exclusion must be hard");
      const proxy = raw.proxy === undefined ? undefined : c.str(raw.proxy, `${path}.proxy`, 120);

      const leaves: Leaf[] = [];
      const badFields: string[] = [];
      const where = checkExpr(c, raw.where, `${path}.where`, 0, leaves, badFields);
      if (badFields.length) {
        // Never drop part of a constraint: half an exclusion is a different rule.
        const first = lookupField(badFields[0]!);
        unsupported.push({
          ask: phrase ?? id,
          reason: `Uses ${badFields.join(", ")}. ${first.ok ? "" : first.reason}`.trim(),
          ...(!first.ok && first.nearest ? { nearest_supported: first.nearest } : {}),
          ...(raw.hard === true ? { unenforced: true } : {}),
        });
        return;
      }
      if (!where || !phrase || confidence === undefined) return;
      const policy = raw.unknown_policy as UnknownPolicy;
      if (raw.explicit_exclusion === true) {
        for (const leaf of leaves) {
          const effective = leaf.predicate.unknown_policy ?? policy;
          if (leaf.spec.audio && !leaf.spec.corroborating && effective !== "exclude") {
            c.fail(`${leaf.path}.unknown_policy`, `An unmeasured ${leaf.spec.field} cannot pass an explicit exclusion; use "exclude"`);
          }
        }
      }
      constraints.push({
        id, source_phrase: phrase, hard: raw.hard as boolean,
        ...(raw.explicit_exclusion === true ? { explicit_exclusion: true } : {}),
        where, unknown_policy: policy,
        ...(weight !== undefined ? { weight } : {}),
        confidence,
        ...(proxy ? { proxy } : {}),
      });
    });
  }
  constraints.sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(constraints.map((item) => [item.id, item]));

  // --- ranking ---------------------------------------------------------------
  const ranking: QueryPlan["ranking"] = { signals: [] };
  if (!isRecord(input.ranking)) c.fail("$.ranking", "Expected an object");
  else {
    c.keys(input.ranking, "$.ranking", ["signals", "exemplars", "diversity", "mmr_lambda"]);
    const signals = input.ranking.signals;
    if (!Array.isArray(signals) || signals.length > 8) c.fail("$.ranking.signals", "Expected at most 8 signals");
    else signals.forEach((signal, index) => {
      const path = `$.ranking.signals[${index}]`;
      if (!isRecord(signal)) return c.fail(path, "Expected an object");
      c.keys(signal, path, ["name", "weight"]);
      const weight = c.num(signal.weight, `${path}.weight`, 0, 1);
      if (RESEARCH_SIGNALS.includes(signal.name as string)) {
        unsupported.push({ ask: `ranking signal ${String(signal.name)}`, reason: signal.name === "clap_text" ? "No text–audio encoder is installed yet." : "No producer for this ranking signal yet." });
        return;
      }
      if (!SUPPORTED_SIGNALS.includes(signal.name as string)) return c.fail(`${path}.name`, `Expected ${SUPPORTED_SIGNALS.join(", ")}`);
      if (weight !== undefined && !ranking.signals.some((item) => item.name === signal.name)) {
        ranking.signals.push({ name: signal.name as "feature_soft", weight });
      }
    });
    ranking.signals.sort((a, b) => a.name.localeCompare(b.name));
    if (input.ranking.exemplars !== undefined) {
      const ex = input.ranking.exemplars;
      if (!isRecord(ex)) c.fail("$.ranking.exemplars", "Expected an object");
      else {
        c.keys(ex, "$.ranking.exemplars", ["positive", "negative"]);
        const exemplars: NonNullable<QueryPlan["ranking"]["exemplars"]> = {};
        for (const side of ["positive", "negative"] as const) {
          const list = ex[side];
          if (list === undefined) continue;
          if (!Array.isArray(list) || list.length > 20 || !list.every((item) => typeof item === "string" && item && item.length <= 256)) {
            c.fail(`$.ranking.exemplars.${side}`, "Expected at most 20 track IDs");
          } else if (list.length) exemplars[side] = [...new Set(list as string[])].sort();
        }
        if (exemplars.positive || exemplars.negative) ranking.exemplars = exemplars;
      }
    }
    if (input.ranking.diversity !== undefined) {
      const diversity = input.ranking.diversity;
      if (!isRecord(diversity)) c.fail("$.ranking.diversity", "Expected an object");
      else {
        c.keys(diversity, "$.ranking.diversity", ["max_per_artist", "max_per_album"]);
        const out: NonNullable<QueryPlan["ranking"]["diversity"]> = {};
        for (const key of ["max_per_artist", "max_per_album"] as const) {
          if (diversity[key] !== undefined) {
            const cap = c.num(diversity[key], `$.ranking.diversity.${key}`, 1, 100, true);
            if (cap !== undefined) out[key] = cap;
          }
        }
        if (Object.keys(out).length) ranking.diversity = out;
      }
    }
    if (input.ranking.mmr_lambda !== undefined) {
      const lambda = c.num(input.ranking.mmr_lambda, "$.ranking.mmr_lambda", 0, 1);
      if (lambda !== undefined) ranking.mmr_lambda = lambda;
    }
  }

  // --- relaxation --------------------------------------------------------------
  const relaxation: QueryPlan["relaxation"] = { min_results: 1, tiers: "strict_plus_near_miss", ladder: [], require_confirmation_for: [] };
  if (!isRecord(input.relaxation)) c.fail("$.relaxation", "Expected an object");
  else {
    const r = input.relaxation;
    c.keys(r, "$.relaxation", ["min_results", "tiers", "ladder", "require_confirmation_for", "never_relax"]);
    if (r.never_relax !== undefined) c.fail("$.relaxation.never_relax", "Use require_confirmation_for (constraint IDs)");
    relaxation.min_results = c.num(r.min_results, "$.relaxation.min_results", 0, 500, true) ?? 1;
    if (r.tiers !== "strict" && r.tiers !== "strict_plus_near_miss") c.fail("$.relaxation.tiers", "Expected strict or strict_plus_near_miss");
    else relaxation.tiers = r.tiers;
    const confirm = new Set<string>();
    if (r.require_confirmation_for !== undefined) {
      if (!Array.isArray(r.require_confirmation_for)) c.fail("$.relaxation.require_confirmation_for", "Expected constraint IDs");
      else for (const id of r.require_confirmation_for) {
        if (typeof id === "string" && byId.has(id)) confirm.add(id);
        else if (typeof id !== "string" || !unsupported.length) c.fail("$.relaxation.require_confirmation_for", `Unknown constraint "${String(id)}"`);
      }
    }
    // Every explicit exclusion is protected, whether or not the parser remembered.
    for (const item of constraints) if (item.explicit_exclusion) confirm.add(item.id);
    relaxation.require_confirmation_for = [...confirm].sort();

    if (!Array.isArray(r.ladder) || r.ladder.length > 10) c.fail("$.relaxation.ladder", "Expected at most 10 steps");
    else r.ladder.forEach((raw, index) => {
      const path = `$.relaxation.ladder[${index}]`;
      if (!isRecord(raw)) return c.fail(path, "Expected an object");
      c.keys(raw, path, ["step", "action", "target", "by", "note"]);
      if (raw.action === "ignore_never_relax") return c.fail(`${path}.action`, "ignore_never_relax is not allowed: an explicit rule is never overridden without the owner's yes");
      if (raw.action !== "drop_boost" && raw.action !== "widen_numeric") {
        return c.fail(`${path}.action`, `"${String(raw.action)}" is not supported; use drop_boost or widen_numeric`);
      }
      const step = c.num(raw.step, `${path}.step`, 0, 100, true);
      const target = typeof raw.target === "string" ? byId.get(raw.target) : undefined;
      if (!target) return c.fail(`${path}.target`, "Expected an existing constraint id");
      if (relaxation.require_confirmation_for.includes(target.id)) {
        return c.fail(`${path}.target`, `"${target.id}" needs the owner's confirmation and cannot sit on the relaxation ladder`);
      }
      const out: LadderStep = { step: step ?? index, action: raw.action, target: target.id };
      if (raw.action === "drop_boost" && target.hard) return c.fail(`${path}.target`, "drop_boost only removes soft constraints");
      if (raw.action === "widen_numeric") {
        if (!target.hard) return c.fail(`${path}.target`, "widen_numeric applies to hard numeric constraints");
        const leaf = target.where as Predicate;
        if (!("field" in leaf) || !["lt", "lte", "gt", "gte", "between"].includes(leaf.op)) return c.fail(`${path}.target`, "widen_numeric needs a single numeric predicate");
        const by = c.num(raw.by, `${path}.by`, 0.000001, 1000);
        if (by !== undefined) out.by = by;
      }
      if (raw.note !== undefined) { const note = c.str(raw.note, `${path}.note`, 200); if (note) out.note = note; }
      relaxation.ladder.push(out);
    });
    relaxation.ladder.sort((a, b) => a.step - b.step);
  }

  // --- the rest ----------------------------------------------------------------
  let sequencing: QueryPlan["sequencing"];
  if (input.sequencing !== undefined) {
    if (!isRecord(input.sequencing)) c.fail("$.sequencing", "Expected an object");
    else {
      c.keys(input.sequencing, "$.sequencing", ["arc"]);
      // Arcs are accepted here; whether a list is actually re-ordered (and how)
      // is query/sequence.ts's job, and only over the already-filtered strict list.
      if (["flat", "build", "cooldown", "peak", "wave"].includes(input.sequencing.arc as string)) {
        sequencing = { arc: input.sequencing.arc as NonNullable<QueryPlan["sequencing"]>["arc"] };
      } else c.fail("$.sequencing.arc", "Expected flat, build, cooldown, peak or wave");
    }
  }
  const retrievalText = input.retrieval_text === undefined ? undefined : c.str(input.retrieval_text, "$.retrieval_text", 300);
  const assumptions: string[] = [];
  if (input.assumptions !== undefined) {
    if (!Array.isArray(input.assumptions) || input.assumptions.length > 20) c.fail("$.assumptions", "Expected at most 20 strings");
    else input.assumptions.forEach((item, index) => { const text = c.str(item, `$.assumptions[${index}]`, 300); if (text) assumptions.push(text); });
  }
  if (input.unsupported !== undefined) {
    if (!Array.isArray(input.unsupported) || input.unsupported.length > 20) c.fail("$.unsupported", "Expected at most 20 asks");
    else input.unsupported.forEach((item, index) => {
      if (!isRecord(item)) return c.fail(`$.unsupported[${index}]`, "Expected an object");
      c.keys(item, `$.unsupported[${index}]`, ["ask", "reason", "nearest_supported", "unenforced"]);
      const ask = c.str(item.ask, `$.unsupported[${index}].ask`, 200);
      const reason = c.str(item.reason, `$.unsupported[${index}].reason`, 300);
      if (ask && reason) unsupported.push({
        ask, reason,
        ...(typeof item.nearest_supported === "string" ? { nearest_supported: item.nearest_supported.slice(0, 200) } : {}),
        ...(item.unenforced === true ? { unenforced: true } : {}),
      });
    });
  }
  if (!constraints.length && !ranking.exemplars?.positive?.length) {
    c.fail("$.constraints", "A plan needs at least one supported constraint or a positive exemplar");
  }

  if (c.errors.length) return { ok: false, errors: c.errors, unsupported };
  const plan: QueryPlan = {
    version: PLAN_VERSION, intent, target_size: targetSize, constraints, ranking, relaxation,
    ...(sequencing ? { sequencing } : {}),
    ...(retrievalText ? { retrieval_text: retrievalText } : {}),
    ...(assumptions.length ? { assumptions } : {}),
    ...(unsupported.length ? { unsupported } : {}),
  };
  return { ok: true, plan, hash: planHash(plan), registry: REGISTRY_VERSION, warnings: [...new Set(c.warnings)].sort() };
}

/**
 * The only text a text–audio encoder will ever see. Negated spans are cut out
 * before encoding, because these models carry an affirmation bias: "no piano"
 * retrieves piano (NegEval-Audio, dossier ch. 6). Exclusions live in predicates.
 */
export function encoderText(text: string | undefined): string {
  if (!text) return "";
  const negation = /\b(?:no|not|without|nothing|never|exclude|excluding|except|minus|avoid|skip|less|zero|non)\b[^.,;!?\n]*/gi;
  return text.replace(/\bn't\b[^.,;!?\n]*/gi, " ").replace(/\b\w+n't\b[^.,;!?\n]*/gi, " ")
    .replace(negation, " ")
    .replace(/[,;:/]+/g, " ").replace(/\s+([.!?])/g, "$1").replace(/([.!?])(?:\s*[.!?])+/g, "$1")
    .replace(/\s+/g, " ").trim().replace(/^[.!?\s]+|[\s]+$/g, "");
}

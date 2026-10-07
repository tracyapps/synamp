/**
 * Exploration budget (A3 §3.5) — implemented, DEFAULT OFF, deliberately tiny.
 *
 * Why OFF is the default: single-user, thin data — exploration noise is
 * indistinguishable from mood; and SynAmp's promise is a fully deterministic,
 * byte-reproducible ranking whose exposures are recorded honestly (policy
 * "deterministic_rank" — no invented propensities). Diversity is already a
 * guardrail (caps + MMR); a queue-builder that WANTS a slot of novelty can
 * switch this on explicitly, at which point selection is a pure function of
 * (epoch_id, resolve counter) — replayable, never random state.
 *
 * The OFF path is byte-identical by construction: derive.ts never reads this
 * module; a view derived with `exploration` absent, false, or true is the same
 * bytes. Tests prove it.
 */

import { createHash } from "node:crypto";
import type { PolicyOptions } from "./types.ts";

export const EXPLORATION_DEFAULT = false;

/** True only when a caller explicitly asked for exploration. */
export function explorationEnabled(opts: Pick<PolicyOptions, "exploration">): boolean {
  return opts.exploration === true;
}

/**
 * Deterministically picks one exploration candidate: same (epoch_id, counter,
 * candidates) ⇒ same pick, across machines and replays. Returns null when
 * there is nothing to explore. Queue building: use at most ONE slot per queue,
 * and record the exposure with policy "deterministic_rank+explore_slot".
 */
export function pickExplorationSlot(args: {
  epochId: string;
  counter: number;
  candidates: readonly string[];
}): string | null {
  if (!args.candidates.length) return null;
  const digest = createHash("sha256").update(`explore\u0000${args.epochId}\u0000${args.counter}`).digest("hex");
  const index = Number.parseInt(digest.slice(0, 8), 16) % args.candidates.length;
  return args.candidates[index] ?? null;
}

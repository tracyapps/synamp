/**
 * Exploration flag tests (A3 §3.5, P24).
 *
 * The contract: default OFF; the OFF path is byte-identical to "no budget";
 * when a caller asks for it, selection is deterministic given (epoch_id, counter).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveEpochPolicy } from "./derive.ts";
import { explorationEnabled, pickExplorationSlot } from "./explore.ts";
import type { ListeningEvent } from "../session/events.ts";

const TZ = "America/Chicago";

test("exploration defaults to OFF and is deterministic when asked", () => {
  assert.equal(explorationEnabled({}), false);
  assert.equal(explorationEnabled({ exploration: false }), false);
  assert.equal(explorationEnabled({ exploration: true }), true);

  const args = { epochId: "ep1:abc", counter: 7, candidates: ["a", "b", "c", "d"] as const };
  const first = pickExplorationSlot(args);
  assert.equal(first, pickExplorationSlot(args));
  assert.ok(first !== null && (args.candidates as readonly string[]).includes(first));
  assert.equal(pickExplorationSlot({ ...args, candidates: [] }), null);

  // a different counter may pick a different slot, but never leaves the list
  const second = pickExplorationSlot({ ...args, counter: 8 });
  assert.ok(second !== null && (args.candidates as readonly string[]).includes(second));
});

test("exploration OFF path is byte-identical to no-budget (proved on a derived view)", () => {
  const t0 = Date.UTC(2026, 9, 2, 14, 0, 0);
  const events: ListeningEvent[] = [
    { id: "x0000001", ts: t0, signal: "repeat", track_id: "X", scope: "session", session_id: "s1", source: "server", policy_version: "test" },
    { id: "x0000002", ts: t0 + 60_000, signal: "skip_early", track_id: "Y", scope: "session", session_id: "s1", source: "server", policy_version: "test" },
  ];
  const now = t0 + 120_000;
  const snap = (view: ReturnType<typeof deriveEpochPolicy>): string =>
    JSON.stringify({
      events: view.events,
      epoch: view.epoch,
      hides: [...view.epochHides()].sort(),
      notes: view.reliabilityNotes(),
      adjustX: view.adjust("X"),
      adjustY: view.adjust("Y"),
      proposals: view.proposals(),
    });

  const noBudget = snap(deriveEpochPolicy(events, { now, timezone: TZ }));
  const offExplicit = snap(deriveEpochPolicy(events, { now, timezone: TZ, exploration: false }));
  const onExplicit = snap(deriveEpochPolicy(events, { now, timezone: TZ, exploration: true }));
  assert.equal(offExplicit, noBudget);
  // Even ON never changes the derived view — the flag only ever affects queue
  // building through pickExplorationSlot, never ranking.
  assert.equal(onExplicit, noBudget);
});

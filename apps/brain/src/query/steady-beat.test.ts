import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretGoal } from "../intent/interpret.ts";
import { draftPlan } from "./draft.ts";
import { validatePlan } from "./plan.ts";
import { evaluatePlan } from "./evaluate.ts";
import type { Library } from "./evaluate.ts";

const library: Library = { version: "steady-fixture", tracks: [
  { id: "steady", title: "Measured stable pulse", signals: { pulse_clarity: 0.3, pulse_steadiness: 0.5 } },
  { id: "weak", title: "Weak pulse", signals: { pulse_clarity: 0.29, pulse_steadiness: 1 } },
  { id: "irregular", title: "Irregular pulse", signals: { pulse_clarity: 0.8, pulse_steadiness: 0.49 } },
  { id: "unknown", title: "Unmeasured", signals: {} },
  { id: "partial", title: "Missing steadiness", signals: { pulse_clarity: 0.8 } },
] };

test("a steady beat maps to the existing measured-pulse definition and preserves strict shortages", () => {
  const intent = interpretGoal("a steady beat", { library });
  assert.equal(intent.accuracy, "specific");
  assert.equal(intent.readings.length, 1);
  const checked = validatePlan(intent.readings[0]!.plan);
  assert.ok(checked.ok);
  const rule = checked.plan.constraints.find(c => c.id === "steady_beat");
  assert.ok(rule?.hard);
  assert.equal(rule.unknown_policy, "exclude");
  assert.ok(checked.plan.relaxation.require_confirmation_for.includes("steady_beat"));
  assert.ok(checked.plan.assumptions?.some(note => /proxy|measured/i.test(note)));
  const result = evaluatePlan(checked, library);
  assert.deepEqual(result.strict.map(t => t.id), ["steady"]);
  assert.equal(result.underfilled, true);
  assert.equal(result.counts.library, 5);
  assert.ok(Object.keys(result.counts.unknown_by).length > 0);
  assert.deepEqual(result.relaxations_applied, []);
});

test("negated steady-beat phrases never become an affirmative requirement", () => {
  for (const prompt of ["no steady beat", "without a steady beat", "not a steady beat", "avoid steady beats"]) {
    const constraints = draftPlan(prompt, library).plan.constraints as Array<{ id: string }>;
    assert.ok(!constraints.some(c => c.id === "steady_beat"), prompt);
    assert.notEqual(interpretGoal(prompt, { library }).accuracy, "specific", prompt);
  }
});

test("live-recording requests remain partial rather than silently dropping the live condition", () => {
  const intent = interpretGoal("live recordings without vocals", { library });
  assert.equal(intent.accuracy, "partial");
  assert.ok(intent.asks.length > 0);
  assert.ok(intent.audit.some(a => a.kind === "unparsed" && /live/.test(a.phrase)));
});

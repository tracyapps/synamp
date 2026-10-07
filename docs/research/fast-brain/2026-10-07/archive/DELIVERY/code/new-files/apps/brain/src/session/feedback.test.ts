/**
 * The policy label on derived views (B5 / decision 3): the default is the event
 * policy version (POLICY_VERSION); the legacy rollback stamps "heuristic-v1"
 * explicitly. The derivation's numbers are independent of the label.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { POLICY_VERSION } from "./events.ts";
import { deriveFeedback } from "./feedback.ts";

test("deriveFeedback labels the view with the policy it ran under", () => {
  assert.equal(deriveFeedback([]).policy_version, POLICY_VERSION, "default = the current event policy version");
  assert.equal(
    deriveFeedback([], Date.now(), (id) => id, "heuristic-v1").policy_version,
    "heuristic-v1",
    "the listening_policy=legacy-v1 rollback passes its own label",
  );
});

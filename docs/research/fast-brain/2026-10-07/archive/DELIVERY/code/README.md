# Code package — SynAmp Fast Learning Brain

- **`PATCH.diff`** — the complete change set, `git diff b6ea5ce1..66cbe4e8` (branch `feat/fast-learning-brain`). Apply with `git apply`, or merge the branch (`git merge feat/fast-learning-brain`); revert with `git reset --hard b6ea5ce1`.
- **`new-files/`** — browsable snapshot of every file added by the slice (same paths as the repository):
  - `apps/brain/src/intent/` — goal lexicon + `interpretGoal` (nine goal bundles, accuracy classes, asks, audit).
  - `apps/brain/src/learning/` — `epoch-v1`: `epochs.ts`, `derive.ts`, `reliability.ts`, `proposals.ts`, `explore.ts`, `types.ts` (+ tests beside each).
  - `apps/brain/src/query/` — `sequence.ts` (arcs) and the integration tests (`sequence.test.ts`, `hide-union.test.ts`).
  - `apps/brain/src/session/feedback.test.ts` — re-ranker pipeline tests.
  - `apps/web/src/BrainSession.tsx`, `apps/web/src/styles/brain.css` — the “This session” panel.
  - `docs/synamp/plans/FAST-LEARNING-BRAIN.md` — the design/operations doc.
  - `tools/brain-lab/` — the deterministic 8-scenario verification harness (run: `node --experimental-strip-types tools/brain-lab/lab.mts`).

Modified files (see the patch for the exact diffs): `index.ts` (routes, readout, forget, proposals, interpretation), `evaluate.ts` (hide union + session-hide split), `plan.ts` (arcs), `events.ts` (`learning_reset`, `POLICY_VERSION`), `feedback.ts`, `settings.ts`, `Describe.tsx`, `App.tsx`, `README.md`, docs.

Run everything: see `../verification/README.md`.

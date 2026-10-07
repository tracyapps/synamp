# B1 — Goal interpreter & sequencing (engineering receipt)

Status: complete · Author: B1 goal-language interpreter & sequencing (feature engineering) · Date: 2026-10-06
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (HEAD still `b6ea5ce1`; **no commits made**, working tree carries B1+B2+B4 changes).

---

## Conclusion

The translation layer is real code now, and it composes with the existing rails instead of bypassing them:

- `apps/brain/src/intent/lexicon.ts` — the nine-goal EN lexicon (focus, pump_up, dance, calm, sleep, catharsis, nostalgia, drive, chores) with A1 §2 soft-constraint bundles (field/op/band/weight/mechanism/refs), A1 §3 arc suggestions, plain-language assumptions, caveats, A2 culture notes, `supersedes` lists, goal-opposition pairs (pump_up↔calm, dance↔sleep), blend hints, and the documented "fast + calm/relaxing" pair. **Soft only**; declared fields are neutral + inert-noted; weights honour the ≤0.5 / bundle ≤1.0 convention.
- `apps/brain/src/intent/interpret.ts` — the frozen `interpretGoal()` seam: draftPlan → lexicon merge (namespaced `goal_<goal>_<n>` ids, supersedes, arcs) → accuracy classification (`specific / partial / contradictory / vague / impossible`) → readings, asks, audit. Every reading passes `validatePlan`; invalid readings are dropped with notes; nothing is silently chosen.
- `apps/brain/src/query/sequence.ts` — `sequenceTracks()` implementing `build / cooldown / peak / wave` over the **already-filtered strict list only**, with a documented produced-fields intensity proxy, tempo-confidence damping, a 60 % coverage gate with honest fallback, and deterministic placement of unknown-intensity tracks.
- `plan.ts` now accepts the four arcs (no longer "unsupported asks"); `query.test.ts` updated deliberately (one focused test — the only pre-existing arc assertion, flagship `flat`, is unchanged).
- Required behaviours all verified by tests: flagship focus; each user example phrase; vague → asks; "fast relaxing bangers" → **two documented readings**; "90s Mongolian throat singing only" / "not four-on-the-floor" → honest asks; determinism; all emitted readings validate. Surface-verb probes stay `vague` (harness cross-check follow-up below).

Test counts: **before 149 (147 pass / 1 fail / 1 skip) → after 205 (203 pass / 1 fail / 1 skip)** — the 205 includes the harness cross-check follow-up fix noted below. The single failure is the pre-existing macOS librarian case-fold artifact; the skip is the pre-existing `/dev/shm` case. Brain type-check: **exit 0**.

## Evidence

Commands (verbatim) and results:

```
pnpm --filter @synamp/brain test
  ℹ tests 205 · ℹ pass 203 · ℹ fail 1 · ℹ skipped 1 · cancelled 0 · todo 0
  ✖ artist merge: whole folders, everything follows, the variant folder disappears
    (librarian.test.ts — pre-existing macOS case-insensitive-FS artifact, identical on main)
pnpm --filter @synamp/brain type-check   →  exit 0 (no output)
node --experimental-strip-types --test src/intent/intent.test.ts src/query/sequence.test.ts
  ℹ tests 19 · pass 19 · fail 0
```

- Baselines (A4): 149 / 147 / 1 / 1 and type-check clean. My delta: **+20 tests** (11 intent + 8 sequence + 1 deliberate query.test.ts addition), all passing; B2's learning suite (+36) landed concurrently and is green — account for the 205 total together.
- **Follow-up fix (verification-harness cross-check, same pass):** the harness probe "play me something good" classified as `impossible` instead of `vague` — surface verbs survived the residue cleanup and flipped `hasContentClaims()` (my own `"something good for later idk"` test pins `vague`, so it was a one-word inconsistency). Fixed by extending `EXTRA_FILLER` in `interpret.ts` with `play/plays/playing/played | put/puts | queue/queues/queued | start/starts/started/starting | up`; probes now: "play me something good", "put on something for later", "queue up something nice", "start me something" → all `vague` (2 asks each). Regression test added ("surface verbs stay glue"). Re-ran everything: no other behaviour changed.
- Full logs saved: `/tmp/synamp-b1-test.log`, `/tmp/synamp-b1-typecheck.log` (copy into `DELIVERY/verification/` if wanted).
- Behaviour spot-checks (fixture library, scratch script): flagship → `specific`, 1 reading, `goal_focus_1…10`, draft `focus_arousal/focus_pulse` superseded with audit notes, `arc=flat`; pump example → `specific`, `goal_pump_up_*`, `arc=build`; dance → `arc=peak`; "fast relaxing bangers" → 2 readings ("energetic but soft" = `mod_fast` + `goal_fastsoft_1/2`; "literally calm" = `goal_calm_*`, no fast) + one clarifying ask; "pump me up but keep it calm" → 2 readings with the other side's draft proxies force-dropped; "over 140 bpm under 100 bpm" → 2 readings each keeping one bound + ask; vague/impossible cases → 0 readings with next-step asks (quoted in transcript above).
- `git diff --stat`: `plan.ts` +9/−4, `query.test.ts` +16. New files: `intent/lexicon.ts` (650 L), `intent/interpret.ts` (822 L), `intent/intent.test.ts` (275 L), `query/sequence.ts` (142 L), `query/sequence.test.ts` (120 L).
- Determinism: two calls deep-equal for flagship/contradictory/vague/dance (intent tests) and for every arc (sequence tests); no `Date.now`/`Math.random` in logic (grep-verified).

## Files changed (ownership respected)

| File | State | Note |
|---|---|---|
| `apps/brain/src/intent/lexicon.ts` | NEW (mine) | goal lexicon + resolution helpers |
| `apps/brain/src/intent/interpret.ts` | NEW (mine) | frozen `interpretGoal` seam |
| `apps/brain/src/intent/intent.test.ts` | NEW (mine) | 11 tests |
| `apps/brain/src/query/sequence.ts` | NEW (mine) | frozen `sequenceTracks` seam |
| `apps/brain/src/query/sequence.test.ts` | NEW (mine) | 8 tests |
| `apps/brain/src/query/plan.ts` | EDIT (mine, deliberate) | arc type + validator; PLAN_VERSION stays "2.0" |
| `apps/brain/src/query/query.test.ts` | EDIT (mine, deliberate) | +1 test only (arc acceptance/hash); explained in-file |
| `events.ts`, `learning/**`, `tools/brain-lab/**` | untouched | B2/B4's concurrent work |

## Interfaces as implemented (exact)

```ts
// apps/brain/src/intent/interpret.ts
export const INTERPRET_VERSION = "intent-v1";
export type Accuracy = "specific" | "partial" | "vague" | "contradictory" | "impossible";
export type Reading = { label: string; confidence: number; plan: unknown; assumptions: string[] };
export type Ask = { ask: string; reason: string; nearest_supported?: string };
export type AuditEntry = { phrase: string; becomes: string; kind: "hard" | "soft" | "goal" | "exclusion" | "unparsed" | "note" };
export type GoalInterpretation = {
  accuracy: Accuracy; readings: Reading[]; chosen_index: number;
  asks: Ask[]; audit: AuditEntry[]; parser: string;
};
export function interpretGoal(text: string, opts: { library?: Library; now?: number } = {}): GoalInterpretation;
// parser = "intent-v1 (rule-based: draftPlan + goal lexicon; no LLM)"
// chosen_index = highest-confidence valid reading; tie → earliest; none → -1

// apps/brain/src/query/sequence.ts
export type SequencedTracks = { tracks: ResultTrack[]; applied: string[] };
export function sequenceTracks(tracks: ResultTrack[], plan: QueryPlan, opts: { library: Library }): SequencedTracks;

// apps/brain/src/intent/lexicon.ts (public surface)
export const LEXICON_VERSION = "goal-lexicon/1";
export const MIN_QUANTILE_SAMPLES = 3;
export const GOALS: readonly Goal[];            // 9 goals, in A1 order
export const GOAL_BY_ID: ReadonlyMap<GoalId, Goal>;
export const MODIFIERS: readonly Modifier[];    // "fast", "slow" (tempo leanings)
export const FAST_CALM_PAIR: { id: "fast_calm"; note; sideA; sideB };
export const SHARED_ASSUMPTIONS: { calibration: string; declared: string };  // declared line contains
                                              // “no producer yet — inert on real data”
export const SHARED_CULTURE_NOTES: readonly string[];
export function quantile(values: readonly number[], q: number): number;       // nearest-rank
export function measuredValues(library: Library | undefined, field: string): number[];
export function resolveLexConstraint(c: LexConstraint, library: Library | undefined):
  | { ok: true; field: string; op: LexOp; value: number | [number, number] | string[] }
  | { ok: false; note: string };
export function bundleScale(goal: Goal): number;
export function emittedWeight(c: LexConstraint, scale: number): number;
export function emittedBundleWeights(goal: Goal): number[];
```

`plan.ts` type after edit: `sequencing?: { arc: "flat" | "build" | "cooldown" | "peak" | "wave" }`.

## Analysis — decisions made, and why

1. **Soft-only + bundle-total normalisation.** A1's bundles F (1.70), P (2.10), D (2.00), S (2.15/2.35) exceed the pack's own "bundle total ≤ 1.0" convention if every row emits. Emitted weights are therefore floor-normalised (scale = 1/Σ; per-term `researchWeight` preserved for traceability; calibration/C rounds can check the mapping). This is **score-neutral**: evaluate.ts scores soft terms as a weighted average (`Σw·sat / Σw`), so scaling changes nothing but satisfies the dominance rule literally. Non-exceeding bundles (catharsis, nostalgia, drive, chores) emit A1's exact numbers.
2. **Curation within A1 rows** (documented in lexicon/caveats): P2 "instant max" and the `instrumental ≥0.85` alternative are labelled alternatives and not emitted by default; S10 (vocal_fraction) applies to **sleep** only ("branch by goal wording"); V2's suggested −0.2 penalty is **not representable** in plan v2.0 (weights are 0.001–1) and is dropped with an explicit caveat; swing/microtiming rows stay off (A1 w0, A2 "never call it feel").
3. **Library-relative bands.** A1 §2.0 recommends quantiles over absolute thresholds, so quantile bands resolve from the current library at interpret time (nearest-rank, ≥3 measured tracks); otherwise the term is **skipped with a note** — never an invented absolute fallback. Consequence: the same text can resolve to different plan values on different libraries (intended); a *saved* plan freezes the resolved numbers at save time.
4. **Declared fields ⇒ `unknown_policy: "neutral"` + inert note.** The plan schema is closed (no per-constraint note), so the exact note "no producer yet — inert on real data" travels in each declared constraint's `mechanism` (lexicon) and in the shared assumption line (readings). No lexicon-emitted constraint is ever hard; the only hard rules in a plan are the user's own words (draft), and explicit exclusions remain hard (CONTEXT rule). The intent tests assert: no `goal_*`/`mod_*` constraint is hard; declared-field constraints are neutral; the only hard-on-declared constraints are `explicit_exclusion: true` (the sanctioned carve-out).
5. **Contradiction policy (ordered):** goal-opposition → documented fast+calm pair → hard numeric empty intersection (closed-interval approximation). Each yields **two readings** with tie-break to the first; each side force-drops the *other side's draft proxies* (fix found by adversarial probe: a "pump me up" reading was keeping the draft `calm` constraint); user exclusions are never dropped. "fast + calm/relaxing" gets the task-specified readings: (A) keep bpm-high + low loudness/percussion, (B) drop the fast side; the pair is documented in the lexicon.
6. **Residue is recomputed, lexicon-aware.** Draft's `unparsed` doesn't know what the interpreter mapped, so residue = text minus (draft-recognised spans ∪ lexicon spans ∪ negated spans ∪ unsupported-ask spans), then cleaned with draft fillers + an extra stopword list. This drives `specific` vs `partial`, the residue ask, and `impossible` vs `vague` (content claims: unsupported asks or non-filler residue). The draft's own "Not understood yet…" assumption is replaced by the recomputed line so a reading never claims the same text was understood and not-understood at once.
7. **Fallbacks don't fabricate.** Vague and impossible return `readings: []`, `chosen_index: -1`, and 1–3 plain-language asks with reasons (+ nearest_supported where relevant). Reads at most 3 asks everywhere (test-asserted).
8. **Arc merge:** goal arcs override draft flat; priority peak > build > wave > cooldown > flat (documented; pump→build, dance→peak (closest single arc to "build to peak, then wave"), calm/sleep→cooldown, others flat). Max 2 goal bundles merge per reading (schema's 32-constraint cap safety; audit-noted).
9. **Sequence proxy** (produced fields only): weighted average of clamped bpm [60,180] (w .35, ×0.5 when `tempo_confidence` < 0.5 **or unknown**), onset_rate [0,8] (w .25), percussiveness [0,1] (w .20), lufs_integrated [−24,−4] (w .20 — smallest, per A2 "loudness ≠ intensity"). Unknown components skip; no components ⇒ unknown. Coverage < 60 % ⇒ input order + note "not enough measured intensity (N% coverage)". Unknown-intensity tracks **keep their original positions**; measured tracks fill the rest (deterministic, documented; "null is never zero" — unknown never sorts as low).
10. **Hash note (required):** plans that carry arcs now hash differently than when those arcs were dropped and reported as unsupported asks — i.e., `{arc:"build"}` now contributes to the SHA-256 instead of being stripped. `flat` plans hash exactly as before; `PLAN_VERSION` and `REGISTRY_VERSION` are untouched; `resolveSmart` ignores its stored `_hash`, so no migration is triggered. The deliberate query.test.ts addition pins this (arcs validate, round-trip, and hash ≠ flat).

### Follow-up fix — harness cross-check (folded into this pass)

- **Probe:** `"play me something good"` → `impossible` (expected `vague`). Also reproduced on "put on something for later", "queue up something nice", "start me something".
- **Root cause:** surface verbs ("play", "put", "queue", "start") were not in `EXTRA_FILLER`, so they survived residue cleanup as content; `hasContentClaims()` then classified the request as `impossible` ("names something specific we cannot measure") instead of `vague`. One-word class: glue, not content.
- **Fix:** `EXTRA_FILLER` extended with `play|plays|playing|played|put|puts|queue|queues|queued|start|starts|started|starting|up`. Nothing else changed (single regex + comment).
- **Test:** new `"surface verbs stay glue"` regression test covering all four probes (vague, no readings, 1–3 asks, readings sane). My suite counts: 11 intent + 8 sequence = 19, all passing.
- **Re-verification:** full brain suite 205 / 203 / 1 (pre-existing librarian) / 1 skip; type-check exit 0; no other test or probe behaviour changed.

## Anything the integrator (B5) must know

1. **Draft route**: thread `interpretGoal(input.prompt, { library: currentLibrary(), now: Date.now() })` and return it additively (A4 §3(b) recipe). Each `reading.plan` has already passed `validatePlan` inside interpret, but the objects are raw plan records — either re-validate cheaply or expose summaries; keep raw plans out of the response if you follow A4's privacy/explainability note. `chosen_index: -1` means "no reading" (vague/impossible) — UI should render the asks then, not a plan.
2. **Resolve/preview**: sequence is **post-evaluate, strict tier only, synchronous**: `const sequenced = sequenceTracks(evaluation.strict, checked.plan, { library: currentLibrary() }); return { ...evaluation, strict: sequenced.tracks, sequencing_applied: sequenced.applied };` Keep `near_miss` untouched. `applied` is `string[]` of human-readable notes; `[]` means flat/no-op — don't render "sequencing: " empty labels.
3. **Until B5 wires it, arcs validate but nothing re-orders** — expected; don't smoke-test ordering through resolve before wiring.
4. **`opts.now` is accepted and deliberately unused** (no time-dependent content exists yet); passing `Date.now()` is safe and keeps the route signature stable. Determinism of interpret = f(text, library) only.
5. **Ties in contradictory readings** resolve to index 0 (side A). If the UI shows one reading, show both labels/asks or a chooser; silently applying A would contradict the "nothing silently chosen" promise.
6. **Saved plans freeze resolved values** (quantile bands resolved at draft time). A library change re-resolves only on re-draft; existing saved plans keep their numbers — this is intentional (hash stability of saved playlists) and worth one line in the production notes.
7. Scratch/manual checks: `node --experimental-strip-types` import of `src/intent/interpret.ts` works with inline fixture libraries (see tests), no env vars needed. Full suite still shows the librarian failure — pre-existing, not this module.

## Gaps and risks

- **Trigger phrases are curated, not learned.** False positives are possible ("party" is broad; "quick"/"fast" modifiers are guarded against bpm-comparator phrases but not against every colloquialism). Documented stance: conservative lists; unmatched text → unparsed/asks, never guessed.
- **Negation scan duplicates draft.ts's pattern** (plus n't forms). If draft.ts's negHead ever changes, keep them in sync (noted in-code). A shared helper would be the right refactor later.
- **Numeric-conflict detection is a closed-interval approximation** — a conflict provable only on strict bounds (`> 140` vs `≤ 140`) is missed; documented trade-off.
- **Normalised bundle weights** deviate from A1's literal per-term numbers (researchWeight retained; score-neutral). C3 should sanity-check the mapping; C1 can verify the ≤1.0 totals (`emittedBundleWeights` exported for exactly that).
- **Culture notes are metadata** (per-goal `culture` + `SHARED_CULTURE_NOTES`): the "bands = starting points" part is surfaced in readings; the metre-convention ban is code-level (no metre fields exist and none are emitted) but not yet rendered in UI copy — C2 may want a surfaced line.
- **Fixtures are synthetic** — they prove logic, not classifier accuracy; bands remain research starting points (A1/A2 own that caveat).
- **`status/§1.1` machine stress**: max merged bundle ≤ 20 constraints + draft ≤ ~8 + extras ≤ 2 ⇒ under the 32 cap; the while-loop guard exists for pathological blends and is audit-noted, not silently truncating.

## Suggested final-report placement

- **Ch. 1 (translation layer)**: the accuracy ladder + the three readings' design (specific/partial/contradictory/vague/impossible), the flagship & misparse transcripts, the fast+calm pair — with §2 of this receipt as the engineering anchor.
- **Ch. 2 (fast learning brain)**: sequencing module (arcs, intensity proxy, coverage gate, unknown placement) as the completion of the roadmap's "non-flat arcs" extension target; note that learned arc preferences slot in later via the same `plan.sequencing`.
- **Ch. 3 (bias, culture & reliability)**: culture notes, "never hard-enforce metre/tempo conventions", library-relative quantiles instead of absolute bands, declared-field inertness, A2 §4 attribution on the goal profiles.
- **Ch. 4 (verification & handoff)**: test counts/method (validatePlan gate on every reading; determinism; coverage gate; the two pre-existing environment reds), plus the B5 integration notes above.
- **Appendix**: per-goal bundle tables (field/op/band/researchWeight/emittedWeight/refs) straight from `lexicon.ts`.

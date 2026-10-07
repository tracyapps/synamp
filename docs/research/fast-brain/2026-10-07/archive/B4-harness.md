# B4 — Verification harness & baseline (receipt)

Status: complete · Author: B4 verification engineering subagent · Date: 2026-10-06 (evening CDT)
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree dirty with B1/B2/B4 edits, no commits)
Scope written: `tools/brain-lab/**` (sole writer) + `evidence/baseline/`, `evidence/brain-lab/` under this cluster dir. Nothing else touched.

---

## Conclusion

**Harness built, runnable with one command, deterministic; baseline evidence captured.** All seven required scenarios run
end-to-end against the live repo modules. At the canonical capture (2026-10-06 23:09:50 CDT): **7 scenarios — 6 pass,
1 fail; 63 checks pass · 1 fail · 0 pending · 5 skip.**

The single failure is a targeted, actionable verification finding (not a harness defect): intent-v1 classifies
**“play me something good” as `impossible` instead of `vague`** because the verb **“play” is missing from the interpreter's
residue filler list** — B1's own test pins the analogous phrase “something good for later idk” as `vague`, so this is a
one-word reconciliation (`EXTRA_FILLER` in `apps/brain/src/intent/interpret.ts` ~L432, add `play|playing`). See §Analysis 1.

**Module-land note (important):** B1's `intent/**` + `query/sequence.ts` and B2's `learning/**` **landed while B4 was
running** (23:02–23:09 CDT). The harness was built to run in both worlds and simply flipped from `pending` to real checks
as files appeared; nothing was stubbed at any point. Evidence runs before 23:06 show some checks pending — sequence and
intent; the canonical 23:09:50 run has **zero pending**.

---

## Evidence

### A) Baseline (mandate A) — done, first

- Logs copied into `evidence/baseline/`: `synamp-brain-test.log`, `synamp-typecheck.log`, `synamp-librarian-test.log`
  (+ B4's own re-run `brain-test-rerun-2026-10-06T2258CDT.log`).
- Summary page: **`evidence/baseline/BASELINE.md`**.
- Re-run verbatim: `cd /Users/tapps/_dev/web-apps/SynAmp && pnpm --filter @synamp/brain test`
  → **tests 149 · pass 147 · fail 1 · skipped 1** (duration 667.6 ms), started 2026-10-06T22:58:15-0500, ended 22:58:16.
  Identical to A4's earlier capture (696.4 ms). The 1 fail = pre-existing macOS case-fold librarian test
  (`librarian.test.ts:149`, deterministic); the 1 skip = `/dev/shm` cross-disk case. Parallel edits had not landed at
  re-run time (git HEAD still `b6ea5ce1`), so counts were directly comparable.
- Root `pnpm type-check` still stops in vendored webamp (pre-broken chain); per-filter receipts `@synamp/brain` and
  `@synamp/web` type-check exit 0. Both carried reds are described in BASELINE.md.

### B) Harness (mandate B) — built and run

**Entry point (one documented command, verified):**

```
$ cd /Users/tapps/_dev/web-apps/SynAmp
$ node --experimental-strip-types tools/brain-lab/lab.mts
```

Exact tail of the canonical run (2026-10-06T23:09:50-0500):

```
[brain-lab] SUMMARY — scenarios: 7 (6 pass, 0 partial, 0 pending, 1 fail)
[brain-lab] checks: 63 pass · 1 fail · 0 pending · 5 skip
[brain-lab] modules not loaded: (none)
[brain-lab] RESULT: FAIL — 1 check(s) failed
```

Exit code 1 (assertion failure, by design; after the B1 “play” fix this is expected to be exit 0).
Options: `--json <path>` (machine-readable evidence, schema `synamp.brain-lab/1`), `--only <substr>`, `--list`, `--help`.
Also verified: runs from any CWD; two consecutive runs byte-identical modulo `generated_at` (determinism).

**Harness files (all under `tools/brain-lab/`, sole-writer):**

| file | role |
|---|---|
| `lab.mts` | entry: args, module table, trace, summary, JSON evidence, exit code |
| `lib/util.mts` | paths/JSON/read-only git info |
| `lib/modules.mts` | dynamic loader — missing modules reported, never stubbed |
| `lib/checks.mts` | `ScenarioRun` collector: pass · fail · pending · skip, expected/actual for every failure |
| `lib/events.mts` | deterministic `ListeningEvent` builders (field-for-field vs `session/events.ts`) |
| `lib/runner.mts` | `phrase` + `learning` scenario runners; resolve composition |
| `scenarios/01..07-*.json` | the seven required scenarios |
| `README.md` | commands, formats, how to add scenarios, limitations |

**Scenarios & results at canonical capture** (`evidence/brain-lab/lab-run-2026-10-06T230950CDT.{log,json}`):

| scenario | result | key values |
|---|---|---|
| 01-three-phrases | **pass** (14·0·0·2) | all three phrases `specific` with valid chosen readings (focus / “pump up” / “dance”); “focus” also runs draft→validate→evaluate (strict 24/25, hash `05ceb529…`) |
| 02-vague | **fail** (7·1·0·2) | `some music please` → `vague` ✓; `play me something good` → `impossible` — **the open finding** (§Analysis 1) |
| 03-contradictory | **pass** (5·0·0·0) | “fast relaxing bangers” → `contradictory`, two readings “energetic but soft” / “literally calm”, both plans validate |
| 04-impossible | **pass** (10·0·0·1) | “songs with exactly three clarinets” → `impossible` + asks; “instrumentals with heavy lead vocals over 300 bpm” → `partial` (range-asserted, never `specific`) and resolve underfills honestly (strict 0) |
| 05-fast-learning | **pass** (11·0·0·0) | skips ×2 → `epochHides=[sample-026, sample-028]`; keeps adjust `+1.59…` with visible parts (entity + centroid, e.g. “tempo ~99 BPM — you kept 3 such tracks”); resolve: kept tracks #33→#0, #23→#2, #39→#1, skips hidden; `sequenceTracks` preserves the set |
| 06-isolation | **pass** (8·0·0·0) | same stream at `now+16h`: all five probes `+0.000` no parts, hides empty, **resolve byte-identical to baseline**; reliability note “no active session — learning is paused” |
| 07-forget | **pass** (8·0·0·0) | + `learning_reset` marker: zero/empty everywhere, resolve identical; note “session learning was reset…” |

**Evidence paths (cluster):**

- Canonical: `evidence/brain-lab/lab-run-2026-10-06T230950CDT.log` + `.json` (git HEAD, module hashes, all checks with expected/actual).
- Mid-flight capture (modules partially landed): `evidence/brain-lab/lab-run-2026-10-06T230647CDT.{log,json}` — kept to show the pending→landed transition.
- Baseline: `evidence/baseline/` (see §A).
- Module hashes at canonical capture: `interpret.ts f260b2606784acd7…`, `derive.ts d54438d7291d7255…`, `sequence.ts b21984264db19be0…` (sha256 prefixes; re-run before quoting if B1/B2 edit further).

---

## Analysis

### 1) Open finding: `play …` phrases miss the `vague` class (scenario 02)

- Observed: `interpretGoal("play me something good")` → `accuracy: "impossible"`, `readings: []`, ask text “**‘play’ is too
  specific** for what I can measure today.” — the phrase has no specific content; “play” is a filler verb.
- Root cause (code read): `computeResidue()` strips `DRAFT_FILLER` + `EXTRA_FILLER`; `EXTRA_FILLER` contains
  `something|anything|good|…` but **not `play`**, so “play” survives into the residue; `hasContentClaims()` returns true
  when residue is non-empty → `impossible`.
- B1's own `intent.test.ts` pins “something good for later idk” as `vague` — the intent is clearly that this phrase
  family is vague; the fix candidate is one word (`play|playing`) in `EXTRA_FILLER` (interpret.ts ~L432), or a smarter
  specificity rule. **B4 did not touch `intent/**`** (not B4's file); this is routed to B1/B4b.
- Expected value in the scenario: `vague` (kept strict; the scenario `note` documents the adjudication; the canonical
  probe `some music please` separately guards the vague path so a “fix” can't regress it).

### 2) Harness-side decisions recorded (so reviewers can trust the checks)

- **Structural relaxation (author fix):** the first draft of `intent-structural` required ≥ 1 reading. The frozen
  interface + B1's documented fallback allow `readings: []` with `chosen_index: -1` (asks must carry the next step).
  Relaxed to: any count of well-formed readings; `chosen_index` −1 iff empty; asks non-empty when no readings. This was
  B4 correcting its own over-constraint, not a repo change.
- **Hide union at the resolve seam:** `deriveEpochPolicy` keeps `removed()` (persistent removes) and `epochHides()`
  (epoch hides) separate; decision 3 says hides = union. The harness wraps the view so `removed(playlistId)` returns the
  union when composing the resolve (idempotent if B5 later unions at the evaluate seam; single place to update in
  `runResolve`).
- **Sign of hidden tracks not asserted:** a twice-skipped track's combined adjust can legitimately stay positive
  (centroid terms can dominate the skip penalty); the operative signals are the hide + `negative_parts` (both asserted).
  An earlier `adjust_negative` expectation was removed as an over-assertion after inspecting the numbers.
- **`learning_reset` marker shape used:** `{signal:"learning_reset", scope:"none", detail:{scope:"epoch"}}` appended
  inside the epoch; verified to clear evidence against B2's implementation.
- Fixture caveat preserved: the sample library is synthetic; nothing here is evidence about real music.

### 3) What ran vs “pending module land”

- **Nothing is pending anymore.** At build time intent/learning/sequence were absent by design of the test brief
  (“runnable while authors are mid-flight”); they landed during the window and all dependent checks ran at capture.
- The five `skip`s are honest not-applicable marks: draft previews for “pump”/“dance”/vague/impossible-clarinets do not
  validate (draft.ts is unchanged) so evaluation cannot run there — the interpretation path covers those phrases instead.

---

## Gaps and risks

1. **One red check to reconcile (B1):** see §Analysis 1 — either fix `play` in the filler list, or update scenario 02
   with a documented rationale. Until then the lab exits 1 by design.
2. **Integration seam not testable from the lab:** `index.ts` wiring (routes, resolve pipeline, `/plans/draft`
   interpretation payload) starts a server and is B5's domain; the lab tests module-level + composed-resolve behavior.
   B4b/C-round should add route-level smoke (curl transcript) when B5 lands; further lab extension is a documented
   single-place change (`runResolve`).
3. **Moving target:** B1/B2 were editing at capture (23:08–23:09 mtimes). Always quote the lab JSON (it embeds git HEAD
   + timestamps) and re-run before citing. The learning module's own tests also landed (`learning/*.test.ts`,
   `intent/intent.test.ts`) — the brain suite count will have grown; the baseline 147/149 pre-dates them.
4. **Scope already covered elsewhere, not duplicated here:** P1 gap boundary (29:59/30:01), P5 flood bounds, `not_now`
   hide, proposals thresholds, rollback diff — listed as future scenario candidates in the README (format supports
   adding them without code changes except new assertion shapes).
5. **No pnpm install / no commits / no git mutation** were performed (per brief). The lab itself reads git read-only for
   evidence metadata.

## Next smallest experiments

1. B1/B4b: add `play|playing` to `EXTRA_FILLER` (or equivalent) → re-run `node --experimental-strip-types
   tools/brain-lab/lab.mts` → expect 7 pass, 0 fail, exit 0; refresh `evidence/brain-lab/`.
2. B4b: after B5 wiring, add a route-level smoke stage (or accept B5's curl transcripts) and re-run the lab with B5's
   final module state; compare `learning-resolve-*` values against the canonical JSON captured here.
3. C1: adversarial re-derivation of the five learning check groups using the lab JSON as the fixture of record.

## Suggested final-report placement

- **Chapter 2 (fast learning brain):** scenario 05/06/07 results (hide/reorder/zero-at-+16h/reset) + the decision-3 union
  note; module-land timeline shows the seams went live without stubs.
- **Chapter 4 (verification & handoff):** canonical lab run + `BASELINE.md` + the baseline reds (librarian macOS
  case-fold; webamp root type-check chain) + the scenario-02 adjudication item as the single open verification finding;
  cite `evidence/` paths; note determinism (two runs identical modulo timestamp).
- **`brief.md`:** link `tools/brain-lab/README.md` as the how-to; link the canonical JSON as the machine-readable
  acceptance artifact for DELIVERY/verification.

## Receipt checklist (repo conventions)

- **Confirmed:** harness runs (one command, verified tail above); baseline captured + re-run (149/147/1/1); all 7
  scenarios execute; learning probes pass at canonical capture; determinism (2×) and CWD-independence verified; no
  writes outside `tools/brain-lab/**` + cluster evidence dirs.
- **Not done:** B1's `play` filler fix (not B4's file); route-level smoke (B5 domain); brain-suite re-count after new
  tests (deliberately out of scope — mandate said once; baseline stands as capture).
- **Unverified:** long-run behavior under real listening data (no real data in scope); B5's eventual union placement
  inside `evaluate.ts`/`index.ts` (lab proves the semantics only through the harness composition).
- **Next smallest experiment:** the one-word filler fix + re-run (expect exit 0).

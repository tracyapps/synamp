# B4b — Harness refresh & final lab (receipt)

Status: complete · Author: B4b (harness owner) · Date: 2026-10-06/07 (evening CDT)
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree dirty; **no commits made** — per task; no `pnpm install` run)
Scope written: `tools/brain-lab/**` (sole writer) + this receipt + cluster `evidence/final-lab/**`. No brain/web/docs files touched; reviewers' files read-only at all times.

---

## Conclusion

- **The lab is green and canonical.** Final state: **7 scenarios / 66 checks pass · 0 fail · 0 pending · 5 documented skips**, exit 0. (The task brief said "expect 64 checks": that was the pre-refresh count, reproduced below; the refresh converts two of the old skips into real checks, so the pass count is now 66 — mapping given in §Task 3.)
- **Determinism re-proven at final state:** two consecutive runs are byte-identical JSON except `generated_at`; a third run from a different CWD produces the same normalized output (sha256 `6532f3f3…37ab3a`, all three runs).
- **Resolve composition verified against current app semantics (task 2):** `index.ts` + `evaluate.ts` union `feedback.removed(playlistId ?? "") ∪ adaptive.epochHides()` at the evaluate seam. The harness previously re-implemented that union (`effective.removed = removed ∪ epochHides`, feedback only). Net hide-set was already equal, but the harness was **updated to mirror the app literally**: the combined view is now passed as **both** `feedback` and `adaptive` exactly as `policyOptions()` does, so the union is applied by `evaluate.ts` itself. Delta documented in §Task 2; all resolve numbers are bit-identical pre/post (no semantic change, only "who applies the union").
- **All 5 skips inventoried, none silent:** 2 converted to a real check (`intent-chosen-evaluates` for pump/dance via the B1 chosen reading — both evaluate 25/25 strict), 3 justified one-by-one in the README register (vague×2, impossible-clarinets — genuinely not applicable by design).
- **Fingerprints recorded** (`evidence/final-lab/hashes.txt` + `run.json`): brain modules at final state (intent/*, learning/*, query/{plan,sequence,evaluate}.ts, index.ts, session/{events,feedback}.ts) plus the harness itself.
- **Canonical evidence saved** to `.cluster/synamp-fast-brain/evidence/final-lab/`: `lab.stdout.log`, `lab.json`, `hashes.txt`, `run.json`, `EVIDENCE.md`, determinism artifacts, pre-refresh reference. README updated (composition note, skip register, resolved adjudication, canonical evidence paths).

---

## Exact commands + observed outputs

### 1) Pre-refresh re-run (state the task was written against — green, 64 checks)

```sh
cd /Users/tapps/_dev/web-apps/SynAmp
node --experimental-strip-types tools/brain-lab/lab.mts                      # run 1 (pre-refresh)
node --experimental-strip-types tools/brain-lab/lab.mts --json /tmp/b4b/run1.json
node --experimental-strip-types tools/brain-lab/lab.mts --json /tmp/b4b/run2.json
```

```
[brain-lab] git HEAD b6ea5ce1 @ feat/fast-learning-brain (working tree dirty) · node v24.13.0
══════════════════════════════════════════════════════════════
[brain-lab] SUMMARY — scenarios: 7 (7 pass, 0 partial, 0 pending, 0 fail)
[brain-lab] checks: 64 pass · 0 fail · 0 pending · 5 skip
[brain-lab] RESULT: OK — all checks pass
```

Pre-refresh determinism: raw diff of the two JSON runs = `generated_at` only; normalized content equal (`shape hash 01cde21eb745ca2a`). This state is preserved as `evidence/final-lab/prerefresh-run.json` / `prerefresh-run.log`.

### 2) Final refresh runs (after harness edits; two runs + a run from a different CWD)

```sh
cd /Users/tapps/_dev/web-apps/SynAmp
node --experimental-strip-types tools/brain-lab/lab.mts --json /tmp/b4b/final-run1.json   # canonical
node --experimental-strip-types tools/brain-lab/lab.mts --json /tmp/b4b/final-run2.json   # determinism
cd /tmp && node --experimental-strip-types /Users/tapps/_dev/web-apps/SynAmp/tools/brain-lab/lab.mts --json /tmp/b4b/final-cwd.json   # CWD independence
```

Canonical run header + tail:

```
[brain-lab] run 2026-10-07T04:39:54.007Z · repo /Users/tapps/_dev/web-apps/SynAmp
[brain-lab] git HEAD b6ea5ce1 @ feat/fast-learning-brain (working tree dirty) · node v24.13.0
...
══════════════════════════════════════════════════════════════
[brain-lab] SUMMARY — scenarios: 7 (7 pass, 0 partial, 0 pending, 0 fail)
[brain-lab] checks: 66 pass · 0 fail · 0 pending · 5 skip
[brain-lab] RESULT: OK — all checks pass
```

Raw diff run 1 vs run 2:

```
3c3
<   "generated_at": "2026-10-07T04:39:54.007Z",
---
>   "generated_at": "2026-10-07T04:39:54.185Z",
```

Normalized comparison (all fields except `generated_at`; python json round-trip, sort_keys):

```
run1 == run2 (normalized): True
run1 == cwd  (normalized): True
normalized content sha256 (all three identical): 6532f3f3eb85b4f2546ceed5da3b89b5efedef0d51c93f732a25ef5da937ab3a
```

CWD run tail (exit 0; `repo.root` still resolves to the repo from its own file path):

```
[brain-lab] SUMMARY — scenarios: 7 (7 pass, 0 partial, 0 pending, 0 fail)
[brain-lab] checks: 66 pass · 0 fail · 0 pending · 5 skip
[brain-lab] RESULT: OK — all checks pass
[brain-lab] JSON evidence → /tmp/b4b/final-cwd.json
```

### 3) Scenario 01 tail — the two converted checks (real evaluations via the B1 reading)

```
    SKIP  pump/pipeline-evaluate — legacy plan did not validate — evaluation not applicable (when a B1 chosen reading validates, its plan is evaluated by intent-chosen-evaluates)
    PASS  pump/intent-structural — accuracy=specific, readings=1, chosen=0, parser="intent-v1 (rule-based: draftPlan + goal lexicon; no LLM)", asks=0, audit=2
    PASS  pump/intent-chosen-validates — ok (hash fd2dce2d8a3a)
    PASS  pump/intent-chosen-evaluates — strict 25/25, near 0, unique=true, allInLibrary=true, underfilled=false (via B1 chosen reading)
    ...
    PASS  dance/intent-chosen-validates — ok (hash b50e2fbbc7b4)
    PASS  dance/intent-chosen-evaluates — strict 25/25, near 0, unique=true, allInLibrary=true, underfilled=false (via B1 chosen reading)
  → PASS — 16 pass, 0 fail, 0 pending, 2 skip
```

### 4) Scenario 05 tail — resolve through the mirrored app seam (same numbers as pre-refresh)

```
    · resolve feedback view: combined view as feedback + adaptive (mirrors index.ts policyOptions in epoch mode; evaluate.ts applies the removed(playlistId) ∪ epochHides() union at the resolve seam)
    PASS  learning-resolve-plan — ok (hash 8beb2ab87af5)
    PASS  learning-resolve-runs — adapted strict 58 · hidden 2 · baseline strict 60
    PASS  learning-resolve-hidden — hidden=[sample-026, sample-028]
    PASS  learning-resolve-improves — sample-034: #33 → #0 ↑ | sample-024: #23 → #2 ↑ | sample-040: #39 → #1 ↑
  → PASS — 11 pass, 0 fail, 0 pending, 0 skip
```

---

## Task 2 — resolve composition vs **current** app semantics (delta documented)

What the app does now (read at final state):

- `apps/brain/src/index.ts` → `policyOptions(playlistId)` (epoch mode, the shipped default): passes the **same combined view** as both slots — `feedback: view`, `playlistId`, `adaptive: view` — where `view = deriveEpochPolicy(...)`.
- `apps/brain/src/query/evaluate.ts` applies the decision-3 hide union at its seam:
  `hiddenIds = feedback.removed(playlistId ?? "") ∪ adaptive.epochHides()` (legacy behaviour preserved: no adaptive + no playlistId ⇒ `removed("")` empty).

What the harness did before this refresh: it built `effective = {...view, removed: pid => view.removed(pid) ∪ view.epochHides()}` and passed it as `feedback` only (no `adaptive`). Net hide-set was **already set-equal** to the app's union (unions are idempotent), but the union was computed harness-side and evaluate's `adaptive` path was not exercised.

**Delta applied (harness now mirrors the app literally):** in the combined-view branch, `runResolve` passes `{ feedback: view, playlistId, adaptive: view }` — exactly `policyOptions()` — and the union is applied by `evaluate.ts`. A harness-side composition remains **only** as a fallback for module shapes without the combined view (`composeEpochView`, never the shipped shape).

**Proof the delta is semantic-free:** scenario 05 pre-refresh (harness-side union) vs post-refresh (evaluate-side union) — `adapted strict 58 · hidden 2 · baseline strict 60`; hidden `[sample-026, sample-028]`; improves `#33→#0, #23→#2, #39→#1`; 06/07 `strict equal=true, hidden equal=true`. Identical numbers; only the trace note text changed.

---

## Task 3 — skipped-checks inventory (5 skips; none silent)

| # | Skip | Action taken |
|---|---|---|
| 1 | `01-three-phrases` › `pump/pipeline-evaluate` | **Converted**: B1 chosen reading ("pump up") is evaluated by new real check `pump/intent-chosen-evaluates` — strict 25/25. Skip retained with an explicit reason (marks the *legacy* pipeline leg specifically, which has no enforceable plan). |
| 2 | `01-three-phrases` › `dance/pipeline-evaluate` | **Converted**: same — `dance/intent-chosen-evaluates` strict 25/25. |
| 3 | `02-vague` › `vague-canonical/pipeline-evaluate` | **Justified in README register**: "some music please" is vague by design (nothing enforceable ⇒ nothing to evaluate); answer contract `asks[] ≥ 1` asserted by `intent-structural`. |
| 4 | `02-vague` › `vague-play/pipeline-evaluate` | **Justified in README register**: same after B1's filler fix — `accuracy=vague`, no readings; `asks[] ≥ 1` asserted. |
| 5 | `04-impossible` › `impossible-clarinets/pipeline-evaluate` | **Justified in README register**: impossible by design (nothing enforceable); `asks[] ≥ 1` asserted; evaluation genuinely not applicable. |

Check-count mapping for the "expect 64 checks" brief: 64 passes → **66 passes** (+2 `intent-chosen-evaluates`), skips 5 → 5 (2 now covered + reason-rich, 3 justified), fails 0 → 0, pending 0 → 0.

---

## Tasks 4/5 — fingerprints & canonical evidence

`/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/final-lab/`:

| file | what |
|---|---|
| `lab.stdout.log` | canonical run stdout (run 1) |
| `lab.json` | canonical `--json` evidence, schema `synamp.brain-lab/1` |
| `hashes.txt` | sha256 of brain modules (task list) + harness files at final state |
| `run.json` | machine-readable summary: timestamps, counts, commands, normalized hash, module + harness hashes |
| `EVIDENCE.md` | one-paragraph what/when/commit-ish summary |
| `determinism.txt` | commands + raw diff + normalized comparison + CWD-run result |
| `determinism-run1.json`, `determinism-run2.json`, `cwd-run.json`, `cwd-run.log` | re-verifiable determinism artifacts |
| `prerefresh-run.json`, `prerefresh-run.log` | pre-refresh state (64 pass / 5 skip) for the delta trail |

Key module hashes (full list in `hashes.txt`, keys verified present in this receipt's capture):

```
6d9089758d4c4da381b5cddb2f622ca70fdbab04b43bf512a8b61429ab498910  apps/brain/src/intent/interpret.ts
26ba75e3b7b186a7d6237cd8614a5accca5aab14b7570bb32ed0e8dc811036e5  apps/brain/src/intent/intent.test.ts
2accbb92f5f0b4f1c57b0798479f9fcca8666086e5f2435c83895e1e18d490ad  apps/brain/src/intent/lexicon.ts
d54438d7291d725577ba412a39a8630e7427e300b2d11b07aaa21cfb9bafa0ca  apps/brain/src/learning/derive.ts
f27742d28f22f810f0bf240fe9ed0a81b6defc1470dcb5484557a438775c34e1  apps/brain/src/learning/epochs.ts
4d206ffff5e7bab516fd5adbf34cb365c8c8b53647b51f291063709fca78f74e  apps/brain/src/learning/explore.ts
deff0bfd27725a43ea3b0c197246f20229f5f06c81dd47c0aaebc9af6bbc9cac  apps/brain/src/learning/proposals.ts
bd9339e8842722d88ab5e5e8c9b37a459bff48dd57143ba3988f15bfa34f17a5  apps/brain/src/learning/reliability.ts
af41278d074615117f95dd09503cac94357c829de9cccecee86f3ff2be9d43ab  apps/brain/src/learning/types.ts
a6e84443a2eab983fd00861cb34f7bd339e3d4c07b1758cdb057f1812ac5168e  apps/brain/src/query/plan.ts
b21984264db19be0976a7e30c295c9b5a1929990bf71ba0387fc939b8b418426  apps/brain/src/query/sequence.ts
0ecaf85e737d4e84e7b912ca0f4c473bfad7331463c1e7138e1d8415f24a2e70  apps/brain/src/query/evaluate.ts
a2f2351dcb1ced0b23ae5b22ac8c3ced54b9e5ce882976a7591e6db77665d28e  apps/brain/src/index.ts
4ace21e8db550d6bf19c5c9746b04315bfa98f3bfad1a15ee959f120ad9b708e  apps/brain/src/session/events.ts
9ca928d326178d85dceeb890469f7fc8ea4142a1a18eceb4f96279d2558200ad  apps/brain/src/session/feedback.ts
```

(Test files and remaining learning files also in `hashes.txt`; `run.json.module_hashes` carries the full 20-file map.)

Harness pins (for re-quoting this instrument): `runner.mts b5e354c471cc96f8…`, `README.md 69353c626e9d4b0e…`, `scenarios/02-vague.json afb6eeb8e9a4cd6e…` — full list in `hashes.txt`.

---

## What changed and why (files touched — nothing else)

1. **`tools/brain-lab/lib/runner.mts`**
   - Resolve composition: now passes the combined view as `feedback` **and** `adaptive` (mirrors `index.ts` `policyOptions()`); union applied by `evaluate.ts`. Why: task 2 — instrument must mirror the current seam; keeps working if the app moves the union again because the lab now exercises the app's own code path.
   - New converted check `intent-chosen-evaluates`: when the legacy plan fails validation but the chosen reading validates, evaluate the reading's plan (the same plan `/plans/draft` previews) with the standard invariants. Why: task 3 — converts 2 of the 5 not-applicable skips into real end-to-end evidence for the user's three example phrases. Skip reasons updated to state precisely what remains not-applicable and where coverage lives.
   - Comments/docstrings updated; fallback composition clearly marked fallback-only.
2. **`tools/brain-lab/scenarios/02-vague.json`** — note updated from "open adjudication (addressed to B4b)" to "resolved": B1's filler/quality lexicon now classifies `play me something good` as `vague` (re-verified; both probes pass). Why: the note was stale/self-addressed; leaving it would quote as an open problem.
3. **`tools/brain-lab/README.md`** — B4b refresh: intro line; commands section now documents the canonical evidence path + CWD/determinism re-verification; phrase-checks list documents `intent-chosen-evaluates` and the precise skip semantics; learning-resolve bullet now describes the mirrored seam (no more "harness-side union" language); scenarios table 01 row notes end-to-end coverage; limitations section re-stamped with the B4b capture, adjudication item resolved, **skipped-checks register** added, composition + determinism notes corrected.

No other files were modified; no commits; no installs.

---

## README limitations section (verbatim, as required by the task)

## Known limitations & notes (state as of the B4b refresh capture, 2026-10-07; canonical files in the cluster
workspace `evidence/final-lab/`)

- **Module state at capture:** all seven modules loaded and frozen; B1 (`intent/**`, `query/sequence.ts`), B2
  (`learning/**`) and B5 integration (evaluate hide union, epoch-policy default, `POLICY_VERSION` bump) have
  landed. Results are deterministic given this module state; the JSON evidence records git HEAD + timestamps.
  Re-run the lab before quoting in any other state.
- **Adjudication item — vague vs impossible (scenario 02): resolved (B4b, 2026-10-07).** `play me something good`
  classified `impossible` pre-fix because the residue token “play” counted as a content claim in intent-v1; B1
  extended the filler/quality lexicon and B4b re-verified both probes as `accuracy=vague`. The resolution is
  recorded in the scenario note.
- **Impossible ask design (scenario 04):** `songs with exactly three clarinets` asserts `impossible` outright;
  the companion `instrumentals with heavy lead vocals over 300 bpm` asserts only `accuracy ∈ [partial, impossible,
  contradictory]` plus honest underfill, because the vocals half is not currently expressible as a claim — never
  `specific`, never a fabricated result.
- **Expectation adjudication generally:** `intent.expect_accuracy` values encode the reading of the frozen
  accuracy enum at capture time; failures print the actual value — adjudicate against the implementation's
  documented ladder rather than blindly “fixing” either side.
- **Skipped-checks register (5 skips at the B4b capture — no silent skips):**
  - `01-three-phrases` › `pump/pipeline-evaluate` — the legacy draft plan has no enforceable constraint, so the
    legacy evaluation leg cannot run; the B1 chosen reading (“pump up”) is evaluated instead by a real check,
    `intent-chosen-evaluates`. The skip marks the legacy leg specifically.
  - `01-three-phrases` › `dance/pipeline-evaluate` — same shape: legacy plan invalid; reading “dance” evaluated
    by `intent-chosen-evaluates`.
  - `02-vague` › `vague-canonical/pipeline-evaluate` — “some music please” is vague by design: nothing
    enforceable, so nothing can be evaluated; the answer contract (`asks[] ≥ 1`, never a dead end) is asserted by
    `intent-structural`.
  - `02-vague` › `vague-play/pipeline-evaluate` — same after the B1 filler fix: `accuracy=vague`, no readings;
    `asks[] ≥ 1` asserted by `intent-structural`.
  - `04-impossible` › `impossible-clarinets/pipeline-evaluate` — “songs with exactly three clarinets” is
    impossible by design (nothing enforceable); `asks[] ≥ 1` asserted; evaluation genuinely not applicable.
- **Hidden-track sign not asserted:** a twice-skipped track's combined `adjust` can stay positive because
  reliability-weighted centroid terms may legitimately dominate the skip penalty; the operative signal is the hide
  (and `negative_parts` proves the skip evidence is visible). Scenario 05 therefore uses `negative_parts`, not
  `adjust_negative`.
- **`learning_reset` marker shape:** `{ signal: "learning_reset", scope: "none", detail: { scope: "epoch" } }`
  appended inside the epoch (verified against B2's implementation: it bounds the active epoch's evidence).
- **Resolve composition:** mirrors the shipped app seam (B5 landed): the combined view is passed as `feedback` +
  `adaptive` exactly as `index.ts` `policyOptions()` does; the decision-3 union is applied by `evaluate.ts`. The
  harness composition fallback remains only for module shapes without the combined view. Delta recorded in the
  B4b receipt.
- **Determinism:** two consecutive runs produced byte-identical JSON except `generated_at` (re-verified at the
  B4b refresh, including a run from a different CWD).
- The lab cannot start the brain HTTP server or exercise routes — endpoint-level smoke tests belong to B5.
- Fixtures are synthetic (`library.sample.json`); nothing here is evidence about real music.
- Future scenario candidates: P1 gap boundary (29:59 vs 30:01), P5 flood bounds, `not_now` hide n=1, persistent
  remove/restore interplay, proposal thresholds, rollback diff (`epoch-v1` vs `heuristic-v1`).

---

## Remaining limitations & notes (B4b view)

- **The lab still cannot exercise HTTP routes.** `index.ts` wiring (routes, `/plans/draft` preview, resolve pipeline) needs a running server — B5's domain; the lab verifies module-level + composed-resolve behaviour via the exact call shapes `policyOptions()` uses.
- **The legacy-v1 rollback branch is not modelled.** The lab mirrors epoch mode (the shipped default since B5); the `listening_policy = "legacy-v1"` path returns the cached v1 view without `adaptive` — out of lab scope, listed here so nobody mistakes epoch coverage for rollback coverage.
- **Skips are documentation-backed, not converted away entirely** (5 remain): three are genuinely not-applicable by design (nothing enforceable to evaluate); two mark the legacy pipeline leg specifically while their coverage now lives in `intent-chosen-evaluates`. Details in the register above.
- **Check counts differ from the pre-refresh brief by design** (64→66 pass; totals 69→71 incl. skips). Re-run expected: `7 scenarios · 66 checks pass · 0 fail · 0 pending · 5 skip`.
- **Deterministic only for a fixed module state.** All inputs pinned (clock, fixtures, ids); the JSON records git HEAD `b6ea5ce1` + dirty flag; re-run before quoting in any other state.
- **Fixtures are synthetic; nothing here is evidence about real music.**
- Working tree is intentionally dirty: B1/B2/B5/B4b edits are uncommitted; no commits were made, so all quotes above are "HEAD b6ea5ce1 + working tree" commit-ish, not releasable artifacts.

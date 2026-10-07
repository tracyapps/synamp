# H4 — Lab sync to the post-hotfix app (receipt)

Status: **complete — lab green (0 fail)** · Author: H4 harness owner subagent · Date: 2026-10-07 00:04 → 00:22 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree dirty — no commits)
Scope written: `tools/brain-lab/**` (sole writer: `lib/runner.mts`, `scenarios/05-fast-learning.json`, `scenarios/08-culture-guardrails.json` (new), `README.md`) + the `evidence/final-lab/` refresh under this cluster dir. Nothing else touched — `git status --short` identical before/after; no app file edited; **no pnpm install, no git commits**.

---

## Conclusion

The lab is re-synced to the post-hotfix app and **green: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 skip** at the canonical capture (2026-10-07 05:13 UTC / 00:13 CDT, **POST hotfixes H1/H2/H3**). Pre-sync it read 7 scenarios / 65 pass · 1 fail · 5 skip; the single failure was the stale `learning-resolve-hidden` — **the app was correct, the check asserted the pre-H2 hide contract**.

Three lab changes (all completed, all passing):

1. **Hidden-display contract fix (C2 F4, post H2).** `learning-resolve-hidden` → **`learning-resolve-hidden-by-session`**: asserts (a) sample-026/028 out of `strict`, (b) `counts.hidden_by_session === 2`, (c) NOT in the persistent `hidden[]` list (no dead Restore for session hides), (d) the strict drop is accounted for by `hidden_by_session + hidden_by_you`. Captured: `out of strict: [sample-026, sample-028] · strict 60→58 · counts.hidden_by_session=2, hidden_by_you=0 · persistent hidden=[]`.
2. **C1-F1 wave regression (post H1).** 4 new checks in scenario 05: `sequence-wave-odd-f1` (odd measured counts n=1,3,5 → full permutation, no `undefined`, JSON-clean), `sequence-wave-odd-order`, `sequence-wave-even-bytes` (n=4 → `[w3,w1,w4,w2]` byte path kept), `sequence-wave-applied-note` (post-H1-2 wording). Negative sanity: the odd-f1 conditions **fail** on the C1-documented pre-fix outputs, so the check genuinely catches the bug.
3. **Scenario 08 `08-culture-guardrails` (seed: C2 §E1).** 10 culture prompts + 2 controls; 12 exact `{slug}/pinned` observations (re-observed post H1/H2/H3, matching C2's E1 table) + 4 defensive cross-checks: banned words ("tribal","primitive","exotic") absent from product copy (quoted user echo + audit input phrases counted, not hidden); culture spans never asserted outside quoted echo; every span surfaced in ≥ 1 ask; no dead ends.

**No check still fails after the sync.** One check-design refinement during development is documented in §Analysis (not an app failure, not papered over).

## Evidence

**Canonical re-runs** (3×, all exit 0; run1+run2 from repo root, run3 from `/tmp`):

```sh
EV=/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/final-lab
cd /Users/tapps/_dev/web-apps/SynAmp
node --experimental-strip-types tools/brain-lab/lab.mts --json "$EV/lab.json" > "$EV/lab.stdout.log" 2>&1   # exit 0
node --experimental-strip-types tools/brain-lab/lab.mts --json "$EV/determinism-run2.json"                  # exit 0
cd /tmp
node --experimental-strip-types /Users/tapps/_dev/web-apps/SynAmp/tools/brain-lab/lab.mts --json "$EV/cwd-run.json" > "$EV/cwd-run.log" 2>&1  # exit 0
```

**Canonical numbers (identical in all three runs):**

```
[brain-lab] SUMMARY — scenarios: 8 (8 pass, 0 partial, 0 pending, 0 fail)
[brain-lab] checks: 86 pass · 0 fail · 0 pending · 5 skip
[brain-lab] RESULT: OK — all checks pass
```

**Determinism:** raw diff between runs = `generated_at` only; normalized content sha256
`c81b8753ddf79b61a023bf45a66bd581bef1a6634ef4199bd4b8e2335dfdb831` equal across run1 / run2 / CWD run.

**Evidence paths (cluster `…/.cluster/synamp-fast-brain/`):**

- Canonical: `evidence/final-lab/lab.json` (machine evidence, schema `synamp.brain-lab/1`) + `lab.stdout.log`; run `generated_at` `2026-10-07T05:13:08.308Z`.
- Determinism: `evidence/final-lab/determinism-run1.json`, `determinism-run2.json`, `determinism.txt`.
- CWD independence: `evidence/final-lab/cwd-run.json`, `cwd-run.log` (`repo.root` recorded as the real repo).
- Fingerprints: `evidence/final-lab/hashes.txt` — 35 files (all of `intent/**`, `learning/**`, `query/{plan,sequence,evaluate}.ts`, `index.ts`, `session/{events,feedback}.ts`, plus the full harness); all verify `shasum -a 256 -c` OK.
- Summary + narrative: `evidence/final-lab/run.json`, `evidence/final-lab/EVIDENCE.md` (both state **POST H1/H2/H3**, date/time).
- Key digests: runner.mts `c1ac6829…`, scenario 05 `3beb2bc2…`, scenario 08 `06846882…`, README `2f81fff7…`; app: interpret.ts `6ae4b4e2…`, lexicon.ts `2c0efcfd…`, evaluate.ts `8d67deec…`, sequence.ts `18330995…`, index.ts `4f9d6258…`; lab.json (raw) `90925318…`. Full list in `hashes.txt`.

**Before → after counts:** 7 sc / 65p·1f·5s (71 rows) → 8 sc / 86p·0f·0pend·5s (91 rows). After, per scenario: 01 `16p/2s` · 02 `8p/2s` · 03 `5p` · 04 `10p/1s` · 05 `15p` (was 10p·1f) · 06 `8p` · 07 `8p` · 08 `16p`.

**The 5 skips (unchanged from B4b, register in README — none silent):**

1. `01-three-phrases` › `pump/pipeline-evaluate` — legacy draft plan has no enforceable constraint; the B1 chosen reading is evaluated by `intent-chosen-evaluates`.
2. `01-three-phrases` › `dance/pipeline-evaluate` — same shape.
3. `02-vague` › `vague-canonical/pipeline-evaluate` — "some music please" is vague by design; the answer contract (`asks[] ≥ 1`) is asserted by `intent-structural`.
4. `02-vague` › `vague-play/pipeline-evaluate` — same after the B1 filler fix.
5. `04-impossible` › `impossible-clarinets/pipeline-evaluate` — impossible by design; `asks[] ≥ 1` asserted; evaluation genuinely not applicable.

## Analysis

- **Why the old check was stale (diagnosis re-verified, not assumed).** H2's C2-F4 split made `Evaluation.hidden` carry **persistent removes only**; epoch hides still leave `strict` via the unchanged union and are reported via `counts.hidden_by_session` (evaluate.ts L352–363). The old check asserted hides in `hidden[]` → `FAIL … actual: hidden=[]` while `learning-resolve-runs` showed `adapted strict 58 · hidden 0 · baseline strict 60`. The new check pins the full new display contract, including the implication that no Restore is offered for session hides (they clear only when the session ends / via Forget session).
- **Wave probe design.** Synthetic 5-track fixture with monotone bpm (under the documented proxy, intensity reduces to one strictly ascending component, so the interleave order is analytically known); expected orders declared in the scenario JSON; wave plan hand-built through the real `validatePlan`; probe executes the real `sequenceTracks`. Odd counts pin exactly the C1-F1 failure modes (dropped element + `undefined` → `null` → queue crash); even counts pin the pre-fix byte path per H1 §H1-1.
- **Scenario 08 pins observations, not correctness.** Re-ran C2's read-only E1 probe on the post-hotfix modules (stdout to /tmp; C2 artifacts untouched) — outputs match the E1 table, and the pins record them exactly. Quote mechanics are explicit: user echo is allowed only inside curly-quoted spans in `ask.ask` and in `audit[].phrase` (counted in evidence); product copy must be clean.
- **The one check-design refinement (documented for transparency).** The first draft of `culture-no-culture-claims` failed on the plan's input-recap fields `intent.summary` / `retrieval_text`, which verbatim quote the user's request (same category as `audit.phrase` — input quotation, not a product claim; not flagged by C2). The corpus definition was corrected to **exclude-and-record** those fields; the check detail now shows `(input-recap echo ×2)` where applicable. No app behaviour was involved or changed.
- **Determinism** (two runs + CWD run byte-equal modulo `generated_at`) and CWD-independence were re-verified on the new scenario set.

## Gaps and risks

- **Scenario 08 pins may need deliberate re-recording** if intent behaviour or ask copy changes (ask counts are pinned; copy edits that split/merge asks will trip them — adjudicate, don't blind-fix). Banned-word list covers C2's product-scope list for these prompts minus the live-echo words (`gypsy`, `world music`); `arrhythmic` isn't exercised by any phrase yet.
- **`sequence_wave` fixture is synthetic** (monotone bpm); it pins the module contract + the C1 repro shape — no goal phrase emits `wave` (C1 §F1 note still stands), so there is no user-visible route to observe end-to-end.
- **Lab still cannot exercise HTTP routes** (starting `index.ts` runs a server); hide/restore module interop is C2's E2 probe, not re-run here. Culture/caveat metadata surfacing remains open (C2 F7/F8).
- **Deterministic only for this fixed module state** — re-run before quoting elsewhere; the evidence records git HEAD + timestamps + hashes.
- **Nothing still failing / nothing open blocking:** the only pre-existing non-lab reds (librarian macOS case-fold, `/dev/shm` skip) live in the brain test suite, not the lab. Tree is intentionally dirty (all edits uncommitted, per task).

## Suggested final-report placement

- **Chapter 2 (fast-learning brain):** scenario 05's hide-display contract result (session hides vs persistent removes — no dead Restore), the C1-F1 wave coverage, and 06/07 isolation/forget outcomes.
- **Chapter 4 (verification & handoff):** canonical lab capture (8 scenarios / 86 pass / 0 fail / 5 skip, POST H1/H2/H3) — cite `evidence/final-lab/lab.json` + `lab.stdout.log`, determinism artifacts (`determinism*.json`, `cwd-run.json`), `hashes.txt`; scenario 08 as the culture-guardrails verification exhibit (defensive pins — explicitly not classifier-accuracy claims).
- **`brief.md` / how-to:** link `tools/brain-lab/README.md` (canonical command, hidden-display contract note, 8 scenarios, limitations) and the canonical evidence paths.

— H4, 2026-10-07 00:22 CDT

# Review round — merged conclusions (C1–C4)

Independent reviews, one dimension each; full findings, repro steps and evidence live in the reviewer files (copied alongside). Confidence levels as marked: High / Medium / Low / Conflict.

**Round disposition.** C1 found one must-fix defect (the `wave` odd-count corruption); it was fixed by H1 with regression tests and re-verified (lab scenario 05 + odd-count checks). C2/C3 findings were folded into H1–H3 (copy, display, docs, parse fixes). C4's one High finding (branch had zero commits, so the documented diff/revert did not hold) is resolved by the single frozen commit `66cbe4e8`. Remaining items are carried as labelled limitations in the report, not silently dropped.

## C1 — Code correctness & numbers

## 1. Conclusion

**Overall verdict: FAIL — exactly one must-fix defect found; everything else reproduced green.**
The single defect is the `wave` sequencing arc: for an **odd** number of measured tracks it drops one
track and injects an `undefined` element, which serialises to `null` in resolve payloads and turns a
queue build into a 500. It is a small, well-localised hotfix (see F1). After that fix plus odd-count
regression tests, the expected verdict is **pass-with-notes**.

- Mandated commands: brain suite **210 tests · 208 pass · 1 fail · 1 skip** (the single fail is the
  pre-existing macOS librarian case-fold, untouched by the branch); `@synamp/brain` and `@synamp/web`
  type-check **exit 0**; brain-lab **7 scenarios · 66 checks pass · 0 fail · 0 pending · 5 skip**,
  exit 0 — reproducible across three consecutive runs and from a different CWD (the brief's "64
  checks" is the pre-B4b-refresh number; §6 explains the delta and it is green in both states).
- Adversarial probes confirm the core epoch-v1 guarantees: isolation both directions byte-identical,
  boundary rules (30:00 vs 30:01, midnight, missing-session buckets, shuffle), flood bounds + finite
  parts + artist π/cap/min-evidence, full hide lifecycle incl. the exact +30:00 expiry edge, reset
  semantics per the code (not the receipt), determinism + exploration-OFF byte-equality, hard-rule
  inviolability under a maxed bonus, proposal boundaries (P21/P22/P23), and ≥10 rows of the A3 §3.7
  number table.
- No new hearing/telemetry/outbound calls: the new modules (`intent/**`, `learning/**`,
  `query/sequence.ts`, new tests, `BrainSession.tsx`) contain no `fetch`/`node:http(s)`/`node:net`/
  `child_process` usage; the web panel uses the app's existing same-origin `request` helper only.

---

## C2 — Bias & ethics

## Conclusion

The slice holds up better than most at this maturity: the bias posture is *"abstain rather than guess; label rather than claim; mask rather than decay"* — and that posture is consistent in code, docs and UI copy. The mandated checks pass where they were expected to pass: no banned strings anywhere in product code; no genre→culture claims; no universal "energy"; no mood inference beyond explicit words; no telemetry; exploration OFF; proposals require an explicit yes; hides are visible; forget works. Culture terms the system cannot honour are left **unparsed with an ask**, never absorbed.

But the review found **five Medium issues** that must be fixed or explicitly carried before chapter 3 is written, because each one is exactly the kind of statement the goal-brief wants called out:

1. **Doc overclaim (F1):** the plan doc's guardrails claim "the lexicon's culture notes name traditions and peoples specifically" — they do not; **no tradition or people is named anywhere in shipped code**. A guardrail section that overstates its own attribution is worse than one that omits it.
2. **README self-contradiction (F2):** "Plays from other apps" still says other-app plays "count as a small global positive" while the shipped default (`epoch-v1`) makes them **epoch-scoped** — the same README says so two sections later.
3. **Log-honesty (F3):** accepting a suggestion writes `reason: "wrong_vibe"` into the append-only event log — a reason the user never gave; the log is the project's immutable record and re-derives from it.
4. **Control honesty (F4):** the per-track "Restore" button is a **silent no-op for session hides** (probe-verified), and system hides are labelled **"Removed by you"**.
5. **Guardrail gap reported as gap (F10):** A2 §4.4 rule 9 (quiet-time/ceremony) has **no implementation and no documentation** in the slice; nothing harmful happens (nothing detects ceremony — which is correct per A2 §4.2 rule 4), but the report must not claim the protection exists.

**Overall verdict: acceptable-with-carried-risks.** Culture-sensitive prompts behave defensively (10-prompt probe below); the residual bias risk is the honest kind — Western-calibrated *soft* preferences applied generically to all material, bounded and labelled, with feedback and spot-check corrections as the stated correction path; no tradition-derived feature ships (which is the ethically safe choice until A2 §4.3 consultation exists). The **bias statements inventory** section below is ready to quote for report chapter 3 and the agent brief.

---

---

## C3 — Music psychology

# C3 — Music-psychology review: goal profiles & learning behaviour vs affect-science evidence

Task: `synamp-fast-brain` · Reviewer: Music Psychologist agent (C3 round) · Date: 2026-10-06
Repo snapshot: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (tree frozen; **no repo edits made**; no app stores touched)
Probes: `evidence/c3/*` (scripts + logs), run with `node --experimental-strip-types` against `apps/brain/fixtures/library.sample.json` (60 synthetic tracks; "fixtures are never evidence about real music" — they exercise the logic, not real-material behaviour)
Materials read: `CONTEXT.md`, `plan.md`, `A1-music-psychology.md` (§2–§4), `B1-intent.md`, `B2-learning.md`, and the code: `intent/{lexicon,interpret}.ts`, `query/{sequence,evaluate,draft,plan}.ts`, `learning/{derive,epochs,proposals,reliability,explore,types}.ts`, `session/{feedback,events}.ts`, plus the web copy in `Describe.tsx` / `BrainSession.tsx` / `index.ts` responses.

---

---

## C4 — Production readiness

# C4 — Production readiness & delivery-inputs review (receipt)

Status: **complete** · Reviewer: C4 (production-readiness & delivery-inputs auditor) · Date: 2026-10-07 00:16 → 00:30 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree; **no commits**) — audited read-only.
All new artifacts of this review live under `evidence/c4/` (+ `/tmp/synamp-c4*` scratch). **No repo file was edited; git status is identical before/after (14 modified + 36 untracked = 50 entries, all in the planned set).**

> **Records as-of 2026-10-07 ~00:30 CDT.** Other agents were active in the cluster during the audit (delivery-plan.md updated 00:20, H4 receipt rewritten 00:21, W1/W5/W7 touch-ups 00:09–00:20). Statements below refer to the files as they are at that time.

---

---

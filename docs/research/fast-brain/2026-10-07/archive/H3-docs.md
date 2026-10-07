# H3 — docs precision fixes (receipt)

Status: **complete** · Role: docs precision fixer (H3) · Date: 2026-10-06 (CDT)
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (working tree; no commits).
Sole-writer scope executed: `docs/synamp/plans/FAST-LEARNING-BRAIN.md`, `apps/brain/README.md`,
`docs/synamp/DECISIONS.md` (one new entry), `docs/synamp/plans/AGENT-ROADMAP.md` (counts only).
No code touched; no other files touched. Every edit below is mapped to a reviewer finding.

---

## 1. `docs/synamp/plans/FAST-LEARNING-BRAIN.md` (untracked/new file — edit summary)

### E1 — declared-field inertness caveat + weight-normalisation sentence
*(findings: C3 F-D-1, C3 F-W-1, C3 F-W-2; task item "weight-normalisation", "declared-field inertness")*

- Bullet renamed and split: **"Soft-only, declared fields inert — with one precise caveat"**.
  Added, verbatim, the caveat: "an unmeasured neutral term still enters the soft average as a
  constant 0.5 saturation at full weight (`evaluate.ts` scores soft terms as `Σw·sat/Σw`), which
  dilutes the produced-term gaps, so bounded feedback (±0.15) and the MMR/caps selection pass can
  differ at the margin when many are present (review probes on the synthetic fixture: a loved
  track ranks 8 with the declared focus terms vs 12 without; 16 of 24 MMR picks differ with zero
  feedback)."
- New bullet **"Weight normalisation"**: "floor-normalised to the ≤ 1.0 convention (scale =
  1/total, applied only when a bundle's research total exceeds 1.0; `Math.floor` at 3 dp). Within
  a pure goal-bundle this is score-neutral up to ≤ 0.001/term floor truncation — a uniform scale
  cancels in the weighted average (`Σw·sat/Σw`); in mixed plans it reduces the bundle's aggregate
  share of the soft-weight denominator relative to other soft terms (user-said terms gain relative
  weight), so mixed rankings are not bit-identical to raw research weights."
- Wording verified against code **before** committing: `apps/brain/src/intent/lexicon.ts`
  (`bundleScale` = 1/total iff total > 1; `emittedWeight` = `Math.floor(w·scale·1000)/1000`) and
  `apps/brain/src/query/evaluate.ts` (soft score = `Σ w·sat / Σ w`; `drop` verdict → `sat = 0.5`;
  feedback applied as `0.15·tanh(v/2)` in the strict tier; MMR λ = 0.65 selection after scoring).

### E2 — artist propagation spec-vs-implementation marker
*(findings: C1 F2; task item "C3/C1 wording drifts")*

- Text already said "≥ 2 events" (matches code); added the marker: "(Spec vs implementation:
  A3 §3.3(b) prose reads “≥ 2 distinct tracks”; P17 and the shipped gate count events — two
  events on one other track open it.)"
- Code anchor re-checked: `apps/brain/src/learning/derive.ts` — `ARTIST_MIN_EVENTS = 2`,
  gate `if (eventsOther < ARTIST_MIN_EVENTS && Math.abs(sumOther) < ARTIST_MIN_SUM) return 0;`.
- Note: the A3 prose itself ("≥ 2 distinct tracks") lives in the cluster research artifact A3, not
  in the repo — it is **not** edited here; it is marked as the spec outlier in the repo doc.

### E3 — guardrails attribution sentence (C2 F1 rewrite)
*(finding: C2 F1)*

- Before: "Culture knowledge stays attributed: the lexicon's culture notes name traditions and
  peoples specifically, and the shared notes ban flattening them into a generic bucket." (false in
  code; names live in the A2 appendix).
- After (what implementation does vs what docs/appendix do): the research appendix (A2) names
  traditions and peoples specifically (Ewe; Aka/Baka/Mbuti; Hindustani/Carnatic tala;
  gamelan/kotekan; Yolŋu manikay; Sámi yoik; Māori taonga pūoro; Northern-style powwow;
  clave/tresillo; aksak; huayno/siku; ma/jo-ha-kyū); what ships is narrower — the lexicon cites
  the pack by rule id only, its culture notes are metadata (rendering them = open review item) and
  name no tradition or people; no tradition-named default ships, future ones gated by the A2 §4.3
  consultation + decision record.
- Also replaced the aspirational "culture-flavoured defaults are labelled" clause with what is
  actually surfaced: "The shared calibration line labels every reading's bands as starting points;
  they are library-relative quantiles, not laws."
- Scope check: no new claims beyond C2 F1/section 1 + A2 §4.3 (consultation rule confirmed in
  `A2-cross-cultural-metrics.md` line 248–251).

### E4 — "Why it is shaped this way" harmonised with E1
*(finding: C3 F-D-1, consistency)*

- "declared fields stay inert on real music" → "declared fields never contribute a measurement
  (their constant-0.5 dilution is the caveat spelled out under 1. Translation)".

### E5 — counts hygiene
*(findings: C1 F4; C2 §2 note on stale counts; B4b; task item "counts hygiene")*

- Suite: "baseline 149 → 205 (203 pass · 1 fail · 1 skip)" replaced with the review-time state:
  **"210 tests / 208 pass + 1 pre-existing macOS failure + 1 skip"** marked "(numbers at review;
  DELIVERY/verification carries the final set)"; the 149 baseline and B1's 205 run retained as
  explicitly labelled history.
- Harness: B4's 64-check capture kept as history; added the B4b refresh state —
  **"7 scenarios · 66 checks pass · 0 fail · 5 documented skips"** "(at review; final counts in
  DELIVERY/verification)"; the old red note updated (fixed with a regression test; no more
  "expected to exit 0 — re-capture" as the live state).
- Receipts line updated B1/B2/B4 → B1/B2/B4/B4b.

## 2. `apps/brain/README.md`
*(finding: C2 F2)*

- "Plays from other apps" paragraph, before: "…count as a small global positive (`played in your
  other apps`, +0.25, decaying) and never as a negative."
- After: "…count as a weak positive — never a negative. Under the shipped default (`epoch-v1`) an
  other-app play scores only inside the live epoch (`played in your other apps this session`,
  +0.25, like the other implicit signals), and it reaches across sessions only as a proposal once
  the pattern repeats (≥ 5 epochs across ≥ 3 dates); the legacy `heuristic-v1` derivation keeps
  the older small global boost."
- Verified against code: `learning/types.ts` `EPOCH_EVIDENCE.external_play` (label + magnitude +
  epoch layer), `learning/proposals.ts` `external_play_positive: { epochs: 5, dates: 3 }`,
  `session/feedback.ts` legacy branch ("small global boost", `0.25 * g` global half-life).

## 3. `docs/synamp/DECISIONS.md`
*(finding: C2 F12)*

- One new entry appended after D7, date-stamped, file format followed (heading + short body +
  *Revisit if:*), 10 lines:
  **D8 — Culture-sourced defaults & guardrails *(accepted 2026-10-06)*** — labelled starting
  points; attribution in the research appendix (not code); no sacred/restricted knowledge inferred
  (no ceremonial inference from audio); reliability honesty (damped/refused with explicit note);
  nothing crosses a listening epoch without an explicit yes; references A2 §4.2–4.4; revisit
  clause: A2 §4.3 consultation + decision record before any tradition-named feature.

## 4. `docs/synamp/plans/AGENT-ROADMAP.md`
*(finding: C1 F4; task item "counts hygiene")*

- Fast-learning entry, "Confirmed" bullet only: "205 tests (B1's run) … +56 new tests … Lab 64
  checks — 63 pass · 1 fail" → **"Brain 210 tests at review — 208 pass + 1 pre-existing macOS
  librarian case-fold failure + 1 skip (both carried from the 149-test baseline; B1's earlier run
  captured 205 — final counts: DELIVERY/verification) … Lab: 7 scenarios · 66 checks — 0 fail ·
  5 documented skips (B4b refresh; the earlier 64-check capture's single red was fixed with a
  regression test — re-run green and byte-identical modulo the timestamp)."**
- Rest of the entry untouched.

---

## Open / left to others

- **Code/web findings not mine:** C2 F3 (log reason), F4 (restore no-op), F5 (accept copy),
  F6 (% sure), F8/F10/F11 remnants, F13 (harness scenario 08); C3 F-A1-* misparses, F-COPY-*,
  F-SEQ-*, F-SURF-*; C1 F1 (wave hotfix) — owned by the code/web fixers per dispatch.
- **A3 §3.3(b) prose** ("≥ 2 distinct tracks") — cluster research artifact, not a repo doc;
  not edited; the repo doc now labels it as the spec outlier vs P17/code.
- **Final counts** for DELIVERY/verification must be captured by the verification round from the
  frozen tree after all hotfixes land; my texts point there explicitly ("at review; final counts
  in DELIVERY/verification").
- **Not verified by me:** whether F1's new appendix list should be trimmed further for the final
  report (kept to C2's own inventory, statement 6, verbatim).
- Files with pre-existing uncommitted B6 content (README section, roadmap entry) were not
  restructured; only the edits above.

## Verification of this receipt's edits

- All four files re-read after editing; no code/docs outside the scope touched
  (`git status --short` checked).
- Edit targets uniqueness-checked before applying (single match per anchor).
- Code anchors for every rewritten numeric/behavioural claim: `lexicon.ts`, `evaluate.ts`,
  `derive.ts`, `proposals.ts`, `types.ts`, `feedback.ts` (all read this session).

# C3 — Music-psychology review: goal profiles & learning behaviour vs affect-science evidence

Task: `synamp-fast-brain` · Reviewer: Music Psychologist agent (C3 round) · Date: 2026-10-06
Repo snapshot: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (tree frozen; **no repo edits made**; no app stores touched)
Probes: `evidence/c3/*` (scripts + logs), run with `node --experimental-strip-types` against `apps/brain/fixtures/library.sample.json` (60 synthetic tracks; "fixtures are never evidence about real music" — they exercise the logic, not real-material behaviour)
Materials read: `CONTEXT.md`, `plan.md`, `A1-music-psychology.md` (§2–§4), `B1-intent.md`, `B2-learning.md`, and the code: `intent/{lexicon,interpret}.ts`, `query/{sequence,evaluate,draft,plan}.ts`, `learning/{derive,epochs,proposals,reliability,explore,types}.ts`, `session/{feedback,events}.ts`, plus the web copy in `Describe.tsx` / `BrainSession.tsx` / `index.ts` responses.

---

## Return format

### Conclusion

**The translation layer is psychologically faithful at the bundle level, and the learning core honours the A1 §4 constraints in almost every machine-checkable respect.** For all nine goal families the emitted constraints match the A1 §2 tables row-for-row (field / op / band / direction), with the deviations being either documented (V2's unrepresentable negative penalty, P2's "instant max" alternative) or degradation-correct (library-relative bands skip honestly when data is missing). Sequencing arcs match the goal→arc mapping of A1 §3 for all nine families, and `sequenceTracks()` strictly re-orders the already-filtered list — it never filters, adds, or scores.

Three classes of problems need action before delivery:

1. **Claim precision (Medium).** B1's "floor-normalisation is score-neutral" is *exactly* true only for pure-bundle plans (verified empirically: zero difference). In **mixed plans** (bundle + any other soft term, e.g. a draft genre hint), the normalisation materially changes relative emphasis — demonstrated with "I need to focus, some jazz": the bundle drops from 84.2% to 75.7% of the total soft weight, reordering scores (rank-3/4 swap `sample-034`↔`sample-045`; 39 of 60 list positions differ) and the emitted list (position 6). Separately, the **floor** itself (not round) adds ≤0.001 per-term truncation — small, but not "nothing changes". Relatedly, **"declared fields are inert" holds for score *ordering* only**: on a library where declared fields are unmeasured, those constraints contribute a constant 0.5 saturation that dilutes all other signal gaps by their weight share (0.561 for focus). Consequences are real once bounded feedback (±0.15) or MMR (λ=0.65) is in play: a loved track's rank changed 8→12 with/without the declared constraints; MMR selection changed 16/24 positions. Both need a *deliberate* decision (document, or change `evaluate.ts`'s drop-saturation handling) rather than a silent claim.

2. **Composite misparses now user-visible through the new "chosen reading" path (Medium).** "I'm driving to work" merges the draft's `energetic` (arousal ≥ 0.6, w=0.6) into the drive plan, where it outweighs every drive-specific term and contradicts A1 §1.7/§2 V (medium tempo, no arousal term). "cleaning the house" pulls a false `genre: house` hint. "music for my workout **then sleep**" merges pump-up + sleep into one cancelling wash with `arc=build` — i.e. the list builds to maximum intensity as the last thing before bed, with no contradiction flagged (pump_up opposes calm, but not sleep; "then" sequence cues are unhandled).

3. **Copy corrections (Medium/Low).** One user-facing instruction is broken: "say 'years 1990–2005' to pin the release tag" — no parser accepts a year window, and in one phrasing the range is silently swallowed. A handful of strings should be softened (a feedback-magnitude promise; two clinical-adjacent phrasings; a forward-referenced "lift" control). No stress-reduction / dopamine / "boosts focus" overclaims were found — the calm/sleep copy explicitly disclaims those — which is a strength to keep.

**Fast-learning §4 check: no violations found.** Skips never become global dislikes (session-scoped, verified in three configurations); "not now" hides for one epoch exactly; proposals require ≥3 epochs AND ≥2 dates (same-day multi-session evidence alone yields zero proposals) and exclude the live epoch; repeats are monotonic positives with no satiation/habituation penalty anywhere; no mood inference exists in the learning code. The residual items are judgment calls to record, not drift: thin artist-propagation thresholds (2 sibling events open the gate), collinearity-flavoured centroid labels, a fixed ×0.5 bpm damping in sequencing vs continuous damping in learning, and exploration default OFF (documented deviation from "keep a small exploration slot").

### Evidence

All findings below are backed by probes under `evidence/c3/` (rerunnable; logs included) plus code references. Headline probe outputs:

```
# Pure bundle: uniform scaling exactly neutral
probe2e: PURE — scale effect (exact-k vs raw):  maxScoreDiff=0.00e+0  orderPositionsDifferent=0
         MIXED (focus+jazz) — scale effect:      maxScoreDiff=6.90e-2 orderPositionsDifferent=39
# Floor truncation (pure): ≤1e-3 score deltas; first micro-swap sample-001↔sample-043 at pos 15
probe2f: num tracks with score delta: 16  max: sample-033 d=0.001

# Declared constraints on an unproduced ("real") library
probe3c: score-sorted (MMR off) orders equal: true
         as-emitted (MMR on) orders equal: false — 16 of 24 positions differ
probe3:  love on sample-054: rank 8 (declared present) vs rank 12 (declared removed)

# Learning behaviours
probe5: 2×skip → hide; epoch closed → adjust 0, no hide; next-day epoch → old skips gone
         not_now → hide n=1, dies at epoch end (−0.71 live → 0 closed)
         repeat ×3 monotonic (+1.67 raw); no negative part
         proposals: 2 epochs→0; 3 epochs/3 dates→1; 3 same-day epochs→0;
                    live epoch excluded; not_now needs 2 dayparts; repeat needs 4/3

# Sequencing
probe4: build ascending / cooldown descending / peak rise-then-relax; same set preserved;
        32% coverage → fallback "kept the ranked order" note

# A1 §2 fidelity (27 trigger phrases)
probe1: all rows match; spectral_* and beat_interval_cv rows skip with honest notes on this fixture
```

### Analysis

**1. Bundle fidelity (task 1).** Read row-by-row against A1 §2 (tables below in Findings F-A1-*). Every emitted constraint carries A1's exact op/direction/band and the correct proxy/refs; all goal constraints are soft (`hard:false`), declared fields carry `unknown_policy:"neutral"` + the inert note in the shared assumption line; no constraint is emitted on `valence/mode/mood` for focus/calm/drive (deliberate omissions preserved). Library-relative quantiles resolve from the current library (nearest-rank, ≥3 measured tracks) or skip with a note — matching A1 §2.0's recommendation over absolute thresholds. Weights: emitted = `Math.floor(researchWeight × 1/Σ × 1000)/1000`; bundle totals ≤1.0 (0.994–1.000); per-term ≤0.5; research weights preserved on the lexicon entries. The neutrality claim is adjudicated in F-W-1/2 and F-D-1.

**2. Sequencing (task 2).** Goal → arc: focus/flat, pump/build, dance/peak, calm+cooldown, sleep/cooldown, catharsis/flat, nostalgia/flat, drive/flat, chores/flat — all as intended; `sequenceTracks` is set-preserving (probe4) and runs post-evaluate on the strict tier only (index.ts `applySequencing`, three call sites; `near_miss` untouched). A1 §3 caveats: catharsis opt-in ✓ (only fires on sad/angry wording; no lift code anywhere), no auto mood-lift ✓, "arcs never violate stated constraints" ✓ (re-order can't break a hard guard), ramp-risk items partially addressed (see F-SEQ-1). "Instant max" and "learned ramp magnitude/duration" are documented-not-implemented.

**3. Fast-learning §4 (task 3).** Mask-not-decay epoch isolation verified in three directions (live → closed → next epoch). Proposals are the only cross-epoch channel and carry the corroboration floors (~"mood ≠ habit": same-day triple sessions yield no proposal). Repeats: positive, monotonic, no satiation logic (grep-verified: no "satiation/habituation/tolerance" anywhere). No mood inference: the learning modules never read `mood`/`valence`/`arousal`; the only reason→weight path is the user's own explicit `wrong_energy`/`wrong_vibe` thumb/remove. Explicit signals (love/thumbs/removes) persist across epochs by declared scope — the sanctioned carve-out in decision 3 — while every implicit behaviour signal dies with its epoch.

**4. Copy (task 4).** Scan of all user-visible strings (lexicon assumptions, asks, reliability notes, BrainSession, Describe, API error paths): no clinical overclaims; three soften/fix items + one broken instruction (F-COPY-*). Notably good: calm "promises no stress reduction (the physiology evidence is mixed)"; sleep "nothing here claims to medicate sleep"; catharsis "does not auto-lift". The caveat/culture strings written into the lexicon never reach the user (F-SURF-2).

**5. Affect-science pushback (task 5).** F-PB-1…5 — small, actionable, none blocking.

### Gaps and risks

- All probes used the synthetic fixture; declared-field effects were simulated by stripping the fields. On a real unproduced library the dilution magnitude will differ (focus: constant-mass share ≈ 41% of the bundle; ~44% on the fixture).
- Proposal thresholds, centroid params and evidence magnitudes are untuned candidates (B2 §7 already says so); my review does not upgrade their confidence.
- The artist-propagation and centroid-label items are design judgments; harm potential is bounded (±0.8 artist cap; ±1.0 feature cap; saturation to ±0.15 in evaluate) and in-session only.
- I did not re-run the full test suite (C1's job); behaviour claims here are probe-based on the frozen tree.
- Two A1-claims-not-honoured items are runtime-feature gaps (ranges: arcs, exploration) rather than correctness faults; the report must state them as *current limits*.

### Suggested final-report placement

- **Ch. 1 (translation layer):** F-A1 discrepancy note (drive/energetic; house leak) as "known misparse class + fix"; the "years" copy correction; the fast+calm pair + pump/sleep gap as design boundaries of contradiction handling.
- **Ch. 2 (fast learning brain):** learning §4 conformance table (F-LEARN-*) as verification evidence; F-W-2/F-D-1 as "claims corrected after review" notes; F-PB-* as parameter caveats.
- **Ch. 3 (bias, culture & reliability):** caveat/culture surfacing gap; declared-field dilution; bpm damping note (cross-ref A2).
- **Ch. 4 (verification/handoff):** evidence/c3 probe index; F-SURF-1 (sequencing note not rendered); F-SEQ-1 arc-shape limits.
- **Risks section:** the not-honoured list below, verbatim, with the rationales.

---

## Findings

Severity scale: **High** = user-harmful / ethically misleading today; **Medium** = materially misleading or wrong UX promise; **Low** = polish / documentation precision. No High findings.

### F-W-1 · Weight normalisation is not score-neutral in mixed plans — **Medium** (claim accuracy; user-visible ordering)

- **Probe:** `probe2-neutrality.mjs`, `probe2d/2e.mjs` — compare the shipped (floor-normalised) focus bundle against A1's literal weights, in a pure plan ("I need to focus") and a mixed one ("I need to focus, some jazz"); also compare against exact-k weights (no floor).
- **Observed:** Pure plan: raw-vs-exact scale effect = 0.00e0 (identical scores and order). Mixed plan: bundle share of the total soft-weight denominator falls 84.2% → 75.7%; score-sorted order shifts in 39 of 60 positions; rank 3/4 swap: shipped `sample-034` 0.807 > `sample-045` 0.796, raw `sample-045` 0.829 > `sample-034` 0.786; with the plan's MMR (λ=0.65) the emitted list diverges at position 6 (`sample-048` vs `sample-054`).
- **Judgment:** The maths in B1's receipt is right about `Σw·sat/Σw` — uniform scaling is exactly neutral **only when the bundle is the whole soft set**. The normalisation scales *one group* of the average, so in mixed plans it shifts the bundle's aggregate share vs. draft genre hints/modifiers/pair extras; direction (user's own terms gain weight) matches the intent of the ≤1.0 convention, but "scaling changes nothing" cannot be said unqualified. I accept the claim for pure bundles; flag the mixed case.
- **Suggested fix:** Reword receipt/report: "normalisation keeps each bundle's published internal ratios and its ≤1.0 convention; in mixed plans it reduces the bundle's aggregate share relative to other soft terms (towards user-said terms dominating), so mixed rankings are not bit-identical to raw research weights." No code change required unless C1 wants strict preservation (then: emit research weights unnormalised and record the convention as unmet).

### F-W-2 · The floor (not round) truncates weights — **Low**

- **Probe:** `probe2e/2f.mjs` — shipped (floor) vs exact-k on the pure plan.
- **Observed:** 16 tracks shift score by ≤0.001; first pure-plan micro-swap at rank 15 (`sample-001` 0.723 vs `sample-043` 0.723 exact-tie flipped by truncation). Max per-term loss 0.0009.
- **Judgment:** Harmless in practice (an order of magnitude below feedback granularity), but "exactly neutral" is not literal. Also note `Math.floor` can only lower a weight, so the truncation is systematic, not random.
- **Suggested fix:** Optional: `Math.round` to 3 dp (or keep exact floats and validate `total ≤ 1.0 + ε`); otherwise say "neutral up to ≤0.001/term truncation" in the docs.

### F-D-1 · "Declared fields are inert" holds for ordering, not for magnitudes/interactions — **Medium** (claim precision; decide deliberately)

- **Probe:** `probe3*.mjs` on a simulated unproduced library (declared fields stripped). Focus plan with vs without `goal_focus_1` (w 0.264) + `goal_focus_10` (w 0.147).
- **Observed:** (a) score-sorted order with MMR off: identical ✓. (b) With a feedback stub (love on `sample-054` → +0.114): rank 8 with the declared constraints vs rank 12 without; `sample-054` overtakes `sample-037` only while the constant 0.5 saturation dilutes the produced gaps (0.659>0.633 vs 0.694<0.737). Dilution factor 0.561. (c) With the plan's MMR λ=0.65: 16 of 24 selected positions differ between the with/without variants even with **zero feedback**.
- **Judgment:** Mechanically, `evaluate.ts` scores a neutral-unmeasured constraint as sat 0.5 at full weight (verdict "drop" contributes `w·0.5` and counts in the denominator). Since the dilution is constant per plan, *ordering by base score* is unaffected ("inert" for ranking), but fixed-size feedback bonuses (±0.15) and MMR's score-vs-redundancy trade-off both change behaviour. This is pre-existing evaluate semantics that B1's claim inherits; the review should not present declared constraints as unconditionally inert.
- **Suggested fix (C1/C4 decide):** Option A — document precisely: "declared/neutral-unknown terms do not change *base* order; they do dilute score magnitudes, so feedback and MMR interactions are strengthened when many such terms are present." Option B — in `evaluate.ts` soft-scoring, skip `drop`-verdict constraints from numerator *and* denominator (true neutrality), with test updates; this changes existing behaviour for all neutral unknowns, so it is C1's call, not a hotfix.

### F-A1-1 · Drive family: draft `energetic` proxy leaks in and outweighs the drive bundle — **Medium**

- **Probe:** `probe6.mjs` — `interpretGoal("I'm driving to work")` (also reproduced with "driving").
- **Observed:** Chosen reading "drive" carries `energetic(arousal ≥ 0.6, w=0.6)` + drive bundle (bpm 95–135 w 0.3, lufs/onset/perc 0.1 each). Total soft weight 1.2 → the arousal term is 50%, twice any single drive term; the reading's own assumptions show "Energy was read as arousal, not tempo" next to "Drive keeps a medium, engaged feel".
- **Judgment:** A1 §1.7/§2 V has no arousal term (medium tempo best, slow worst) and explicitly warns against "faster = better". The leak comes from the draft regex matching "driving" as the energetic adjective; `pump_up` supersedes `energetic` but `drive` does not. Semantic drift — medium (changes what drive plans favour, and the assumption line contradicts the bundle).
- **Suggested fix:** Add `"energetic"` to `drive.supersedes` in `lexicon.ts` (pump-up already does exactly this), or carve the word "driving" out of the draft's energetic regex. (Owner: B1 file; hotfix sized.)

### F-A1-2 · Chores family: "cleaning the house" → false `genre: house` hint — **Low/Medium**

- **Probe:** `probe1-summary.txt` — "cleaning the house" plan = chores bundle + `genre_hint(genre in ["house"], w=0.3)`.
- **Observed:** The draft's genre scan matches the noun "house"; the chores goal does not supersede it.
- **Judgment:** Lexical false-friend; a 0.3-weight hint (≈25% of the combined soft mass) biases toward house music when cleaning "the house". Not musically harmful, but visibly wrong in "how I read it".
- **Suggested fix:** Supersede `genre_hint` for chores (or guard the genre scan against "the house/home/kitchen" compounds). Same owner as F-A1-1.

### F-A1-3 · Soft-band disjointness between merged goals is never signalled: pump_up + sleep — **Medium**

- **Probe:** `probe8-blends.mjs` — "music for my workout then sleep".
- **Observed:** One reading "pump up + sleep" carrying contradictory soft terms (bpm 125–140 **and** 50–70; percussiveness ≥0.5 **and** ≤0.35; arousal ≥0.6 **and** ≤0.4); `arc=build` (priority order peak>build>wave>cooldown); accuracy "partial"; the only ask is about the word "then". "wind down for bed" (calm+sleep) merging is intentional and test-pinned; "chill music for cleaning" (calm+chores) likewise merges with cooldown.
- **Judgment:** The contradiction detector only knows the declared pairs (pump_up↔calm, dance↔sleep) and hard-draft numeric conflicts; pump_up vs sleep is the transitive gap and the worst case psychologically — the plan ends *ascending* into the most intense material for a user who said they want to sleep after the workout. A1 §3 treats "then" as a two-phase sequence (pump build, then wind-down), not a wash. Neither phrase field nor arc supports sequence output today.
- **Suggested fix:** (1) Add `pump_up.opposes: ["sleep"]` (and re-check transitivity: dance vs calm?) so the pair yields two readings; (2) optionally treat "then" as a sequence cue → an ask ("two phases — I can build one list for the workout; for bedtime say 'wind down'") rather than a merge; (3) document the single-arc limitation. At minimum, never emit `build` when a merged reading contains a sleep/calm side with disjoint bpm bands.

### F-A1-4 · Nostalgia cohort copy promises an utterance the parser cannot handle — **Medium** (broken user instruction + silent-drop edge)

- **Probe:** `probe7-years.mjs` — "throwback, years 1990 to 2005"; "back in the day, 1990-2005"; "music from 1990 to 2005".
- **Observed:** No year-window parsing exists in `draft.ts`/`interpret.ts` (schema *does* support `year between`). First phrasing → partial + residue ask that itself never offers years; third → "impossible". "back in the day, 1990-2005" → accuracy **specific**, and the range is *silently* dropped (digits-only residue is filtered out by `/[a-z]/` guards in both draft and interpreter residue). Meanwhile the lexicon tells the user: "say a window like 'years 1990–2005' to pin the release tag" (nostalgia assumption) and the cohort skip note repeats it.
- **Judgment:** Copy → mechanism mismatch (the instruction it gives does not work), plus a silent content-drop edge case that contradicts "unparsed text is reported, never guessed". The cohort row itself (skip-with-note) is an honest implementation of A1 N1; it is the *promise* that fails.
- **Suggested fix:** Either (a) implement a year-range handler (small: mirror the bpm range regex; `year between [low,high]`, soft w 0.25; then remove the "always skips" note) — preferred for UX; or (b) rewrite both strings: "release-year windows aren't supported yet — a future update will accept them." Also fix residue filtering so digit-bearing ranges ("1990-2005") are never silently discarded (report as unparsed/ask instead). Cross-ref C1.

### F-SEQ-1 · Arc shapes approximate A1 §3 (ramp length, hold phases, learnability) — **Low**

- **Probe:** `probe4-sequence.mjs` — pump build over the 25-track result: intensity 0.311→0.656 strictly ascending, no "hold" segment; dance "peak" = single rise-relax; `wave` unused by any goal.
- **Observed/judgment:** A1 §3 describes "2–3 tracks ascending then hold" (pump), "build to peak then wave / vary texture not tempo" (dance), and says ramp direction/magnitude "should be learned from session feedback, not fixed". Implementation: fixed full-list sorts, single-arc approximations (documented in `arcNote`), no hold phase, no feedback-learned ramps, no "instant max" variant. For a workout this reads as a continuous 25-track warm-up — defensible, but not the arc A1 drafted.
- **Suggested fix:** No code change demanded now; final report must describe arcs as "single-arc approximations of A1 §3" and keep the "learned arcs later via `plan.sequencing`" promise as future work. (Also note: the pump caveat about the "instant max" variant is written but never surfaced — see F-SURF-2.)

### F-SURF-1 · Sequencing transparency note is returned by the API but never rendered — **Low**

- **Probe:** grep + read of `apps/web/src` — `sequencing_applied` appears only in `apps/brain/src/index.ts`; no web file reads it; `Describe.tsx`'s `Evaluation` type omits it.
- **Observed:** The notes "arc build: ordered by measured intensity (100% coverage)" and the coverage-fallback note ("… not enough measured intensity … kept the ranked order") are invisible in the UI, although B5 smoke-tested their presence in three API responses.
- **Judgment:** The re-ordering itself is benign (re-order only, post-hard-guard), but hiding the explanation undercuts the explainability promise ("every adjustment comes with the sentence that explains it").
- **Suggested fix:** Render `sequencing_applied[0]` as one muted line in `ResultView` (near the near-miss/tier copy) and in the resolve view; then the E2E smoke claim can be retold as "visible at all three sites".

### F-SURF-2 · Caveats, culture notes and arc notes are dead data — **Low**

- **Probe:** grep — `caveats`, `culture`, `arcNote`, `SHARED_CULTURE_NOTES` are referenced only inside `lexicon.ts` (not even tests). Only `assumptions` + the two `SHARED_ASSUMPTIONS` lines reach readings/UI.
- **Observed:** The A1 caution lines that are most protective ("gaming extension is a design assumption", "objective sleep-stage effects are mostly null", "one classical piece, one route", MP-19's catharsis warning beyond the flat-arc note, the CC metre-convention note) never surface. The B1 receipt's phrasing ("culture notes … surfaced in readings") is not literally true; the general "bands are starting points" line is surfaced via the calibration assumption.
- **Judgment:** Not a correctness issue; a transparency gap. The user-facing copy stays honest, but a report claim that culture notes are surfaced must not be repeated as-is.
- **Suggested fix:** Merge one selected caveat/culture line per goal into `assumptions` for the highest-stakes families (catharsis, sleep, drive, pump, chores) — or state in the report that these are code comments, not UI copy, and flag the C2 "surface one culture line" request.

### F-COPY-1 · Softening list (music-psychology lens) — **Low/Medium**

Exact strings and suggested rewrites (others in the corpus were checked and pass — see "copy strengths" below):

1. **Pump-up assumption** (lexicon.ts L191): “Self-selected music outperforms preselected; your loves and repeats in this session will move the list more than these defaults (MP-3).”
   *Issue:* the second clause overstates the mechanism — feedback is bounded at ±0.15 vs a 1.0-scale soft score; it can re-rank but does not systematically outweigh a full preference bundle.
   *Rewrite:* “Self-selected music outperforms preselected (MP-3). Your loves and repeats re-rank this list as you listen — kept deliberately bounded, so they steer quickly without steamrolling the request.”

2. **Catharsis assumption** (L383): “The lift stays an explicit choice — say “then lift me” and a future arc can shift upward partway; nothing shifts on its own.”
   *Issue:* "say 'then lift me'" reads as a supported command; nothing parses it (no lift trigger, no lift arc).
   *Rewrite:* “There's no automatic lift here — if you ever want the mood to shift partway, that would be a future option you ask for explicitly; nothing shifts on its own today.”

3. **Drive assumption** (L~426): ““Drive” keeps a medium, engaged feel: slow/low-energy material can increase fatigue on long drives (MP-31).”
   *Issue:* single study (one piece, one route — A1 states the caveat). Keep the direction, add the hedge so it doesn't read as settled science.
   *Rewrite:* ““Drive” keeps a medium, engaged feel: one driving study found slow material can add to fatigue on long trips, though individual differences dominate (MP-31).”

4. **Sleep assumption** (L342): “No mood lift is applied at bedtime; “stay here” is the default and nothing here claims to medicate sleep.”
   *Issue:* "medicate" is itself clinical wording in a denial.
   *Rewrite:* “…and nothing here treats a sleep problem.”

5. **Proposals `not_now_pattern` suggested_action** (proposals.ts): “give it a global thumbs down — it seems wrong for you in general”
   *Issue:* "seems wrong for you in general" asserts an inference the evidence (2+ dayparts over 3 sessions) supports only weakly.
   *Rewrite:* “give it a global thumbs down if it's really not for you — you decide.”

6. **Shared calibration line** (optional precision): “Tempo/energy bands are research starting points, not universal — they adapt from your feedback and from spot-check corrections.”
   *Issue:* band *values* don't recalibrate; session feedback adapts scoring (centroids) and spot-checks fix tempo data. Acceptable as-is, but if precision is cheap: “…they stay soft and learn from your session feedback and spot-check corrections.”

**Copy strengths (keep):** "calm" explicitly "promises no stress reduction"; "sleep" explicitly "no mood lift… not a medicate claim"; catharsis "offered, never imposed"; forget-confirm "Loves, thumbs and removals stay" (matches §5.4 semantics); "Patterns must repeat across several sessions on different days before they appear. Nothing here applies until you accept it."; the difficulty ladder hints in `Describe.tsx`. Grep found **no** dopamine/serotonin/“boosts focus”/therapy-style claims in intent, learning, or the two web components.

### F-LEARN-1 · §4 fast-learning conformance — all machine-checkable items **verified**

| A1 §4 requirement | Status | Probe evidence |
|---|---|---|
| No global dislikes from skips | ✓ | `probe5` S1: skips only score in the live epoch; closed → `adjust=0`, no hide; next-day epoch unaffected |
| Skips session-scoped (hours, not days) | ✓ | same; 30-min half-life in-epoch, hard kill at boundary |
| Single skip = "not this moment" (hide needs k≥2; small weight) | ✓ | 1×skip: no hide, raw −0.3·decay (≈−2.2% via tanh); 2×skip: hide |
| "not now" semantics (first-class, moment-scoped) | ✓ | `probe5` S2: hide n=1, −0.71 raw live → 0 after epoch; L1 not persisted |
| Corroboration ≥3 epochs / ≥2 dates before proposals | ✓ | `probe5` S4a–d; **same-day triple session → 0 proposals** ("mood ≠ habit") |
| Active epoch excluded from proposal scan | ✓ | S4d: 4 epochs, last live → 1 proposal from the 3 closed |
| not_now needs 2 dayparts | ✓ | S4e/f: 3 nights → 0; +1 morning → 1 |
| Repeat not treated as satiation danger | ✓ | S3: monotonic +; no satiation/habituation strings in `src/learning` |
| Never write off a track from one exposure | ✓ | k=2 threshold; `repeat_positive` needs 4 epochs/3 dates |
| No mood inference | ✓ | grep: learning never reads mood/valence/arousal; only explicit `wrong_energy/wrong_vibe` reasons weight negatives |

### F-PB-1 · Pushback: artist propagation opens at 2 sibling events — **Low/Medium** (parameter judgment)

- **Probe:** `probe5` S1 — one skip each on two tracks by "Lumen Atlas" produced −0.17 artist contribution on each (gate: `eventsOther ≥ 2` OR |sum| ≥ 1.0).
- **Judgment:** In-session, bounded (±0.8), labelled ("other tracks by X this session") and deterministic — acceptable. But 2 events is thin for an artist-level inference, and A1 warns that feature attribution stays provisional (tempo/loudness/onset co-vary; §Gaps). Two skips across one artist's album could down-weight a whole artist for the rest of the session.
- **Suggested fix:** Consider `ARTIST_MIN_EVENTS = 3` (one constant), or require the corroborating events to include at least one explicit signal; keep as a named candidate in the report either way.

### F-PB-2 · Pushback: centroid labels read as causal attribution — **Low**

- **Probe:** read `derive.ts` label construction + `probe5` runs — labels like “tempo ~120 BPM — you kept 3 such tracks this session”.
- **Judgment:** The keep/skip centroids run over 5 collinear-ish axes (bpm/onset/lufs/crest/percussiveness). A1's collinearity caution (a skip cannot identify the offending feature) means a proximity bonus should not read as "this is why". Containments exist (β=0.5, γ=0.15, gates, spread floor, per-axis part caps 0.5, total cap 1.0) — it's the wording, not the maths.
- **Suggested fix:** e.g. “tempo ~120 BPM — near what you've kept this session (several features move together; treat as a hint)”. Low priority.

### F-PB-3 · Pushback: fixed ×0.5 bpm damping in sequencing vs continuous weights in learning — **Low** (consistency)

- **Observed:** `sequence.ts` damps the bpm intensity component ×0.5 when `tempo_confidence < 0.5` **or missing**; `reliability.ts` uses weight = confidence for 0.2 < c < 0.5 and refuses c ≤ 0.2 / missing. A1 §2.0 sanctions "damp ×0.5 or skip"; A2 flags octave errors as a failure class. The asymmetry: a non-Western / low-confidence-tempo track's intensity estimate loses up to 0.175 of its mass, so it can sort earlier in `build` / later in `cooldown` — a small systematic placement bias against the very material the confidence gate is meant to protect.
- **Judgment:** Not a violation (damping is the sanctioned option), but pick one shape: continuous confidence weighting (matches learning) or skip-with-renormalisation. If kept: document why the two modules damp differently.
- **Suggested fix:** Prefer `term *= max(0, confidence)` style continuous damping, or skip the component and let `sum/weight` renormalise (already the fallback behaviour for missing bpm).

### F-PB-4 · Watch-item: "energy → arousal" proxy and the arousal field — **Low** (future producer)

- **Observed:** The draft maps energy words to a declared `arousal` field (inert today) — fine for now. When a producer lands, remember A1 [MP-32]: high-arousal music raised *felt effort* on demanding attentional tasks, and both low/high-arousal music raised physiological activation and pleasure. A single "arousal ≥ 0.6" for energy would conflate activation with felt energy in exactly the focus context where the sign flips. Keep the band mid for focus (F10), and calibrate per task type before any producer ships.

### F-PB-5 · Watch-item: exploration default OFF vs "keep a small exploration slot" — **Low** (documented deviation)

- A1 §4 pragmatic rule suggests a small novelty slot; `explore.ts` implements a deterministic, default-OFF flag with a written rationale (single-user determinism, honestly-recorded exposures). This is the right call for this iteration; just keep it in the "deviations" list of the report, not in the "honoured" list.

---

## Adjudicated semantic drift (task 1 summary)

| # | Candidate drift | Verdict |
|---|---|---|
| 1 | V2 drive "slow = penalty" (−0.2) not representable in plan v2.0; dropped with caveat | **Accepted deviation** — schema has no negative weights (validator: 0.001–1); documented in lexicon caveat (though not surfaced; F-SURF-2) |
| 2 | P2 "instant max" (bpm ≥ 120) alternative not emitted | **Accepted** — labelled alternative, not default; A1 says "alternative/additive" |
| 3 | "energy → arousal" draft proxy kept in drive plans | **Drift (Medium)** — F-A1-1, fix by supersede |
| 4 | "house" genre false positive in chores | **Drift (Low/Medium)** — F-A1-2 |
| 5 | pump_up vs sleep not a detected opposition; "then" sequences unhandled | **Drift (Medium)** — F-A1-3 |
| 6 | Weight normalisation ≠ strict score-neutral in mixed plans | **Claim precision (Medium)** — F-W-1; code behaviour defensible |
| 7 | Declared constraints not unconditionally inert | **Claim precision (Medium)** — F-D-1; decide or document |
| 8 | Catharsis "lift" referenced in copy but absent | **Copy fix** — F-COPY-1.2 (arc itself is correctly flat) |
| 9 | Nostalgia year window offered but unparseable | **Broken instruction (Medium)** — F-A1-4 |
| 10 | All other §2 rows (F/P/D/S/C/N/W) | **Match** — verified row-by-row in `probe1` (spectral_* + beat_interval_cv skip with honest notes on this fixture; they emit when data exists) |

## Explicit list — A1 claims the implementation does NOT honour (carry into the report)

1. **§3 pump:** no "instant max" variant for short pre-game windows (caveat text only).
2. **§3 arc shapes:** "2–3 tracks ascending then hold" and "build to peak, then wave / vary texture not tempo" are approximated by single full-list sorts (build = full ramp; peak = one rise-relax; no hold/texture phase; `wave` unused).
3. **§3 learnability:** "ramp direction/magnitude should be learned from session feedback, not fixed" — arcs are fixed defaults; learning integration is future work (B1 notes the slot).
4. **§3 catharsis control:** no "stay here / lift me" control exists; wording is forward-looking copy only.
5. **§2 V2:** negative-weight penalty not representable; dropped (documented).
6. **§4 exploration:** "keep a small exploration slot" — implemented but default OFF (documented rationale).
7. **§4 spacing:** "avoid immediate repeats of the same track unless requested" — no queue-level spacing in this workstream (player-side; not contradicted).
8. **§2/§3 calibration:** bands are not recalibrated per user; adaptation is bounded session scoring (centroids) + spot-check data corrections only.
9. **Receipt claim:** per-goal culture notes / caveats / arcNotes are not surfaced ("dead metadata" today; the generic calibration line is surfaced).
10. **Nostalgia UX:** the offered phrase "years 1990–2005" does not work (F-A1-4).

## Confidence levels

- **High** (code + probe, deterministic): bundle row fidelity; weight arithmetic; pure-bundle neutrality; mixed-plan re-ranking; floor truncation; declared-constraint score-order inertness; feedback/MMR interactions; all F-LEARN-1 rows; sequencing set-preservation & fallback; drive/house/no-years/blend misparses; copy strings as quoted.
- **Medium** (single probe class or judgment): severity calls on F-A1-1/3; the practical importance of F-D-1 (real-library magnitude depends on future producers); rewrite wording taste; artist-threshold and centroid-label pushbacks.
- **Low / to calibrate:** all magnitude values (proposal thresholds, β/γ, damp factor) remain candidate values from A3/dossier; nothing in this review upgrades them.
- **Conflict:** none new. (Existing A1 conflicts — sad-music direction [MP-17/18 vs MP-19], stress response [MP-27], iso-principle [MP-8 vs MP-9] — are correctly *surfaced as conflicts* in the lexicon copy where they matter, e.g. calm/sleep/catharsis assumptions.)

---

### Files written by this review (no repo edits)

- `C3-psych-review.md` (this file)
- `evidence/c3/` — 16 probe scripts + `probe1-out.json` + `probe1-summary.txt` + 16 logs + `README.md`

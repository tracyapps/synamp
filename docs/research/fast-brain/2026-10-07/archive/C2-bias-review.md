# C2 — Bias & ethics adversarial review (fast-learning-brain)

Status: **complete** · Reviewer: C2 (adversarial bias & ethics perspective) · Date: 2026-10-06 evening → 2026-10-07 CDT
Repo snapshot: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` — **frozen; no repo files touched by this review**.
Scratch probes (mine): `evidence/c2/probe-interpret.mts` + `.out.txt`, `evidence/c2/probe-hides.mts` + `.out.txt` (in this directory).
Read for this review: `CONTEXT.md`, `plan.md`, `A2-cross-cultural-metrics.md` (§1–5 + CC appendix), `A1-music-psychology.md` (§2–5 + confidence tiers), receipts `B1/B2/B5/B6`; repo: `apps/brain/src/intent/lexicon.ts`, `intent/interpret.ts`, `learning/*.ts`, `query/sequence.ts`, `query/evaluate.ts` (diff), `index.ts` (new routes), `apps/web/src/Describe.tsx`, `apps/web/src/BrainSession.tsx`, `Playlists.tsx` (restore path), `docs/synamp/plans/FAST-LEARNING-BRAIN.md`, `apps/brain/README.md` (new section + carried section), `AGENT-ROADMAP.md` (dated entry).

---

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

## Findings table

Severity: **Medium** = fix or carry explicitly in the report before delivery · **Low** = polish / carry with a line · **Info** = note only.

| # | Sev | Finding | Evidence | Exact location |
|---|-----|---------|----------|----------------|
| F1 | **Medium** | Guardrail sentence claims culture notes "name traditions and peoples specifically" — no people/tradition name exists in shipped code; "shared notes ban flattening" is also aspirational | Grep: no `Ewe\|Sámi\|Māori\|Yolŋu\|Akan\|gamelan\|…` in `lexicon.ts`; culture notes say only "Western…"; `SHARED_CULTURE_NOTES` bans metre-hardening + requires starting-point labels, not flattening | `docs/synamp/plans/FAST-LEARNING-BRAIN.md` lines 216–218 vs `apps/brain/src/intent/lexicon.ts` (all `culture` arrays + `SHARED_CULTURE_NOTES` lines 584–587) |
| F2 | **Medium** | README describes other-app plays as "a small global positive … never as a negative" — false under the shipped default; epoch-v1 scores them epoch-only (+ proposals) | New README section: "Implicit signals (…, other-app plays) score only inside the live epoch"; plan doc table row "epoch \| other-app play \| +0.25" | `apps/brain/README.md` line 120 vs lines 150–155 (new section) vs `apps/brain/src/learning/types.ts` `EPOCH_EVIDENCE.external_play` |
| F3 | **Medium** | Accepting a negative suggestion synthesizes `reason: "wrong_vibe"` in the append-only log — a reason the user never gave; feeds the reject-centroid set | `record(("thumb_down"))` forced with `reason: "wrong_vibe"`; `derive.ts` treats `wrong_energy/wrong_vibe` as reject evidence | `apps/brain/src/index.ts` `applyProposalAccept()` line 423; consumption: `apps/brain/src/learning/derive.ts` lines ~252/260 |
| F4 | **Medium** | "Restore" is a silent no-op for epoch hides (skip×2 / not_now); system hides labelled "Removed by you" in the playlist view | Probe: restore event leaves `epochHides` unchanged (skip + not_now); restore works only for persistent removes. UI posts playlist-scoped restore for **any** entry in `hidden` | Probe `evidence/c2/probe-hides.out.txt`; `apps/web/src/Playlists.tsx:177`; `apps/web/src/Describe.tsx` lines 154 & 161; `apps/brain/src/learning/derive.ts` hide computation (skipCounts/notNowTracks) |
| F5 | Low | Accept consequence disclosed only *after* click for (a) no-op accepts (artist subjects) and (b) `track_repeat_skip`→ global thumb_down even when evidence was "in one playlist" | `acceptDone()` post-click strings; `suggested_action` says "exclude … in that playlist" while accept writes scope global | `apps/web/src/BrainSession.tsx` lines 40–46, 126; `apps/brain/src/learning/proposals.ts` suggested_action fields |
| F6 | Low | Multi-reading UI shows `"50% sure"` / `"60% sure"` — heuristic rule constants rendered as calibrated probabilities | `Math.round(reading.confidence * 100)`; constants are 0.3–0.7 rule outputs (`confidenceFor`), contradictory readings pinned at 0.5 | `apps/web/src/Describe.tsx` line 78; `apps/brain/src/intent/interpret.ts` `confidenceFor()` |
| F7 | Low | Culture notes + metre-convention ban are metadata only; nothing renders them (already declared as open item — carry as open, not done) | B1 §Gaps flagged it; plan doc says "surfaced UI copy line is an open review item" | `apps/brain/src/intent/lexicon.ts` (`culture`, `SHARED_CULTURE_NOTES`); `FAST-LEARNING-BRAIN.md` line 293 |
| F8 | Low | Sequencing note ("ordered by measured intensity…") never rendered in web; wording reifies "intensity" when it is a proxy | Grep: no `sequencing_applied` in `apps/web/src`; note text in `sequence.ts` `applied[]` | `apps/brain/src/query/sequence.ts` lines ~120–138; `apps/web` (absent) |
| F9 | Info | Catharsis covers sad words only; A1 says "sad/angry language" — "angry/anger" not covered (users get vague asks, nothing harmful) | Trigger list; no anger words | `apps/brain/src/intent/lexicon.ts` `catharsis.triggers` |
| F10 | **Medium** | A2 §4.4 rule 9 (quiet-time/ceremony) + §5 row 10 (long-form "prefer flat arcs on flagged material") have **no mechanism and no documentation**: no "ceremonial"/"long-form" flag concept exists; arcs are request-level; gap must be reported, not glossed | Grep: "ceremon" absent from `apps/` + `docs/synamp/`; probe "indigenous music for the gym" → pump-up + build arc, no flag path; A2 §4.2 rule 4 (no ceremonial inference — also absent, correctly) | everywhere-absent; `FAST-LEARNING-BRAIN.md` guardrails (omission) |
| F11 | Low | Yoik-like ontology (A2 §4.4 rule 10): safe by **abstention** (no product text describes any track's meaning), but no positive handling (artist-provided descriptions) — declare as gap | Probe "sami yoik to wind down" → calm bundle + "sami yoik" unparsed + ask; no semantic labels anywhere | `interpret.ts` probe output; `FAST-LEARNING-BRAIN.md` (not mentioned) |
| F12 | Low | No `DECISIONS.md` record for the cross-cultural posture ("no tradition-named defaults ship; bans/labels only"), which A2 §4.3's decision-record convention would want before any tradition-named feature ships | `docs/synamp/DECISIONS.md` has no fast-learning/culture entry | `docs/synamp/DECISIONS.md` |
| F13 | Low | Harness scenarios 01–07 contain no culture-sensitivity prompts; the probes in this review are scratch-only, not regression-guarded | `tools/brain-lab/scenarios/*.json` (7 files, no culture prompts) | `tools/brain-lab/scenarios/`; recommend scenario 08 |
| F14 | Info | `docs/synamp/README.md` plan index not updated with the new plan doc | index lists Agent roadmap / Beat timing / Library care only | `docs/synamp/README.md` line 83–85 |
| F15 | Info | `/brain/session` `queue_adjustments` passes no playlistId → playlist-scoped thumb parts don't appear in the readout (B5 §7 carried) | B5 receipt §7; `index.ts` `brainSessionView()` calls `view.adjust(trackId)` | `apps/brain/src/index.ts` `brainSessionView()` |

**Positives verified (P1–P11)** — these are the checks that passed and should be quoted as strengths, not re-derived:

- **P1 Banned strings**: `tribal|primitive|exotic|gypsy|world music|arrhythmic` — zero occurrences in `apps/brain/src` (new modules), `apps/web/src`, `tools/`, new docs/README. Only user prompts echo them back verbatim inside asks (acceptable; the product never authors them).
- **P2 No genre→culture claims**: draft emits `genre tag not X (hard)` / `prefer genre tag Y (soft — tags are weak evidence)`; lexicon has no culture/genre coupling. Probe: "latin party music" → dance reading from the *activity* word "party"; "latin" left unmapped with an ask; no "Latin = danceable" claim.
- **P3 No universal "energy"**: energy-family asks compile to labelled proxies with named inputs; loudness explicitly smallest-weighted ("loudness ≠ perceived intensity", CC-43..45); proxy labels on constraints ("pump up → exercise tempo band", "focus → arousal (moderate band)" etc.).
- **P4 Mood-inference caution**: catharsis fires only on explicit sad-language triggers; no behavioural mood inference anywhere in `learning/**`; no code path infers "the user is sad/angry" from skips, repeats or plays.
- **P5 Learning gating**: proposals are the only cross-epoch channel from behaviour and change nothing until accepted; dismiss never nags (permanent until re-drafted; decision store local); exploration implemented, default OFF, and **not consumed anywhere** (only `explore.ts` exports; derive ignores it; OFF ⇒ byte-identical — test-asserted).
- **P6 No engagement metrics**: no watch-time/streak/reward constructs in new code; adjustments bounded (`±0.15` applied inside strict tier, feature layer caps, artist cap); "the learner can re-order but never pass a hard rule".
- **P7 Privacy**: no `fetch`/HTTP/telemetry in the new modules; new endpoints write only local stores (`events.jsonl` append, `brain-proposals.json` mode 0600); `/api/v1/brain` added to `protectedPath` (401 without token when configured — B5 smoke).
- **P8 Hides transparency**: visible in the session readout ("Hidden until this session ends: …") and in evaluation `hidden`/`hidden_by_you` counts; `Forget this session` clears them (test-asserted) and the confirm copy is accurate ("Loves, thumbs and removals stay").
- **P9 Reliability honesty**: `bpm` gated by `tempo_confidence` (≥0.5 full; <0.5 down-weighted with exact note; ≤0.2/missing refused); declared/missing axes never contribute; notes instead of zero-filling.
- **P10 Declared-inert transparency**: declared fields emitted with `unknown_policy:"neutral"` + "no producer yet — inert on real data"; surfaced in every reading's assumptions; quantile bands skipped with a note below 3 measured tracks — never an invented fallback.
- **P11 Directional correctness of A2 use**: no "feeling" claims from microtiming (off by default); no metre hard-enforcement (no metre fields emitted); beat/timing fields keep their registry gates.

---

## Evidence

### E1 — Culture-language probe (10 prompts + 2 controls)

Command (reproducible; reads only):
```sh
cd .cluster/synamp-fast-brain/evidence/c2
node --experimental-strip-types probe-interpret.mts   # full transcript: probe-interpret.out.txt
```
Library: `apps/brain/fixtures/library.sample.json` (synthetic 60 tracks; always disclosed as non-evidence about real music).

Exact outputs (accuracies/readings/asks; verbatim quotes):

| Prompt | accuracy | reading(s) | Culture-critical behaviour |
|---|---|---|---|
| "latin party music" | `partial` | dance (bpm 115–130 …), arc peak | "party"→dance (activity, not culture); **"latin" unparsed** → ask: “I left “latin” unused — if it matters, say it as an activity, a tempo range, or a tag.” |
| "tribal drumming" | `impossible` | none | Ask: ““tribal drumming” is too specific for what I can measure today.” (user words echoed; no product-authored slur, no claim) |
| "gypsy jazz" | `partial` | "what I could parse" (genre_hint jazz soft) | "gypsy" unparsed → ask; only the *tag* "jazz" matched, labelled "tags are weak evidence" |
| "exotic vibes" | `impossible` | none | ask; no culture/energy claim |
| "music for my ancestors" | `impossible` | none | ask; no ceremonial semantics invented, no stereotyping |
| "west african drumming for focus" | `partial` | focus bundle | "west african drumming" unparsed → ask; focus terms are soft + labelled |
| "sami yoik to wind down" | `partial` | calm bundle, arc cooldown | "sami yoik" unparsed → ask; no content description of yoik ("song about nature" class avoided) |
| "indigenous music for the gym" | `partial` | pump up bundle, arc build | "indigenous" unparsed → ask; no flattening text; **no ceremonial-flag path exists** (F10) |
| "gamelan for studying" | `partial` | focus bundle | "gamelan" unparsed → ask; no key/mode claims emitted |
| "play me some world music" | `impossible` | none | "world" unparsed → ask; **no catch-all "world music" bucket** |
| "fast relaxing bangers" (control) | `contradictory` | A "energetic but soft" / B "literally calm", both valid, chosen=A marked "applied" | two readings, nothing silent; "bangers" unparsed |
| flagship focus phrase (control) | `specific` | focus, 1 reading | exclusions stay hard; declared fields inert |

### E2 — Hide reversibility probe

Command: `node --experimental-strip-types probe-hides.mts` (transcript: `probe-hides.out.txt`). Key output:

```
BEFORE restore — epochHides: [ 'A' ] removed(P): [ 'B' ]
AFTER restore(A, playlist-scoped) + restore(B):
  epochHides: [ 'A' ]            ← restore does NOT clear skip-hidden tracks
  removed(P): []                 ← restore DOES clear persistent removes
--- 'not now' hide + restore ---
epochHides after not_now + restore: [ 'C' ]   ← not_now hides also survive restore
--- scope_persistence: declared vs global_only (next day) ---
declared:    adjust(D, P) = {"value":0.977,"parts":[{"label":"thumbs up here","value":0.98}]} | epoch = null
global_only: adjust(D, P) = {"value":0,"parts":[]}                                    | epoch = null
```

The restore event shape in the probe is exactly what `Playlists.tsx:177` posts (`signal:"restore", scope:"playlist", playlist_id:selected.id`).

### E3 — Greps (exact commands, exact results)

- Banned strings (product scope): `grep -rniE "tribal|primitive|exotic|gypsy|world music|arrhythmic" apps/brain/src apps/web/src tools/ docs/synamp/plans/FAST-LEARNING-BRAIN.md apps/brain/README.md` → **exit 1, zero hits**. Context pass over all of `docs/`: two benign matches only — `docs/research/synamp-brain-dossier.html:673` (`DSP primitives` — substring false positive, a library category, pre-existing) and `docs/synamp/plans/BEAT-TIMING.md:134` (the "do not call rejected tracks arrhythmic" ban itself). **No product-copy hits anywhere.**
- Telemetry/outbound in new modules: `grep -rniE "fetch\(|http|axios|WebSocket|beacon|sendBeacon" apps/brain/src/intent apps/brain/src/learning apps/brain/src/query/sequence.ts` → no matches (test files excluded); `git diff index.ts | grep "^+.*fetch("` → none.
- Mood inference: `grep -rniE "sad|angry|cathar" apps/brain/src/learning apps/brain/src/query/sequence.ts` → none outside tests. Catharsis triggers only.
- Ceremony/quiet-time: `grep -rni "ceremon" apps/brain/src docs/synamp` → none.
- Traditions/peoples named: `grep -rniE "ewe|sámi|sami|māori|maori|yolŋu|akan|pygmy|aka|baka|gamelan|…" apps/brain/src/intent` → none (F1).
- `POLICY_VERSION` consumers and `/api/v1/brain` protection: per B5 §4/§6 verified by reading `index.ts` (protectedPath includes `/api/v1/brain`).

### E4 — Code readthrough anchors

- `derive.ts` (`epoch-v1`): L1 explicit-only cells; L2 active-epoch only (hard mask); hides recomputed from evidence; `learning_reset` bounds evidence by containment; `scopePersistence` branch; artist min-evidence gate; centroid gates; note strings ("no active session — learning is paused", "session learning was reset — only what happened after the reset counts").
- `proposals.ts`: thresholds require epochs AND dates (some dayparts / ≥2 tracks); 30-day scan window; live epoch excluded; `pr1:` stable ids.
- `explore.ts`: `EXPLORATION_DEFAULT = false`; "derive.ts never reads this module"; deterministic hash pick; exposure note policy text.
- `interpret.ts` / `lexicon.ts`: triggers word-boundary + negation-guarded; asks capped at 3; `SHARED_ASSUMPTIONS.calibration` surfaced in readings; declared-field line; culture notes as metadata (not surfaced — F7).
- `BrainSession.tsx`: readout structure; confirm-gated forget; post-click accept copy; 30 s polling (local only).
- `index.ts`: `/brain/session` GET; `/brain/forget` POST (scope enforced; append-only marker); `/brain/proposals` POST (accept/dismiss; 400/404/409 paths; stable event id); `/plans/draft` interpretation additive, no raw plans leave the server.

---

## Analysis

### 1. Culture rules (A2 §4.2–4.4) — findings + probe reading

- **"Culture-flavoured defaults labelled as starting points"**: no tradition-flavoured *defaults* ship at all (the nine goals are activity-based); the generic label is present and surfaced: "Tempo/energy bands are research starting points, not universal…" in every reading, plus per-goal culture notes as metadata. A2 §4.4 rule 2's example archetype ("Starts from West African timeline-pattern picks") is deliberately **not** implemented — the ethically correct call pre-consultation (A2 §4.3), but the plan doc's claim that culture notes "name traditions and peoples" (F1) is not met by any code. Report must attribute via A2 (§1's named traditions: Ewe, Akan-adjacent, Aka/Baka/Mbuti, Hindustani/Carnatic, gamelan/kotekan, Yolŋu manikay, Sámi yoik, Māori taonga pūoro, Northern-style powwow, clave/tresillo, aksak, huayno/siku, ma/jo-ha-kyū) and state plainly that the shipped lexicon cites rule ids only.
- **Attribution in code**: citations are CC-n / MP-n rule ids — good provenance practice, but ids aren't readable names; acceptable at code level, must not be described as "naming peoples".
- **No universal energy**: pass (P3); proxy field populated; loudness smallest-weighted; "intensity" wording in sequence notes is the residual (F8).
- **No genre→culture claims**: pass (P2).
- **No pan-Indigenous flattening**: no flattening text exists; the risk is the *absence* of any named-people content, which the report (not the code) must supply. Given the user's brief #3 ("draw on knowledge from various Indigenous cultures"), the honest statement is: the slice brackets culture terms defensively (asks, no claims); the cross-cultural substance lives in the research pack (A2) and must be named specifically in chapters 3/5.
- **Banned strings**: pass (P1).
- Probe verdict: **no stereotyping or culture claims found in any of the 10 outputs**; unparsed-with-ask is the consistent behaviour; the only sensitive strings echoed are the user's own.

### 2. Overclaiming — statements that outrun A1/A2 confidence tiers

Pass column: magnitudes labelled "candidate values, not tuned" in `types.ts`, plan doc ("Candidate values" section), README; arcs labelled hypotheses ("no retrieved experiments showing any arc beats a flat list" — plan doc/allowed by A1 §3); iso-principle not presented as validated; "improves focus" type claims absent; "stress reduction" explicitly disclaimed in the calm reading ("it promises no stress reduction"); sleep caveats ("objective null"); groove U labelled lab evidence; the catharsis conflict listed, not smoothed.

Findings: **F1** (attribution overclaim — the strongest one, because it sits inside the guardrails chapter that will be quoted into report ch. 3); **F2** (README stale "global" claim contradicts shipped default — a claim *outlived* by code, the inverse shape of overclaim, equally misleading); **F6** (heuristic constant shown as "% sure").

Also flagged for the report writer: the roadmap entry quotes B1's 205-test run while B5's final tree is 210 — labelled as B1's run and "re-capture before quoting", so it's honest as written; final numbers belong to C1/C4. The lab's one historical red was fixed with a regression test; a fresh final run must be captured (B4b).

### 3. Learning ethics

- **Explicit yes**: proposals change nothing until an explicit accept; accept is an idempotent single event; dismiss is respected; UI states "Nothing here applies until you accept it." **Artist-subject deviation (B5 §4.1)**: acceptable — no artist-keyed signal exists; writing a `thumb_up` with `track_id: "<artist name>"` would never match a track and would pollute the log; recording the decision only + honest copy is the right call. Verdict: keep, but fix disclosure (F5).
- **Hides transparent + reversible**: transparent yes; reversible **epoch-wide** via forget (works; copy accurate); **per-track restore is broken for epoch hides** (F4) — the one real functional gap found by this review.
- **Engagement**: none; exploration OFF; no watch-time metrics; exposure policy strings stay `deterministic_rank`; no queue manipulation beyond bounded re-rank.
- **Privacy**: local-only; no new outbound; new data file mode 0600; auth added to new routes.
- **Mood inference**: none beyond explicit sad-language words; no inference path from behaviour to mood. Catharsis remains opt-in by trigger words (A1 §2.1 C's "only on explicit ask"); note the sad-only trigger gap (F9, harmless).
- **Log honesty**: F3 (synthesized reason) is the one lapse; everything else keeps the "events are immutable; policies re-derive" contract.

### 4. `scope_persistence`: declared vs global_only — **verdict**

**Verdict: keep `"declared"` as the default; do not flip to `"global_only"`; keep the switch as the named tension (P25) and document it as code-level until it earns a settings surface.**

Rationale:

1. The user's requirement (#2) targets **mood leakage** — incidental behaviour from another day/session/hour must not shape learning. The design draws the line at *deliberate vs incidental*: implicit signals (skip/repeat/plays) are hard-masked; explicit gestures (love/thumbs/remove) persist — with **scope respect**: a playlist thumb persists only in that playlist, a global thumb globally, and `not_now` exists precisely so a user can say "just now, not forever" without persisting anything. A thumb is an instruction, not a mood.
2. `global_only` would make playlist thumbs die at epoch end. That contradicts the interface's own semantics (a thumb "here" visibly evaporating is *less* honest), makes love and thumbs inconsistent (both explicit, one persists forever, one for 30 min), and swaps a bounded, visible, restorable preference for an invisible expiry. It also does not improve the mood-leakage guarantee: the leak the user described (a skip at 2 pm scoring at 2 am) is already closed for behaviour.
3. The residual risk of `declared` — one misplaced tap colouring a playlist for up to 30 days (half-life) — is real but bounded and visible: playlist-only scope, labelled part "thumbs up here", `Restore` (works for this case — probe E2), and `not_now` as the sanctioned short-lived negative.
4. The tension is *already named*, not hidden: A3 §3.6 ("flagged"), P25, plan doc §2, and `derive.ts` inline comment. That is the standard C2 wants for a deliberate interpretation. Conditions attached: (a) expose or explicitly document the switch — currently hardcoded `scopePersistence: "declared"` in `index.ts:349` with no settings key (hand to C4); (b) keep the byte-parity tests for `global_only` (B2 has them); (c) state the decision and its rationale in the report (ch. 2/3) so reviewers see the adjudication.
5. Note for the record: the probe E2 shows `global_only` provably reduces persistence (0.98 → 0.00 next-day) versus `declared` — the switch is real and testable, whichever way the product later goes.

### 5. Language precision (yoik-like ontology) + quiet-time/ceremony (A2 §4.4 rules 9–10)

- **What the code does**: nothing **auto-applies semantics** to non-Western material — no key/mode outputs, no mood naming, no "song about nature" class strings anywhere; the yoik probe yields an unparsed ask. Arcs are attached by *request* (goal word), not by material classification.
- **What's missing (report as gap, F10/F11)**: there is no material-level flag concept at all — no "ceremonial" tag, no "long-form" tag — so (a) A2 §4.4 rule 9's promised protection ("do not auto-generate pump-up arcs for ceremonial material") has nothing to hook into; (b) A2 §5 row 10's "prefer flat arcs on flagged long-form" has no flag. The only mechanism today is the generic one: explicit user exclusions are hard, and a user can phrase "no drums" etc. Nothing bad *happens* today (no inference from audio — which also matches A2 §4.2 rule 4), but the guardrail chapter must not present these rules as implemented.
- **Yoik**: safe-by-abstention; positive handling (artist-provided descriptions) is future work; keep the report's yoik paragraph sourced to A2 CC-16/17.
- **Recommended minimal next step (for report ch. 5 handoff)**: a user-taggable context flag (e.g., a reserved tag/genre `"ceremony"` the resolver treats as arc-suppressing + default-neutral), requiring no audio inference — the one A2-compatible shape.

---

## Bias statements inventory (quotable — report ch. 3 + agent brief)

Each statement is grounded (finding id or A2 rule) and **true of the shipped slice as reviewed**; where a caveat is part of the truth, it is inside the statement.

1. **Bands are starting points, never laws.** "Tempo/energy bands are research starting points, not universal — they adapt from your feedback and from spot-check corrections." (Shipped string; `SHARED_ASSUMPTIONS.calibration`; A2 CC-29/30/36/37.)
2. **Tempo is the weakest signal.** Tempo octave errors (60/120/240) are a named MIR failure class; the system damps or refuses tempo-derived terms when confidence is low and never renders a low-confidence BPM as a bare fact. (A2 §3.1/§4.4 rule 3; `reliability.ts`; the UI tap-cycle line is *planned*, not done — say so.)
3. **No universal "energy".** Energy-family asks compile to labelled proxies with named inputs (loudness, onset rate, percussiveness, tempo) — loudness deliberately the smallest weight because LUFS ≠ perceived intensity. (A2 §3.4, CC-43..45; `sequence.ts`, lexicon mechanisms.)
4. **No genre→culture claims.** Genre tags are weak hints ("prefer genre tag jazz (soft — tags are weak evidence)"), never a bridge from a label to a culture or a danceability claim. (A2 §4.4 rule 5; probe: "latin party music" → dance from the activity word "party"; "latin" left unparsed with an ask.)
5. **Sensitive words are never product language.** "Tribal", "primitive", "exotic", "gypsy", "world music" appear nowhere in shipped UI/code; the only occurrences are inside user prompts, quoted back verbatim so the user can correct them. (A2 §4.4 rule 8; grep evidence E3.)
6. **Attribution, not absorption — with an honest caveat.** The research pack names traditions and peoples specifically (Ewe; Aka/Baka/Mbuti; Hindustani/Carnatic tala; gamelan/kotekan; Yolŋu manikay; Sámi yoik; Māori taonga pūoro; Northern-style powwow; clave/tresillo; aksak; huayno/siku; ma/jo-ha-kyū); the shipped lexicon cites that pack by rule id and currently names no people in copy — an open item, stated as such (not claimed done). (A2 §4.2; F1.)
7. **No invented traditions, no sacred-knowledge inference.** The system does not infer ceremonial function or cultural semantics from audio, and no tradition-named default ships before consultation; that is deliberately the safe choice. (A2 §4.2 rules 3–4, §4.3; probes "music for my ancestors", "sami yoik".)
8. **Quiet-time/ceremony is a named gap, not a claimed feature.** Nothing auto-generates pump-up arcs for ceremonial material because no ceremonial-flag mechanism exists yet; explicit user exclusions stay hard today, and a context-flag design is the recommended next step. (A2 §4.4 rule 9; F10.)
9. **Learning is epoch-scoped, not person-scoped.** Implicit behaviour is hard-masked at the listening-session boundary (30-minute half-life inside it); only deliberate explicit signals and user-confirmed proposals cross a session — the literal answer to "moods change fast, so must the brain". (User requirement #2; `derive.ts`; isolation tests.)
10. **Nothing crosses a session boundary without a yes.** Proposals are the only behavioural cross-epoch channel; they change nothing until accepted and are gone once dismissed; exploration is OFF by default (and unimplemented in any queue path). (A3 §3.4–3.5; `proposals.ts`, `explore.ts`.)
11. **Deliberate signals persist only in the scope the user chose, and every adjustment can say why.** A playlist thumb stays a playlist signal; "not now" exists for "this moment only"; each track's adjustment shows labelled parts, and forgetting the session clears the rest. (P25 tension named; `scopePersistence` default; readout; `derive.ts` parts; F4 caveat for per-track restore.)
12. **Suspect measurements can't teach feature tastes.** Low-confidence tempo is refused or down-weighted with an explicit note; declared fields never contribute; a skip on unreliable material still counts only as identity-level evidence, not as a tempo/rhythm hypothesis. (A2 §4.4 rule 6, §5 row 12; `reliability.ts`, `derive.ts`.)
13. **Null is never zero.** Unmeasured fields stay unknown with "not measured" reasons; a missing genre tag is not absence; unknown-intensity tracks keep their positions in arcs. (A1 §2.0; plan doc; `sequence.ts`; A2 §3.3 "honest nulls beat false keys".)
14. **No engagement optimisation.** Every adjustment is bounded, tier-limited and explainable; the learner can re-order but never pass a hard rule or widen an exclusion; there are no watch-time metrics and no exploration loop. (Plan doc guardrails; `evaluate.ts`; probe/settings.)
15. **Where the product hasn't built a protection, it says so.** Per-track restore for session hides, ceremony flags, and a surfaced metre-correction UI are open items in this review — carried into the report rather than papered over. (F4/F7/F10/F11; this review's own honesty clause.)

---

## Gaps and risks (explicit UNVERIFIED list)

**UNVERIFIED — do not present as done/false when writing chapters:**
1. **Everything about real music/listening** — fixtures are synthetic; bands, thresholds, magnitudes, classifier accuracy, and all bias claims on real material are untested (stated across receipts/docs; carry).
2. **Restore no-op at route level** — probe-verified at module level with the exact event shape the UI posts; end-to-end click-through was not run (left to C1/C4). Reading `Playlists.tsx` → `derive.ts` shows no other code path that could clear a session hide; the claim stands on code + probe.
3. **F6's "60% sure" perception** — the mismatch between heuristic constants and % display is a judgment, not user-tested.
4. **F10/F11 remedies** — no design exists yet; the "context flag" sketch is a recommendation, not a committed design.
5. **Proposal thresholds/magnitudes** — most speculative constants (docs say so); untuned.
6. **A2's own UNRETRIEVED list carries forward** (Indian intonation; note-density→perceived-speed evidence; Saraga paper text; Agawu/Fürniss/Polak full texts; AIATSIS) — the report must repeat A2's exclusion list, not upgrade those claims.
7. **Scope limits of this review**: new/changed files on this branch + the named docs; no audit of pre-existing repo copy beyond the greps listed; the B5 incident (4 scratch events written into the local dev sandbox, `apps/brain/data/`) reviewed only as disclosed in B5 §6 — its runtime state is C4/B5 territory.
8. **Catharsis "angry" coverage** (F9) — absence confirmed; whether users want it is unverified.
9. **Lab final run** — the historical red was fixed with a regression test; the fresh final-lab capture was in flight (frozen snapshot: `evidence/final-lab/` empty at review time). Quote final numbers from C1/C4, never from this review.
10. **Doc-index update (F14) and settings exposure of `scope_persistence`** — recommended, not verified as required by the dispatch; C4's call.

**Top carried risks for the report (bias lens):** (a) soft preferences tuned on Western-lab samples are applied to all libraries — bounded and labelled, but real ranking bias on non-Western material remains, mitigated only by feedback + corrections + the planned tap-cycle; (b) the guardrails chapter must be trimmed to what is actually true (F1/F2/F10) or the report inherits the overclaims; (c) per-track reversibility of session hides currently exists only through "Forget this session".

---

## Suggested final-report placement

- **Ch. 3 (bias, culture & reliability)** — lead with the *bias statements inventory* (verbatim, numbered); use §"Findings" F1–F13 as the "known gaps / open items" sub-list; the scope_persistence verdict (§4 above) as a sidebar "design decision: what persists, and why"; probes E1/E2 as the verification exhibits ("culture prompts behave defensively", "hide reversibility — module-level probe"), each labelled synthetic-fixture evidence.
- **Ch. 2 (fast learning brain)** — the scope_persistence verdict + "explicit yes" semantics (statements 10–11); F3 as a changelog-style fix item if hotfixed, else a documented mapping.
- **Ch. 4 (verification & handoff)** — F13 (recommend harness scenario 08 for culture prompts, with the E1 prompt set as the seed), F4/F6/F8 as UI-copy/verification follow-ups, V-list items 1–9.
- **Ch. 5 / agent brief (bias, safety, ethics pitfalls)** — statements 1–15 are the brief's skeleton; expand 6, 8, 11 with the F1/F10/F12 caveats and the A2 §4.3 consultation rule ("no tradition-named profile before a decision record + consultation").
- **Hotfix list (for the fixer, in priority order):** F1 (doc sentence), F2 (README paragraph), F3 (reason→`detail` or new reason), F4 (restore clears epoch hide **or** hide the button + copy fix), F5 (pre-click consequence copy), F6 (drop "%", use words) — none require architecture changes.

*End of C2 review. All findings are stated with their evidence; nothing above is fixed in code — the repo snapshot is untouched per the task brief.*

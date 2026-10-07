# W1 — Ch. 1 "Words in, music out — the translation layer"

## Return block (subagent format)

**Conclusion.** Chapter 1 drafted from the assigned sources only: CONTEXT.md, delivery-plan.md (W1 role), A1 §2–4, A2 §5, receipts B1 and H1, reviews C3 (verified behaviour) and C2 (bias statements for tone), plus read-only skims of `apps/brain/src/intent/{lexicon,interpret}.ts` and `apps/brain/src/query/sequence.ts` for exact names. Every factual claim below the divider is traceable to those artifacts; all worked behaviours come from receipts/tests, none is invented. No claim of tuning or validation on real music is made (fixtures are synthetic; the chapter says so).

**Evidence.** B1 §Interfaces (exact `interpretGoal`/`sequenceTracks` surfaces, `goal-lexicon/1` constants); B1 §Evidence (spot-checks + surface-verb follow-up fix; 205-test run at that time); B1 §Analysis 1–10 (supersede, contradiction policy, sequence proxy, coverage gate); H1 §2 (fixes H1-1…H1-8: wave odd-count, note wording "pace/energy", drive supersede, genre guard, two-phase "then/after", copy corrections, catharsis angry triggers; **218 tests at fix time — 216 pass, one pre-existing macOS case-fold red, one environment skip; final counts in verification**); C3 §Findings F-A1-1…F-COPY-1 (what it verified and corrected); C2 §"Bias statements inventory" (statements 1, 10, 13 for the closing notes); `Describe.tsx:98` ("How I read it").

**Analysis.** Structure: problem → pipeline (+ `[FIGURE: flow]`) → goals/bundles/supersede/contradictions/two-moods/asks/audit → sequencing → five worked examples (+ phrase→rule table) → bias & honesty notes. Editorial decisions: (1) sequencing fallback text uses the *post-H1* wording "not enough measured pace/energy data" — the old "intensity" phrasing was renamed for proxy honesty (H1-2 / C2 F8); (2) declared-field honesty is phrased with C3 F-D-1's precision (inert for base ordering; magnitude/interaction effects are a tracked claim item, not presented as unconditional inertness); (3) the fast+calm pair and "workout then sleep" are described as shipped behaviour with their limits (single-arc sequencing; two-phase = first goal + ask).

**Gaps and risks.** (a) No real-music validation exists anywhere in the project — bands, thresholds and classifier accuracy remain research starting points (stated in-chapter); (b) arcs are single full-list approximations of A1 §3 (no hold phases, no learned ramps — C3 F-SEQ-1), noted in the sequencing section; (c) the sequencing note is returned by the API but not yet rendered in the web UI (C3 F-SURF-1) — chapter does not claim it is visible; (d) I did not re-run any suite; counts quoted from receipts with final numbers deferred to ch. 4; (e) culture-note surfacing and other bias depth items are deliberately left to ch. 3.

**Suggested final-report placement.** Chapter 1 as drafted, immediately after the executive summary; `[FIGURE: flow]` to be rendered by the mainline per the delivery-plan figure list ("words → interpret → plan → evaluate → sequence → queue; feedback loop events → epoch policy"). The worked-examples table is reusable by W6 (exec summary) and the closing bias notes feed ch. 3's quotables / the agent brief.

---

# 1 — Words in, music out: the translation layer

## The problem

SynAmp's measurement layer speaks in numbers — bpm, onset rate, percussiveness, integrated loudness — while people speak in intentions: "I need to focus", "pump me up to win this game", "I want to dance". The vocabularies do not map cleanly: a request can be accurate, partial, vague, contradictory, or impossible with today's signals ("90s Mongolian throat singing only"). The translation layer's contract: turn words into a candidate plan while never pretending to understand more than it does.

## The pipeline

Text enters `interpretGoal()` (parser `intent-v1`; `apps/brain/src/intent/interpret.ts`), which composes the rule-based draft parser (`draft.ts`) with the goal lexicon (`lexicon.ts`, `goal-lexicon/1`). The draft converts recognised phrases into an *untrusted* plan object; the lexicon merges goal bundles, applies supersessions, and resolves library-relative bands. Every emitted reading is validated by `validatePlan()` — the closed, versioned plan schema (v2.0, SHA-256-hashed); readings that fail are dropped with a note, never shipped (B1 §Conclusion). Evaluation (`evaluate.ts`) filters and scores the union of the hard guard and similarity channels; `sequenceTracks()` re-orders the already-filtered strict list per the arc; the queue is built from that list.

[FIGURE: flow]

**Hard vs soft — two authorities in one plan.** Hard constraints come from the user's own words: "no words", "no piano", "nothing too slow/relaxing" compile to hard, `explicit_exclusion` rules ("hard; unmeasured fails") — flagged for confirmation, never loosened downstream. Soft constraints come only from research bundles and modifiers; they weight the ranking, never filter. Tests assert that no `goal_*`/`mod_*` term is ever hard (intent.test.ts house rules; B1 §Analysis 4).

## Nine goals, two modifiers

The lexicon carries nine goals — focus, pump_up, dance, calm, sleep, catharsis, nostalgia, drive, chores — each with word-boundary, negation-guarded trigger phrases ("i need to focus", "pump me up", "i want to dance"), plus two tempo modifiers (fast, slow — soft leans only). A **goal bundle** is the goal's set of soft weighted terms (field/op/band/weight plus mechanism and [MP-n]/[CC-n] refs) taken from A1 §2, emitted as `goal_<goal>_<n>`. Emitted weights are floor-normalised so each bundle totals ≤ 1.0 with every term ≤ 0.5, honouring A1 §2.0's dominance convention — user words and bounded feedback outrank research defaults — while research weights stay on the lexicon entries for traceability (B1 §Analysis 1). Weights are research suggestions, not tuned values (A1 §2.0).

**One reading, not a stack.** When a goal matches, its bundle *supersedes* the draft's proxy constraints for that reading — dropped, never kept twice, audited (flagship: draft `focus_arousal`/`focus_pulse` superseded). The same rule fixed "I'm driving to work": the draft's generic "energetic" arousal proxy is superseded by the drive bundle (H1-4; C3 F-A1-1). A supersede can never drop a user exclusion (intent.test.ts).

**Contradictions, deliberately.** Conflicts resolve in a documented order — opposing goal pairs (pump_up↔calm, dance↔sleep), then the documented fast+calm pair, then hard numeric bounds with an empty intersection. Each conflict yields **two readings** plus a clarifying ask; neither side is chosen silently (ties resolve to the first, so the interface must show both labels or a chooser). "fast relaxing bangers" produces exactly that: reading A "energetic but soft" keeps the fast side and adds soft texture terms; reading B "literally calm" drops the fast side and keeps the calm bundle (B1 §Analysis 5; `FAST_CALM_PAIR`).

**Two moods in one ask.** "music for my workout then sleep" is not merged into a self-cancelling wash: the then/after cue builds one reading for the first goal only ("pump up", arc build) plus an ask to request the second phase later (H1-6). Declared conflicts still take precedence ("relax after my workout" yields the two-reading pair).

**Asks, never guesses.** Vague and impossible requests return no readings (`chosen_index: -1`) and 1–3 plain-language asks with reasons: "play me something good" is `vague` — surface verbs ("play", "queue", "start") are glue, not content (a harness-caught, regression-pinned fix) — and "not four-on-the-floor" stays `impossible`, the ask naming the phrase (B1 §Evidence).

**Audit transparency.** Every interpretation ships an audit trail (phrase → becomes; kinds: hard/soft/goal/exclusion/unparsed/note), rendered as the expandable **"How I read it (N)"** (`Describe.tsx:98`): nothing is inferred silently.

## Sequencing: arcs that cannot betray the ask

`sequenceTracks()` only re-orders the already-filtered strict list — it never filters, adds, or scores — so every hard guard stays true at every position (A1 §3; sequence.ts header). Arcs: build (ascending), cooldown (descending), peak (rise then relax), wave (interleaved; implemented and tested, unused by any goal today). Goal arcs: pump_up→build, dance→peak, calm/sleep→cooldown, others flat. "Intensity" means exactly the documented *measured pace/energy proxy*: bpm (weight .35; ×0.5 when tempo confidence is low/missing — octave errors are a known failure class), onset rate (.25), percussiveness (.20), loudness (.20 — deliberately smallest: LUFS ≠ perceived intensity [CC-43..45]). Below 60% coverage the module keeps the ranked order and returns an honest note — "not enough measured pace/energy data (N% coverage) — kept the ranked order"; tracks without measurements keep their positions; null never counts as zero (sequence.ts; H1-2 reworded the note from "intensity" to "pace/energy").

## Worked examples

1. **"I need to focus. no words, no piano, nothing too slow/relaxing."** → `specific`; one reading; the user's words stay hard; focus bundle F1–F10 merges; arc flat.
2. **"pump me up to do this task / win this game"** → `goal_pump_up_*`; arc build.
3. **"I want to dance"** → `goal_dance_*`; arc peak.
4. **"play me something good"** → `vague`; no readings; asks carry the next step.
5. **"fast relaxing bangers"** → `contradictory`; two readings ("energetic but soft" / "literally calm") plus one clarifying ask.

All five are receipt-verified spot-checks (B1 §Evidence; intent.test.ts; re-run in H1 §3).

| Phrase | Outcome | Key rules |
|---|---|---|
| "I need to focus. no words, no piano, nothing too slow/relaxing." | specific, 1 reading | hard `no_words` / `no_piano` / `not_slow` / `not_relaxing` + `goal_focus_1…10`; supersede of draft proxies; arc flat |
| "pump me up… win this game" | specific/partial | `goal_pump_up_*`; arc build |
| "I want to dance" | specific | `goal_dance_*`; arc peak |
| "play me something good" | vague | 0 readings; asks (surface verbs = glue) |
| "fast relaxing bangers" | contradictory | two readings + ask; `FAST_CALM_PAIR` |

All behaviours above are test-verified against **synthetic fixtures** — they prove logic, not classifier accuracy on real music; nothing here is tuned or validated on a real library. At fix time the brain suite stood at **218 tests (216 passing; one pre-existing macOS case-fold red, one environment skip)** — final counts live in verification (ch. 4).

## Bias and honesty notes (quotable)

- **Bands are research starting points, not universals.** "Tempo/energy bands are research starting points, not universal — they stay soft and learn from your session feedback and spot-check corrections." (`SHARED_ASSUMPTIONS.calibration`; A1 §2.0; A2 CC-29/30/36/37).
- **Declared-field terms are inert until producers land.** Voice, instrument and mood-style fields have no producer today; terms on them emit `unknown_policy: "neutral"` with the note "no producer yet — inert on real data" and are unknown for every track on a real library. (C3 F-D-1 precision: they don't change base ordering; the magnitude dilution is a tracked claim item.)
- **Nothing is inferred silently.** Unparsed text is reported, ambiguity becomes asks, every reading ships its audit trail (B1 §Analysis 7; C2 P10).

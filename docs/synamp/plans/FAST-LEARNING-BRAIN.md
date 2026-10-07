# Fast learning brain — goals in, session-scoped learning out

Status: 2026-10-06, branch `feat/fast-learning-brain` (working tree; no commits at
receipt time). Translation (`src/intent/`), session-scoped learning (`src/learning/`),
arc sequencing (`src/query/sequence.ts`) and the verification harness
(`tools/brain-lab/`) landed with the engineering receipts B1/B2/B4. The integration
pass wires the endpoints, the resolve seam, the settings and the web readout named
under “Integration points” below — those names are the frozen contract for this
slice (most of the wiring landed in the working tree while this document was
finalised; see “Evidence states”). Read “Evidence states” before quoting any number.

## Current boundary

Already in place before this slice (mainline-verified; see
[AGENT-ROADMAP.md](AGENT-ROADMAP.md)):

- **P2 query layer** (`apps/brain/src/query/`): signal registry with per-field status
  (`produced` / `declared` / `metadata`) and gates (`signals.ts`); closed, versioned
  plan schema with a stable SHA-256 hash (`plan.ts`); deterministic two-channel
  evaluation — hard guards on the union, strict + near-miss tiers, caps + MMR,
  per-track reasons, honest counts (`evaluate.ts`); rule-based draft parser standing
  in for the LLM (`draft.ts`); file-backed library signals on a synthetic 60-track
  sample fixture (`library.ts`).
- **P3 session & feedback** (`apps/brain/src/session/`): append-only JSONL event log
  with dedupe and torn-line recovery (`events.ts`); server-owned session with queue
  snapshots, server-classified reports and exposure records (`session.ts`);
  replayable `heuristic-v1` re-ranker, bounded and strict-tier-only (`feedback.ts`);
  human tempo verification (`library/spotcheck.ts`).

This slice adds (all under `apps/brain/` unless noted):

| Area | Files | What it does |
|---|---|---|
| Intent layer | `src/intent/lexicon.ts`, `src/intent/interpret.ts` | goal language → validated plan readings; accuracy classes; asks instead of guesses |
| Learning core | `src/learning/{types,epochs,reliability,derive,proposals,explore}.ts` | policy `epoch-v1`: epochs, evidence tables, combined view, hides, proposals |
| Sequencing | `src/query/sequence.ts` + `plan.ts` arcs | `build` / `cooldown` / `peak` / `wave` over the already-filtered strict list |
| Event log | `src/session/events.ts` | one additive signal: `learning_reset` (append-only forget marker) |
| Harness | `tools/brain-lab/` | one-command acceptance scenarios + machine-readable evidence |
| Integration | routes, resolve seam, settings, web readout | frozen contract, listed under “Integration points” |

## The two halves

### 1. Translation — goal language into validated plans (`src/intent/`)

- **Lexicon** (`lexicon.ts`, `goal-lexicon/1`): nine EN goals — focus, pump up,
  dance, calm, sleep, catharsis, nostalgia, drive, chores — as *soft* preference
  bundles compiled from the music-psychology pack (A1 §2): namespaced constraint ids
  (`goal_<goal>_<n>`), library-relative quantile bands (resolved at interpret time;
  skipped with a note below 3 measured tracks — never an absolute fallback),
  suggested arcs, plain-language assumptions, caveats and culture notes, plus tempo
  modifiers (`fast`, `slow`) and the documented “fast + calm” pair. Trigger matching
  is word-boundary, longest-first, and negation wins over everything — “no dance
  music” is an exclusion, never a dance goal.
- **Interpreter** (`interpret.ts`, parser `intent-v1`): composes the draft parser
  with the lexicon — draft plan → goal-bundle merge (max 2 goal bundles per reading)
  → **accuracy classification** → readings + asks + audit. Every reading’s plan is
  run through `validatePlan()`; invalid readings are dropped with a note, never
  shipped.
- **Accuracy classes**, rules ordered as in the code: `contradictory` first — a
  provable conflict (opposing goal pair: pump up ↔ calm, dance ↔ sleep; the
  fast + calm pair; two hard numeric bounds with an empty intersection) resolves
  into **two readings**, neither side silently chosen, each side force-dropping the
  other side’s draft proxies; then `specific` (a valid reading, nothing unmapped),
  `partial` (a valid reading, some content unmapped), `impossible` (structured
  unsupported asks — “songs with exactly three clarinets” — or content we cannot
  measure), `vague` (nothing enforceable). Vague and impossible return **no
  readings** (`chosen_index: -1`) and up to three plain-language asks with reasons.
  **Asks never guess.**
- **Supersede map**: when a goal fires, the draft parser’s cruder proxies for the
  same idea are dropped with audit notes (focus → `focus_arousal`, `focus_pulse`;
  pump up → `energetic`; calm and sleep → draft `calm`). Explicit user exclusions
  can never be dropped by `supersedes`.
- **Soft-only, declared fields inert — with one precise caveat**: no lexicon
  constraint is ever hard — the only hard rules are the user’s own words from the
  draft. Declared fields with no producer are emitted with
  `unknown_policy: "neutral"` and the note “no producer yet — inert on real
  data”; they can never filter, and they do not change *base* score ordering —
  but they are not free: an unmeasured neutral term still enters the soft average
  as a constant 0.5 saturation at full weight (`evaluate.ts` scores soft terms as
  `Σw·sat/Σw`), which dilutes the produced-term gaps, so bounded feedback (±0.15)
  and the MMR/caps selection pass can differ at the margin when many are present
  (review probes on the synthetic fixture: a loved track ranks 8 with the declared
  focus terms vs 12 without; 16 of 24 MMR picks differ with zero feedback).
- **Weight normalisation**: emitted bundle weights are floor-normalised to the
  ≤ 1.0 convention (scale = 1/total, applied only when a bundle’s research total
  exceeds 1.0; `Math.floor` at 3 dp). Within a pure goal-bundle this is
  score-neutral up to ≤ 0.001/term floor truncation — a uniform scale cancels in
  the weighted average (`Σw·sat/Σw`); in mixed plans it reduces the bundle’s
  aggregate share of the soft-weight denominator relative to other soft terms
  (user-said terms gain relative weight), so mixed rankings are not bit-identical
  to raw research weights.
- **Arc sequencing** (`sequence.ts`; `plan.ts` now accepts the four arcs instead of
  reporting them as unsupported asks): a documented intensity proxy from produced
  fields only — bpm (damped ×0.5 when `tempo_confidence` < 0.5 or unknown), onset
  rate, percussiveness, loudness (smallest weight, “loudness ≠ intensity”) — with a
  60 % coverage gate and an honest fallback note; unknown-intensity tracks keep
  their exact positions (“null is never zero”). The strict list is only ever
  permuted, never filtered or re-scored; near-miss is untouched. Plans carrying
  arcs now hash as such (previously the arcs were stripped); `flat` hashes exactly
  as before.

### 2. Learning — `epoch-v1`, scoped to the listening moment (`src/learning/`)

- **Epoch definition** (`epochs.ts`): an epoch is one listening context, derived from
  the event log — a break happens when the session key changes, when the idle gap
  is over **30 minutes** (29:59 keeps the run, 30:01 splits it), or when the local
  calendar day changes. Events without a `session_id` are their own bucket and
  never merge into a session’s epoch. **Dayparts** label the start: morning 05–12,
  afternoon 12–17, evening 17–22, night 22–05 (IANA timezone injectable; tests pin
  one). The epoch is *live* for **30 minutes** after its last event; older means
  “no active session — learning is paused”. `epoch_id` is `"ep1:" + sha256(t_start, t_end, first_event_id)[0..15]`.
- **Evidence weights** (candidate values, A3 §3.2) — L1 persistent (explicit
  signals only) and L2 epoch (implicit + explicit inside the live epoch;
  contribution = magnitude · confidence · 0.5^((now − ts) / 30 min)):

  | Layer | Signal | Magnitude | Confidence | Decay | Reason label |
  |---|---|---|---|---|---|
  | persistent | love | +2 | 1.0 | 180 d | “you loved this” |
  | persistent | thumb up (playlist / global) | +1 | 0.9 | 30 d / 180 d | “thumbs up here” / “thumbs up” |
  | persistent | thumb down (playlist / global) | −1 | 0.9 | 30 d / 180 d | “thumbs down here” / “thumbs down” |
  | epoch | full play | +0.5 | 0.5 | 30 min | “heard it through this session” |
  | epoch | repeat | +1.0 | 0.7 | 30 min | “replayed this session” |
  | epoch | early skip | −0.6 | 0.5 | 30 min | “skipped early this session” |
  | epoch | late skip | −0.1 | 0.2 | 30 min | “skipped late this session” |
  | epoch | other-app play | +0.25 | 0.5 | 30 min | “played in your other apps this session” |
  | epoch | not now | −1.0 | 0.9 | hide | “not now — hidden until this session ends” |

- **Hides**: a track skipped early **twice** inside an epoch, or marked “not now”,
  is hidden for the rest of that epoch — then forgotten. Persistent removes stay
  playlist-scoped (restore undoes) and union with epoch hides at the resolve seam.
  Hides are recomputed from the active evidence, so a reset clears them.
- **Reliability-weighted centroids** (`reliability.ts`, `derive.ts`): five produced
  axes — tempo, loudness, crest factor, onset rate, percussiveness — standardised
  against robust library stats (median / 1.4826·MAD; ≥ 4 usable library values
  required). Keep and skip sides each form a centroid scored by a Gaussian kernel;
  **gates**: keep side needs ≥ 3 kept tracks, skip side ≥ 2, coverage ≥ 60 %,
  spread floored; keep weight β = 0.5, skip weight γ = 0.15; the whole feature
  layer caps at ±1.0; every contribution carries a human label (“tempo ~99 BPM —
  you kept 3 such tracks this session”). `bpm` is gated by `tempo_confidence`:
  full weight ≥ 0.5, down-weighted below 0.5, unusable ≤ 0.2 or missing — with an
  explicit note either way. Declared or missing fields never contribute.
- **Artist propagation**: a track inherits π = 0.35 of the artist’s other-track
  evidence, only with ≥ 2 events or raw |sum| ≥ 1.0, capped ±0.8 — one thumbs-down
  does not tar a whole artist. (Spec vs implementation: A3 §3.3(b) prose reads
  “≥ 2 distinct tracks”; P17 and the shipped gate count events — two events on
  one other track open it.)
- **One combined saturation**: `adjust()` returns L1 + L2 + artist + centroids as
  ONE value with fixed-order, labelled parts; `evaluate.ts` keeps the existing
  bounded application `0.15·tanh(v/2)` inside the strict tier. Fast response: one
  love lands ≈ +0.114 (near the ±0.15 cap); one epoch half-life is 30 minutes.
- **Proposals** (`proposals.ts`) — the only cross-epoch channel: a pure scan over
  closed epochs (30-day window; the live epoch excluded) surfaces five kinds —
  track repeat-skip, artist repeat-skip, “not now” pattern, other-app positive,
  repeat positive — each requiring recurrence across **epochs AND dates** (some
  also dayparts or ≥ 2 tracks), with stable `pr1:` ids. A proposal changes nothing
  until the user confirms it as an explicit signal or a plan edit.
- **Exploration** (`explore.ts`): implemented, **default OFF**; the OFF path is
  byte-identical to no flag at all. When a queue builder opts in, it may pick one
  deterministic slot (sha256 of epoch id + counter) and records the exposure.
- **`scope_persistence`**: `"declared"` (default — thumbs keep the scope you chose)
  or `"global_only"` (playlist thumbs become epoch-scoped).
- **Determinism**: everything is a pure function of (event log, library, options,
  `now`) — no clock reads (the derivation throws without `now`), identical inputs
  give byte-identical views, hides, notes and proposals; `learning_reset` markers
  (forget) bound the active epoch without ever touching the log.

## Why it is shaped this way

- **“Moods change fast, so the brain forgets fast.”** A skip at 2 pm is not a fact
  about 2 am: implicit evidence is *masked*, not merely decayed — it scores only
  inside the live epoch and is killed at the boundary (30-minute half-life within
  it). The learning unit is the listening moment, not the person; only deliberate
  explicit signals persist.
- **“Null is never zero.”** Unmeasured axes are skipped and reported, never filled
  with neutral values; unknown-intensity tracks keep their positions in arcs;
  declared fields never contribute a measurement (their constant-0.5 dilution is
  the caveat spelled out under 1. Translation); a missing genre tag is not
  absence. Every place a value is absent, the output says so.
- **“A method’s rejection is not musical truth.”** Reliability gating keeps suspect
  measurements out of feature learning (low-confidence tempo first; declared fields
  always) — a bad tempo estimate can never teach the brain a taste it will hold
  against a song. Contradiction handling (two readings) is the same principle
  applied at translation time.
- **“Nothing crosses a session boundary without a yes.”** The cross-epoch channels
  are explicit signals (love / thumbs / remove) and proposals; a proposal is a
  suggestion that changes nothing until the user confirms it; exploration is off;
  the derivation is fully replayable, so learning can always be traced,
  re-derived, or forgotten.

## Integration points

The slice's frozen integration contract (landed in the working tree; review and
route-level smoke are the verification round's job):

- **Resolve / preview seam.** Resolve, preview and saved-playlist evaluation pass
  the active policy's combined view as the evaluation's `feedback`; in epoch mode
  it also arrives as the `adaptive` hook, so epoch hides apply to every resolve;
  hides apply as the union of persistent removes and epoch hides; arc sequencing
  runs after evaluation over the strict list only, and its notes ride back as
  `sequencing_applied`; each evaluation echoes the policy that shaped it.
- **`POST /api/v1/plans/draft`** gains `interpretation` additively — accuracy,
  reading summaries (label / confidence / assumptions / `chosen` flag), asks, audit;
  reading plans stay server-side. When a reading is chosen, its plan supersedes the
  raw draft for validation and preview; `chosen_index: -1` means “show the asks,
  not a plan”.
- **`GET /api/v1/brain/session`** — the readout: policy version, the configured
  listening policy, the active epoch (or `null` with the “paused” note), hides,
  undecided proposals, reliability notes, and per-track adjustments for the current
  queue (≤ 50 entries, canonical ids).
- **`POST /api/v1/brain/forget`** — scope `epoch` (enforced): appends a
  `learning_reset` marker and returns the fresh readout; the append-only log is
  never edited or deleted.
- **`POST /api/v1/brain/proposals`** — decide on one suggestion:
  `{id, action: "accept" | "dismiss"}`. Accepting writes one explicit signal with a
  stable event id (so retries dedupe); dismissing records the decision in
  `brain-proposals.json` without touching the log; both filter the readout. The
  proposal list itself rides the session readout — this endpoint changes state.
- **Settings `listening_policy`**: `"epoch-v1"` (default) | `"legacy-v1"`.
  `legacy-v1` is the untouched `deriveFeedback` path labelled `heuristic-v1`; both
  read the same log, so switching is a re-derive — never a migration.
- **`POLICY_VERSION`** bumps `"heuristic-v1"` → `"epoch-v1"` so appended events
  carry the policy that shaped them; any change of meaning ships as a new version
  plus a re-derive.
- **Web readout**: a this-session panel on The Brain screen (epoch, hides,
  proposals with their evidence, forget); the Describe panel shows interpretation
  summaries; the player bar is untouched.
- **Harness hook**: `tools/brain-lab/` covers module-level acceptance; route-level
  smoke (curl transcripts) is the integration pass’s verification step.

## Bias & ethics guardrails

- **Attribution, not flattening — stated precisely.** Culture knowledge stays
  attributed, in exactly two places: the research appendix (A2) names traditions
  and peoples specifically (Ewe; Aka/Baka/Mbuti; Hindustani/Carnatic tala;
  gamelan/kotekan; Yolŋu manikay; Sámi yoik; Māori taonga pūoro; Northern-style
  powwow; clave/tresillo; aksak; huayno/siku; ma/jo-ha-kyū). What ships is
  narrower: the lexicon cites that pack by rule id only; its culture notes are
  metadata (rendering them is an open review item) and name no tradition or
  people; no tradition-named default ships, and any future one goes through the
  A2 §4.3 consultation + decision record first. There is no “universal energy” —
  energy-family asks compile to labelled proxies with named inputs (loudness, onset
  rate, percussiveness, tempo confidence) and plain reason strings. The shared
  calibration line labels every reading’s bands as starting points; they are
  library-relative quantiles, not laws; genre tags stay weak hints (a missing tag
  is never absence). Metre/tempo conventions are never hard-enforced — the ban is
  code-level today; a surfaced UI copy line is an open review item.
- **Reliability honesty.** Suspect measurements are not presented as facts:
  low-confidence tempo is down-weighted or unusable with an explicit note (“tempo
  confidence 0.4 — down-weighted”), never a bare number; spot-check corrections
  arrive as human-verified confidence. The planned tap-cycle extension (A2 §4.4)
  brings “tempo unclear — tap it” and metre states to the UI.
- **Don’t learn feature hypotheses from suspect metrics.** The centroid layer
  refuses unusable axes (declared fields, missing values, low-confidence tempo)
  with notes instead of zero-filling — a rejected method or measurement is not
  evidence about music. The epoch layer keeps identity-level evidence (this track,
  this artist, here) even when feature evidence is gated.
- **No engagement optimisation.** Every adjustment is bounded (feature layer ±1.0,
  artist ±0.8, final application within ±0.15), strict-tier-only, and explainable
  per track; exploration is OFF by default and exposure records stay
  `deterministic_rank` (no invented propensities). The learner can re-order, but it
  can never get a track past a hard rule or silently widen an exclusion.
- **An explicit yes before anything crosses an epoch.** Proposals change nothing
  until confirmed; only explicit signals persist; forget is one call.

## Evidence states

**Confirmed** (code in the working tree; receipts B1/B2/B4/B4b):

- Full brain suite (**final verified capture: 218 tests / 216 pass + 1
  pre-existing macOS failure + 1 skip**). The failure is the macOS case-fold
  librarian artifact (also red on `main`), the skip the `/dev/shm` case — both
  carried from the **149**-test baseline (147 pass · 1 fail · 1 skip). B1’s
  earlier run captured **205** (203 pass · 1 fail · 1 skip; +56 new tests: 20
  translation/sequencing, 36 `learning/*`); the tree grew to **218** as
  integration and hotfix tests landed (210 → 212 → 218 across the review rounds —
  earlier counts superseded). `@synamp/brain` + `@synamp/web` type-check exit 0.
- Named falsification evidence (B2): epoch isolation byte-compare both directions
  (a later day’s implicit events leave the earlier snapshot byte-identical);
  resume-keeps / 30:01-fresh; midnight kills evidence; in-epoch half-life
  (+60 min ≤ 0.25× fresh); flood bounds (20 loves / 20 skips stay within the
  ±0.15 application); hide rules (2nd early skip, `not_now`, expiry);
  explicit-only parity with `deriveFeedback`; determinism under reversed
  insertion; `learning_reset` bounds evidence, clears hides, L1 survives;
  exploration OFF path byte-identical to no flag.
- Harness (B4/B4b/H4), one command
  (`node --experimental-strip-types tools/brain-lab/lab.mts`): **final verified
  capture: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 documented
  skips** (canonical in `evidence/final-lab/`; runs byte-identical modulo the
  timestamp). History: B4’s canonical capture (2026-10-06 23:09:50 CDT) was
  **7 scenarios · 64 scored checks (63 pass · 1 fail) + 5 not-applicable
  skips**; the B4b refresh converted two skips into real checks and re-ran
  green, and the H4 re-sync (post-hotfix) added the culture-guardrails scenario
  and the wave regression checks — earlier captures superseded. The one old red
  — “play me something good” classified `impossible` instead of `vague` (one
  word missing from the residue filler list) — was fixed with a regression test.
  Scenario highlights:
  skips ×2 → hides {sample-026, sample-028}, kept tracks rise to the top (05);
  the same stream at now + 16 h → all probes +0.000, resolve byte-identical to
  baseline (06); a `learning_reset` marker → zero / empty everywhere (07).
- Translation behaviours: flagship phrases (focus, “pump me up”, “dance”)
  classify `specific` with valid chosen readings; “fast relaxing bangers” →
  `contradictory` with two readings, both valid; the impossible clarinet ask stays
  honest; arcs validate, round-trip and hash (plans carrying arcs hash differently
  than the old stripped form; `flat` unchanged).

**Partial:**

- The integration seams (routes, `listening_policy`, the `POLICY_VERSION` bump,
  the `evaluate.ts` hook, web readout) are the frozen contract listed above; the
  wiring landed in the working tree while this document was being finalised.
  Verified by reading: the routes and `/plans/draft` interpretation in
  `src/index.ts`, `listening_policy` in `settings.ts`, `POLICY_VERSION = "epoch-v1"`
  and the `learning_reset` member in `events.ts`, the hide union and
  `adaptive` hook in `evaluate.ts`; the web readout was still in flight at the
  last check. Route-level smoke is the integration pass's verification step —
  verify against the landed code before relying on details.
- Contradiction detection for hard numeric bounds is a closed-interval
  approximation (misses conflicts provable only on strict bounds — a documented
  trade-off).
- Culture notes exist as lexicon metadata; rendering them (and the metre-
  convention note) in UI copy is an open review item.
- Saved plans freeze resolved quantile bands at save time — a library change
  re-resolves only on re-draft (intentional, for hash stability).

**Unverified:**

- Everything about real music and real listening: the sample library is synthetic,
  and fixtures are never evidence about real music. No session on the real library
  has shaped this layer yet; the harness proves logic, not classifier accuracy.
- Reliability weights exist for `bpm` only; other axes are placeholder 1.0 until
  producers expose uncertainty (P4).
- Proposal thresholds are the most speculative constants; energy-axis collinearity
  is contained, not solved.

**Candidate values.** Every magnitude, confidence, half-life, gate and threshold
in `src/learning/types.ts` (evidence tables, `FEATURE`) and `PROPOSAL_THRESHOLDS`
is a candidate value from the research packs / learning-science spec — a testable
hypothesis, not tuned evidence. Treat every number as unproven until a real
session tunes it under a new policy version.

## Rollback & operations

- **Branch.** The slice ships as a single commit on `feat/fast-learning-brain`
  (see the delivery manifest for the hash); `git diff main..feat/fast-learning-brain`
  produces the full patch; revert = reset the branch to `b6ea5ce1`. Nothing
  migrates data, so reverting is safe.
- **Runtime switch.** Setting `listening_policy` = `epoch-v1` (default) |
  `legacy-v1`; the legacy path is the untouched `heuristic-v1` derivation — same
  log either way, so switching re-derives.
- **Forget.** `POST /api/v1/brain/forget` appends a `learning_reset` marker; the
  active epoch’s evidence is bounded to events after the marker, and hides are
  recomputed (they clear). Explicit L1 cells (love / thumbs / removes) survive a
  reset by design — the endpoint’s scope is the epoch; widening it is a deliberate
  one-spot change, not a silent one.
- **Event log.** Append-only and never edited; the only change to `events.ts` is
  the `learning_reset` union member. Policy meaning changes ship as a new version
  string plus a re-derive, never as log rewrites.
- **Operations.** Views are pure and recomputed per request (fine at current
  scale); the harness re-runs the acceptance scenarios after any policy change;
  the test and lab logs are the evidence record.

## Handoff — next smallest experiments

1. **First real-library session.** Run this branch against the real library, listen
   one session through the player, then read `GET /api/v1/brain/session`: do the
   hides, adjustments and proposals match what you actually meant? This is the
   first non-fixture evidence any of these numbers will get.
2. **Tune the P-values.** With that session’s data, revisit the evidence
   magnitudes, centroid gates and proposal thresholds; ship changes as a new
   policy version and re-run the lab. Nothing here should be tuned from the
   synthetic fixture.
3. **Tap-cycle spot-check extension (A2 §4.4).** Extend the existing spot-check to
   tap-the-cycle (2/4/8), odd cycles (5/7/9/11) and “layered/ambiguous”, storing a
   human-verified tier that supersedes measured values; then let reliability gating
   consume the metre / verification state.
4. **Exploration when data justifies it.** Keep the flag OFF; when a queue builder
   wants a novelty slot, switch it on for one deterministic slot and record the
   exposure (`deterministic_rank+explore_slot`).

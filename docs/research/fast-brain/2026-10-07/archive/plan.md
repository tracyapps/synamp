# Dispatch plan — synamp-fast-brain (SynAmp fast learning brain)

Read `CONTEXT.md` in this directory first. User request + Goal Brief: see CONTEXT.md §"The ask"
and `get_goal` contract. Repo: `~/_dev/web-apps/SynAmp`, branch `feat/fast-learning-brain`.

## Assumptions (stated at delivery)

1. "Fast learning" = within-session adaptation from implicit signals (skips/completions/repeats)
   + explicit signals (love/remove), derived deterministically from the existing event log.
2. Session isolation = learning scope keyed to a listening *epoch* (session id + continuity gap +
   daypart context); cross-epoch effects only via explicit global signals or corroborated patterns
   with user confirmation (proposals). No ML training pipeline required; keep replayable policy
   versions like `heuristic-v1`.
3. Deliver code integrates with the existing query/session modules (extend, don't rewrite, unless
   a finding justifies it — state the justification). All new code deterministic, strip-types safe.
4. The web app gains a small "this session" surface only if it fits the existing design system
   (project context beats the generic visual preset; explain in delivery).

## Deliverable definitions

- **Code library**: new modules in `apps/brain/src/{intent,learning}/` + sequencing (`query/sequence.ts`)
  + integration edits (index.ts routes, evaluate options, web panel) + tests, on branch
  `feat/fast-learning-brain`; snapshot + patch in `DELIVERY/code/`.
- **Docs**: `docs/synamp/plans/FAST-LEARNING-BRAIN.md` in repo; AGENT-ROADMAP dated entry.
- **Report**: `DELIVERY/SynAmp-Fast-Brain-Report.html` (chapters + sources appendix + diagrams),
  PDF bonus if tooling permits.
- **Agent instructions**: `DELIVERY/agent-instructions/AGENT-BRIEF-FAST-BRAIN.md`.
- **Evidence**: `DELIVERY/verification/` — baseline + final test logs, smoke transcripts,
  screenshots if feasible, review.md copy.

## Round A — research & context (4 subagents, parallel)

| # | Subagent | Role perspective | Output | Depends |
|---|----------|------------------|--------|---------|
| A1 | Music Psychologist (agent: music-psychologist) | Domain research (goal language ↔ constructs ↔ features; affect science; sound & brain) | `A1-music-psychology.md` | — |
| A2 | Cross-cultural & bias researcher | Domain research + adversarial bias lens (non-Western/Indigenous knowledge, MIR reliability, ethics) | `A2-cross-cultural-metrics.md` | — |
| A3 | Data Science & ML (agent: data-science-machine-learning-sp) | Algorithm research (session-scoped learning designs, formulas, parameters, evaluation) | `A3-learning-science.md` | — |
| A4 | Code interface audit | Code risk / interface audit (extension points, baseline test evidence) | `A4-code-integration-map.md` | — |

Review items fed by A-round: lexicon defaults must be evidence-cited (C3 music psychologist, C2
bias); reliability heuristics must reference MIR literature (C2); learning parameters must be
justified + testable (C1, C3).

## Round B — engineering, wave 1 (3 subagents, parallel; disjoint file ownership)

| # | Subagent | Perspective | Files (sole writer) | Output receipt |
|---|----------|-------------|---------------------|----------------|
| B1 | Goal interpreter & sequencing | Feature engineering | `src/intent/**` (new), `src/query/sequence.ts` (new), edits `src/query/plan.ts` (arcs), `src/query/query.test.ts` (arc tests) | `B1-intent.md` |
| B2 | Session learning core | Feature engineering | `src/learning/**` (new only) | `B2-learning.md` |
| B4 | Verification harness & baseline | Verification engineering | `tools/brain-lab/**` (new), fixtures under `tools/brain-lab/` | `B4-harness.md` |

Frozen interfaces (mainline; engineering must implement exactly these seams):

- `apps/brain/src/intent/interpret.ts`:
  `interpretGoal(text: string, opts: { library?: Library; now?: number }): GoalInterpretation`
  where `GoalInterpretation = { accuracy: "specific"|"partial"|"vague"|"contradictory"|"impossible";
  readings: Reading[]; chosen_index: number; asks: Ask[]; audit: AuditEntry[];
  parser: string }`; each `Reading = { label: string; confidence: number;
  plan: unknown /* untrusted, feed validatePlan */; assumptions: string[] }`.
  Must compose with existing `draftPlan` + `validatePlan`; every reading's plan must validate
  or be reported with structured errors. No new plan fields without updating plan.ts + tests.
- `apps/brain/src/query/sequence.ts`:
  `sequenceTracks(tracks: ResultTrack[], plan: QueryPlan, opts: { library: Library }): { tracks: ResultTrack[]; applied: string[] }`
  — deterministic re-ordering for arcs `build`/`cooldown`/`peak`/`wave` using a documented
  intensity proxy with reliability weighting; falls back to ranked order with an honest note when
  data is insufficient. plan.ts must accept these arcs (no longer "unsupported").
- `apps/brain/src/learning/derive.ts`:
  `deriveAdaptive(events: readonly ListeningEvent[], opts: { now: number; library: Library;
  canonical?: (id: string) => string; context?: { playlist_id?: string; plan_hash?: string;
  goal?: string } }): AdaptiveView` where
  `AdaptiveView = { policy_version: string; epoch_id: string; epoch_context: EpochContext;
  hides: ReadonlySet<string>; adjust(trackId: string): { value: number; parts: {label,value}[] };
  proposals(): Proposal[]; reliabilityNotes(): string[] }`
  — bounded like v1 (±max), strict-tier-only application, pure derivation, epoch-scoped.
- B5 (wave 2) wires: `/api/v1/plans/draft` response gains `interpretation` (additive);
  new `GET /api/v1/brain/session` (adaptive readout + proposals + epoch info);
  new `POST /api/v1/brain/forget` (scope: epoch); resolve pipeline applies
  sequence + adaptive inside strict tier; `evaluate.ts` gains optional adaptive hook.

## Round B2 — integration & web (1 subagent, single writer for shared files)

| # | Subagent | Perspective | Files (sole writer) | Output |
|---|----------|-------------|---------------------|--------|
| B5 | Integration engineer | Integration & smoke verification | `src/index.ts`, `src/query/evaluate.ts` (additive), `src/session/feedback.ts` (if needed), `apps/web/src/Describe.tsx`, `apps/web/src/Playlists.tsx` or new `apps/web/src/BrainSession.tsx` + `styles/brain.css`, `apps/web/src/api.ts` (if needed) | `B5-integration.md` |

Runs: full brain test suite, `pnpm type-check`, boot brain dev server on a scratch data dir
(`BRAIN_DATA_DIR`/env per A4 memo), curl smoke of new endpoints, web build; screenshot if puppeteer
available. Fixes wiring bugs surfaced by B1–B4 integration.

## Round C — review (4 subagents, parallel, after B5 green)

| # | Reviewer | Dimension | Output |
|---|----------|-----------|--------|
| C1 | Code correctness & numbers | Re-run tests; adversarial falsification of epoch isolation, determinism, bounds, decay math; edge cases (torn log, duplicate events, empty epoch, day rollover) | `C1-code-review.md` |
| C2 | Bias & ethics adversarial | Dominant-culture bias, Indigenous knowledge handling, overclaiming, data governance (CARE), privacy/dark-pattern risks in learning features | `C2-bias-review.md` |
| C3 | Music Psychologist (agent) | Do goal profiles & learning behaviour match affect-science evidence; flag overclaims; iso-principle/entrainment/groove claims checked | `C3-psych-review.md` |
| C4 | Production readiness | Error paths, config, rollback (branch/revert/policy switch), handoff completeness, docs conventions, DELIVERY audit | `C4-production-review.md` |

Conclusions → `review.md` (confidence: High/Medium/Low/Conflict; conflicts listed, not smoothed).

## Round D — writing & assembly (mainline orchestrated)

- D1..D4 chapter writers (subagents) draft chapters from A/B/C material + repo (see brief.md
  before writing): (1) what & why incl. translation layer; (2) the fast learning brain; (3)
  bias, culture & reliability; (4) verification, handoff, rollback, risks. Executive summary is
  written last from the actual output.
- Mainline renders `DELIVERY/SynAmp-Fast-Brain-Report.html` (preset "11 Build" after reading
  `aesthetic-preset-library` skill), stages `DELIVERY/code/`, `DELIVERY/agent-instructions/`,
  `DELIVERY/verification/`, writes `brief.md`.

## Round A outcomes & mainline decisions (frozen before engineering)

**A-packs delivered** (all in this directory): A1 (goal bundles F/P/D/S/C/N/V/W; 34 sources), A2 (traditions, perception, MIR failures, ethics; CC-1..52 + UNRETRIEVED list; rescued from a timeout by resume), A3 (epoch-v1 spec; params P1-P25; eq(4) composition; evaluation plan), A4 (baseline 147/149 pass + 1 skip — macOS-only librarian case-fold test, pre-existing on main; brain/web type-check clean; integration map + recipes + landmines).

**Baseline red list to carry, not chase:** librarian case-fold test (macOS-only); root type-check webamp chain (pre-broken, unrelated).

**Decisions (freeze):**
1. Forget = append-only `learning_reset` marker event (Signal union addition; B2 owns it; B5 owns the endpoint). Events are never edited or deleted.
2. Epoch semantics per A3 §3.1: idle gap 30 min; local-day break; session-id-change break; live window 30 min; epoch_id = "ep1:" + sha256(t_start, t_end, first_event_id)[0..15]. Dayparts (local): morning 05-12, afternoon 12-17, evening 17-22, night 22-05. Timezone injectable (tests pin America/Chicago); default = server local.
3. Policy `epoch-v1`: one combined view implementing the FeedbackView surface (removed/adjust); value = explicit-persistent + epoch entity/artist + reliability-weighted centroids inside ONE tanh (A3 eq 4, W=0.15). Hides = persistent removes ∪ epoch hides (skip_early ×2 → hide; `not_now` → hide; both die at epoch end). Proposals are the only cross-epoch channel (A3 §3.4 thresholds). Exploration default OFF (flag implemented; OFF ⇒ byte-identical). `scope_persistence`: declared | global_only (default declared). Rollback via setting `listening_policy`: epoch-v1 | legacy-v1 (default epoch-v1); legacy path labels deriveFeedback with "heuristic-v1". Bump events.ts `POLICY_VERSION` → "epoch-v1" (fixture literals stay; no constant pins in tests — verified by grep). deriveFeedback gains optional 4th arg `policyVersion = POLICY_VERSION` (additive).
4. Integration: resolve/preview pass the epoch view as `feedback`; evaluate.ts deltas limited to (a) hide union applies without playlistId (call `removed(playlistId ?? "")`), (b) policy echo; sequencing applied post-evaluate in index.ts; `/plans/draft` gains `interpretation` additively; new routes GET /api/v1/brain/session + POST /api/v1/brain/forget; add "/api/v1/brain" to protectedPath. Web: BrainSession panel on the Brain screen; Describe shows interpretation summaries; player bar untouched.
5. Scratch env anchor: PLAYLIST_DATA_PATH (+ LIBRARY_SIGNALS_PATH, EVENTS_PATH, SESSION_PATH, BRAIN_PORT/HOST). `BRAIN_DATA_DIR` does not exist.
6. Wave 2 = B5 (integration) + B4b (finish/run lab harness) in parallel; disjoint files.

## Acceptance criteria mapping (Goal Brief)

- execution path → plan.md + report ch. 1
- materialized deliverables → repo modules + DELIVERY files (paths in final reply)
- verification evidence → baseline/final test logs, smoke transcripts, screenshots, review.md
- production readiness → C4 + rollback section (branch revert, policy version switch, forget endpoint)
- final handoff → report ch. 5 + AGENT-BRIEF + DELIVERY README
- bias statements → C2 + report ch. 3 + inline notes in code/docs ("bias notes" convention)

## Risks & rollback

- Risk: parallel writers clobber shared files → mitigated by single-writer file ownership + wave 2
  integration; conflicts resolved by B5/mainline, never by overwriting others' files silently.
- Risk: strip-types syntax violations → catch with `pnpm type-check` + node test run before review.
- Risk: overclaiming research → C2/C3 anti-overclaim gates; evidence states preserved.
- Rollback: all repo changes on `feat/fast-learning-brain` (no push); `git checkout main` is a full
  revert. Runtime rollback: new endpoints additive; adaptive layer switchable via settings/policy
  version; forget/reset endpoints; event log untouched (append-only).

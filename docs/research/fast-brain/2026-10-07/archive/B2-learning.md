# B2 — Session learning core (`epoch-v1`) — engineering receipt

Status: complete · Author: B2 subagent (feature engineering — session-scoped learning core)
Date: 2026-10-06 · Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD `b6ea5ce1`, no commits made)
Owned footprint: `apps/brain/src/learning/**` (new, 11 files, 2031 lines) + one additive edit to
`apps/brain/src/session/events.ts` (Signal union only). Nothing else touched.

---

## 1. Conclusion

The epoch-scoped learning core is implemented exactly against this dispatch: epoch resolution
(session bucketing, 30-min idle gap, local-day + daypart, injectable IANA timezone), one combined
`EpochPolicyView` value (explicit-persistent cells + epoch entity + artist propagation +
reliability-weighted centroids, saturation left to `evaluate.ts`), epoch hides with reset
support, cross-epoch proposals, and a default-OFF exploration flag. All 36 new tests pass;
the full brain suite keeps its baseline state (only the known macOS librarian case-fold failure);
`@synamp/brain` type-check exits 0. Raw logs staged in `/tmp` (copy to `DELIVERY/verification/` before temp cleanup):

- `/tmp/synamp-b2-brain-test.log` (full suite)
- `/tmp/synamp-b2-learning-test.log` (isolated learning run)
- `/tmp/synamp-b2-typecheck.log`

## 2. Evidence — exact commands, exact counts

| command | result |
|---|---|
| `pnpm --filter @synamp/brain test` (full suite, run with B1/B4 tree present) | **tests 203 · pass 201 · fail 1 · skipped 1** — the single fail is the pre-existing macOS case-fold librarian test (`src/librarian/librarian.test.ts:149`, also red on `main`); the skip is the known `/dev/shm` cross-disk case. **All 36 B2 tests are inside this run and green.** |
| `node --experimental-strip-types --test src/learning/*.test.ts` (isolated) | **tests 36 · pass 36 · fail 0 · skipped 0**, exit 0 |
| `pnpm --filter @synamp/brain type-check` | **exit 0**, clean (rerun after B1's concurrent `interpret.ts` fix landed; earlier in the round it transiently showed 2 errors in B1's in-flight file — never in B2 files) |

Baseline carried: 149 tests / 147 pass / 1 fail / 1 skip → now 203/201/1/1;
delta = B2's 36 tests + 18 from B1's in-flight `intent/intent.test.ts` (9),
`query/sequence.test.ts` (8) and `query.test.ts` (+1) changes
(working-tree observation only; B1 owns those).

### Test inventory (36)

- `epochs.test.ts` (9): single-event id/format; 29:59 keeps / 30:01 splits / 30:00 exact keeps;
  midnight split; session change splits; **missing session_id is its own bucket** (sandwich → 3
  epochs; consecutive missing chain); daypart boundaries (04:59/05:00/11:59/12:00/16:59/17:00/21:59/22:00);
  daypart/date from START; insertion-order + id-tie determinism; `activeEpoch` window inclusive;
  future-start epoch never active.
- `derive.test.ts` (15): **isolation byte-compare both directions** (day-2 implicit append leaves the
  day-1 snapshot byte-identical; day-1 implicit does not move day-2 values — proposals compared
  separately as the sanctioned cross-epoch channel); resume-keeps / 30:01-fresh; midnight kills
  evidence; **half-life: +60 min ≤ 0.25× fresh**; hides (k=1 vs k=2, not_now, expiry, resume note);
  remove/restore last-write-wins; **flood bounds** (20 loves / 20 skips: `|0.15·tanh(v/2)| ≤ 0.15`,
  saturation delta < 0.05 vs one love); determinism (reversed insertion, byte-equal);
  **explicit-only parity with `deriveFeedback`** (deep-equal `adjust` for all tracks/playlists and
  `removed` per playlist; `deriveFeedback` imported in the test only); scope_persistence both modes;
  learning_reset (bounds evidence, clears hides, L1 survives, wrong-scope ignored); odd inputs
  (empty, single, unknown signal, torn NaN ts); reliability down-weight note; centroid pull + part
  caps ≤ 0.5; artist propagation min-evidence + cap.
- `proposals.test.ts` (6): 2 epochs → none, 3 epochs/2 dates → exactly 1 (evidence `{epochs:3, dates:2, dayparts:[morning,afternoon]}`);
  30-day window; not_now needs 2 dayparts; positive thresholds (repeat 4/3, external 5/3);
  artist pattern (≥2 tracks); stable `pr1:` ids.
- `reliability.test.ts` (4): axis list frozen; bpm confidence behavior (≥0.5 full, 0.35 damped with
  exact note, ≤0.2 unusable, missing unusable; spot-check confidence 1 = full weight, no special case);
  other produced axes 1.0; declared/missing refused.
- `explore.test.ts` (2): default OFF semantics; **OFF path byte-identical to no-budget** (and ON
  never alters the derived view); seeded `pickExplorationSlot` determinism.

## 3. Files and exact interface signatures

```
apps/brain/src/learning/types.ts        — types + evidence tables
apps/brain/src/learning/epochs.ts       — resolveEpochs / resolveEpochRuns / activeEpoch / activeEpochContext
apps/brain/src/learning/reliability.ts  — axisReliability + AXIS_META + CENTROID_AXES
apps/brain/src/learning/derive.ts       — deriveEpochPolicy (the core)
apps/brain/src/learning/proposals.ts    — generateProposals + PROPOSAL_THRESHOLDS
apps/brain/src/learning/explore.ts      — explorationEnabled / pickExplorationSlot
+ tests: epochs.test.ts, derive.test.ts, proposals.test.ts, reliability.test.ts, explore.test.ts
apps/brain/src/session/events.ts        — 1-line union addition (below)
```

```ts
// derive.ts — the frozen seam this round implements (dispatch wins over plan.md's deriveAdaptive)
export function deriveEpochPolicy(events: readonly ListeningEvent[], opts: PolicyOptions): EpochPolicyView;

// types.ts
export type EpochPolicyView = {
  policy_version: "epoch-v1";
  events: number;                                  // events that shaped the view (explicit all-time + implicit inside the live epoch + applied resets)
  removed(playlistId: string): ReadonlySet<string>; // persistent playlist removes (v1 semantics; restore undoes)
  adjust(trackId: string, playlistId?: string): { value: number; parts: Array<{ label: string; value: number }> };
  epoch: Epoch | null;
  epochHides(): ReadonlySet<string>;               // skip_early ×2 ∪ not_now, dies at epoch end
  proposals(): Proposal[];
  reliabilityNotes(): string[];
};
export type PolicyOptions = {
  now: number;                                     // REQUIRED; no wall-clock reads anywhere else
  timezone?: string;                               // IANA; default server local via Intl
  library?: Library;                               // artist/centroids/labels; absence degrades honestly
  canonical?: (id: string) => string;              // pass LibrarySource.canonicalId
  scopePersistence?: "declared" | "global_only";   // default "declared"
  exploration?: boolean;                           // default OFF; never read by derive
};
export type Epoch = { id: string; t_start: number; t_end: number; first_event_id: string;
  event_count: number; session_ids: string[]; daypart: Daypart; date: string };
export type Proposal = { id: string; kind: "track_repeat_skip" | "artist_repeat_skip" | "not_now_pattern"
  | "external_play_positive" | "repeat_positive"; subject: string; subject_type: "track" | "artist";
  thesis: string; evidence: { epochs: number; dates: number; dayparts: Daypart[] }; suggested_action: string };
export const EPOCH_EVIDENCE: Record<...>;   // A3 §3.2 magnitudes (m, c, label)
export const PERSISTENT_EVIDENCE: Record<...>; // love +2/180d, thumbs ±1 (30d/180d), labels byte-equal to v1
export const FEATURE = { beta: 0.5, gamma: 0.15, min_keeps: 3, min_rejects: 2, coverage: 0.6, ... } as const;

// epochs.ts
export function resolveEpochs(events: readonly ListeningEvent[], opts?: { timezone?: string }): Epoch[];
export function resolveEpochRuns(events, opts?): Array<{ epoch: Epoch; events: ListeningEvent[] }>;
export function activeEpoch(epochs: readonly Epoch[], now: number): Epoch | null;
export function activeEpochContext(epochs: readonly Epoch[], now: number): EpochContext;
export function epochIdFor(tStart: number, tEnd: number, firstEventId: string): string; // "ep1:" + sha256hex(t_start,t_end,first_event_id)[0..15]
export function daypartForHour(hour: number): Daypart; // 05-12 morning / 12-17 afternoon / 17-22 evening / 22-05 night
export const IDLE_GAP_MS = 30 * 60_000; export const LIVE_WINDOW_MS = 30 * 60_000;

// reliability.ts
export function axisReliability(track: LibraryTrack, field: string): { usable: boolean; weight: number; value?: number; note?: string };
export const CENTROID_AXES = ["bpm","lufs_integrated","crest_factor","onset_rate","percussiveness"] as const;
export const AXIS_META: readonly { field: string; name: string; unit: string; decimals: number }[];

// proposals.ts
export function generateProposals(runs: readonly EpochRun[], opts: { now: number; library?: Library;
  canonical?: (id: string) => string; excludeEpochId?: string | null }): Proposal[];
export const PROPOSAL_THRESHOLDS: Record<ProposalKind, { epochs: number; dates: number; dayparts?: number; min_tracks?: number }>;
export const PROPOSAL_SCAN_DAYS = 30;

// explore.ts
export function explorationEnabled(opts: { exploration?: boolean }): boolean; // true only on explicit true
export function pickExplorationSlot(args: { epochId: string; counter: number; candidates: readonly string[] }): string | null;

// derive.ts constants
export const EPOCH_POLICY_VERSION = "epoch-v1"; export const EPOCH_HALF_LIFE_MS = 30 * 60_000;
export const ARTIST_MIN_EVENTS = 2; export const ARTIST_MIN_SUM = 1.0;
```

### The events.ts edit (verbatim diff)

```diff
   // bookkeeping: proves a player report was applied, so a retry is recognised
   | "receipt"
+  // user asked the brain to forget this epoch; markers bound epoch evidence
+  | "learning_reset"
   // what was shown, for later debiasing
   | "exposure";
```

Nothing else in that file. `POLICY_VERSION` was deliberately NOT bumped here — see §6 for B5.

## 4. Analysis — what the implementation guarantees

- **Mask, not decay (P1).** Implicit scoring reads only the active epoch's evidence array; a closed
  epoch contributes exactly nothing (tests: byte-compare both directions, 30:01 split, midnight).
- **Bounded composition (P2/P5).** `adjust.value` is the raw sum; unchanged `0.15·tanh(v/2)` in
  `evaluate.ts` caps every bonus; artist term is clipped ±0.8; feature total clipped ±1.0 with
  per-axis parts ≤ 0.5 by construction; flood tests assert the composed bound.
- **Fast response (P3).** One love ≈ 0.114 bonus (near cap); k≥2 skip hides on the second event;
  single-event anchors immediate (parity with v1 verified).
- **Fast forgetting (P4).** In-epoch `0.5^(Δt/30min)`; hard-kill at the boundary; `+60min ≤ 0.25×`
  asserted on derived values.
- **Explainability (P5).** Fixed part order: L1 global → L1 playlist → epoch entity (fixed label
  order) → artist → per-axis feature parts; every non-zero part carries a label; reliability notes
  explain gated/absent data; `null is never zero`.
- **Replayability (P6).** Pure function of (events, opts, now); no clock reads (guard throws without
  `opts.now`); identical inputs → byte-identical `adjust`, hides, notes, proposals (tested; reverse
  insertion included).
- **Honest degradation (P7).** Missing/declared fields unusable; axes need ≥4 usable library values
  and nonzero robust scale (median/MAD) to standardize, else they are skipped with a note; low
  `tempo_confidence` down-weight/unusable paths produce their own notes.

## 5. Deviations from A3 and interpretation decisions (every one, with why)

1. **Missing `session_id` = its own bucket (dispatch rule).** Implemented as an effective-key break
   (`session_id ?? "\u0000missing"`): a missing-id event never joins a session's epoch and vice
   versa; consecutive missing-id events chain among themselves (gap/day rules still apply). This is
   stricter than A3's b1 wording ("both non-null and different") but is what the dispatch's
   "never merged" requires; A4 §2.3 explicitly warns `session_id` ≠ epoch.
2. **`activeEpoch` ignores epochs that end after `now`.** Literal "now − t_end ≤ 30 min" would make a
   *future* epoch (possible only with future-dated events) "active", breaking the dispatch's own
   byte-isolation requirement when later-day events are appended. Epoch must have ended by `now` to
   be live. Same behavior for all real (now ≥ t_end) logs.
3. **`Epoch` has no positional `index`.** Found by the reverse-isolation byte-compare: a position
   field legitimately differs when earlier epochs exist, weakening the invariant. Content is now a
   pure function of the run; B5 can derive position from the list if UI wants it.
4. **`learning_reset` semantics.** A marker bounds the ACTIVE epoch by *containment*: the latest
   marker inside the active run slices evidence after it; hides are recomputed from the remainder
   (so they clear). `detail.epoch_id` is treated as display provenance only — the id moves when the
   marker itself extends the epoch (t_end changes), so matching by stored id would be brittle.
   Markers with `detail.scope` other than `"epoch"` (or absent scope — tolerated) apply; absence of
   markers changes nothing. **L1 explicit cells survive a reset** (love/thumbs/removes are the
   sanctioned cross-epoch channel; the endpoint scope is "epoch"). Flagged for C1: if review wants
   reset to also zero L1, it is a one-spot change (suppress pre-reset explicit events in the L1
   sweep) — do not do it silently.
5. **`global_only` thumbs (P25).** A3 does not define the epoch-scoped magnitudes; chose
   ±1.0 magnitude · 0.9 confidence · epoch half-life (labels `"thumbs up (this session)"` /
   `"thumbs down (this session)"`), matching P8/P9 magnitudes with the epoch decay. One constant to
   change if review disagrees.
6. **Skip-hide is epoch-wide, not playlist-scoped.** Dispatch: "same track skip_early count ≥ 2 in E
   → hide". v1's playlist-scoped 2× rule is removed from L1 per A3 §3.6 delta 1.
7. **Reason-coded negatives feed the reject set only within the active evidence window** ("this
   session's skips"; explicit wrong_energy/wrong_vibe thumbs count there). A3 §3.2's "feeds negative
   feature set" does not specify the window; epoch consistency chosen. They still persist in L1.
8. **Proposals — playlist context is soft, not a gate.** A3's track-row said "same playlist context";
   the dispatch's threshold list does not include it; dispatch wins. The thesis says "in one playlist"
   only when all qualifying runs shared exactly one playlist id. `subject_type` added to `Proposal`
   (needed by any UI action); `external_play_positive` prefers artist-level subjects and falls back to
   a track id when the track has no artist tag; dayparts sorted in the fixed semantic order
   (morning→night).
9. **Notes wording.** "no active session — learning is paused" exact (A3 §3.1); reset note
   "session learning was reset — only what happened after the reset counts"; coverage and
   tempo-down-weight notes as specced (exact strings in code; determinism test-covered).
10. **`events` field meaning** (interface says only `number`): events that shaped the view —
    all explicit signals (all-time, as v1 counts) + implicit signals inside the live epoch +
    applied resets. B5 may display as "signals considered"; document in the UI if shown.
11. **Axis standardisation guard.** Axis stats need ≥4 usable library values and a nonzero
    `1.4826·MAD`, else the axis is unavailable (note emitted when it gates learning). A3 is silent;
    this avoids divide-by-zero on degenerate libraries.
12. **Explore module shape.** Per "keep tiny": `explorationEnabled` + `pickExplorationSlot`
    (sha256 of `explore\0{epoch_id}\0{counter}` → index into candidates). derive never reads it, so
    OFF *and* ON are byte-identical on the derived view (proved); the flag lives at queue-build time.

## 6. What B5 must know to wire it

1. **Seam name differs from plan.md.** This dispatch froze `deriveEpochPolicy(events, opts)` /
   `EpochPolicyView`; plan.md's older `deriveAdaptive`/`AdaptiveView` sketch is superseded (dispatch
   wins). `EpochPolicyView` is structurally a `FeedbackView` (policy_version/events/removed/adjust),
   so per decision 4 you can pass it directly as `evaluatePlan(..., { feedback: epochView, playlistId })`
   — the existing `0.15·tanh(v/2)` saturated application then acts on the ONE combined value; no
   evaluate.ts scoring change needed for the bonus.
2. **Hides union.** evaluate.ts currently hides only `feedback.removed(playlistId)` and only when
   `playlistId` is set. New behavior: `hides = union(options.feedback.removed(playlistId ?? ""), epochView.epochHides())`
   applied with the same snapshot semantics (counts/hidden echo as today). Note `removed("")` is
   empty by construction — persistent removes stay playlist-scoped; epoch hides apply to every
   resolve while live.
3. **`learning_reset` marker append** (forget endpoint). Suggested payload:
   `log.append({ id, ts: Date.now(), signal: "learning_reset", track_id: "", scope: "none",
   session_id: sessions.get().id, source: "server", policy_version: POLICY_VERSION,
   detail: { scope: "epoch" } })`. The derivation matches by containment (see §5.4); an optional
   `detail.epoch_id` is informational only — do not rely on id equality.
4. **`POLICY_VERSION` bump NOT done** (dispatch limited the events.ts edit to the union). Decision 3
   says bump `heuristic-v1` → `epoch-v1` + `deriveFeedback` optional 4th arg; that edit belongs to
   B5/mainline (events.ts:1 line + feedback.ts signature). My module labels itself via its own
   constant and does not import `POLICY_VERSION` for labels, so the bump cannot break it.
5. **`/api/v1/events` viewer** hides only `receipt|exposure` today → `learning_reset` will appear.
   Decide deliberately (transparency suggests leaving it visible; note for C4).
6. **Readout suggestions** (`GET /api/v1/brain/session`): serializable fields — `policy_version`,
   `events`, `epoch` (object or null), `hides: [...epochHides()].sort()`, `proposals()`,
   `reliabilityNotes()`, and per-track `adjust(id)` for the visible queue/tracks. Everything is a
   plain value; methods must be called, not serialized.
7. **Caching**: keep it like `feedbackCache` — recompute keyed on (events length, library version,
   playlist id), but **pass a fresh `now` at request time**; never cache a view across `now` when
   hide expiry matters (views are pure per `now`; recompute is O(n), fine at n≈10³).
8. **Options plumb-through**: `canonical: (id) => library.canonicalId(id)` (alias mapping);
   `timezone` optional (default server local; pin it in settings if you want cross-restart
   determinism of day boundaries); `scopePersistence` from settings if/when exposed; `exploration`
   stays OFF and is only consumed by `pickExplorationSlot` at queue build (one slot max, record
   exposure `policy: "deterministic_rank+explore_slot"` when used).
9. **Legacy rollback** (decision 3): `listening_policy: "epoch-v1" | "legacy-v1"`; legacy path is
   the untouched `deriveFeedback(...)` labelled `heuristic-v1` — the two share the event log, so
   switching is a re-derive, never a migration.
10. **Determinism contract**: do not mutate returned arrays/sets (fresh copies on every accessor);
    do not thread `Date.now()` into anything but `opts.now` at the call boundary.

## 7. Gaps and risks (carried, not hidden)

- All magnitudes are A3/dossier candidate values — nothing here is tuned on real listening;
  fixtures are synthetic. Proposal thresholds (P21–P23) are the most speculative.
- Reliability weights exist only for `bpm`; other axes are placeholder 1.0 until producers expose
  uncertainty (P4) — the honest-degradation gates and notes are the containment, not a fix.
- Energy-axis collinearity: contained (small γ, gates, "provisional" labeling only implicit in
  notes) but not solved — matches A3's own honest gap.
- Interpretation points explicitly flagged for C1 review: reset scope (§5.4), epoch-wide skip-hide
  (§5.6), `global_only` magnitudes (§5.5), proposals playlist-context softness (§5.8).
- Concurrent-tree note (attribution only, not mine): during this round B1's `intent/**`,
  `query/plan.ts`, `query/sequence.ts`, `query.test.ts` and B4's `tools/brain-lab/**` were also in
  flight; the full-suite green described in §2 includes their latest state at 2026-10-06 ~23:1x CDT.
  Re-run the two VERIFY commands after all writers land before final DELIVERY numbers.

## 8. Suggested final-report placement

- Chapter 2 ("The fast learning brain"): §3 signatures + §4 guarantees as the implementation core;
  reproduction of the parameter table from A3 §3.7 annotated with "implemented as" pointers.
- "Verification & review methods": §2 counts, the isolation byte-compare, half-life, parity and flood
  tests as named falsification evidence; raw logs → `DELIVERY/verification/`.
- "Risks & rollback": §5 interpretation flags + §7 gaps; §§6.3–6.5, 6.9 as the rollback/forget levers.
- Handoff: §6 as the integration checklist for B5/C4.

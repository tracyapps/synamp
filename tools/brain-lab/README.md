# brain-lab — SynAmp fast-learning brain scenario lab

A deterministic, runnable scenario lab for the fast-learning brain (task `synamp-fast-brain`, B4 verification
engineering; refreshed by B4b on 2026-10-07 after B1/B2/B5 landed, and again by H4 on 2026-10-07 after the
H1/H2/H3 hotfixes — see *Provenance* below). It drives the real repo modules from the outside: fixes a pinned
clock, builds synthetic listening streams, runs the pipeline, and records human-readable checks plus
machine-readable JSON evidence.

**What it is not:** it is not a test suite for `pnpm test` (turbo never sees `tools/`), never imports
`apps/brain/src/index.ts` (that would start a server), and never writes into brain stores — all calls are pure
functions over fixtures in memory.

## Commands (one documented entry point)

```sh
# from the repository root
node --experimental-strip-types tools/brain-lab/lab.mts
node --experimental-strip-types tools/brain-lab/lab.mts --json evidence/brain-lab/run.json
node --experimental-strip-types tools/brain-lab/lab.mts --only 08      # filter scenarios by id substring
node --experimental-strip-types tools/brain-lab/lab.mts --list         # list scenarios, no run
```

- Exit code `0` when no check failed (pending checks are allowed and reported), `1` on any failed check, `2` on a
  harness-level error.
- `--json <path>` writes the evidence document (schema `synamp.brain-lab/1`, below); the path is resolved against
  your current working directory.
- The lab is **CWD-independent** (it locates the repo from its own file path); Node ≥ 22, `--experimental-strip-types`.
- Determinism: two runs against the same module state produce byte-identical JSON except for `generated_at`
  (re-verified at every refresh; timestamps inside scenarios are pinned).
- Canonical captured evidence (H4 refresh, post H1/H2/H3 — 2026-10-07):
  `/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/evidence/final-lab/`
  — `lab.stdout.log`, `lab.json`, `hashes.txt`, `run.json`, `EVIDENCE.md`, plus determinism artifacts.

## Layout

```
tools/brain-lab/
  lab.mts              entry point (args, module table, trace, summary, JSON evidence)
  lib/util.mts         paths, JSON, read-only git info
  lib/modules.mts      dynamic module loader — missing modules are reported, never stubbed
  lib/checks.mts       ScenarioRun / Check collector (pass · fail · pending · skip)
  lib/events.mts       synthetic ListeningEvent builders (apps/brain/src/session/events.ts field-for-field)
  lib/runner.mts       scenario runners ("phrase", "learning", "culture" kinds) + resolve composition
  scenarios/*.json     the scenarios (01–08)
```

## Modules the lab uses (all imported dynamically, all optional)

| key | path | wanted export | without it |
|---|---|---|---|
| draft | `apps/brain/src/query/draft.ts` | `draftPlan` | phrase pipeline can't run (pending) |
| plan | `apps/brain/src/query/plan.ts` | `validatePlan`, `planHash` | validation can't run (pending) |
| evaluate | `apps/brain/src/query/evaluate.ts` | `evaluatePlan` | evaluation can't run (pending) |
| feedback | `apps/brain/src/session/feedback.ts` | `deriveFeedback` | harness composition fallback unavailable (pending) |
| sequence | `apps/brain/src/query/sequence.ts` (B1) | `sequenceTracks` | sequence checks pending |
| intent | `apps/brain/src/intent/interpret.ts` (B1) | `interpretGoal` | interpretation checks pending |
| learning | `apps/brain/src/learning/derive.ts` (B2) | `deriveEpochPolicy` (fallback `deriveAdaptive`) | learning checks pending |

A missing file is reported as `not present` and turns dependent checks into `pending` with the reason; a file that
exists but fails to import is a `LOAD ERROR` (and the affected checks surface it); a loaded file without the wanted
export is reported with its actual export list. Nothing is ever mocked.

## Scenario kinds

### `phrase` — interpretation + legacy pipeline

Fields: `id`, `kind: "phrase"`, `title`, and either `phrases: [...]` or a single `phrase`.

```json
{
  "text": "i need to focus",
  "slug": "focus",
  "intent": { "expect_accuracy": "specific", "chosen_validates": true, "min_readings": 1 },
  "pipeline": { "expect_validation": "ok", "expect_underfilled": false, "min_strict": 1 }
}
```

Checks produced per phrase:

- `pipeline-draft` — `draftPlan` returns `recognized[]/unparsed[]/plan{}`;
- `pipeline-validates` (only when `expect_validation` is `"ok"`/`"fail"`; otherwise a structural check
  `pipeline-validation-structure` that the result is well-formed — the plan may legitimately not validate);
- `pipeline-evaluate` — evaluation invariants: strict ≤ target, ids unique and all from the library, library count
  matches; plus `pipeline-underfilled` / `pipeline-min-strict` when declared;
- `intent-structural` — `accuracy` in the frozen enum, ≥ 1 well-formed reading, valid `chosen_index`, parser
  string, `asks[]` + `audit[]` arrays; per-reading plan validation counts are recorded as notes;
- `intent-accuracy` — only when `expect_accuracy` is declared (see *adjudication* below);
- `intent-chosen-validates` — the chosen reading's plan validates (when declared);
- `intent-chosen-evaluates` — when the legacy plan did not validate but the chosen reading's plan does, the
  reading's plan (the one `/plans/draft` validates and previews) is evaluated and the same invariants are asserted;
- `pipeline-evaluate` is `skip`ped when the legacy plan did not validate — the reason string is written into the
  evidence, and the skipped-checks register below covers each one (no silent skips).

### `learning` — synthetic stream → epoch derivation → resolve

Fields: `id`, `kind: "learning"`, `title`, `stream`, `now` (offset like `"+29m"`), `checks`.

```json
{
  "stream": {
    "base_ts": "2026-10-06T19:00:00-05:00",
    "timezone": "America/Chicago",
    "playlist_id": "pl-lab", "session_id": "sess-lab-1", "plan_hash": "cbe2…",
    "events": [
      { "signal": "skip_early", "track": "sample-026", "at": "+1m", "play_ms": 18000, "duration_ms": 216000 }
    ],
    "events_append": [ { "signal": "learning_reset", "track": "", "at": "+25m", "detail": { "scope": "epoch" } } ]
  },
  "now": "+29m",
  "checks": {
    "adjust_positive": ["sample-034"], "require_parts": true,
    "negative_parts": ["sample-026"],
    "adjust_zero": ["sample-024"],
    "skip_hidden": ["sample-026"], "hides_empty": false,
    "sequence_wave": { "fixture": [ { "id": "lab-wave-1", "bpm": 70 }, "…" ],
                       "odd_counts": [1, 3, 5], "even_counts": [2, 4], "expect_orders": { "1": ["lab-wave-1"], "…": [] } },
    "resolve": { "playlist_id": "pl-lab", "plan_phrase": "60 tracks, between 60 and 180 bpm",
                 "hidden_by_session": ["sample-026"], "improves": ["sample-034"], "identical_to_baseline": false }
  }
}
```

Event entries are built long-hand into `ListeningEvent` objects (`lib/events.mts`), with defaults matching how
`session.ts` records real events: `full_play`/`repeat` → playlist scope; `skip_early`/`skip_late` → session scope;
`love`/`thumb_*` → player source; `learning_reset` → server, `scope: "none"`. Fields: `signal`, `track` (must exist
in the sample library; `""` allowed for non-track events), `at` (`"+5m"`, `"+30s"`, `"+16h"`), and optional
`play_ms`, `duration_ms`, `reason`, `scope`, `scope_id`, `source`, `detail`. Ids are deterministic
(`lab:<scenario>:001`…), timestamps monotonic-checked; no randomness anywhere.

Checks produced (only those declared in `checks`):

- `stream-built` — events build, count + signal histogram + time range recorded;
- `learning-view-structure` — view has `adjust()` and a hide channel; `policy_version`, `epoch.id`, and available
  surfaces are recorded;
- `learning-adjust-positive` (+`require_parts`) — every listed track has `value > 0` and ≥ 1 visible part;
- `learning-adjust-negative` — `value < 0` (supported, not used by the default scenarios — see limitations);
- `learning-negative-parts` — every listed track shows ≥ 1 negative contribution in its parts;
- `learning-adjust-zero` — `value === 0` **and** no parts (used by the isolation/reset scenarios);
- `learning-skip-hidden` / `learning-hides-empty` — the hide channel (`epochHides()` / `hides` / `removed(pid)`);
- `learning-resolve-plan` → `learning-resolve-runs` → `learning-resolve-baseline-has-hidden` →
  `learning-resolve-hidden-by-session` → `learning-resolve-improves` (per-track rank deltas, printed) →
  `learning-resolve-identical` — the resolve mirrors `index.ts` `policyOptions()` in epoch mode: the combined view
  (`deriveEpochPolicy`) is passed as **both** `feedback` and `adaptive` to `evaluatePlan` with a `playlistId`,
  and `evaluate.ts` applies the decision-3 hide union (`feedback.removed(playlistId ?? "") ∪
  adaptive.epochHides()`) at its own resolve seam. The harness-side composition (`composeEpochView`) remains
  only as a fallback for module shapes without the combined view — the shipped modules never take that path;
- **hide-display contract (C2 F4, post H2)** — `hidden_by_session` declares epoch hides (skip ×2 / not now).
  `learning-resolve-hidden-by-session` asserts: (a) each listed track is OUT of `strict` (it was in the baseline
  strict — `learning-resolve-baseline-has-hidden`), (b) `counts.hidden_by_session` equals the declared count,
  (c) the tracks do NOT appear in the persistent `hidden[]` list (`counts.hidden_by_you` is the restorable
  "Removed by you" surface — a session hide must never be offered a dead Restore), and (d) the strict-length drop
  equals `hidden_by_session + hidden_by_you` (every dropped track is accounted for);
- `learning-resolve-sequence` — `sequenceTracks` (B1) is applied post-evaluate and must preserve the strict set;
- **`sequence_wave` probe (C1-F1 regression, post H1)** — `sequence-wave-odd-f1` (odd measured counts n=1,3,5:
  full permutation of the input, no `undefined`, JSON-clean — pre-fix the wave arc dropped one track and emitted
  `undefined` → `null` → queue crash), `sequence-wave-odd-order` (the documented upper/lower interleave order for
  odd counts), `sequence-wave-even-bytes` (even counts keep the pre-fix interleave byte-identical, e.g. n=4 →
  `[w3, w1, w4, w2]` per H1 receipt §H1-1), and `sequence-wave-applied-note` (`applied[]` keeps the post-H1-2
  pace/energy-proxy wording — not "measured intensity" — at 100% coverage). The fixture (5 synthetic tracks with
  monotone bpm, `tempo_confidence` 0.9 → strictly ascending documented proxy) and the expected orders are
  declared in the scenario; the runner only executes and compares. Declared by scenario 05 only.

### `culture` — culture-language guardrails (scenario 08)

Fields: `id`, `kind: "culture"`, `title`, `banned_words`, `prompts[]` (text, slug, optional `span`, `expect`).

```json
{
  "slug": "tribal-drumming", "text": "tribal drumming", "span": "tribal drumming",
  "expect": { "accuracy": "impossible", "chosen_index": -1, "labels": [], "asks": 2 }
}
```

Runs `interpretGoal` on the prompts (seed: C2-bias-review.md §E1 — the 10 culture prompts + 2 controls) with the
pinned clock and the sample library, and asserts **defensive behaviour only** (this is a regression pin of honest
behaviour, not a classifier-accuracy claim):

- `{slug}/pinned` — `accuracy`, `chosen_index`, reading labels, and ask count exactly as observed at the capture
  (re-record deliberately if behaviour intentionally changes);
- `culture-banned-strings` — the scenario's `banned_words` never appear in product-authored copy (reading text
  with quoted spans removed, ask `reason`/`nearest_supported`, audit `becomes`). User echo is expected in exactly
  two places and is counted in the evidence, not hidden: inside curly-quoted spans in `ask.ask`, and in
  `audit[].phrase` (the input span being reported on). The plan's `intent.summary` / `retrieval_text` recap fields
  and `audit[].phrase` are input quotes by design — the no-claims check below records them separately;
- `culture-no-culture-claims` — each declared `span` never appears OUTSIDE quoted user echo in reading
  labels/assumptions/plan fields, stripped ask text, ask reason/near, or audit `becomes` (i.e. no invented
  semantics for the unparsed span; it may only surface in the "not understood"/echo channels; plan
  `intent.summary` / `retrieval_text` are excluded as input recaps and reported as `input-recap echo`);
- `culture-spans-surfaced` — each span appears in ≥ 1 ask (user words echoed honestly, nothing silently dropped);
- `culture-no-dead-ends` — a prompt with no readings still gets ≥ 1 ask.

### `extends` — scenario inheritance

`06`/`07` extend `05`. Merge rules: child scalars override; plain objects merge recursively; **arrays and `checks`
are replaced wholesale** by the child; `stream.events_append` is appended after the inherited `events` at build
time. Use it for "same stream, different clock" variants.

## Current scenarios

| id | covers |
|---|---|
| 01-three-phrases | "i need to focus" / "pump me up to win this game" / "i want to dance" — all three evaluate end-to-end (legacy plan for focus; B1 chosen reading for pump/dance) |
| 02-vague | "play me something good" — must be admitted as vague |
| 03-contradictory | "fast relaxing bangers" — must be admitted as contradictory |
| 04-impossible | "instrumentals with heavy lead vocals over 300 bpm" — unsatisfiable; honest underfill |
| 05-fast-learning | skip high-bpm tracks ×2, keep mid-tempo; next resolve reorders + hides (C2 F4 display contract) + `sequence_wave` C1-F1 regression |
| 06-isolation | same stream, resolve at `now + 16h` — implicit adjustments must be zero/empty, resolve byte-identical |
| 07-forget | same stream + `learning_reset` marker — epoch evidence cleared |
| 08-culture-guardrails | C2 E1 culture prompts + controls — defensive behaviour pinned; no invented culture semantics; banned words absent from product copy; spans surfaced; no dead ends |

## How to add a scenario

1. Drop a new `scenarios/NN-name.json` following the formats above (or `extends` an existing one).
2. Run `… --only NN-name`; check the trace; for a new learning stream verify the builder's monotonic-ts and
   known-track checks pass.
3. If you need a new assertion shape, extend `LearningChecks` / `runResolve` / the culture or wave runners in
   `lib/runner.mts` — keep expectations declarative and put the tolerant/failing detail in `expected`/`actual`.

## Evidence JSON (schema `synamp.brain-lab/1`)

```
{ format, generated_at, repo { root, head, branch, dirty }, node, library { path, tracks },
  modules [ { key, path, status, wanted, found, exports } ],
  scenarios [ { id, title, kind, status: pass|partial|pending|fail, checks [ { id, status, expected?, actual?, note? } ], notes } ],
  summary { scenarios { pass, partial, pending, fail }, checks { pass, fail, pending, skip } } }
```

`status: "partial"` = no failure but ≥ 1 pending check (module not landed yet). `"pending"` = nothing could run.

## Provenance (post-hotfix refresh)

- **H4 refresh, 2026-10-07 (post hotfixes H1/H2/H3).** The lab was re-synced to the hotfixed app:
  - the learning hidden check now asserts the **new display contract** (H2 / C2 F4): `learning-resolve-hidden`
    → `learning-resolve-hidden-by-session` (`counts.hidden_by_session` + not in the persistent `hidden[]`);
  - the `sequence_wave` probe was added for the fixed C1-F1 wave bug (H1) plus the post-H1-2 `applied[]` wording;
  - scenario `08-culture-guardrails` was added (seed: C2 E1) with `{slug}/pinned` observations and defensive
    checks.
  - At capture: **8 scenarios · 91 emitted checks — 86 pass · 0 fail · 0 pending · 5 skip** (the 5 skips are the
    unchanged register below). Canonical files in `evidence/final-lab/` (`lab.stdout.log`, `lab.json`,
    `hashes.txt`, `run.json`, `EVIDENCE.md` + determinism artifacts).
- Earlier refresh: B4b (2026-10-07) after B1/B2/B5 landed — 7 scenarios, 66 pass · 0 fail · 5 skip. After the
  later H2 display split (C2 F4), the stale `learning-resolve-hidden` expectation read 65 pass · 1 fail · 5 skip
  until this H4 sync reconciled it with the new contract (the app was correct; the check was updated).

## Known limitations & notes (state as of the H4 refresh capture, 2026-10-07; canonical files in the cluster
workspace `evidence/final-lab/`)

- **Module state at capture:** all seven modules loaded and frozen; B1 (`intent/**`, `query/sequence.ts`), B2
  (`learning/**`), B5 integration (evaluate hide union, epoch-policy default, `POLICY_VERSION` bump) and the
  H1/H2/H3 hotfixes have landed. Results are deterministic given this module state; the JSON evidence records git
  HEAD + timestamps. Re-run the lab before quoting in any other state.
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
  documented ladder rather than blindly “fixing” either side. This applies with full force to the scenario-08
  pins (they pin observations, not claims of correctness).
- **Skipped-checks register (5 skips at the H4 capture — no silent skips):**
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
- **Hide display split (post H2 / C2 F4):** `hidden` / `counts.hidden_by_you` = persistent removes only
  (restorable); epoch hides leave `strict` but are reported via `counts.hidden_by_session`. The lab asserts the
  split; the module-level hide/restore interop itself is C2's E2 probe (not re-run here).
- **`sequence_wave` fixture is synthetic:** it pins the documented deterministic interleave (order is declared in
  the scenario; the odd counts are the C1-F1 repro shape, the even counts the frozen byte path). If the wave
  behaviour is intentionally changed, update `expect_orders` in the same change and say so in the commit — the
  even-bytes check exists precisely to make that deliberate.
- **`learning_reset` marker shape:** `{ signal: "learning_reset", scope: "none", detail: { scope: "epoch" } }`
  appended inside the epoch (verified against B2's implementation: it bounds the active epoch's evidence).
- **Resolve composition:** mirrors the shipped app seam: the combined view is passed as `feedback` + `adaptive`
  exactly as `index.ts` `policyOptions()` does; the decision-3 union is applied by `evaluate.ts`. The harness
  composition fallback remains only for module shapes without the combined view.
- **Culture scenario quote mechanics:** “user echo must be quoted” is asserted only for `ask.ask` (curly quotes);
  `audit[].phrase` and the plan recap fields (`intent.summary`, `retrieval_text`) are input quotations by design
  and are counted in the evidence. `banned_words` currently covers C2's product-scope list for these prompts
  minus the words that only ever appear as live user echo/recaps (`gypsy`, `world music`); C2's full grep list
  additionally includes `arrhythmic` (no test phrase exercises it — extend the scenario if one is added).
- **Determinism:** two consecutive runs produce byte-identical JSON except `generated_at`; re-verified at the H4
  refresh, including a run from a different CWD (artifacts in `evidence/final-lab/`).
- The lab cannot start the brain HTTP server or exercise routes — endpoint-level smoke tests belong to B5/H2.
- Fixtures are synthetic (`library.sample.json`); nothing here is evidence about real music.
- Future scenario candidates: P1 gap boundary (29:59 vs 30:01), P5 flood bounds, `not_now` hide n=1, persistent
  remove/restore interplay, proposal thresholds, rollback diff (`epoch-v1` vs `heuristic-v1`), culture prompts
  with an expressible anchor (“samba party music”), ask-copy regression pins for C3 F-COPY-1.

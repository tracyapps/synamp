# B5 — Integration & smoke verification (engineering receipt)

Status: complete · Author: B5 integration engineer (integration & smoke verification) · Date: 2026-10-06 ~23:35 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (HEAD still `b6ea5ce1`; no commits, no `pnpm install`, no git writes — read-only `status/diff/log` only)
Role: sole writer of `index.ts` wiring, `query/evaluate.ts` (additive), `session/feedback.ts`, `session/events.ts`, `settings.ts`+test, `web/Describe.tsx`, `web/App.tsx`, NEW `web/BrainSession.tsx` + `styles/brain.css`, NEW one-level tests.

---

## Conclusion

The epoch learning core, goal interpreter and sequencer are now WIRED into the live brain and the web app, end-to-end verified at module, route and browser level:

1. **Epoch policy is live by default** — `listening_policy: "epoch-v1"` setting (settings.ts + tests), cached legacy rollback accessor, fresh-per-call epoch view; resolve path, draft preview and `/plans/evaluate` all use the active view; `POLICY_VERSION` bumped `heuristic-v1 → epoch-v1`; `deriveFeedback` gained the optional 4th `policyVersion` arg.
2. **Hide union + sequencing integrated** — `evaluate.ts` hides = `feedback.removed(playlistId ?? "") ∪ adaptive?.epochHides?.()` (structural option, no learning import), scoring untouched; `applySequencing` wraps all three evaluate call sites; `near_miss` untouched; `sequencing_applied` omitted when empty.
3. **`/plans/draft` now returns `interpretation`** (accuracy, chosen_index, reading summaries with `chosen` flags, asks, audit — no raw plans), validates/evaluates the **chosen reading's** plan, and the preview applies policy + sequencing.
4. **Three new routes** — `GET /api/v1/brain/session`, `POST /api/v1/brain/forget` (epoch-marker append), `POST /api/v1/brain/proposals` (accept/dismiss, atomic decision store at `dataDir/brain-proposals.json`); `"/api/v1/brain"` added to `protectedPath`.
5. **Web** — Describe renders the interpretation (accuracy badge, "How I read it" audit, asks, multi-reading list with chosen marked); NEW `BrainSession` panel on The Brain screen (epoch line + daypart, adjustments with parts, hides, proposals with Accept/Dismiss, confirm-gated Forget, policy line); player bar untouched. Web build + type-check clean.
6. **All verification green** — brain tests 210/208/1/1 (single fail = pre-existing macOS librarian case-fold, +1 skip known), brain+web type-check exit 0, web build exit 0, brain-lab 7/7 scenarios / 64 checks GREEN without touching `tools/**`, route smokes + auth + resolve probes + screenshots all captured under `evidence/b5/`.

One incident to disclose (details in §"Incident report"): a first screenshot attempt accidentally wrote a tiny amount of scratch data into the user's **gitignored dev sandbox** (`apps/brain/data/`) because port 3001 was silently owned by the user's long-running watch server. Disclosed, contained, no edits; the evidence-of-record screenshots use fully isolated ports.

---

## 1. Exact file list (B5 footprint)

**Modified (mine):**
| File | Change |
|---|---|
| `apps/brain/src/index.ts` | +187/−? — policy accessors (`activePolicyView`, `policyOptions`), `applySequencing`, `ProposalDecisions` store, `applyProposalAccept`, `brainSessionView`, 3 new routes, protectedPath, draft/evaluate/events rewiring, RuntimeSettings defaults, imports |
| `apps/brain/src/query/evaluate.ts` | +15 — `EvaluateOptions.adaptive` (structural) + hide union (legacy-identical when absent) |
| `apps/brain/src/session/events.ts` | +14 — `POLICY_VERSION = "epoch-v1"` + comment (the `learning_reset` union member was B2's, pre-existing) |
| `apps/brain/src/session/feedback.ts` | +8 — doc + optional 4th arg `policyVersion = POLICY_VERSION` |
| `apps/brain/src/settings.ts` | +15 — `ListeningPolicy` type, `listening_policy` in Defaults/Saved/getter/view/origin/update (+validation) |
| `apps/brain/src/settings.test.ts` | +26 — defaults updated + 1 new policy test |
| `apps/web/src/Describe.tsx` | +66 — interpretation mirror types + `InterpretationView` + render slot |
| `apps/web/src/App.tsx` | +2 — import + mount BrainSession in `case "brain"` |
| `apps/web/src/styles/describe.css` | +23 — interpretation styles (see justification §4.2) |

**New (mine):**
- `apps/web/src/BrainSession.tsx` (the "This session" panel)
- `apps/web/src/styles/brain.css`
- `apps/brain/src/query/hide-union.test.ts` (3 tests)
- `apps/brain/src/session/feedback.test.ts` (1 test)

**Untouched by me (other writers' dirty state, verified not mine):** `query/plan.ts`, `query/query.test.ts`, `intent/**`, `learning/**`, `query/sequence.ts`, `tools/brain-lab/**`, `docs/**`, `apps/brain/README.md` (dock/README edit by a parallel agent), plus all other web files. No edits to `draft.ts`, `signals.ts` — no bugs needed reporting there.

## 2. Route/response shapes as built

**`GET /api/v1/brain/session` → 200**
```json
{
  "policy_version": "epoch-v1",              // active view's label ("heuristic-v1" in legacy mode)
  "listening_policy": "epoch-v1",            // the setting
  "events": 2,                               // view.events — signals that shaped the view (B2 §6.10)
  "epoch": { "id": "ep1:...", "t_start": 0, "t_end": 0, "first_event_id": "...", "event_count": 14,
             "session_ids": ["..."], "daypart": "night", "date": "2026-10-06" } | null,
  "hides": ["sample-001"],                   // epoch hides, sorted; [] in legacy
  "proposals": [ { "id": "pr1:...", "kind": "...", "subject": "...", "subject_type": "track",
                   "thesis": "...", "evidence": { "epochs": 3, "dates": 2, "dayparts": ["morning"] },
                   "suggested_action": "..." } ],   // decided ids filtered out
  "reliability_notes": ["..."],
  "queue_adjustments": [ { "track_id": "sample-001", "value": -0.6,
                           "parts": [ { "label": "skipped early this session", "value": -0.6 } ] } ]
}
```
`queue_adjustments`: first ≤50 queue entries, deduped by canonical id (first occurrence), each row = `view.adjust(canonicalId)`; rows with no parts are included (stable shape), the panel renders only parts-bearing rows.

**`POST /api/v1/brain/forget` (body `{"scope":"epoch"}`, scope optional → default "epoch") → 200** = same readout as above, re-derived after appending:
```json
{ "id": "<randomUUID>", "ts": 0, "signal": "learning_reset", "track_id": "", "scope": "none",
  "session_id": "<sessions.get().id>", "source": "server", "policy_version": "epoch-v1",
  "detail": { "scope": "epoch" } }
```
Other scopes → 400 `{"error":"scope must be \"epoch\" — the event log is never edited, only marked"}` (PlaylistError). After forget in the smoke: `hides: []`, adjustments with parts: 0, note "session learning was reset — only what happened after the reset counts".

**`POST /api/v1/brain/proposals` (body `{"id":"pr1:…","action":"accept"|"dismiss"}`) → 200** = updated readout (proposal filtered). Validation: missing id → 400 "id is required"; bad action → 400; unknown id → 404 "No suggestion with that id"; already decided with a different action → 409. Accept semantics (per dispatch + one documented judgment, §4.1): `track_repeat_skip`/`not_now_pattern` → global `thumb_down` (reason "wrong_vibe"); `repeat_positive` and **track-subject** `external_play_positive` → global `thumb_up`; `artist_repeat_skip` and **artist-subject** `external_play_positive` → no event (decision recorded); event id `proposal-<safeid>` (`[^A-Za-z0-9_-]` → `-`), stable so retries dedupe. Decisions persisted via atomic temp+rename to `dataDir/brain-proposals.json` (`format: "synamp.brain-proposals/1"`, mode 0600).

**`POST /api/v1/plans/draft` → 200 (additive)**
- existing keys unchanged: `parser` ("rule-based draft (no LLM yet)"), `recognized`, `unparsed`, `encoder_text`, `validation`, `preview`;
- `validation` = `validatePlan(chosenReading.plan)` when a reading exists, else the old draft-based `checked` (smoke: ok, 13 constraints);
- `interpretation`: `{ parser, accuracy, chosen_index, readings: [{label, confidence, assumptions, chosen}], asks, audit }` — summaries only; verified no raw plan inside (smoke assertion `has raw plan inside interpretation: false`);
- `preview` = chosen plan evaluated with the active policy + sequencing; `feedback_policy` echoes e.g. `"epoch-v1"`.

**Sequencing echo:** `sequencing_applied: string[]` present **only when non-empty**, on the `Evaluation` objects returned by `evaluateSaved` (resolve + explain), the draft preview and `/plans/evaluate`. Smoke: `["arc build: ordered by measured intensity (100% coverage)"]` at all three sites; resolve order == explain order == evaluate order.

**`/api/v1/events`:** `policy_version` now reports the **active** policy ("epoch-v1"; "heuristic-v1" under legacy) instead of a hardcoded v1 label. `learning_reset` stays visible in the viewer (transparency; no hidden signals).

**Settings:** `GET /api/v1/settings` view gains `settings.listening_policy` + `origins.listening_policy`; `POST` accepts `{"listening_policy":"epoch-v1"|"legacy-v1"|""}`, rejects others with a SettingsError (400). No web Settings control added (not in scope; curl-switchable today — flagged for C4).

## 3. Evidence

### 3.1 Test/type/build/lab (before → after)

| command | before (my session start) | after (final tree) |
|---|---|---|
| `pnpm --filter @synamp/brain test` | **205 · pass 203 · fail 1 · skipped 1** (log `brain-test-before.log`) | **210 · pass 208 · fail 1 · skipped 1** (log `brain-test-final.log`); +5 = 3 hide-union + 1 feedback + 1 settings |
| `pnpm --filter @synamp/brain type-check` | exit 0 | exit 0 (`type-check-brain-final.log`) |
| `pnpm --filter @synamp/web type-check` | exit 0 | exit 0 (`type-check-web-final.log`) |
| `pnpm --filter @synamp/web build` | — | exit 0, `✓ built in ~1s` (`web-build-final.log`) |
| `node --experimental-strip-types tools/brain-lab/lab.mts` | **OK — 7/7 scenarios, 64 checks pass, 0 fail, 5 skip** (`lab-before.log`) | **OK — identical** (`lab-final.log`) — no `tools/**` edits were needed; the evaluate.ts delta did not break the harness resolve seam |

Single failing test in every run = pre-existing macOS librarian case-fold artifact; skip = pre-existing `/dev/shm` case. Both carried, not chased.

### 3.2 Route smoke (transcripts: `evidence/b5/route-smoke-*.{log,sh}` + `responses/`)

- **`route-smoke-epoch.log`** — scratch `/tmp/synamp-b5` on :3911: `/health` ok; draft of the flagship prompt → `accuracy: specific`, 1 reading "focus", 0 asks, 11 audit entries, validation ok (13 constraints), preview strict 6, `feedback_policy: epoch-v1`; queue of 3 sample tracks; `start`+`skip` ×2 for sample-001 → `GET /brain/session` shows `hides: ["sample-001"]` and parts (`skipped early this session -0.6`; artist propagation `other tracks by Lumen Atlas this session -0.21` for the other two); `POST /brain/forget` → hides cleared + reset note; second GET confirms; `{scope:"all"}` → 400; proposals validation 404/400; **legacy rollback**: POST settings `legacy-v1` → readout `policy_version: heuristic-v1`, `epoch: null`, `hides: []`; switched back.
- **`route-smoke-auth.log`** — restart with `PLAYLIST_API_TOKEN=smoke-token`: `/health` 200 (public); `/brain/session` 401 no-token → 200 with token; `/brain/forget` 401 → 200; bad scope 400; proposals unknown-id 404 / bad-action 400.
- **`route-smoke-resolve.log`** — "pump me up to do this task / win this game" → reading "pump up", `arc: build`; saved as a smart playlist; `GET /resolve` == `GET /explain` == `POST /plans/evaluate` (identical order `sample-016,034,033,014,022,057,021,056…`, `sequencing_applied` at all three); then 2 skips for `sample-034` → `hides: ["sample-034"]`, track gone from resolve (the whole order re-derived — `sample-033` also dropped, same artist "Vera Okonkwo Trio" → artist propagation minus; deterministic and equal at all call sites).
- **`route-smoke-details.log`** — functional draft-preview wiring: with an epoch hide on `sample-039`, the preview strict loses it and `hidden: ["sample-039"], hidden_by_you: 1` (earlier run also recorded why a naive probe shows nothing: events in a different session bucket form a **separate, closed epoch by design** — epoch isolation working as specified).
- **Screenshots (see §3.3)** — `route-smoke-screenshots-v2.log` (working run), `route-smoke-screenshots.log` (v1 failed attempt, kept intentionally), `route-smoke-details.sh`/`screenshots-detail.mjs`.

Reproduction: each `.sh` is self-contained; `bash evidence/b5/route-smoke-epoch.sh` etc. All servers bind scratch ports (3911/5199) or previously-killed 3911 smoke ports; scratch dirs under `/tmp/synamp-b5*` — **never real data** (one incident excepted, §6).

### 3.3 Screenshots (evidence/b5/)

| file | content |
|---|---|
| `shot-describe.png` | full Playlists screen with the flagship prompt evaluated |
| `shot-describe-interpretation.png` | close-up: "Read as: focus", "How I read it (11)", audit entries with hard/soft kinds, assumptions |
| `shot-describe-result.png` | close-up: strict list + counts + save |
| `shot-brain.png` | full "The Brain" screen with the new panel mounted first |
| `shot-brain-panel.png` | close-up: epoch line ("This session: night, started 11:30 PM · 14 signals · last 11:30 PM"), adjustments with parts (Glass Lattice −0.59 "skipped early this session"; Velvet Engine / Engine Meridian −0.21 "other tracks by Lumen Atlas this session"), "Hidden until this session ends: Glass Lattice.", suggestion "You keep skipping “Engine Paper”… 3 sessions · 2 days · morning" + Accept/Dismiss, honesty note, "Learning policy: epoch-v1 (epoch-v1)" + Forget button |

**Why not the prescribed `pnpm --filter @synamp/web dev` on :5173:** :5173 was already listening — the **user's own stale Vite dev server** (PID 72140, started Mon 6 PM) — which serves a broken app in its browser (React version-mismatch: react 19.1.0 vs react-dom 19.3.0 from its stale dep cache; nothing on disk is out of sync — both packages are 19.1.0). My dev server was pushed to :5174 and was killed; rather than kill/repair the user's process, screenshots were taken against **`vite preview` of the verified dist build** on :5199 with a `/tmp` config proxying `/api` to the scratch brain on :3911 only. This exercises the production bundle (arguably stronger evidence than dev mode) and touches nothing of the user's.

## 4. Analysis — judgments made (all deliberate, none silent)

1. **Proposal accept for artist subjects.** Dispatch says "for positive kinds append global `thumb_up`". `external_play_positive` commonly has `subject_type: "artist"` (B2 §5.8) and there is no artist-keyed signal in the event schema; a `thumb_up` with `track_id: "<artist name>"` could never match a track and would pollute the log. Implemented: append the thumb **only when `subject_type === "track"`**; artist subjects record the decision and the UI says the fix is "follow the artist". `artist_repeat_skip` is no-event per dispatch. **Flagged for C-round.**
2. **`describe.css` edit** (the one "other web file"): strictly required to style the new interpretation elements (accuracy badge tones, readings list, audit). Minimal, token-based, ~23 lines, additive; no alternative fits the design-system convention (per-feature css file).
3. **`/api/v1/events` policy_version now reports the active policy** (was the v1 label). This is the "endpoints report the active policy name" clause; flagged since it changes a debug response field.
4. **Epoch view is recomputed per request** (`now` fresh) rather than cached — B2 §6.7 explicitly forbids caching a view across `now` (hide expiry, decay). Legacy view keeps the existing size+version cache. Cost is O(n) per call; measured sub-ms at 60 tracks / 22 events in the probes.
5. **Readout in legacy mode**: `epoch: null`, `hides: []`, `proposals: []`, `reliability_notes: []`; `queue_adjustments` still derived from `deriveFeedback` (v1 semantics, global parts only since no playlistId is passed). "Forget this session" button is disabled in legacy mode in the UI (backend accepts it; the marker is simply inert until epoch mode).
6. **`sequencing_applied` omitted when `[]`** (dispatch allowed omit-or-empty); the note-bearing coverage fallback is kept.
7. **Forget endpoint runs in both modes** (append-only marker; harmless and takes effect when the policy is epoch — a tombstone). Client-side confirm step is local state, no browser `confirm()`.
8. **`hidden_by_you` semantics kept** (count = `hidden.length`, now including epoch hides); the Describe copy still says "Removed by you" — flagged for C4 copy review.

### POLICY_VERSION / policy_version grep — exactly what was found (deliverable 6)

After the bump: `session/events.ts` = `"epoch-v1"` (mine). All other usages audited:
- **Value-flow consumers (all coherent):** `session/session.ts` (5 sites — new events stamped `epoch-v1`), `session/feedback.ts` (recordFeedback + view label), `index.ts` (subsonic events, forget marker; legacy accessor calls `deriveFeedback(..., "heuristic-v1")` explicitly). `learning/**` labels itself via its own `EPOCH_POLICY_VERSION`/literal and does **not** import `POLICY_VERSION` — bump cannot affect it. `evaluate.ts` echoes `feedback_policy` from whatever view is passed (now "epoch-v1" by default in epoch mode).
- **Literal fixtures (unaffected, suite green):** `lastfm/lastfm.test.ts` (×2 `"heuristic-v1"`), `session/session.test.ts` (×2 `"heuristic-v1"`), `learning/*.test.ts` (+`"test"`), `library/discography.test.ts` (`"t"`). No test pins the constant; no test asserted a view's `policy_version` (grepped before/after — the two new asserts are mine: default == `POLICY_VERSION`, explicit legacy label).
- No other `POLICY_VERSION` imports exist anywhere in `apps/` or `tools/`.

## 5. Anything C-round must check

1. **Accept semantics for artist-subject `external_play_positive`** (§4.1) — review the no-event choice and the UI copy ("follow the artist"); if reviewers want the literal dispatch, it is a one-line change + one event fixture.
2. **`hidden_by_you` copy**: Describe's "Removed by you — N hidden" now includes epoch hides (semantics kept per dispatch; the label is stale). Decide: server keeps count; UI copy may need "hidden this session".
3. **Item 3.2 resolve probe's re-selection**: after hiding `sample-034`, `sample-033` (same artist) also dropped from the top list via artist propagation — deterministic, identical at all three call sites, but C1 should falsify with their own fixtures (also: selection/caps mean hides can change *membership*, not just order).
4. **Forget marker with no active epoch** and in legacy mode (backend accepts; effect is deferred). Confirm the chosen semantics vs A3/C4 rollback story.
5. **`/api/v1/events` policy_version change** and `learning_reset` visibility (kept visible).
6. **Proposals store format** `synamp.brain-proposals/1` decisions never expire; dismissed id = (kind,subject) stable hash — confirm permanent-dismissal is acceptable, or propose an expiry.
7. **Security/robustness**: proposals `id` string length not capped (only equality-matched, no reflection into responses beyond readout filter — low risk); `brainSessionView` calls `view.adjust` per queue track (≤50) per request — fine at this scale, C4 can confirm on a 2000-entry queue (cap applies before adjust).
8. **`/brain/session` and `/brain/forget`/`proposals` need `PLAYLIST_API_TOKEN`** — verified 401/200; also confirm CORS/CSRF posture matches other POSTs (same-origin via proxy as usual).

## 6. Incident report (disclosed, contained)

**What:** during the first screenshot attempt, a scratch brain intended for `:3001` failed to bind (the port is owned by the **user's own long-running watch server**: PID 5801 `node --watch … src/index.ts`, live since Friday, child PID 12089). The script's `curl`s then silently hit the user's dev brain and wrote: 2 `started` + 2 `skip_early` events (ids `shot-rep-0001…0004`), queue/exposure bookkeeping (~14 log lines total), and replaced `session.json`'s queue with `sample-001..003`. All of it landed in `apps/brain/data/` — a **gitignored local dev sandbox that contained no prior events at all** (every line in `events.jsonl` is from that run; `playlists.json` untouched since Oct 1). No real/data loss; the implicit signals decay (30-min half-life) and their hides die at epoch end; the session queue can be replaced by playing anything. Nothing further was written to it; I did not touch the user's processes (the watch server, still running, also served my *read* checks earlier).
**Also observed, not fixable by me:** the user's Vite on `:5173` is stale/broken (React 19.1/19.3 mismatch from its old dep cache) — a restart of that dev server (or `pnpm dev` fresh) resolves it; packages on disk are consistent at 19.1.0 both.
**Process:** the retried screenshot flow (§3.3) adds hard port-owner assertion (`lsof` PID == our PID) and uses only :3911/:5199. Recommend C4 mention the two stale user processes as environment notes, not regressions.

## 6b. Mismatches found in others' modules

**None.** Everything consumed behaved exactly as the B1/B2/B4 receipts describe: `interpretGoal` returned valid chosen readings for every probed phrase; `sequenceTracks` notes matched wording; `deriveEpochPolicy`'s hides/resets/proposals behaved as specified at the route level; the B4 harness composition stayed idempotent under my evaluate-seam union (lab green, no `tools/**` refresh needed). No edit to any other writer's file was required or made. The only cross-module observations are the deliberate judgment calls in §4 (mine) and the environment notes in §6 (not code mismatches).

## 7. Gaps and risks (carried)

- Route-level time-travel (hide expiry after 30 min, daypart boundaries) is covered by B2 unit tests, not re-proven at route level (would need clock injection into the server; out of scope).
- Screenshots use the **built dist**, not the dev server (reason in §3.3).
- `queue_adjustments` passes no `playlistId` (spec shape is `adjust(track_id)`), so playlist-scoped thumb parts don't appear there; global/epoch parts do. If C-round wants playlist context per queue entry, it's a small add.
- Brain/web acceptance of the new `settings.listening_policy` in the web Settings UI is absent by design (curl-only switch); rollback remains a one-POST operation.
- All fixture-based claims remain synthetic-library evidence only.

## 8. Suggested final-report placement

- **Ch. 1 (translation layer):** `/plans/draft` interpretation shape + the Describe screenshots (accuracy badge, audit, asks) as the user-facing proof the interpreter ships.
- **Ch. 2 (fast learning brain):** the policy-switch wiring (decision 3/4), hide union, sequencing echo at all three call sites, the resolve probe (hide → resolve changes; artist propagation), the BrainSession panel + screenshots.
- **Ch. 3 (bias/culture):** "no raw plans in responses", interpretation-only summaries, learning stays advisory (proposals need a human Accept), honest empty states ("learning is paused", "not learned yet").
- **Ch. 4 (verification & handoff):** §3 tables (205→210 / lab green / smokes / auth), the incident report as an environment/process lesson, the §5 review checklist, rollback levers (settings switch + forget + branch revert).
- **DELIVERY/verification/:** copy `evidence/b5/` (logs, `.sh` scripts, `responses/`, screenshots).

## Receipt checklist (repo conventions)

- **Confirmed:** all 8 dispatch deliverables executed; tests 210/208/1/1; type-checks clean; build clean; lab green without `tools/**` edits; route smoke (epoch + auth + resolve + details) and screenshots saved under `evidence/b5/`; no commits, no `pnpm install`; forbidden files untouched; POLICY_VERSION grep audited and reported.
- **Not done:** web Settings UI control for `listening_policy`; route-level time travel; no proposals flow exercised through the UI end-to-end (Accept needs ≥3 epochs history — seeded data rendered it; the POST path was curl-verified including 404/400/409 paths).
- **Unverified:** long-run behavior on real listening data (none in scope); behavior of the user's stale :5173/:3001 processes (not mine).
- **Next smallest experiments:** C1 re-derive the resolve probe fixtures; C4 decide on the two flagged items (§5.1, §5.2).

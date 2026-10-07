# C4 — Production readiness & delivery-inputs review (receipt)

Status: **complete** · Reviewer: C4 (production-readiness & delivery-inputs auditor) · Date: 2026-10-07 00:16 → 00:30 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ branch `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree; **no commits**) — audited read-only.
All new artifacts of this review live under `evidence/c4/` (+ `/tmp/synamp-c4*` scratch). **No repo file was edited; git status is identical before/after (14 modified + 36 untracked = 50 entries, all in the planned set).**

> **Records as-of 2026-10-07 ~00:30 CDT.** Other agents were active in the cluster during the audit (delivery-plan.md updated 00:20, H4 receipt rewritten 00:21, W1/W5/W7 touch-ups 00:09–00:20). Statements below refer to the files as they are at that time.

---

## Return block (mandatory format)

**Conclusion.** The fast-learning-brain tree is production-ready as a *reviewed candidate*: all three fresh verification runs reproduce the claimed state (brain suite 218 / 216 pass / 1 pre-existing macOS red / 1 skip; both type-checks exit 0; lab 8 scenarios / 86 checks / 0 fail / 5 skip, normalized-identical to the canonical `evidence/final-lab` capture). Runtime rollback works exactly as documented — `listening_policy: legacy-v1` reverts the readout to `policy_version: heuristic-v1` with epoch `null` and hides `[]`, switching back re-derives from the untouched log; `POST /brain/forget` clears session learning via an appended `learning_reset` marker (append-only proven). All audited error paths behave per contract, auth is enforced on the new routes (401/200), the scratch recipe and `.env`-layer defaults are correct, and the new modules introduce no telemetry/outbound calls and no new required envs. **One real delivery defect found (F1): the branch has zero commits, so the documented `git diff main..feat/fast-learning-brain` PATCH.diff command yields an empty patch and `git checkout main` would not revert anything yet — S5 must commit the tree (or use the verified `git add -N` variant) before generating PATCH.diff.** Remaining items are documentation-grade (stale counts already tracked by the delivery-plan QA list, README endpoints table rows, curl-only policy switch).

**Evidence.** Fresh runs + logs in `evidence/c4/`: `c4-brain-test-fresh.log` (218/216/1/1), `c4-typecheck-brain.log` + `c4-typecheck-web.log` (exit 0), `c4-lab-fresh.log` + `c4-lab-fresh.json` (fresh lab run — normalized-equal to all four `evidence/final-lab` JSONs: `lab.json`, `determinism-run1/2`, `cwd-run`). Rollback/forget/error smoke: `c4-rollback-smoke.sh` + `.log` (scratch `/tmp/synamp-c4/rollback`, port 3921). Auth: `c4-smoke-auth.sh` + `.log` (port 3922). Git audit: `c4-git-audit.txt` (rev-parse, both diff dry-runs, full status). Git-semantics proof for the add -N recommendation: `/tmp/synamp-c4/git-semantics` (scratch repo, transcript in this file §7). Source-level checks: `apps/brain/src/session/events.ts` (append-only), `settings.ts`, `config.ts`, `index.ts` routes; dev sandbox: `apps/brain/data/` listing + JSON parse.

**Analysis.** (1) Rollback story = three levers: settings switch (verified live), forget marker (verified live, append-only proven), branch revert (only remaining lever — but precondition F1). (2) Error paths: every probed malformed input returns its designed status/body; nothing leaks plans or 500s. (3) Config: scratch recipe runs as documented; clean-env defaults unchanged; no new envs anywhere in the new modules. (4) Event log: only writer is `EventLog.append` (`openSync("a")` + `appendFileSync` + `fsync`); no mutate/delete path exists; `learning_reset` appended by the forget route. (5) Docs: code-name checks all pass (settings key, routes, policy version, constants); only counts are stale-by-design; D8 is well-formed. (6) Delivery inputs: all sources present except the two expected pending chapters (W4, W6) — plus F1. (7) Privacy: no telemetry; docs/report carry research citations and synthetic-fixture references only.

**Gaps and risks.** F1 (High, delivery): empty PATCH.diff / branch revert not yet effective — needs a commit decision at S5. F2 (Low): stale "at review" counts in FLB doc + AGENT-ROADMAP (exact lines below), already on the delivery-plan QA list; W5 appendix still carries the 7/66 lab command comment. F3 (Low): README endpoints table lacks the three new brain routes (prose covers them). F4 (Low, carry): proposal decisions never expire; 409 path not freshly re-exercised (needs seeded multi-epoch history; covered by B5/H2). F5 (Low): policy switch has no UI (curl-only) — acceptable; must be in the ch.4 ops notes. F6 (Note): dev-sandbox residue matches the disclosure; leave + document.

**Suggested final-report placement.** Ch.4 "Verification, rollback, and handoff": the fresh-count table (§1), rollback levers with the exact verified POSTs (§2a/b) and the branch-revert caveat (F1), error-path table summary (§3), ops notes (switch is curl-only; sandbox residue F6), and the delivery audit result (§7) including the PATCH.diff caveat. Ch.3 note: "no telemetry in new modules" audit (§8) fits the bias/privacy paragraph. DELIVERY/verification manifest: copy `evidence/c4/` alongside `final-lab`.

---

## Verdicts (explicit)

| Question | Verdict |
|---|---|
| **Rollback verified** | **YES** — settings switch (a) + forget (b) re-proved live on scratch; append-only proven. Caveat: branch-level revert (c) is the only remaining lever but is **not effective until the tree is committed** (F1). |
| **Error paths verified** | **YES** — all probed bad inputs return designed 400/404 with clear bodies; auth 401/200 matrix correct; no 500s. |
| **Delivery inputs ready** | **YES — no missing sources.** Blockers to act on at S5: **F1 (PATCH.diff command void until commit/add -N)**; expected pending work: W4 + W6 chapters (D-round), review.md + HTML/PDF (mainline). Upgrades vs brief: figures + W7 are now **present** (no longer pending). |

---

## 1. Fresh re-run (task 1) — exact counts

Environment: node v24.13.0, pnpm 9.12.0; run 2026-10-07 ~00:18–00:21 CDT from a clean shell in the repo root.

| Command | Result | Log |
|---|---|---|
| `pnpm --filter @synamp/brain test` | `tests 218 · pass 216 · fail 1 · skipped 1` — the **only** red is `librarian.test.ts:149 "artist merge: whole folders…"` (macOS case-fold `Ani Difranco` vs `Ani DiFranco`; identical to baseline); skip = the known `/dev/shm` case. Exit 1 **by design** (carried red), `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` at the end. **No new red.** | `evidence/c4/c4-brain-test-fresh.log` |
| `pnpm --filter @synamp/brain type-check` | exit **0**, no output | `evidence/c4/c4-typecheck-brain.log` |
| `pnpm --filter @synamp/web type-check` | exit **0**, no output | `evidence/c4/c4-typecheck-web.log` |
| `node --experimental-strip-types tools/brain-lab/lab.mts` | exit **0** — `SUMMARY — scenarios: 8 (8 pass…)` / `checks: 86 pass · 0 fail · 0 pending · 5 skip` / `RESULT: OK` | `evidence/c4/c4-lab-fresh.log` |

Lab equivalence re-proved freshly (stronger than reading receipts): a fresh `--json` capture is **normalized-identical** (drop `generated_at`, sort_keys, compact separators) to all four canonical files `evidence/final-lab/{lab,determinism-run1,determinism-run2,cwd-run}.json` → counts-determinism holds at the audited tree state.

## 2. Rollback paths (task 2) — details

**(a) `listening_policy` switch → `legacy-v1` (scratch `/tmp/synamp-c4/rollback`, port 3921; pattern copied from `evidence/b5/route-smoke-epoch.sh`).** Sequence: queue 3 tracks → `start` + early-skip ×2 for `sample-001` → readout.

- Epoch mode (before): `policy_version: epoch-v1`, `listening_policy: epoch-v1`, `hides: ["sample-001"]`, adj `-0.5999…` parts `[{"skipped early this session", -0.6}]`, epoch `night 2026-10-07`.
- After `POST /api/v1/settings {"listening_policy":"legacy-v1"}` (changed: `["listening_policy"]`, no restart): readout `policy_version: heuristic-v1`, `listening_policy: legacy-v1`, `epoch: null`, `hides: []`, `proposals: 0`; queue adjustment now `{value: 0, parts: []}` (**behaviour reverted**); `GET /api/v1/events` reports `policy_version: heuristic-v1`; `POST /plans/draft` preview echoes `feedback_policy: heuristic-v1`.
- Switch back to `epoch-v1`: `hides: ["sample-001"]` **reappears** — a pure re-derive from the same untouched log (reversible; no migration).
- Readout shows exactly the B5-documented rollback shape (`policy_version: heuristic-v1` ✓).
- Scratch restored: server killed by trap; ports 3921/3922 free; nothing written outside `/tmp` + `evidence/c4`.

**(b) `POST /api/v1/brain/forget` clears session learning — re-verified.**
- Before: hides `["sample-001"]`, adjustments with parts = 1. After forget (scope `epoch`, default): `hides: []`, adjustments-with-parts `0`, notes `["session learning was reset — only what happened after the reset counts","nothing learned yet this session"]`; a re-GET confirms.
- Append-only proof: events line count `14 → 15` (exactly +1), **first-line sha256 unchanged**, last line = `{signal: "learning_reset", scope: "none", detail: {"scope":"epoch"}, policy_version: "epoch-v1"}`.

**(c) Branch-level revert is the only other lever — with one precondition (F1).** Enumerated: runtime levers are (a) + (b); the repo-level lever is the branch. Ownership picture is clean: all 50 dirty entries map to the planned writers (14 modified: brain README, index, evaluate, plan, query.test, events, feedback, settings+test, web App/Describe/describe.css, DECISIONS, AGENT-ROADMAP; 36 untracked: intent/×3, learning/×11, query/×3, session feedback.test, web BrainSession+brain.css, FLB doc, tools/brain-lab ×15). **Nothing unexpected; no stray files.** But: `main` and `feat/fast-learning-brain` both point at `b6ea5ce1` and the work is uncommitted → see F1: today `git checkout main` keeps the dirty tree (proved in a scratch repo), so the revert story only becomes true once S5 commits the tree (or the team chooses the no-commit procedure). Data files involved in rollback (settings.json policy field, `brain-proposals.json`, dev-sandbox events/session) are additive and inert under an old build — nothing else needs rolling back.

## 3. Error paths (task 3) — recorded responses

All via scratch server (§2a); full transcripts in `evidence/c4/c4-rollback-smoke.log`.

| Probe | Status | Body (verbatim where quoted) |
|---|---|---|
| `POST /brain/forget {"scope":"all"}` | **400** | `scope must be "epoch" — the event log is never edited, only marked` |
| `POST /brain/forget {"scope":"session"}` | **400** | same |
| `POST /brain/forget {}` (scope default) | **200** | default = epoch |
| `POST /brain/forget` — empty body | **400** | `Invalid JSON object` |
| `GET /brain/forget` (wrong verb) | **404** | `not_found` |
| `POST /brain/proposals {"action":"accept"}` (no id) | **400** | `id is required` |
| `POST /brain/proposals {"id":"pr1:x","action":"maybe"}` | **400** | `action must be "accept" or "dismiss"` |
| `POST /brain/proposals {"id":"pr1:does-not-exist","action":"accept"}` | **404** | `No suggestion with that id` |
| `POST /plans/draft` — prompt 501 chars | **400** | `prompt must be 1–500 characters` |
| `POST /plans/draft` — prompt 500 chars | **200** | boundary accepted |
| `POST /plans/draft` — whitespace-only prompt | **400** | `prompt must be 1–500 characters` |
| `POST /plans/draft` — invalid JSON | **400** | `Invalid JSON object` |
| `POST /settings {"listening_policy":"bogus"}` | **400** | `The listening policy must be "epoch-v1" (session learning) or "legacy-v1" (the v1 re-ranker)` |

**Auth on/off (task 3b; `evidence/c4/c4-smoke-auth.log`, `PLAYLIST_API_TOKEN` set, port 3922):** `/health` 200 public; `GET /brain/session` 401 → 200 with token; `POST /brain/forget` 401 → 200; `POST /brain/proposals` 401 (no token) → 400 with token+bad action; `GET /events` 401 → 200; `POST /settings` 401 → 200. `"/api/v1/brain"` is in `protectedPath` (index.ts:655–659). CORS/CSRF posture unchanged from existing POSTs (same-origin via proxy). Not freshly re-exercised: proposals **409** "already decided with a different action" + accept event shape — needs seeded ≥3-epoch history; covered by B5 §3.2/H2 §F3 receipts (low risk, noted as carry).

## 4. Config / env (task 4)

- **Scratch recipe (as documented in B5 §3.2 / plan.md decision 5) executed and correct**: `PLAYLIST_DATA_PATH=<scratch>/playlists.json LIBRARY_SIGNALS_PATH=<repo>/fixtures/library.sample.json BRAIN_PORT=3921 BRAIN_HOST=127.0.0.1 node --experimental-strip-types src/index.ts` boots cleanly (`synamp-brain listening on http://127.0.0.1:3921`), writes everything scratch-local (events/session/settings/proposals beside the playlist store via `dataDir = dirname(PLAYLIST_DATA_PATH)`, index.ts:73–74). **`BRAIN_DATA_DIR` does not exist anywhere** (grep of apps + docs: no hits) — matches decision 5.
- **`.env`-style defaults still apply** (clean-env import of `src/config.ts`): port `3001`, host `127.0.0.1`, `./data/playlists.json`, `./fixtures/library.sample.json`, events/session derived beside the store, token `""` (no auth locally). Verified restorable and unchanged.
- **No new required envs**: `config.ts` is untouched by this slice; new modules (`intent/**`, `learning/**`, `query/sequence.ts`, `BrainSession.tsx`) contain **zero** `process.env` reads; README's Config list covers the runtime vars.

## 5. Event-log integrity & dev sandbox (task 5)

- **Append-only holds at source level.** `events.ts` opens the log **only** with `openSync(path, "a")` + `appendFileSync` + `fsyncSync` (events.ts:103–113); no `writeFile/truncate/rename/unlink/rm` on the event path anywhere; `learning_reset` is a union member (events.ts:40) and is **appended** by the forget route (index.ts:1041–1052). Mutation call sites are exactly three `events.append(...)`: subsonic capture (index.ts:299), proposal accept (index.ts:433), forget (index.ts:1047) — plus derived classification appends inside `session.ts`, all through `EventLog.append` with id-dedupe and torn-line recovery. All other stores write their own files atomically (temp+rename); none touches `events.jsonl`.
- **Dev sandbox `apps/brain/data/` — confirmed matches the disclosure** (B5 §6): `events.jsonl` = **14 lines** = 2 `started` + 2 `skip_early` + 8 `exposure` + 2 `receipt`; ids all `shot-queue-0001/0002` / `shot-rep-0001…0004`; `track_id`s only `sample-001…003` (synthetic). `session.json` = 3-track queue `sample-001..003`, `index: 1`, `state: playing`, `updated_at` 2026-10-06 23:26 CDT. `playlists.json` untouched since Oct 1 21:34. No other files.
- **Disposition proposed (nothing deleted):** **leave + document.** It is a gitignored local dev sandbox (`.gitignore` line 21 `apps/brain/data/`), the events decay/hides die at epoch end, and the queue is cosmetic (playing anything replaces it). Optional owner-side cleanup if a pristine sandbox is wanted: move `apps/brain/data/events.jsonl` + `session.json` to Trash (their call; not performed here). Do not treat as a deliverable.

## 6. Docs consistency (task 6)

Checked claims against code (all file:line refs in the repo):

| Doc claim | Code anchor | Verdict |
|---|---|---|
| Settings key `listening_policy` = `epoch-v1` (default) / `legacy-v1`; validation + origins | `settings.ts:16–36,62,78,85,140–145` | ✓ |
| Routes `GET /brain/session`, `POST /brain/forget`, `POST /brain/proposals` (+ shapes, scope enforcement, proposal actions) | `index.ts:1038–1066` | ✓ (live-verified §2–3) |
| `POLICY_VERSION` bump `heuristic-v1 → epoch-v1`; legacy path labels `heuristic-v1` | `events.ts:31`; `index.ts:325–340` | ✓ (live-verified) |
| Epochs: 30-min idle gap / 30-min live window / local day / session key; dayparts 05/12/17/22 | `epochs.ts:27,29,76–84,137–141,164` | ✓ |
| `epoch_id = "ep1:" + sha256(t_start,t_end,first_event_id)[0..15]` | `epochs.ts:93–96` | ✓ |
| Evidence table (love +2/1.0/180d; thumb ±1/0.9/30–180d; full_play .5/.5; repeat 1/.7; skip_early −.6/.5; skip_late −.1/.2; ext .25/.5; not_now −1/.9) | `types.ts:129–136,151–155` | ✓ |
| Centroids: β .5, γ .15, keeps ≥3, rejects ≥2, coverage 60 %, spread floor .25, total cap 1.0, axis cap .5; artist π .35 cap .8, gate ≥2 events/|sum|≥1.0 | `types.ts:158–168`; `derive.ts:39,41,302` | ✓ |
| Proposals: 30-day scan; thresholds (track 3/2; artist 3/2/≥2 tracks; not_now 3/2/2 dayparts; ext 5/3; repeat 4/3) | `proposals.ts:22,28–33` | ✓ |
| Arcs `build/cooldown/peak/wave` accepted by plan (hash includes sequencing; flat unchanged) | `plan.ts:78,422–424` (diff vs main reviewed) | ✓ |
| Saturation stays `0.15·tanh(v/2)` in evaluate | FLB doc vs `evaluate.ts` (C1/H3 verified; unchanged here) | ✓ |
| **Stale counts** | **FLB doc lines 270 / 286–288** ("210 tests…", "7 scenarios · 64 checks…", "7 scenarios · 66 checks…") and **AGENT-ROADMAP lines 545 / 547 / 550–551** ("7 scenarios", "Brain 210 tests at review", "66 checks") | ⚠ **stale-by-design** — both explicitly say "at review; final counts in DELIVERY/verification"; current canon = **218 / 216 pass / 1 / 1** and **8 / 86 / 0 / 5**. Delivery-plan "Assembly QA list" items 1/3/5 already track this (incl. W5 appendix line 368 still expecting "7 scenarios · 66 checks" — update to 8/86). |
| AGENT-ROADMAP entry format | Confirmed / Not done / Unverified / Next smallest experiment present (lines 547–563) | ✓ |
| README fast-learning section | Section present, names match code (`epoch-v1`, routes, hides, proposals). **Nit:** the big Endpoints table (README:243+) lacks rows for the 3 new brain routes (prose at 163–164 covers them) | ⚠ Low (F3) |
| DECISIONS **D8** | Lines 95–105: heading + 10 body lines incl. *Revisit if:*, dated `*(accepted 2026-10-06)*` (ISO, matches repo date style); content matches H3 receipt | ✓ |

## 7. Delivery inputs audit (task 7)

Sources vs delivery-plan §"Final DELIVERY layout" (audited ~00:30):

| Promised artifact | Source state |
|---|---|
| `SynAmp-Fast-Brain-Report.html` | Sources present: `report-sources/W1, W2, W3, W5, W7` + **figures now present** (4 SVGs `flow/epochs/reliability/modules.svg` + render-check snapshots in `report-sources/figures/`). **W4 (ch.4) and W6 (exec summary) pending** — expected D-round work; W4 now has its C4 input (this file). |
| `SynAmp-Fast-Brain-Report.pdf` | Pending S5 (bonus; downgrade note already planned). |
| `agent-instructions/AGENT-BRIEF-FAST-BRAIN.md` | Source `W7-agent-brief.md` present (mtime 00:20). ⚠ F1-adjacent: W7 line 11 says "`PATCH.diff` staged in `DELIVERY/code/`" — not yet true; becomes true at S5. |
| `code/` snapshot + `PATCH.diff` | Snapshot inputs fine (working tree, 50 paths). **PATCH.diff dry-run issue — see F1 and below.** |
| `verification/` | All source sets present: `evidence/{baseline(5), b5(33 incl. 5 PNGs), final-lab(12), c1(24), c2(4), c3(35), h1(11), h2(4), c4(11)}` + receipts at cluster root (A1–A4, B1/B2/B4/B4b/B5/B6, C1/C2/C3/H1–H4). |
| `review.md` (copy) | Pending mainline assembly — inputs C1/C2/C3/C4 all present. |

**PATCH.diff dry-run (executed, read-only):**

- `git -C ~/_dev/web-apps/SynAmp diff --stat main..feat/fast-learning-brain` → **EMPTY (0 lines)**. Cause: both refs are `b6ea5ce1`; the branch has **no commits** (all work is dirty-tree; `git status`: 14 modified + 36 untracked). The documented command (delivery-plan lines 10 & 44) cannot produce the patch in this state.
- `git diff --stat main` → 14 files, **483 insertions(+), 26 deletions(−)** (tracked changes only).
- Scratch-repo proof of the fix path: `git add -N .` then `git diff --stat main` → includes new files as new-file diffs; `git reset` restores the index cleanly; and a same-commit branch pair: `git checkout main` **carries** the dirty tree (so it is not a revert while uncommitted).

**Exact command for S5 (pick one, deliberately):**
- **(A, makes the plan doc true — recommended)** commit the frozen tree on the branch first, e.g. `git -C ~/_dev/web-apps/SynAmp add -A && git -C ~/_dev/web-apps/SynAmp commit -m "fast learning brain: intent + epoch learning + sequencing + integration"`, then generate: `git -C ~/_dev/web-apps/SynAmp diff main..feat/fast-learning-brain > "<DELIVERY>/code/PATCH.diff"` (preview with `--stat` first). After this, `git checkout main` is a true revert and W7's claim is honest.
- **(B, keep no commits)** in the repo: `git add -N . && git diff main > "<DELIVERY>/code/PATCH.diff" && git reset` (verified semantics in scratch; includes the 36 new files; `git reset` restores index; nothing else mutated). Note in DELIVERY that the branch remains uncommitted so the revert story is "discard working tree", not checkout.
- Either way: after generation, verify the patch touches all 50 planned paths and re-capture final counts (delivery QA item 5).

**Not blocking S5:** receipt list complete (H4 receipt recovered — delivery QA item 2 now satisfied: `H4-lab-sync.md` present + `evidence/final-lab/EVIDENCE.md` + `run.json`); DELIVERY/ dir itself not created yet (that is S5's job).

## 8. Safety / privacy (task 8)

- **No telemetry / outbound calls in the new modules.** Audit: `intent/**`, `learning/**`, `query/sequence.ts`, `BrainSession.tsx` — no `fetch`/`http(s)`/`XMLHttpRequest`/`WebSocket`/sockets/`child_process`, and no analytics SDKs; imports are only `node:crypto`/`node:assert` + internal modules; the only grep hit is the word "web-analytics" inside a research comment (`epochs.ts:12`). `BrainSession.tsx` receives the app's `request` prop (relative `/api/v1/...` same-origin calls only). No `process.env` reads in new modules (config surface unchanged). Pre-existing outbound (Last.fm, MusicBrainz, Subsonic proxy) is untouched by this slice.
- **No private data that shouldn't ship.** All verification used the synthetic 60-track fixture (`library.sample.json`) and sample ids; docs/report-sources carry research citations + design text only (scan for emails/tokens/secrets: none; only repo/cluster paths and citation URLs — standard for this project's internal delivery). The dev-sandbox residue is synthetic ids only (§5). Screenshots (b5) show the synthetic library. Nothing processes real listening data.

---

## Findings table

| # | Severity | Finding | Evidence | Fix suggestion (owner: S5/hotfix) |
|---|---|---|---|---|
| **F1** | **High** | **PATCH.diff command is void: branch has no commits.** `git diff main..feat/fast-learning-brain` = empty; `git checkout main` would not revert (dirty tree carries); FLB doc says "`git checkout main` is a full revert" (lines 339–340) and W7 says "PATCH.diff staged in DELIVERY/code/" (line 11) — both untrue until committed/patched. | `evidence/c4/c4-git-audit.txt`; dry-run output; scratch-repo proof (`/tmp/synamp-c4/git-semantics`); rev-parse both = `b6ea5ce1`; 14 M + 36 ?? | S5: choose (A) commit tree → documented command works + revert true; or (B) `git add -N . && git diff main > PATCH.diff && git reset`. Then update/verify W7 line 11 claim. |
| **F2** | Low | **Stale "at review" counts** in repo docs: FLB doc lines 270/286–288; AGENT-ROADMAP lines 545/547/550–551; W5 appendix line 368 (still expects 7/66). Both repo docs point to DELIVERY/verification for finals; delivery-plan QA list items 1/3/5 track this. | Fresh runs §1; line refs above; `report-sources/W5` line 50/389 already mark old numbers superseded | S5/verification: update to 218 / 216 / 1 / 1 and 8 / 86 / 0 / 5 (or rely on DELIVERY/verification, as the texts already say). Never quote 205/64/66 in the report (QA item 4). |
| **F3** | Low | README Endpoints table (line 243+) omits `GET /api/v1/brain/session`, `POST /api/v1/brain/forget`, `POST /api/v1/brain/proposals` (prose covers them at 163–164). | README read; grep of table | Add 3 table rows at S5 (1 line each) — cosmetic. |
| **F4** | Low (carry) | Proposal decisions (`brain-proposals.json`) never expire — a dismissed id is permanently suppressed; and the 409 "already decided" path was not freshly re-exercised (needs seeded multi-epoch proposals; B5/H2 cover it). | index.ts:397–421 (ProposalDecisions); B5 §5.6 (open item); receipt coverage | Accept + document as known limitation in ch.4/AGENT-BRIEF; revisit expiry later. Optionally add a seeded 409 check to C5-style smoke. |
| **F5** | Low | Rollback switch has no web UI (curl/API-only; B5-flagged). Acceptable for ops but must be discoverable. | B5 §5/§7; smoke §2a shows the one-POST flow | Ensure report ch.4 + DELIVERY ops note contain the exact `POST /api/v1/settings {"listening_policy":"legacy-v1"}`; optionally add a Settings toggle later. |
| **F6** | Note | Dev-sandbox residue in `apps/brain/data/` confirmed exactly as disclosed (14 events, synthetic ids; 3-track queue; 23:26 CDT); `.gitignore:21` covers it. Environment: stale user processes still listening (`:5173` PID 72140, `:3001` PID 19998) — not regressions. | §5; `ls -la apps/brain/data`; port checks | Leave + document (proposed; nothing deleted). Owner may optionally Trash `events.jsonl` + `session.json` for a pristine sandbox. |

## Carried context (do not chase)

- Pre-existing reds: macOS librarian case-fold fail + `/dev/shm` skip — same names/counts as the 149-test baseline; root `pnpm type-check` stops in the pre-broken vendored `packages/webamp` chain (unrelated).
- Candidate values (magnitudes/thresholds) remain untuned by design; proposal thresholds most speculative.
- Fixtures are synthetic — no claim in this review is evidence about real music.

## Artifacts produced by this review (`evidence/c4/`)

`c4-rollback-smoke.sh` + `c4-rollback-smoke.log` · `c4-smoke-auth.sh` + `c4-smoke-auth.log` · `c4-brain-test-fresh.log` · `c4-typecheck-brain.log` · `c4-typecheck-web.log` · `c4-lab-fresh.log` + `c4-lab-fresh.json` + `c4-lab-fresh-json.log` · `c4-git-audit.txt`.

— C4, 2026-10-07 00:30 CDT

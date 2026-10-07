# W4 — Ch.4 "Verification, rollback, and handoff"

## Return block (subagent format)

**Conclusion.** Chapter 4 drafted from the assigned receipts and reviews (B4, B4b, B5, H4, H1–H3, C1, C4) plus the evidence tree (baseline, final-lab, b5, c1, c4 — read-only). It tells the verification story honestly: a 149-test baseline with two carried reds, a 218/216/1/1 final canon with the same two, both type-checks at exit 0, an 8-scenario / 86-check harness that is deterministic and CWD-independent, C4's three verdicts (rollback YES; error paths YES; delivery inputs YES with one High finding, F1), route smokes for auth / policy rollback / forget / error paths, the review-catch-fix loop (wave bug + display/copy/docs) framed as the system working, the rollback levers and ops notes, and the next smallest experiments. Every number traces to a log; intermediate counts (205 / 64 / 66) are explicitly barred from quoting.

**Evidence.** `evidence/baseline/BASELINE.md` + logs (149/147/1/1, captured twice); `evidence/final-lab/` (lab.json `synamp.brain-lab/1`, run.json, hashes.txt — 35 files verified `shasum -c`, determinism-run1/2 + cwd-run, EVIDENCE.md); `evidence/b5/` (route smokes, responses, screenshots); `evidence/c1/` (probe logs, wave repro); `evidence/c4/` (fresh re-runs, rollback + auth smokes, git audit); receipts B4 §§A–B, B4b §§1–3, H4, B5 §§3–6, H1 §2, H2 §F3–F8, H3; reviews C1 §§1–7, C4 §§1–8 (+ verdicts, F1–F6).

**Analysis.** Structure: counts table → harness → route-level evidence → review catches → rollback/ops → next experiments + status ledger. Load-bearing choices: (1) quote only the freshest captures and state that the S5 manifest re-captures on the frozen tree; (2) keep the branch-revert story honest with the commit precondition (F1) stated, not assumed; (3) name the wave bug's coverage hole — the fix is the proof the review system works; (4) mark partial/unverified items rather than smoothing them.

**Gaps and risks.** Real-music behaviour unverified (synthetic fixtures); proposals 409 path not freshly re-exercised (B5/H2 receipts cover); legacy policy path route-verified but not lab-modelled; branch revert only true once S5 commits (F1 closed at delivery); lab counts frozen to a module state — re-run before quoting elsewhere.

**Suggested final-report placement.** Ch.4 as written, between Ch.3 and the appendix; the counts table and error-path table are quotable wholesale by W6 and the delivery manifest; no new figure placeholders (figures live in ch.1–3).

---

# Chapter 4 — Verification, rollback, and handoff

Verification here means three re-runnable commands, counts captured fresh on the frozen tree, adversarial review, route smoke against a live server — and notes wherever a check cannot see.

## 4.1 Baseline → final canon

| Verification | Baseline | Final canon (fresh capture at write time) |
|---|---|---|
| Brain suite (`pnpm --filter @synamp/brain test`) | **149** — 147 pass · 1 fail · 1 skip | **218** — 216 pass · 1 fail · 1 skip |
| Type-checks (`@synamp/brain`, `@synamp/web`) | both exit 0 | both exit 0 |
| brain-lab harness | (did not exist) | **8 scenarios · 86 pass · 0 fail · 0 pending · 5 documented skips** |
| C1 adversarial probes (five scripts) | — | 132 checks; one red = the `wave` bug (fixed, regression-pinned) |

Both reds are carried, not earned: the fail is a macOS case-fold artifact — the librarian artist-merge expects `Ani DiFranco/…` after renaming `Ani Difranco/…`, which case-insensitive APFS cannot deliver (passes on Linux CI); the skip is the cross-disk `/dev/shm` case, absent on macOS. Same test, same skip, every run; 69 tests were added net with zero new reds. (The root `type-check` chain still stops in the pre-broken vendored `webamp`.) Counts above are the freshest capture at write time (C4's fresh re-runs, 2026-10-07, post H1–H4); the delivery manifest re-captures at S5 and supersedes them. Intermediates (205 / 64 / 66) are never quoted.

## 4.2 The harness: `tools/brain-lab`

A read-only harness loads the repo's real modules (absent ones reported, never stubbed) and drives eight scenarios with pinned inputs — clock, fixture, ids. One command:

```
cd ~/_dev/web-apps/SynAmp
node --experimental-strip-types tools/brain-lab/lab.mts
```

`--json <path>` writes machine evidence (`synamp.brain-lab/1`). What they prove:

- **01–04** — flagship phrases yield valid readings (pump/dance run the full evaluate path, strict 25/25); vague/impossible return asks, never dead ends; contradictions give two labelled readings.
- **05 fast-learning** — inside one epoch, repeat-skips hide tracks (`counts.hidden_by_session = 2`, no dead Restore), kept tracks re-rank (#33→#0, #23→#2, #39→#1); four `sequence-wave-*` regression checks.
- **06 isolation** — the same stream at `now+16h`: adjustments `+0.000`, hides empty, resolve **byte-identical** to baseline. Proven, not promised.
- **07 forget** — the `learning_reset` marker clears the epoch's evidence.
- **08 culture-guardrails** — banned product words absent (user echo counted), culture spans never asserted outside quoted echo, no dead ends — a pin over honest behaviour, not classifier accuracy.

**Determinism and CWD.** Two runs are byte-identical modulo `generated_at`; a run from `/tmp` normalizes to the same hash (`c81b8753…`). When replayability is the promise, a harness drifting with clock or directory tests the environment, not the code; C4's fresh re-run matched all four canonical captures.

**The five skips** are registered, not silent: two mark the legacy pipeline legs (coverage moved to `intent-chosen-evaluates`); three are not-applicable by design — evaluating a vague or impossible ask is a category error; the contract is asserted instead.

**Honest boundary.** The lab composes modules exactly as `index.ts` `policyOptions()` does but cannot start the server; routes are covered below. Fixtures are synthetic — no evidence about real music.

## 4.3 Route-level evidence

**Auth on/off.** `/health` public; without a token the brain routes, `/events` and `/settings` return 401, with it 200 (bad bodies still 400); `"/api/v1/brain"` is protected.

**Policy rollback, live.** One POST — `{"listening_policy":"legacy-v1"}` — flips the readout to `policy_version: heuristic-v1`, `epoch: null`, `hides: []`; the queue adjustment falls from −0.5999 ("skipped early this session") to 0. Switching back restores the hide — a pure re-derive from the untouched log. No restart, no migration (C4 live).

**Forget.** `POST /brain/forget` appends a `learning_reset` marker — append-only proven: 14→15 log lines, first-line hash unchanged.

**Error paths** (probed live; no 500s, nothing leaked):

| Probe | Result |
|---|---|
| forget `scope:"all"` / `"session"` | 400 — "the event log is never edited, only marked" |
| forget empty body / invalid JSON | 400 |
| proposals missing id / bad action | 400 |
| proposals unknown id | 404 — "No suggestion with that id" |
| draft prompt >500 chars / whitespace-only | 400 (500 chars boundary → 200) |
| settings bogus policy | 400 |

**Queue/resolve smokes.** "pump me up…" resolves with an identical order at resolve == explain == evaluate, `sequencing_applied` at all three; a skip hides `sample-034` and the list re-derives (same-artist `sample-033` drops too — deterministic); draft previews match; screenshots from the built dist.

## 4.4 What review caught — and fixed

C1's probes found the sharpest catch — `wave` corrupting odd measured counts (n=3 → `[hi, lo, undefined]` → `null` → queue-build 500); it survived a green unit suite because the wave test used even tracks and the determinism loop compared outputs to themselves. A coverage hole, closed. H1 fixed it, added n=1/3/5 regression tests (even counts byte-identical); H4 converted it into lab checks. Display/copy: session hides no longer masquerade as "Removed by you" (no dead Restore); accepted proposals no longer synthesize a reason (`detail.proposal_id` provenance); consequences precede the click; "% sure" → confidence words; sequencing notes render. Docs: declared-field caveat, propagation marker, guardrails attribution, D8, counts hygiene. Counts were re-captured, not re-quoted.

## 4.5 Rollback and operations

C4's verdicts: **rollback — YES; error paths — YES; delivery inputs — YES**, with the commit precondition as its only High finding.

- **Branch level.** The slice ships as a single commit on `feat/fast-learning-brain`; revert = `git reset --hard <base>` (or `git checkout main`) — no migrations; data files are additive and inert under an old build; hashes go in the manifest. *Precondition (C4 F1, closed at S5):* the tree was uncommitted at review time and the patch command void; S5 commits first.
- **Policy switch.** `POST /api/v1/settings {"listening_policy":"legacy-v1"}` and back — instant; curl-only (no UI — carried).
- **Forget.** `POST /api/v1/brain/forget` — append-only; loves/thumbs/removes survive by design.
- **Proposals store.** `brain-proposals.json` (atomic, 0600); decisions never expire — a dismissed id stays suppressed (documented limitation).
- **Exploration stays off** (byte-identical when off).
- **Scratch recipe.** `PLAYLIST_DATA_PATH=… LIBRARY_SIGNALS_PATH=… BRAIN_PORT=… node --experimental-strip-types src/index.ts` — state derives beside the playlist store; no `BRAIN_DATA_DIR`; no new envs; no telemetry.
- **Environment notes.** Dev-sandbox residue (`apps/brain/data/`, 14 synthetic events, gitignored) stays, documented; stale user servers on :5173/:3001 are not ours to touch.

## 4.6 Next smallest experiments — and a status ledger

1. **One real-library session, then a tuning pass.** Read `GET /api/v1/brain/session` after real listening; magnitudes/thresholds are labelled candidates — isolation is proven, "does it feel right" is not.
2. **P4 producers.** `vocal_fraction`, `instruments.*`, mood/arousal/valence/danceability are declared but unproduced; lexicon terms stay inert until producers land.
3. **Proposal thresholds** — conservative, untested guesses (3 epochs / 2 dates); revisit after real data.
4. **Metre-correction UI depth** — the tap path seeds the human-verified tier; a surfaced UI (5/7/9/11 tap-the-cycle), like ceremony flags, remains open.

**Status ledger.** *Confirmed:* counts, determinism, rollback levers, error paths, auth, no telemetry. *Partial:* proposal accept — the 409 path is not freshly re-exercised (B5/H2 receipts cover it); the legacy policy path is route-verified, not lab-modelled. *Unverified:* real-music behaviour and long-run logs.

Handoff: the `DELIVERY/verification/` manifest re-captures counts and checksums on the frozen tree; `review.md` carries the round conclusions; the branch — one commit — is the live copy.

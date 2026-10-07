# C1 — Code correctness & numbers review (independent, adversarial verification)

Status: complete · Reviewer: C1 (independent code-correctness & numbers; adversarial role) ·
Date: 2026-10-06, 23:35–24:00 CDT · Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain`
(HEAD `b6ea5ce1`; all slice work is **uncommitted working-tree** changes). The tree was treated as a
frozen snapshot: **no repo files were edited, nothing was committed**; my writes are this file plus
scratch under `.cluster/synamp-fast-brain/evidence/c1/` and `/tmp` only.

Method: receipts (B1/B2/B4/B4b/B5/B6, A3 §3, A4 §4) were read as **hypotheses**; every load-bearing
claim was re-checked against the actual code and by running things — the three mandated commands,
five adversarial probe scripts (132 executed checks), and targeted greps/diffs for the carried reds
and the no-outbound rule. The receipts' own "moving target" warnings were applied: harness files
changed mid-review (B4b refresh, 23:39 — see §6) and stale numbers are flagged below rather than
copied.

---

## 1. Conclusion

**Overall verdict: FAIL — exactly one must-fix defect found; everything else reproduced green.**
The single defect is the `wave` sequencing arc: for an **odd** number of measured tracks it drops one
track and injects an `undefined` element, which serialises to `null` in resolve payloads and turns a
queue build into a 500. It is a small, well-localised hotfix (see F1). After that fix plus odd-count
regression tests, the expected verdict is **pass-with-notes**.

- Mandated commands: brain suite **210 tests · 208 pass · 1 fail · 1 skip** (the single fail is the
  pre-existing macOS librarian case-fold, untouched by the branch); `@synamp/brain` and `@synamp/web`
  type-check **exit 0**; brain-lab **7 scenarios · 66 checks pass · 0 fail · 0 pending · 5 skip**,
  exit 0 — reproducible across three consecutive runs and from a different CWD (the brief's "64
  checks" is the pre-B4b-refresh number; §6 explains the delta and it is green in both states).
- Adversarial probes confirm the core epoch-v1 guarantees: isolation both directions byte-identical,
  boundary rules (30:00 vs 30:01, midnight, missing-session buckets, shuffle), flood bounds + finite
  parts + artist π/cap/min-evidence, full hide lifecycle incl. the exact +30:00 expiry edge, reset
  semantics per the code (not the receipt), determinism + exploration-OFF byte-equality, hard-rule
  inviolability under a maxed bonus, proposal boundaries (P21/P22/P23), and ≥10 rows of the A3 §3.7
  number table.
- No new hearing/telemetry/outbound calls: the new modules (`intent/**`, `learning/**`,
  `query/sequence.ts`, new tests, `BrainSession.tsx`) contain no `fetch`/`node:http(s)`/`node:net`/
  `child_process` usage; the web panel uses the app's existing same-origin `request` helper only.

## 2. Findings (ordered by severity)

| # | Severity | Finding | Exact repro | Observed vs expected | Code location |
|---|----------|---------|-------------|----------------------|---------------|
| F1 | **major — must-fix** | `wave` arc corrupts the list when the measured-track count is odd: one measured track is dropped and the last measured slot becomes `undefined` (→ `null` in JSON; queue build throws). The module docstring, B1 receipt and in-repo docs advertise wave as a supported, deterministic interleave. | `evidence/c1/probes/p3-sequence-hash.mts` (check "wave on 3 measured (ODD)"); `probes/wave-bug-repro.mts`; `probes/p5-wave-integration.mts` | n=3 → ids `[hi, lo, undefined]` (track `mid` dropped, undefined appended); n=1 → `[undefined]`; n=5 same shape; even counts OK. JSON: `["three","one",null]`. `PlaylistStore.resolve` (same surface as `GET /playlists/:id/resolve` and `POST /session/queue`) hands the `undefined` through; the queue mapping `track.id` throws `TypeError` → route 500 `internal_error`. Expected: a permutation — every measured track exactly once, no undefined; unknowns keep positions; note `arc wave: ordered by measured intensity (N% coverage)`. | `apps/brain/src/query/sequence.ts:98-107` (loop bound `upper.length` at :103) consumed by `arrange()` `:77-86` (`pool.shift()` at :82, no exhaustion guard) |
| F2 | minor — doc drift | Artist min-evidence wording: A3 §3.3(b) says "≥2 **distinct tracks** with events, or \|Σ\| ≥ 1.0"; the code implements "≥2 **events** (or \|Σ\| ≥ 1.0)". Two events on ONE other track with sum < 1.0 opens the gate in code. | `probes/p2-bounds-hides-reset.mts` ("min-evidence is ≥2 EVENTS…") | Observed: 2 full-plays on one other track (Σ=0.5) → neighbour gets π·0.5 ≈ +0.17. Under the A3 §3.3(b) prose reading it would be 0. P17 table (`A3:516`) says "≥2 events"; dispatch says "min-evidence ≥2" → code follows P17/dispatch; A3 prose is the outlier. | `apps/brain/src/learning/derive.ts:39,41,294-305` (gate at `:302`); A3 `A3-learning-science.md:360` vs `:516` |
| F3 | nit | B2 §5.4 sentence "Markers with `detail.scope` other than `"epoch"` (or absent scope — tolerated) apply" is ambiguous/inverted vs behaviour: markers **without** `detail.scope` apply; markers with `detail.scope` ≠ `"epoch"` are **ignored** (their own test asserts this; my probe confirms both directions). | `probes/p2-bounds-hides-reset.mts` ("marker with NO detail applies", "marker with detail.scope='global' is ignored") | Behaviour reproduces exactly as coded; only the receipt sentence needs rewording. | `derive.ts` reset block ~`:118-133`; `B2-learning.md:190` |
| F4 | nit — artifact freshness | Numbers/hashes that DELIVERY must quote have drifted since the early receipts: lab **64 → 66** checks (B4b refresh, §6); `interpret.ts` hash `f260b260…` (B4 capture) → `6d90897…` (B1's filler fix); B6/roadmap quote "Brain 205" → now **210**. All flagged as moving-targets in the receipts themselves. | §3 evidence; `evidence/final-lab/hashes.txt` (B4b) matches current hashes | Quote final-lab + this review's re-runs in DELIVERY; do not quote 64/205/f260… | receipts B4 §"Moving target", B6 §"Gaps", B4b |
| F5 | nit | Cosmetic label drift: A3 §3.3(b) example label "two of this session's skips were by <artist>" vs implemented part label `"other tracks by <artist> this session"`. | grep `derive.ts` label construction; p2 probe output | Implemented label is clearer and test-pinned; report/appendix should quote the implemented label. | `derive.ts` `artistContribution` consumer ~`:425-432`; A3 `:365` |

### F1 — hotfix specification (do NOT fix in review; hand to one hotfix agent)

- Root cause: in the wave branch, `lower = known.slice(0, half)` is **longer** than `upper = known.slice(half)`
  for odd `known.length` (half = ⌈n/2⌉). The loop `for (index < upper.length)` never emits the last
  lower-half element, so the emitted sequence has length n−1; `arrange()` then shifts one more slot
  than the pool holds and writes `tracks[undefined]` → `undefined`.
- Minimal fix shape: interleave over `Math.max(lower.length, upper.length)` with tight `!== undefined`
  guards on both pushes (this keeps even-count behaviour byte-identical: `k3,k0,k2,k1` for n=4; yields
  `k2,k0,k1` for n=3, `k4,k0,k3,k1,k2` for n=5, `k0` for n=1). Optionally add a defensive pool-length
  check in `arrange()` so any future arc bug fails loudly instead of emitting `undefined`.
- Tests to add (the current suite missed this): wave with n = 1, 3, 5 (odd) asserting (a) same
  membership/length, (b) no `undefined`, (c) alternation property; and a permutation assertion in the
  determinism loop (`sequence.test.ts:113` currently compares outputs to themselves, so it cannot
  catch permutation violations).
- While in there: `arrange()` has no pool-exhaustion guard (`sequence.ts:82`) — a one-line `if`
  (throw or keep-null) is cheap insurance.

## 3. Evidence — exact commands and outputs (this review)

All logs are in `evidence/c1/verification/` (fresh runs) and `evidence/c1/*.log` (probes). Machine:
darwin 25.6.0 arm64, node v24.13.0 (the repo also runs node v22.22.3 elsewhere; strip-types feature
set used is stable across both).

| # | command | result |
|---|---------|--------|
| 1 | `pnpm --filter @synamp/brain test` | **tests 210 · pass 208 · fail 1 · skipped 1**; the fail is `librarian.test.ts:149` "artist merge: whole folders, everything follows, the variant folder disappears" (assert at `:162`, case-normalised dir names); skip = `/dev/shm` cross-disk. Exit 1 by design (single carried red). `verification/c1-brain-test.log` |
| 2a | `pnpm --filter @synamp/brain type-check` | **exit 0**, no output. `verification/c1-tc-brain.log` |
| 2b | `pnpm --filter @synamp/web type-check` | **exit 0**, no output. `verification/c1-tc-web.log` |
| 3 | `node --experimental-strip-types tools/brain-lab/lab.mts` | **7 scenarios / 66 checks pass · 0 fail · 0 pending · 5 skip · exit 0** (three consecutive runs; plus a run from `/tmp` with identical normalized JSON modulo `generated_at`). `verification/c1-lab-final.{log,json}`, `c1-lab-determinism-run2.log`, `c1-lab-from-tmp-cwd.log` |
| 4 | probe suite (`probes/`) | P1 isolation/boundaries/determinism **20/0**; P2 bounds/hides/reset/hard-rule **41/0**; P3 sequence/hash **37/1** (the 1 = F1, deliberate); P4 numbers vs A3 **33/0**; P5 wave integration repro; wave minimal repro. Logs `evidence/c1/p1..p5-*.log`, `wave-bug-repro.log` |
| 5 | `pnpm type-check` (root chain) | exit 1 — fails in `packages/webamp` (**pre-broken, untouched**: see §5). `verification/c1-root-typecheck.log`; `pnpm --filter webamp type-check` fails standalone: `c1-webamp-typecheck.log` |

Probe-by-probe highlights (observed values, all from the logs):

- **Isolation (P1-probe):** day-2 implicit append leaves the day-1 snapshot byte-identical (sorted-key
  JSON compare, full snapshot); reverse — day-1 implicit events do not move day-2 values; the only
  day-1 fingerprint on day-2 values is the *explicit love part* (sanctioned channel, value
  `round2(2·0.5^(Δt/180d))=2.00`), and the remaining part labels match the day-2-only view exactly.
- **Boundaries:** gap 30:00 exactly keeps (0.25·0.5 = 0.125 at one half-life), 30:01 splits and kills
  the value (0); midnight split with a 60 s gap; missing-session sandwich → 3 epochs, consecutive
  missing → 1 bucket; reversed and interleaved shuffles byte-identical.
- **Bounds:** 20 loves / 20 skips / 20 repeats → `|0.15·tanh(v/2)| ≤ 0.15` (0.15000 / −0.14925 /
  0.15000), all parts finite; artist neighbour cap = **+0.8 exactly**, π·1.4 ≈ 0.49 without cap;
  single event ≤ 0.11 (gate closed). Composed through `evaluatePlan`: one saturated bonus,
  `score_breakdown.feedback = 0.15`, hidden track counted (`hidden_by_you=1`).
- **Hides:** k=1 value −0.2999 no hide; k=2 hide + −0.5897; not_now hides at n=1 and is 0 after the
  epoch; `remove`+`reason=not_now` → epoch hide only; expiry live at exactly +30:00 and cleared at
  +30:00.001 with the paused note; restore/undo and playlist-scoping correct; persistent removes
  survive the epoch.
- **Reset:** pre-reset skips neither score nor hide; post-reset evidence scores (−0.2999); L1 love
  and L1 remove survive (matches B2 §5.4 decision); note present; last-marker-wins with two markers;
  marker without `detail` applies; `detail.scope="global"` ignored.
- **Hard-rule:** 30 loves + 30 repeats maxed on an excluded (piano 0.91) track — still absent from
  strict AND near_miss; positive control track gets 0.15, its artist neighbour +0.057; every strict
  bonus ≤ 0.15.
- **Sequence:** build/cooldown/peak verified as order properties + unknown-position preservation +
  note text; coverage gate opens at exactly 60% and falls back at 40% with the exact note; flat/absent
  no-op; **wave fails for odd counts (F1)**.
- **Hash:** all five arcs validate; `build ≠ flat ≠ peak` hashes; flat round-trips structurally and
  hashes deterministically; unknown/non-string arcs rejected (`$.sequencing.arc`). "Flat hashes as
  before" reasoned from the validator diff (old code kept `{arc:"flat"}` too — `git diff main -- plan.ts`),
  not from stored hashes.
- **Numbers (≥10 rows of §3.7):** P1, P3 (ratio exactly 0.25), P5, P7 (`bonus=0.11424`; note the brief's
  "0.10–0.11" is approximate — actual 0.1142), P12, P15, P16, P17, P18 (n=2 note; coverage 1/3 note
  with exact strings), P19/P20 (total clipped to exactly 1.0 with sum-of-parts 2.35, per-axis 0.47≤0.5),
  P21 (2→none, 3/2dates→exactly 1 with `{epochs:3,dates:2,dayparts:[morning,afternoon]}`, same-date→none),
  P22 (5/3→proposal, 4→none), P23 (35-day-old pattern→none), P25 (both modes), plus a full constant-table
  check of `EPOCH_EVIDENCE`/`PERSISTENT_EVIDENCE`/`FEATURE`/`PROPOSAL_THRESHOLDS`.
- **Proposals live-epoch exclusion:** a live third epoch does not count (2 closed ⇒ none), matching
  "scan closed epochs".

## 4. Claims that FAILED reproduction (explicit list)

1. **`sequence.ts` header + B1 receipt: "wave → interleave upper half / lower half starting high
   (alternating, deterministic)".** FAILS for odd measured counts (F1): not a permutation; emits
   `undefined`; downstream `null`/500. Even counts match. This is the one must-fix.
2. (Number delta, *explained, not a defect*) **Brief's expectation "brain-lab 64 checks"**: current
   state reports **66 checks**; B4b's refresh converted two documented skips into real checks
   (`pump/dance intent-chosen-evaluates`) and both old (64) and new (66) states are green. B4's
   canonical capture and B5's quotes predate the refresh — DELIVERY should quote 66.
3. (Stale artifact, *flagged by the authors themselves*) **B4's module hash `interpret.ts f260b260…`**
   no longer matches the tree (`6d90897…`) because B1's filler fix landed after B4's canonical capture;
   B4 explicitly said "re-run before quoting". B4b's `hashes.txt` matches current.
4. (Stale count, same class) **B6 docs / roadmap quote "Brain 205"**; the suite is now 210. B6 itself
   flagged this.

Everything else checked — including every claim in B2 §2/§4, B5 §3, and the B4b refresh — reproduced
as written within stated tolerances.

## 5. Carried reds — both confirmed pre-existing (reasoned from diff + paths, not stash)

- **Librarian case-fold test (macOS-only).** `git diff main --stat -- apps/brain/src/librarian apps/brain/src/lastfm`
  is empty; the failing test constructs `Ani Difranco/…` + `Ani DiFranco/…` and expects a folder
  rename to materialise the case change (`librarian.test.ts:149/162`). On default macOS APFS
  (case-insensitive) the target path resolves to the existing directory, so the tree keeps
  `Ani Difranco/` → assertion fails. The librarian modules import nothing this branch changed
  (`library/organise.ts`, `naming.ts`, `duplicates.ts` — all untouched). Baseline 147/149 on main per
  A4/B4; signature unchanged (same test, same diff shape).
- **Root type-check / webamp chain.** `pnpm type-check` runs brain (pass) → web (pass) → `webamp`
  (**11 tsc errors in `packages/webamp/js/**`, `@types/react` mismatch**) → exit 1.
  `git diff main -- packages` is empty and `git status -- packages` is empty: the vendored webamp is
  untouched by the branch; it fails standalone (`pnpm --filter webamp type-check`).
- **No new outbound/telemetry.** Grep over `apps/brain/src/{intent,learning}`, `query/sequence.ts`,
  the two new test files, `apps/web/src/BrainSession.tsx`, `styles/brain.css`: no `fetch(`,
  `XMLHttpRequest`, `node:http(s)`, `node:net`, `node:dns`, `node:child_process`. `index.ts` additions
  use `node:crypto`/`node:fs` only (existing server imports already covered HTTP serving).

## 6. Timeline & moving-target notes (affect what DELIVERY quotes)

- App modules (`apps/brain/src/**`) were last modified 23:22 CDT; all my runs at 23:35–24:00 CDT
  therefore exercised the same app state as B5's receipt.
- `tools/brain-lab/**` was modified at 23:39 CDT by **B4b** (runner + scenario 02 note + README):
  this converted two skips into real checks (64→66) and made the harness mirror `index.ts`
  `policyOptions()` literally. Harness-only; resolves the B4 "adjudication item" (scenario 02 now
  `vague`, passing). Verified read-only by mtimes and `find -newermt` (no other files changed).
- Receipts with numbers that predate these two events (B4 capture hash, B5 "64 checks", B6 "205")
  are superseded — see F4.

## 7. Analysis — judgement calls and where I disagreed or withheld agreement

- **F1 severity = major, not blocker:** no goal phrase emits `wave` (lexicon arcs: flat/build/peak/
  cooldown only — verified by grep), so default user flows never hit it. It is reachable through the
  public plan schema (saved smart playlists, `/plans/evaluate`), where it produces `null` entries and
  a 500 on queue build — hence must-fix before merge, but not a data-corrupting default path.
- **B2 §5.4 L1-survives-reset** is implemented as documented and I judged it **acceptable**: the
  endpoint is scoped "epoch", the event log is immutable, and loves/thumbs/removes are the sanctioned
  cross-epoch channel; the receipt already flags it for C-round. If the final report wants "forget"
  to also suppress pre-reset explicit cells, it is a one-spot change — say so explicitly there.
- **Entity-only artist propagation** (loves don't feed the artist term — A3 eq. 2 uses `v2_entity_raw`)
  is correct per spec but counter-intuitive; report ch. 2 should state it in one line.
- **`wave` docs vs tests:** the wave unit test uses 4 (even) tracks and the determinism loop compares
  self-to-self, which is why 8/8 green tests coexisted with F1 — a coverage hole worth naming in the
  report's "review methods" section.
- **Determinism nuance:** `evaluate.ts` applies feedback only inside the strict tier and saturates
  once (`0.15·tanh(v/2)`); my probes verified the composed bound through the real pipeline, not just
  the raw value — matching B2's "one saturation" claim.

## 8. Gaps and risks (residual, not defects)

1. Route-level smoke was not re-run by me (B5's transcripts stand; C4 should re-verify, particularly
   after the wave hotfix if any route asserts sequencing output shape).
2. P21's "≥2 dayparts" gate and the `not_now_pattern` proposal path were verified by code read +
   constants, not exercised end-to-end (the 2-date boundary was exercised).
3. The legacy `listening_policy = "legacy-v1"` path was verified only by code read (B5 smoke covers
   the route once); my probes are epoch-mode only.
4. All fixtures synthetic; nothing here is evidence about real music (inherited caveat).
5. The review caught one class of bug (arc completeness); I did not exhaustively fuzz all arcs with
   mixed unknown/known patterns beyond the cases listed — the hotfix should leave the new odd-count
   tests in place so the gap closes permanently.

## 9. Suggested final-report placement

- **Ch. 2 (fast learning brain):** cite §2's green probe matrix (isolation, half-life, hides, reset,
  flood, proposals, determinism) as the independent falsification evidence; mention F2's wording
  reconciliation in a footnote.
- **Ch. 4 (verification & handoff):** §3 table (210/208/1/1; type-checks 0; lab 66/0/5 — with the
  brief's 64→66 explanation from B4b), §5 carried-reds reasoning, §6 timeline, and **F1 as the open
  must-fix with the hotfix spec** — do not smooth it over; the verdict flips to pass-with-notes only
  after the fix.
- **Risk register / rollback:** F1 shows why "documented arc" ≠ "shipped arc"; keep wave out of any
  user-facing arc picker until fixed; the hotfix is one function + tests (no schema change, no hash
  change for flat plans).
- **`review.md` assembly:** carry the verdict as **fail (single must-fix)** — an explicit
  "hotfix-required" entry with the findings table above.

## 10. Reproduction

```
bash .cluster/synamp-fast-brain/evidence/c1/runall.sh     # re-runs sections 3.1–3.4 + probes
# or individually:
cd /Users/tapps/_dev/web-apps/SynAmp
pnpm --filter @synamp/brain test && pnpm --filter @synamp/web type-check
node --experimental-strip-types tools/brain-lab/lab.mts
node --experimental-strip-types .cluster/synamp-fast-brain/evidence/c1/probes/p3-sequence-hash.mts   # shows the wave FAIL
node --experimental-strip-types .cluster/synamp-fast-brain/evidence/c1/probes/p5-wave-integration.mts  # shows null/500 impact
```

Artifacts: `evidence/c1/verification/` (command logs, lab JSON), `evidence/c1/probes/` (5 probe
scripts + minimal wave repro + integration repro), `evidence/c1/*.log` (probe outputs),
`evidence/c1/runall.sh`.

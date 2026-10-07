# H5 — final numbers & README touch-up (receipt)

Status: **complete** · Role: final numbers/README touch-up (assembly support) · Date: 2026-10-07 ~00:25–00:45 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD `b6ea5ce1`; working tree dirty — **no commits, no installs**; `git status --short` file set identical before/after: 14 M + 36 ??).
Cluster: `/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/`

Sole-writer scope executed (5 files; nothing else touched):
1. repo `docs/synamp/plans/FAST-LEARNING-BRAIN.md`
2. repo `docs/synamp/plans/AGENT-ROADMAP.md`
3. repo `apps/brain/README.md`
4. cluster `report-sources/W5-ch5-appendix.md`
5. cluster `report-sources/W7-agent-brief.md`

Canon applied: brain suite **218 tests / 216 pass / 1 pre-existing macOS librarian case-fold fail / 1 skip**; `@synamp/brain` + `@synamp/web` type-check exit 0; brain-lab **8 scenarios / 86 checks / 0 fail / 0 pending / 5 documented skips** (canonical `evidence/final-lab/`); delivery = **ships as a single commit** on the branch (hash → delivery manifest), full patch = `git diff main..feat/fast-learning-brain`, revert = reset the branch to `b6ea5ce1`.

---

## 1. Per-file diff summary

### 1.1 `docs/synamp/plans/FAST-LEARNING-BRAIN.md`

**Suite counts (~line 269).** Old: "Full brain suite (numbers at review; DELIVERY/verification carries the final set): **210 tests / 208 pass + 1 pre-existing macOS failure + 1 skip** … the tree grew to 210 with the integration tests. `@synamp/brain` type-check exit 0."
New: "Full brain suite (**final verified capture: 218 tests / 216 pass + 1 pre-existing macOS failure + 1 skip**) … the tree grew to **218** as integration and hotfix tests landed (210 → 212 → 218 across the review rounds — earlier counts superseded). `@synamp/brain` + `@synamp/web` type-check exit 0."
History kept and marked: 149 baseline ("carried from the **149**-test baseline"), B1 "earlier run captured **205**".

**Lab counts (~line 285).** Old: "B4's canonical capture … was **7 scenarios · 64 scored checks (63 pass · 1 fail) + 5 not-applicable skips**; the B4b refresh … re-ran green — **7 scenarios · 66 checks pass · 0 fail · 5 documented skips** (at review; final counts in DELIVERY/verification), runs byte-identical modulo the timestamp."
New: "**final verified capture: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 documented skips** (canonical in `evidence/final-lab/`; runs byte-identical modulo the timestamp). History: B4's canonical capture … was **7 scenarios · 64 scored checks …**; the B4b refresh converted two skips into real checks and re-ran green, and the H4 re-sync (post-hotfix) added the culture-guardrails scenario and the wave regression checks — earlier captures superseded."
The superseded 7·66 pair is **not retained**; B4's 64-check capture is retained under an explicit "History:" / "was" label. Scenario-highlights sentence (05/06/07) unchanged.

**Delivery/commit sentence (~line 339, "Rollback & operations → Branch").** Old (C4 F1: untrue until committed): "All changes sit on `feat/fast-learning-brain` (no push at receipt time); `git checkout main` is a full revert."
New (tense-robust; "ships as" fallback per dispatch, reads correctly just-before and just-after the commit): "The slice ships as a single commit on `feat/fast-learning-brain` (see the delivery manifest for the hash); `git diff main..feat/fast-learning-brain` produces the full patch; revert = reset the branch to `b6ea5ce1`. Nothing migrates data, so reverting is safe."

### 1.2 `docs/synamp/plans/AGENT-ROADMAP.md` (latest entry)

- Intro (~line 545): "(one command, **7 scenarios**)" → "(one command, **8 scenarios**)".
- Confirmed bullet (~line 547). Old: "Brain 210 tests at review — 208 pass + 1 pre-existing macOS librarian case-fold failure + 1 skip (… B1's earlier run captured 205 — final counts: DELIVERY/verification); … type-check exit 0. Lab: 7 scenarios · 66 checks — 0 fail · 5 documented skips (B4b refresh; …)."
  New: "Brain **218** tests — **216** pass + 1 pre-existing macOS librarian case-fold failure + 1 skip (both carried from the 149-test baseline; B1's earlier 205 and the 210/208 review capture are superseded — 218/216 is the final capture); new intent/sequencing and learning tests green; type-check exit 0 (brain + web). Lab: **8 scenarios · 86 checks — 0 fail · 0 pending · 5 documented skips** (final capture; the earlier 64-check capture's single red was fixed with a regression test — re-run green and byte-identical modulo the timestamp)."
- Entry voice + format kept (Confirmed / Not done / Unverified / Next); the isolation/determinism sentence untouched.

### 1.3 `apps/brain/README.md`

- **Stale counts: none found.** Grep `205|210|218|librarian|64|66` matches only the legitimate "librarian process" prose (organise/import sections) — no test counts exist in this file. No count edits.
- **Endpoints table (C4 F3 nit): added the three new routes** after the `GET /api/v1/events?limit=` row, matching the existing Method | Path | Purpose column style:
  - `GET /api/v1/brain/session` — the learning readout: listening policy, active epoch (or paused), hides, undecided proposals, reliability notes, per-track adjustments
  - `POST /api/v1/brain/forget` — `{scope: "epoch"}` → append a `learning_reset` marker; the event log is never edited, only marked
  - `POST /api/v1/brain/proposals` — `{id, action: "accept" \| "dismiss"}` → decide one cross-epoch suggestion

### 1.4 cluster `report-sources/W5-ch5-appendix.md`

- **Analysis paragraph (~line 35).** "…no H4 receipt existed in the cluster at write time (… H1, H2, H3), so it consolidates…" → "…H-round files present: H1, H2, H3; the receipt was recovered afterwards, `H4-lab-sync.md`), so it consolidates the exact commands from B4b §"Exact commands", B5 §3.2, C1 §10, H1 §4, H2 "Verification" **and the H4 re-sync**. Counts are marked as the *latest captures*; **the S5 delivery-manifest re-capture is the definitive set to quote**." (re-capture honesty kept)
- **Gaps and risks (1).** "H4/S5 final re-run not yet captured — suite count … latest at write time but the tree is still moving (H2 212/210 at 23:59; C1 210/208 at ~23:35)…" → "S5's delivery-manifest re-capture is still to come — the suite count (218/216/1/1, H1) reproduced fresh in the C4 production audit; earlier H2/C1 captures (212/210, 210/208 as tests landed) are superseded."
- **Gaps and risks (2).** "brain-lab's last canonical green (66/0/5) predates H2's evaluate.ts edit; a transient 65/1/5 … expect 66/0/5 on a fresh S5 run; not re-verified here." → "brain-lab re-synced green in H4 (post-hotfix): canonical **8 scenarios · 86 checks · 0 fail · 0 pending · 5 skip** in `evidence/final-lab/`, reproduced fresh in the C4 production audit; the pre-sync green and the mid-round transient (H1 §5.5) are superseded." (raw 66/0/5 and 65/1/5 pairs dropped from prose)
- **§5.4 intro.** "No H4 receipt existed … when S5/H4 re-captures the stack, its numbers replace the expected values below. The tree is … + uncommitted working tree; no commits, no installs." → "…and the H4 re-sync (receipt `H4-lab-sync.md`; canonical lab capture `evidence/final-lab/`). **S5's delivery-manifest re-capture remains the definitive set.** Captures were taken on `feat/fast-learning-brain` @ base `b6ea5ce1` + the working tree; **no commits at capture time**, no installs." (tense-proofed; stays true after the S5 commit)
- **§5.4 commands.** Suite comment: "last capture (H1, 00:02 CDT): 218 …" → "capture (H1, 00:02 CDT): 218 tests · 216 pass · 1 fail · 1 skip · exit 1 by design — reproduced fresh post-hotfix; (earlier captures: H2 212/210, C1 210/208 — tests landed progressively; the S5 re-run is definitive)". Lab comment: "expected: **7 scenarios · 66 checks** … (last canonical green = B4b; a transient 65/1/5 …)" → "expected: **8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 skip · exit 0**; (last canonical green = H4 re-sync, post-hotfix — `evidence/final-lab/`; a mid-round transient came from concurrent evaluate.ts edits — S5 re-confirms)".
- **Closing "When quoting numbers" line.** "use the S5/H4 fresh capture (…)" → "use the S5 delivery-manifest re-capture, reproducing the H4/C4 runs (…)". Do-not-quote guardrail (B4 64-check / "Brain 205" / `f260b260…`) untouched.

### 1.5 cluster `report-sources/W7-agent-brief.md`

- **Line 11 (C4 F1: claim not yet true).** Old: "(HEAD `b6ea5ce1`; uncommitted; `PATCH.diff` staged in `DELIVERY/code/`)". New: "— the slice ships as a single commit on this branch (see the delivery manifest for the hash); `git diff main..feat/fast-learning-brain` produces the full patch, staged as `PATCH.diff` in `DELIVERY/code/`; revert = reset the branch to `b6ea5ce1`." (same tense-robust phrasing as 1.1)
- **Extra, count correctness (same file; sole-writer discretion):** run comment "`# 218 pass / 1 fail / 1 skip`" → "`# 218 tests / 216 pass / 1 fail / 1 skip`" — the old form implied 220 tests (canon: 216+1+1 = 218). Lab comment line left as-is (already accurate: "8 scenarios · 86 pass / 0 fail / 5 skip" — W7's terse style).

---

## 2. Verification grep evidence

Command per dispatch: `grep -n "205\|210\|218\|66\|86\|PATCH\|commit" <file>` (citation-digit false positives filtered where noted; plus `grep -n "7 scenarios\|66 checks\|7/66"` and `grep -n "64"` runs).

```
### docs/synamp/plans/FAST-LEARNING-BRAIN.md
$ grep -n '205|210|218|66|86|PATCH|commit'
3:Status: 2026-10-06, branch `feat/fast-learning-brain` (working tree; no commits at
269:- Full brain suite (**final verified capture: 218 tests / 216 pass + 1
273:  earlier run captured **205** (203 pass · 1 fail · 1 skip; +56 new tests: 20
274:  translation/sequencing, 36 `learning/*`); the tree grew to **218** as
275:  integration and hotfix tests landed (210 → 212 → 218 across the review rounds —
287:  capture: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 documented
343:- **Branch.** The slice ships as a single commit on `feat/fast-learning-brain`

### docs/synamp/plans/AGENT-ROADMAP.md
$ grep -n '205|210|218|66|86|PATCH|commit'
409:export (now 8 files at a time, with progress, committing as it goes); a
547:- **Confirmed:** Brain 218 tests — 216 pass + 1 pre-existing macOS librarian
549:  earlier 205 and the 210/208 review capture are superseded — 218/216 is the
551:  exit 0 (brain + web). Lab: 8 scenarios · 86 checks — 0 fail · 0 pending · 5

### apps/brain/README.md
$ grep -n '205|210|218|66|86|PATCH|commit'
(no matches)

### cluster report-sources/W5-ch5-appendix.md
$ grep -n '205|210|218|66|86|PATCH|commit'
44:**Gaps and risks.** (1) S5's delivery-manifest re-capture is still to come — the suite count (218/216/1/1, H1) reproduced
45:fresh in the C4 production audit; earlier H2/C1 captures (212/210, 210/208 as tests landed) are superseded. (2) brain-lab
46:re-synced green in H4 (post-hotfix): canonical **8 scenarios · 86 checks · 0 fail · 0 pending · 5 skip** in
52:capture (64 checks) and B6/roadmap ("Brain 205") are superseded; do not quote them.
352:set. Captures were taken on `feat/fast-learning-brain` @ base `b6ea5ce1` + the working tree; no commits at capture time,
361:#   capture (H1, 00:02 CDT): 218 tests · 216 pass · 1 fail · 1 skip · exit 1 by design — reproduced fresh post-hotfix
362:#   (earlier captures: H2 212/210, C1 210/208 — tests landed progressively; the S5 re-run is definitive)
371:#   expected: 8 scenarios · 86 checks pass · 0 fail · 0 pending · 5 skip · exit 0
392:**not** quote B4's 64-check lab number, B6/roadmap's "Brain 205", or the stale `interpret.ts` hash `f260b260…` — all

### cluster report-sources/W7-agent-brief.md
$ grep -n '205|210|218|66|86|PATCH|commit'
11:Repo `/Users/tapps/_dev/web-apps/SynAmp`, branch **`feat/fast-learning-brain`** — the slice ships as a single commit on this branch (see the delivery manifest for the hash); `git diff main..feat/fast-learning-brain` produces the full patch, staged as `PATCH.diff` in `DELIVERY/code/`; revert = reset the branch to `b6ea5ce1`.
27:pnpm --filter @synamp/brain test      # 218 tests / 216 pass / 1 fail / 1 skip
29:node --experimental-strip-types tools/brain-lab/lab.mts [--json <out>]  # 8 scenarios · 86 pass / 0 fail / 5 skip
```

Supplementary greps (all five files): **`7 scenarios`, `66 checks`, `7/66` → no matches anywhere** (incl. joined pairs like "7 scenarios · 66" — removed from FLB, roadmap, W5). `64` → only marked-history/guardrail hits (FLB "History: … 64 scored checks"; roadmap "earlier 64-check capture"; W5 "B4's 64-check lab number" do-not-quote + one citation "64 %"). Source-table digits like `18826699`/`668–683` are citation numbers, not counts.

**Stale-pair audit result: PASS** — no unmarked stale pairs remain; every remaining old-number mention is explicitly framed: "earlier" / "was" / "History:" / "superseded" / "do not quote".

## 3. Deliberately left (flag list)

1. **FLB status line**: "Status: 2026-10-06 … (working tree; no commits at receipt time)." — scoped "at receipt time"; historical header, not in the fix list; left as history.
2. **FLB "Partial:" bullet** ("…the web readout was still in flight at the last check. Route-level smoke is the integration pass's verification step…") and the "Integration points" intro ("review and route-level smoke are the verification round's job") — write-time verification-state notes, past-scoped, not C4-flagged and outside the enumerated fixes; left verbatim (flagged here in case a final sweep wants them — they read as history, they just don't say "superseded").
3. **FLB/Roadmap/W5 marked history kept on purpose**: 149 baseline; B1's 205; 210→212→218 progression; B4's 7·64 ("History:"/"was"); W5's "earlier captures: H2 212/210, C1 210/208"; the do-not-quote guardrail lines (64 / "Brain 205" / `f260b260…`); roadmap "earlier 64-check capture".
4. **Roadmap line 409 "committing as it goes" and line 60 "analyzer 64/64"** — different/older entries about other workstreams, not this slice's counts; untouched.
5. **W7 lab comment** "8 scenarios · 86 pass / 0 fail / 5 skip" — accurate; left in W7's terse style (no "· 0 pending" added).
6. **W7 header provenance** ("receipts B1/B2/B4b/B5 + H1-H3, C1") not extended with H4 — minimal edits; flagged here.
7. **README prose** — no count existed; only the 3 table rows added (plus nothing else).

## 4. Guardrails

- No commits, no installs, no code, no other artifacts touched. Repo `git status --short` file set identical before/after in composition (14 M + 36 ??; among them only my three are mine: README [M], AGENT-ROADMAP [M], FLB [??]).
- Every edit matched a unique anchor; all five files re-read after editing; W5 §5.4 code block structure intact.

— H5, 2026-10-07 00:45 CDT

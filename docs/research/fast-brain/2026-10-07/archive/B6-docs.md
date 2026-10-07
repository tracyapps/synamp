# B6 — Repo documentation (fast-learning-brain) — receipt

Status: complete · Author: B6 subagent (repo documentation) · Date: 2026-10-06 (evening CDT)
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (HEAD still `b6ea5ce1`; **no commits**; working tree carries B1–B5 changes).
Scope written: the three assigned documentation files only (below) + this receipt. No code, web, tools, or other docs touched; no commits; no `pnpm install`.

---

## Conclusion

The slice's repo documentation is in place and consistent with the frozen decisions in the
dispatch plan:

1. **NEW `docs/synamp/plans/FAST-LEARNING-BRAIN.md`** — the slice's plan document in the
   BEAT-TIMING / LIBRARY-CARE style: boundary, the two halves (translation + `epoch-v1`
   learning), why-shaped-this-way principles, the integration contract, bias & ethics
   guardrails, evidence states, rollback & operations, and handoff.
2. **`docs/synamp/plans/AGENT-ROADMAP.md`** — one dated section appended at the end
   (`### 2026-10-06 — Fast learning brain…`), matching the file's existing entry format
   (Confirmed / Not done / Unverified / Next smallest experiment; tests as “Brain NN”).
3. **`apps/brain/README.md`** — one ~29-line section added between “Plays from other apps,
   and Last.fm” and “Missing tracks” (module table + `epoch-v1` paragraph + how to see it +
   `listening_policy`); the file was not restructured.
4. This receipt.

Every count is quoted from the B1/B2/B4 receipts or the canonical lab JSON; nothing is
fabricated. The one moving target: **B5's integration pass was landing while this was
written** — mid-write the tree gained `settings.listening_policy`, `POLICY_VERSION =
"epoch-v1"`, the `deriveFeedback` legacy label, the `evaluate.ts` `adaptive` hook, the
`/api/v1/brain/{session,forget,proposals}` routes and `/plans/draft` interpretation (all
re-read and reflected in the docs). The web readout was **not yet** in the tree at the
final check; the docs say so in the plan's “Evidence states → Partial”.

## Files written ("files · what each contains")

| File | Contents |
|---|---|
| `docs/synamp/plans/FAST-LEARNING-BRAIN.md` (NEW, 348 lines) | Status + boundary (P2/P3 recap; slice table with file pointers); **Translation** (lexicon `goal-lexicon/1`, `interpretGoal` `intent-v1`, accuracy ladder, asks-never-guess, supersede map, soft-only/declared-inert, arcs + intensity proxy/coverage gate); **Learning** (`epoch-v1`: epoch definition with 30-min gap/live window/local day/dayparts/`ep1:` id, evidence-weights table with exact magnitudes/confidences/labels, hides, centroids + gates (≥3 keeps / ≥2 skips / 60 % / β 0.5 / γ 0.15 / ±1.0 cap), artist propagation π 0.35 ±0.8, single combined `0.15·tanh`, proposals + thresholds, exploration OFF, `scope_persistence`, determinism); **Why** (4 principles); **Integration points** (resolve seam, `GET /api/v1/brain/session`, `POST /api/v1/brain/forget`, `POST /api/v1/brain/proposals`, `POST /api/v1/plans/draft` interpretation, `listening_policy`, `POLICY_VERSION`, web readout, harness); **Guardrails** (attribution/CARE/no-universal-energy; reliability honesty incl. “tempo unclear — tap it” as the A2 §4.4 direction; no feature-learning from suspect metrics; no engagement optimisation; explicit yes for cross-epoch); **Evidence states** (confirmed/partial/unverified + candidate-values caveat; B4 numbers: baseline 149 → 205; lab 7 scenarios · 64 scored checks — 63 pass · 1 fail + 5 skips); **Rollback & operations**; **Handoff** (4 next experiments incl. tap-cycle A2 §4.4). |
| `docs/synamp/plans/AGENT-ROADMAP.md` (EDIT, +31 lines, appended last) | `### 2026-10-06 — Fast learning brain: goals in, session-scoped learning out`: what landed (link to the plan doc); **Confirmed** = Brain 205 tests (B1's run) — 203 pass · 1 fail · 1 skip (macOS librarian red + `/dev/shm` skip carried from baseline 149); +56 new tests green; type-check 0; lab 7·64 — 63 pass · 1 fail (fix noted: re-capture before quoting); isolation/half-life/flood/determinism test-asserted; **Not done** = P4 producers / proposals unproven / magnitudes untuned; **Unverified** = real music; **Next smallest experiment** = one real session → read `/api/v1/brain/session`. |
| `apps/brain/README.md` (EDIT, +29 lines between “Plays from other apps” and “Missing tracks”) | `## Goal language and session-scoped learning (fast-learning brain)`: intro line; 3-row module table (`intent/lexicon.ts`, `intent/interpret.ts`, `learning/`); one `epoch-v1` paragraph (epochs, hard mask, hides, proposals, exploration OFF); “See it” (`/api/v1/brain/session`, `/forget`, `listening_policy` epoch-v1/legacy-v1); pointer to the plan doc. |

## Evidence

- Read first: cluster `CONTEXT.md`, `plan.md` (frozen decisions), receipts `B1-intent.md`,
  `B2-learning.md`, `B4-harness.md`, and A2 §4.4 (tap-cycle rules).
- Style-matched against `BEAT-TIMING.md`, `LIBRARY-CARE.md`, existing `AGENT-ROADMAP.md`
  entries and the brain README's module tables.
- Code read for exact names: `intent/{lexicon,interpret}.ts`; `learning/{types,epochs,reliability,derive,proposals,explore}.ts`;
  `query/sequence.ts`; `plan.ts` arc block; `events.ts` union. Test counts grep-verified:
  11 intent + 8 sequence + 36 learning = 56 delta; 149 + 56 = 205.
- Lab numbers re-counted from `evidence/brain-lab/lab-run-2026-10-06T230950CDT.json`:
  63 pass · 1 fail · 0 pending · 5 skip across 7 scenarios (= 64 scored checks).
- B5 tree re-checks at write time (23:3x CDT): routes/`listening_policy`/`POLICY_VERSION`/hook
  present; `apps/web/` untouched; two new B5 test files appeared (`query/hide-union.test.ts`,
  `session/feedback.test.ts`) → final suite count will exceed 205; docs quote B1's run as instructed.

## Could not verify by reading code (explicitly flagged)

1. **Web readout** — no `apps/web/` changes at the final check; the plan doc notes “still in
   flight” and the README/roadmap describe it as the slice's contract (“a this-session panel
   on The Brain screen; Describe shows interpretation summaries; player bar untouched”).
2. **Route-level smoke** (curl transcripts) — not present; declared as the integration pass's
   verification step in the plan doc.
3. **`POST /api/v1/brain/proposals`** — was in the task's frozen name list but not in plan.md
   decision 4; I verified B5's actual implementation (accept/dismiss on a suggestion) and
   documented *that* (not a hypothetical GET list). Confirm semantics with B5/C-round if they differ.
4. **Fresh lab run after B1's filler fix** — not re-captured; docs say “expected to exit 0 —
   re-capture before quoting” (honest, per B4).
5. **Web copy for culture/metre notes** — B1's flagged gap (code-level ban, no UI copy line);
   recorded as an open review item in the plan doc.

## Gaps and risks

- The docs describe integration as “landed in the working tree” with the web readout open; if
  B5/C changes names (e.g. panel title), one small doc touch-up is enough — the frozen names
  are the anchor.
- 205 is B1's run; the C-round's final numbers (with B5 tests) should be quoted in DELIVERY,
  not from these docs.
- The plan doc's guardrails lean on A1/A2/A3 § refs (cluster research packs) — if the report
  reuses those sections, keep the refs; they are the evidence trail.

## Suggested DELIVERY placement

- **Report ch. 1 / ch. 2**: `FAST-LEARNING-BRAIN.md` §§ “The two halves”, “Why” as the
  canonical slice narrative (translation + learning).
- **Report ch. 3 (bias/ethics)**: its “Bias & ethics guardrails” section (verbatim-friendly).
- **Report ch. 4 (verification/handoff) + ch. 5**: its “Evidence states”, “Rollback &
  operations”, “Handoff” — plus the roadmap entry as the dated summary.
- **DELIVERY/verification/**: this receipt alongside B1/B2/B4 (and B5 when it lands).
- **Ops handoff**: README section is the in-repo entry point; link it from `brief.md`.

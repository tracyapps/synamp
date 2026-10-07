# H1 — hotfix receipt: intent layer + sequence module

Status: **complete** · Hotfix engineer: H1 (sole writer: `apps/brain/src/intent/**`, `apps/brain/src/query/sequence.ts`, `apps/brain/src/query/sequence.test.ts`) ·
Date: 2026-10-06 23:48 → 2026-10-07 00:03 CDT · Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (working tree; **no commits, no `pnpm install`**).

Fix specs read first: C1 §F1, C3 F-A1-1/2/3/4 + F-COPY-1 + C2 F9, C2 F6/F8 (and C2 F7 for the culture-metadata honesty note).
Every change is confined to the five files listed below. Other fixers were editing `evaluate.ts` / `index.ts` / `learning/**` / web / docs concurrently — that tree movement is called out where it affects runs (moving target; timestamps given per run).

---

## 1. Files changed (5 — nothing else)

| # | File | Change summary |
|---|------|----------------|
| 1 | `apps/brain/src/query/sequence.ts` | F1 wave fix (loop bound + guards), defensive `arrange()` pool guard, `applied[]` wording (C2 F8-i), docstring note quotes |
| 2 | `apps/brain/src/query/sequence.test.ts` | +1 odd-count regression test (n=1/3/5, permutation + JSON round-trip + queue mapping); determinism test upgraded with membership assertions; 3 note regexes updated to new wording |
| 3 | `apps/brain/src/intent/lexicon.ts` | `drive.supersedes`/`supersedeAssumptions` += energy proxy (C3 F-A1-1); catharsis triggers += `angry/anger/furious/rage` (C3 §2.1 C); five copy rewrites (C3 F-COPY-1 items 1,2,3,4,6); nostalgia year-example rewrite (C3 F-A1-4); culture-metadata comment made honest (C2 F7/F8-ii) |
| 4 | `apps/brain/src/intent/interpret.ts` | Genre context guard (C3 F-A1-2); two-phase "then/after" handling (C3 F-A1-3); residue cue-span support; audit kind for corrected genre reads; header doc updated |
| 5 | `apps/brain/src/intent/intent.test.ts` | +6 regression tests (drive supersede / genre guard / two-phase / angry triggers / copy corrections / lexicon regressions) |

Untouched by me (verified by inspecting my own edit set): `draft.ts`, `evaluate.ts`, `index.ts`, `plan.ts`, `learning/**`, `apps/web/**`, `docs/**`, `tools/brain-lab/**`, reviewer artifacts (`C*.md`, `evidence/c*/**`).

---

## 2. Per-fix summary (before → after)

### H1-1 · C1 F1 — `wave` arc corrupts odd measured counts (must-fix)

**Before:** for odd `known.length`, `lower = known.slice(0, half)` is one longer than `upper`; the interleave loop was bounded by `upper.length`, so the last lower-half element was never emitted and `arrange()` (`pool.shift()!`) shifted past the pool → `undefined` in the output (→ `null` in JSON; queue build `TypeError` → route 500).
Repro (pre-fix, scratch): n=1 → `[UNDEFINED]`; n=3 → `[c, a, UNDEFINED]` (mid dropped); n=5 → `[d, a, e, b, UNDEFINED]`; JSON of n=3 fixture: `["three","one",null]`.

**After:** interleave over `Math.max(lower.length, upper.length)` with tight `!== undefined` guards on both pushes (keeps even counts **byte-identical** — n=4 still `["w3","w1","w4","w2"]`), plus a defensive guard in `arrange()` that throws a clear internal error if an arc order ever exhausts the pool again (fails loudly instead of emitting `undefined`).
Post-fix: n=1 → `[w1]`; n=3 → `[w3,w1,w2]`; n=5 → `[w4,w1,w5,w2,w3]`; all full permutations, no `undefined`.
C1's p5 resolve-path probe (PlaylistStore.resolve → JSON → queue mapping): `["three","one","two"]`, `contains undefined: false`, queue build **ok** (pre-fix: `null` + crash).

**Tests:** `wave with odd counts (n = 1, 3, 5) is a full permutation with no undefined` (asserts length, no-undefined, membership, deterministic order, JSON-round-trip no-null, queue mapping) + determinism test now asserts exact membership for every arc (the old loop compared outputs to themselves and could not catch F1).

### H1-2 · C2 F8 (i) — `applied[]` note no longer reifies "intensity"

**Before:** `arc build: ordered by measured intensity (100% coverage)` / `arc build: not enough measured intensity (40% coverage) — kept the ranked order`.
**After:** `arc build: ordered by measured pace/energy proxy (bpm, onsets, percussion, loudness) — 100% coverage` / `arc build: not enough measured pace/energy data (40% coverage) — kept the ranked order`; the unknown-track variant keeps its shape (`… — 83% coverage, 1 track without measurements kept in place`). Module docstring quotes updated to match.
**Tests:** the three note-regex assertions in `sequence.test.ts` updated to the new strings (intentional; the old text is exactly what F8 flags).

### H1-3 · C2 F8 (ii) — culture metadata honesty (no content removed)

**Before:** lexicon comment said shared "assumption & culture lines (plain language; **shown with readings**)" — false for the culture lines (nothing renders them; open item).
**After:** comment rewritten: shared *assumption* lines are shown; per-goal `culture` + `SHARED_CULTURE_NOTES` are metadata comments only, not rendered yet (open review item C2 F7/F8) — keep honest, don't present as shipped copy. No data changed; docs untouched (h3 owns docs).

### H1-4 · C3 F-A1-1 — drive: draft `energetic` arousal proxy superseded

**Before:** `"I'm driving to work"` → reading carried draft `energetic` (arousal ≥ 0.6, w=0.6 — 50% of the soft mass) **plus** the assumption `“Energy” was read as arousal, not tempo…` next to the drive bundle.
**After:** `drive.supersedes: ["energetic"]` and `drive.supersedeAssumptions: ["“Energy” was read as arousal"]` (mirrors pump_up). Reading = `goal_drive_1..4` only; audit: `dropped draft rule “energetic” — replaced by the goal bundle`.
**Test:** `drive keeps its medium feel: the draft “energetic” arousal proxy is superseded, never kept twice`.

### H1-5 · C3 F-A1-2 — "cleaning the house" no longer reads the room as the genre

**Before:** `"cleaning the house"` → `genre_hint ["house"]` + chores bundle.
**After:** a context guard on the draft's genre scan (implemented in `interpret.ts`, since `draft.ts` is outside H1's write scope): a genre value survives in `genre_hint` only if at least one occurrence reads as music. Non-music contexts cancelled: determiner/possessive before (`the house`, `my house`), household-task verbs (`cleaning house`), household compounds after (`house work`, `house plants`); music nouns after rescue it (`house music`, `house track`); idiomatic `the`-genres are exempt (`the blues`, `the funk`). Fully-dropped hints are removed and the audit says `read as the ordinary word here (not a genre) — no genre preference added`.
Verified: `cleaning the house` / `cleaning house` / `house work and laundry` → no genre hint; `house music for cleaning` / `play some house` → `["house"]` kept; `play me the blues` → kept.
**Tests:** `genre context guard: “the house” is a room, “house music” is a genre` (both directions + the blues exception).

### H1-6 · C3 F-A1-3 — "workout then sleep" no longer merges cancelling bundles

**Before:** `"music for my workout then sleep"` → **one merged reading** with `goal_pump_up_*` **and** `goal_sleep_*` (bpm 125–140 **and** 50–70), `arc=build` — a wash that builds to max intensity before bed; the only ask was about the word "then".
**After:** a `then/after` cue (`then`, `after`, `afterwards`, `afterward`, `followed by`) between two adjacent distinct goal matches builds **one reading for the first goal only** (`pump up`, `arc=build`, sleep side not merged; the second goal's draft proxies are force-dropped like the conflict readings do) + a plain-language ask:
`Two moods in one ask — “workout” then “sleep” reads as two phases. I built a list for the first one (“pump up”) only; ask again for “sleep” when you get there and I'll build the second.`
(the cue word is consumed from the residue, so it no longer surfaces as "unused"; audit note records the cue; accuracy `partial`).
Declared conflicts still take precedence: `relax after my workout` → calm↔pump_up pair → two readings (unchanged semantics); `dance then sleep` → pair → two readings. No-match blends unchanged (`wind down for bed`, `calm sleepy music for bed` still merge).
**Test:** `“workout then sleep” builds the first phase only and asks about the second`.

### H1-7 · C3 F-A1-4 + F-COPY-1 — broken year example & copy softening

- Nostalgia assumption: `…say a window like “years 1990–2005” to pin the release tag…` → `No era is known yet: release-year windows aren't supported yet — say “throwback” or “old school”, and your loves and repeats steer the flavour.`
- Cohort skip note: `(say “years 1990–2005” to pin it)` → `year windows aren't supported yet (no cohort known)`.
- Copy rewrites applied **exactly as listed** in C3 F-COPY-1 for my files (items 1, 2, 3, 4, 6): pump-up assumption (bounded feedback, "steer quickly without steamrolling"), catharsis assumption (no forward-referenced "then lift me" instruction), drive assumption (hedged single study), sleep assumption ("treats a sleep problem"), shared calibration ("stay soft and learn from your session feedback and spot-check corrections").
  - One consistency extra: catharsis assumption now says `asked in sad or angry words` (was `sad words`) — required because H1-8 adds angry-language triggers; flagged for reviewers.
- Item 5 of F-COPY-1 (`learning/proposals.ts` not_now copy) is **not in my files** — see §5.
**Tests:** `copy corrections (C3 F-COPY-1)…` (old strings absent: `1990`, `lift me`, `medicate`, `move the list more than`; new strings present; cohort note no longer promises year windows).

### H1-8 · C3/C2 F9 — catharsis covers angry language (A1 §2.1 C)

**Before:** `"i'm so angry, i need to rage"` → `impossible` (no trigger; nothing enforceable).
**After:** `catharsis.triggers += "angry", "anger", "furious", "rage"`. That phrase → catharsis reading (specific; bundle `goal_catharsis_1..5`, arc flat). Word-boundary guard intact: `"cleaning out the garage"` stays chores (the "rage" inside "garage" does not fire; negations still win).
**Tests:** `catharsis covers angry language too…` (loop over the four words + garage negative control) and a lexicon-level pin.

---

## 3. Test counts (before → after)

| Run | tests | pass | fail | skip | exit | notes |
|---|---|---|---|---|---|---|
| **Before** — `pnpm --filter @synamp/brain test` @ 23:48 | 211 | 209 | 1 | 1 | 1 (by design) | the 1 fail = `librarian.test.ts:162` "artist merge: whole folders…" — **pre-existing macOS case-fold red** (untouched files); skip = `/dev/shm` cross-disk |
| **After** — same command @ 00:01, re-confirmed @ 00:02 | **218** | **216** | 1 | 1 | 1 (by design) | delta **+7 tests, +7 pass, all mine**; same single carried red, same skip |
| `@synamp/brain` type-check — before & after | — | — | — | — | **0** | clean both times |
| `src/query/sequence.test.ts` alone | 8 → **9** | 9 | 0 | 0 | 0 | +odd-count test; note regexes updated |
| `src/intent/intent.test.ts` alone | 11 → **17** | 17 | 0 | 0 | 0 | +6 regression tests |

Logs: `.cluster/synamp-fast-brain/evidence/h1/before-brain-test.log`, `after-brain-test.log`, `after-brain-test-run2.log`.

## 4. Exact command outputs (tails)

```
$ pnpm --filter @synamp/brain test          # BEFORE, 23:48
ℹ tests 211 · ℹ pass 209 · ℹ fail 1 · ℹ skipped 1
✖ artist merge: whole folders, everything follows, the variant folder disappears
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 1

$ pnpm --filter @synamp/brain test          # AFTER, 00:02 (re-run)
ℹ tests 218 · ℹ pass 216 · ℹ fail 1 · ℹ skipped 1
✖ artist merge: whole folders, everything follows, the variant folder disappears   # same pre-existing red
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL … Exit status 1

$ pnpm --filter @synamp/brain type-check    # before & after
(no output) — exit 0

$ node --experimental-strip-types --test src/intent/intent.test.ts     # AFTER
ℹ tests 17 · ℹ pass 17 · ℹ fail 0

$ node --experimental-strip-types --test src/query/sequence.test.ts    # AFTER
ℹ tests 9 · ℹ pass 9 · ℹ fail 0
```

**Resolve-path concept (C1 p5 probe, post-fix):**
```
resolved tracks: ["three","one","two"]
contains undefined: false
GET /resolve payload would serialize as: {"tracks":["three","one","two"]}
queue build ok (unexpected): [{"rank":0,"track_id":"three"},{"rank":1,"track_id":"one"},{"rank":2,"track_id":"two"}]
```
(pre-fix per C1: `["three","one",null]` + queue `TypeError` → 500.)

## 5. What I could not fix (and why) — for the integrator

1. **C3 F-COPY-1 item 5** (`learning/proposals.ts` — `not_now_pattern.suggested_action` "seems wrong for you in general"): outside my write scope (learning/ belongs to another fixer). Observed during H1 that the learning fixer has already revised that copy (`Keeps it out of suggestions everywhere (a global thumbs-down) — you decide`). **No H1 action taken.**
2. **C3's residue-filtering suggestion** (digit-bearing ranges like "back in the day, 1990-2005" are silently dropped by the `/[a-z]/` guard in `computeResidue`): *not mandated in H1* (year-window parsing explicitly NOT implemented; scope was "rewrite the example string"). Left as-is. Probe7 re-run confirms the rewrite is honest but this adjacent silent-drop edge remains — recommend it as a follow-up if wanted.
3. **Culture/caveat surfacing** remains not surfaced (per instructions: keep metadata, don't touch docs — h3 owns docs). Only comments were made honest (H1-3).
4. **C1 p3 probe note checks** (`evidence/c1/probes/p3-sequence-hash.mts`): post-fix it reports 32 pass / 6 fail — all 6 fails are that probe's own hard-coded pre-F8 note strings compared with `===` (lines 118-121, 159, 166); behavior is otherwise verified and the previously failing "wave on 3 measured (ODD)" check now **passes**. The probe is C1's evidence artifact (not mine to edit); its string constants should be updated to the new wording on any re-run of C1's suite.
5. **brain-lab** (not in H1's mandated command set; run as extra verification): 65 pass / 1 fail / 5 skip. The failure is `learning-resolve-hidden` (scenario 05) — the evaluate.ts resolve/hides union seam owned by the hide-union fixer (`evaluate.ts` modified 23:52:40, after C1's green 66/0/5 run at ~23:35; that fixer's `hide-union.test.ts` passes 4/4). **Not caused by H1 files** (intent/sequence are not in that path; `applied=[]` there). Flagged for the integrator — the lab should go green once that fixer lands their remainder.

## 6. Evidence artifacts (this hotfix)

- `evidence/h1/before-brain-test.log`, `after-brain-test.log`, `after-brain-test-run2.log` — full suite before/after
- `evidence/h1/before-intent-cases.out`, `after-intent-cases.out` — per-case before/after captures (driving / house / workout-then-sleep / angry / years / blues)
- `evidence/h1/after-p5-wave.log`, `after-p3-sequence.log` — C1 probes re-run
- `evidence/h1/lab-after.log` — brain-lab snapshot (with the §5.5 caveat)
- `evidence/h1/probes/` — scratch scripts (`wave-current-check.mts` pre-fix repro; `h1-edges.mts` edge sweep; `h1-intent-before.mts` case capture used for both before/after)

— H1, 2026-10-07 00:03 CDT

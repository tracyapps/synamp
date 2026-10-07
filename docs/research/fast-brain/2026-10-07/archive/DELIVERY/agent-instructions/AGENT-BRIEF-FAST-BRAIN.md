# AGENT-BRIEF-FAST-BRAIN — handoff for the next Music Psychologist, DS&ML specialist, or implementer

## 1. What this slice added and where it lives

Repo `/Users/tapps/_dev/web-apps/SynAmp`, branch **`feat/fast-learning-brain`** — the slice ships as a single commit on this branch (see the delivery manifest for the hash); `git diff main..feat/fast-learning-brain` produces the full patch, staged as `PATCH.diff` in `DELIVERY/code/`; revert = reset the branch to `b6ea5ce1`.

- `apps/brain/src/intent/lexicon.ts` — nine goal bundles + two modifiers; triggers/supersedes; culture notes metadata-only; `goal-lexicon/1`.
- `apps/brain/src/intent/interpret.ts` — `interpretGoal()`: accuracy, readings, ≤3 asks, audit; genre guard; two-phase "then/after"; `intent-v1`.
- `apps/brain/src/learning/` — `epochs.ts`, `derive.ts` (`deriveEpochPolicy`), `reliability.ts` (bpm gates), `proposals.ts`, `explore.ts` (OFF), `types.ts`; policy `epoch-v1`.
- `apps/brain/src/query/sequence.ts` — arcs flat/build/cooldown/peak/wave; pace/energy proxy; coverage-fallback notes.
- `apps/brain/src/query/evaluate.ts` — hide union; `hidden_by_you` vs `hidden_by_session` split.
- `apps/brain/src/index.ts` + `settings.ts` — `GET /api/v1/brain/session`; `POST /api/v1/brain/{forget,proposals}`; `/plans/draft` interpretation; `listening_policy: "epoch-v1" | "legacy-v1"`; `/api/v1/brain` protected.
- `apps/brain/src/session/events.ts` + `feedback.ts` — `learning_reset` signal; `POLICY_VERSION = "epoch-v1"`; legacy path.
- `apps/web/src/BrainSession.tsx` + `Describe.tsx` — "This session" panel; interpretation UI; session-hides line; `Order:` note.
- `tools/brain-lab/` — deterministic 8-scenario lab, incl. `08-culture-guardrails`.
- Docs: plan `FAST-LEARNING-BRAIN.md`; README section; `DECISIONS.md` D8; roadmap entry.

Run (repo root):

```sh
pnpm --filter @synamp/brain test      # 218 tests / 216 pass / 1 fail / 1 skip
pnpm --filter @synamp/brain type-check && pnpm --filter @synamp/web type-check   # exit 0
node --experimental-strip-types tools/brain-lab/lab.mts [--json <out>]  # 8 scenarios · 86 pass / 0 fail / 5 skip
bash .cluster/synamp-fast-brain/evidence/b5/route-smoke-epoch.sh        # + -auth / -resolve / -details
```

Reds (don't chase): macOS librarian case-fold (`librarian.test.ts:149`); `/dev/shm` skip; root `pnpm type-check` stops in pre-broken vendored `packages/webamp` (C1 §5). Route smokes are self-contained (scratch `/tmp/synamp-b5*`, :3911; H2 variants in `evidence/h2/`). Canonical lab capture: `evidence/final-lab/`.

## 2. For the Music Psychologist

- **Re-check before repeating.** "Score-neutral" floor-normalisation holds only for pure bundles; mixed plans re-weight (84.2→75.7%); floor truncation ≤0.001/term; declared-term dilution moves feedback/MMR interactions (C3 F-W-1/W-2/D-1).
- **Copy softens applied** (C3 F-COPY-1: H1 1-4/6, H2 5; year-window promise removed): `intent/lexicon.ts`, `learning/proposals.ts`, pinned by `intent.test.ts`. Don't reintroduce "years 1990-2005", "then lift me", "medicate", or magnitude promises; digit-range silent drop remains (H1 §5.2).
- **Arcs are hypotheses** — full-list approximations of A1 §3; no retrieved experiment shows an arc beats flat (C2 §2; C3 F-SEQ-1).
- **Probing goal prompts**: `lab.mts --only 08` (culture; regression pin, not an accuracy claim), `--only 01/02/03/04`; direct probes: `evidence/c3/probe1-bundles.mjs`, `evidence/c2/probe-interpret.mts`.
- **Candidate until tuned**: bands, evidence magnitudes, proposal thresholds, centroid β/γ, artist min-events, bpm damping, exploration.

## 3. For the DS&ML specialist

- **Parameter map**: A3 §3.7 P1-P25 → `learning/types.ts` (`EPOCH_EVIDENCE`, `PERSISTENT_EVIDENCE`, `FEATURE {beta .5, gamma .15, min_keeps 3, min_rejects 2, coverage .6}`), `proposals.ts` (`PROPOSAL_THRESHOLDS`, 30-day scan), `derive.ts` (`ARTIST_MIN_EVENTS=2`, `ARTIST_MIN_SUM=1.0`), `epochs.ts` (30-min gap/window), `reliability.ts`; C1 re-verified ≥10 rows (p4).
- **Evaluation protocol**: offline replay for invariants/bugs/sanity only; no fabricated propensities (deterministic, exploration OFF); causal claims need live interleaving/switchback + user read-back (A3 §4.1). Re-run the falsifiers: isolation byte-compare **both directions**; flood bounds (20 loves ⇒ ≤0.15); hard rules under maxed evidence; determinism (reversed insertion); half-life ≤0.25× at +60 min; proposal boundaries — `derive.test.ts`, C1 p1-p5, lab 05-07.
- **Never tune silently**: policy versioning (meaning change ⇒ new version + re-derive); proposal thresholds (most speculative); exploration OFF. Drift: artist gate counts **events** (≥2) vs A3 "≥2 distinct tracks" — fix neither silently (C1 F2; H3 E2).

## 4. For implementers — load-bearing conventions

- **Events append-only**; forget = `learning_reset` marker (containment-bounded; L1 explicit survives; `detail.scope ≠ "epoch"` ignored — B2 §5.4).
- **Adjustments bounded, strict-tier-only**: one saturation `0.15·tanh(v/2)`; artist cap ±0.8; per-axis parts ≤0.5, feature total ≤1.0; never passes a hard rule — C1 p2.
- **Null is never zero**; declared fields contribute nothing (dilution caveat, §2).
- **Proposals require an explicit yes**; accept writes a normal signal with `detail.proposal_id`, never a synthesized reason; artist-subject accepts record the decision only (H2 F3).
- **No new outbound/telemetry** (grep-tested); new stores local, mode 0600.
- **Strip-types**: no enums/namespaces/parameter properties; `.ts` specifiers; `import type`; no aliases; `now` is a parameter (pure, replayable).
- **Test placement**: `src/*.test.ts` or `src/*/*.test.ts` (one level deep) — deeper files never run.
- **Single-writer habit**: claim files before editing; don't touch other writers' artifacts; land a receipt with before/after evidence. Evidence → receipt + `.cluster/.../evidence/<round>/`; final → `DELIVERY/verification/`. Fixtures are never evidence about real music; mark candidates; re-run counts before quoting.

## 5. Bias / safety / ethics pitfalls (checklist)

1. Never claim a universal "energy" — asks compile to labelled proxies, loudness smallest (`lexicon.ts`; `sequence.ts`).
2. No genre→culture claims; tags stay weak hints (`interpret.ts`; C2 E1).
3. Sensitive words are never product copy — `tribal|primitive|exotic|gypsy|world music|arrhythmic` only as quoted user echo; pinned by lab `08`.
4. Culture-sourced defaults labelled starting points, attributed in the appendix — shipped lexicon names no peoples (open caveat; names in A2 §1: Ewe; Aka/Baka/Mbuti; Hindustani/Carnatic; gamelan/kotekan; Yolŋu manikay; Sámi yoik; Māori taonga pūoro; Northern-style powwow; clave/tresillo; aksak; huayno/siku; ma/jo-ha-kyū; `SHARED_ASSUMPTIONS.calibration`; D8).
5. No tradition-named feature before consultation + decision record (A2 §4.3; D8).
6. No sacred/restricted knowledge — no ceremony inference from audio; never claim the protection exists (C2 F10).
7. Never learn feature hypotheses from suspect metrics — skips on unreliable material update identity signals only (`reliability.ts`; A2 §4.4 rule 6).
8. Mood only from explicit language (catharsis triggers); no learning module reads mood/valence/arousal (C2 P4).
9. Show uncertainty — damp/refuse low-confidence bpm with a note; "tempo unclear — tap it" prompts are **planned, not shipped** (`reliability.ts`).
10. No engagement optimisation — no watch-time/streaks/rewards; bounded, tier-limited, exploration OFF (C2 P6).
11. Nothing crosses an epoch without a yes — proposals do nothing until accepted; dismissals stick (C2 10–11).
12. Honest counts — excluded/unknown/unverified; `hidden_by_you` vs `hidden_by_session`; no dead Restore (`hide-union.test.ts`).
13. Null is never zero; missing genre tag ≠ absence (`signals.ts`).
14. Log honesty — never synthesize reasons the user didn't give (`index.ts`; H2 F3).

## 6. Operations and rollback

- **Policy switch**: default `epoch-v1`; POST settings `{"listening_policy":"legacy-v1"}` → legacy `deriveFeedback`; re-derive, never migration; curl-only (flagged C4).
- **Forget**: `POST /api/v1/brain/forget {"scope":"epoch"}` appends the marker — clears session hides/evidence, keeps explicit signals; other scopes → 400.
- **Proposals store**: `dataDir/brain-proposals.json` (`synamp.brain-proposals/1`, mode 0600, atomic); dismiss permanent until re-drafted; accept idempotent.
- **Exploration**: OFF; enabling requires a user switch + exposure record (`deterministic_rank+explore_slot`) + novelty-vs-mood evaluation (B2 §6; A3 §3.5).
- **Branch revert**: everything on `feat/fast-learning-brain`; runtime rollback = one legacy-v1 POST; code rollback = revert branch.
- **Evidence**: `.cluster/synamp-fast-brain/evidence/` — `final-lab/` (canonical), `b5/` (routes/screenshots), `h1/`, `h2/`, `c1/`–`c3/`; `DELIVERY/verification/` gets the manifest.
- **Environment**: smoke scratch `/tmp/synamp-b5*`, :3911/5199; **B5 §6 incident** — first screenshot run wrote 4 scratch events into gitignored `apps/brain/data/` (port 3001 = user's watch server; stale Vite :5173); never kill user processes; assert port ownership in scripts.

## 7. Open items (carried honestly)

- **P4 producer wall**: declared fields (e.g. `vocal_fraction`, `arousal`, `mood`) inert until producers land; degrade honestly.
- **Proposal thresholds unproven**; magnitudes untuned; fixtures synthetic.
- **Metre UI depth**: spot-check ships (right/half/double/tap, "no steady beat", 3-based ratios); tap-the-cycle and "layered" planned (A2 §4.4 rule 4).
- **Ceremony flags**: none; recommended next step = user-taggable arc-suppressing flag (C2 §5).
- **C1 F2/F5 wording drifts**: quote implemented wording (artist gate ≥2 events; "other tracks by <artist> this session") (H3 E2).
- **C3 judgment-not-tested**: artist min-events=2 thin; centroid labels causal-reading risk; ×0.5 bpm damping vs continuous weights; arousal-producer watch item; exploration deviation documented.
- Also open: culture/caveat notes unrendered (F7); digit-range silent drop (H1 §5.2); `queue_adjustments` lacks playlistId (F15).

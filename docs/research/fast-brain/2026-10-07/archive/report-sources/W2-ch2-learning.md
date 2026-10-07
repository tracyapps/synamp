# W2 — Chapter 2 source: "The fast learning brain"

> Writer's return (assembly metadata). Sources: A3 §3–§4 · B2 §§3–6 · B5 §§2–4 · H2 · C1 §§2–3 · A4 §2.3 (all retrieved; repo code read read-only).

**Conclusion.** Epoch-v1 learns fast inside one listening session and forgets at the boundary; the body explains epochs, evidence/hides/centroids, the single saturating composition, proposals, the isolation proofs, exploration-OFF, and the limits — every number traced to A3/B2/B5/C1/H2/A4.

**Evidence.** Spec: A3 §3 (P1–P25) + §4. Implementation/guarantees: B2 §§3–6 (`apps/brain/src/learning/{types,epochs,derive,proposals}.ts`). Wiring: B5 §§2–4; H2. Independent checks: C1 §3 (probe batches 20/0, 41/0, 33/0) + brain-lab 05/06/07 (B4b). Session-id fact: A4 §2.3.

**Analysis.** The chapter body follows; candidate values are labelled, and no tuning or real-music claims appear.

**Gaps and risks.** Untuned magnitudes; bpm-only reliability weights; synthetic fixtures; conservative untested proposal thresholds; collinearity contained, not solved; two single-switch calls open (`global_only` scope; epoch-wide skip-hide).

**Suggested placement.** Report Ch.2, between Ch.1 and Ch.3; `[FIGURE: epochs]`/`[FIGURE: modules]` from the figure list; parameter table (A3 §3.7) stays in the W5 appendix.

---

# Chapter 2 — The fast learning brain

The brief had two halves: learn *fast* from what the listener does — and never let behaviour from a different day, session, or hour bend what is ranked *right now*. Human moods change quickly, so the learning must forget just as quickly. This chapter describes the epoch-v1 layer built for that: epochs, what can move a score within one, what may cross a session boundary, and how isolation is proven. Full mathematics: A3 §3 (P1–P25); code: `apps/brain/src/learning/`.

[FIGURE: epochs]

## Epochs — the unit of "this session"

Learning is only as isolated as its unit of context — and the server's `session_id` is the wrong unit: minted once per installation, it survives restarts and never expires, so it can span days (A4 §2.3). Using it as the session would leak exactly what the requirement forbids.

An **epoch** is derived from the event log instead (A3 §3.1; B2 §3). A boundary exists between two consecutive events when any of three things happens:

- **The session key changes.** Different `session_id`s never mix; id-less events (some other-app captures) form their own bucket rather than joining a session.
- **More than 30 minutes of silence.** A gap of exactly 30:00 keeps the session; 30:01 starts a new one — and since 30 minutes is under an hour, the "or even hour" requirement holds with margin.
- **The local day changes.** Midnight ends an epoch even when only a minute of silence precedes it.

An epoch has a **live window**: for up to 30 minutes after its last event it still counts as "this moment" — resuming within the gap continues the same session; if nothing is live, the interface says so ("no active session — learning is paused"). Each epoch carries a stable id (`ep1:` plus a short hash of its bounds and first event), a daypart label (morning/afternoon/evening/night — context for display and proposals, never a boundary), and its start date.

To the listener: the panel says "This session: night, started 11:30 PM · 14 signals". That is "this session" honestly — the span of continuous listening since the last real break. Restarting the app does not start a new one; walking away for half an hour, or crossing midnight, does.

[FIGURE: modules]

The new code is small and pure: `epochs.ts`, `types.ts`, `derive.ts`, `proposals.ts`, `reliability.ts`, `explore.ts` (see figure).

## What can move a score

All session evidence combines into one value. Each contribution is (magnitude × confidence), decays with a 30-minute half-life inside the session, and is **killed exactly at the epoch boundary** — a mask, not a slower decay (B2 §4). Plain-language evidence table (candidate magnitudes — A3 §3.2):

| What happened this session | Pull | Extra rule |
|---|---|---|
| Heard it through | +0.50 × 0.50 | — |
| Replayed it | +1.00 × 0.70 | — |
| Skipped early | −0.60 × 0.50 | a 2nd early skip of the same track hides it for the rest of the session |
| Skipped late | −0.10 × 0.20 | weak; never hides |
| Played in your other apps | +0.25 × 0.50 | — |
| "Not now" | −1.00 × 0.90 | hides immediately; nothing persists |

**Hides** are the hard edge of fast forgetting: a repeat-skipped or "not now" track leaves *future* queue builds and resolves while the epoch lives — the current queue is a snapshot that is never reordered. Hides die at the epoch boundary; "Forget this session" clears them immediately — it appends a `learning_reset` marker to the never-edited log, so everything learned in the session stops counting. Deliberate signals — loves, thumbs, removes — survive a reset by design: the sanctioned cross-epoch channel (B2 §5; B5 §2).

Two secondary mechanisms, never dominating. **Artist propagation** lets a track's session evidence touch the artist's other tracks — damped to 35%, capped at ±0.8, opened only by ≥2 events on the artist's other tracks (or a summed magnitude of 1.0); a single event moves almost nothing, and only session-level evidence feeds it (loves do not propagate). It produces the label "other tracks by <artist> this session". **Keep/skip centroids** are the one attribute-level learner: from kept tracks and corroborated negatives (repeat-skips, "not now", reason-coded thumbs), it builds small Rocchio-shaped centroids over five produced axes (bpm, loudness, crest factor, onset rate, percussiveness). Gates: ≥3 keeps, ≥2 rejects, ≥60% coverage, spread-based shrinkage; β = 0.5 vs γ = 0.15 (γ < β per the IR-textbook convention); per-axis parts ≤ ±0.5, feature term ≤ ±1.0. Missing measurements contribute nothing and say why — null is never zero (A3 §3.3c; B2 §4).

Composition happens exactly once: **bonus = 0.15 · tanh((persistent + session + artist + features)/2)**. One love reaches ≈0.114 of the 0.15 maximum; twenty loves cannot exceed it (flood-tested — C1 §3). The bonus applies only inside the strict tier: it can re-order and re-select within what a request allows, but cannot break a hard rule (an excluded track stays excluded under maxed-out evidence; C1 §3). The learning meaning changed, so the version is `epoch-v1`; switching back to `legacy-v1` re-derives the same immutable log — never a migration (B5 §1).

## Proposals — the only cross-session channel

Anything outliving a session must pass a human gate. **Proposals** scan closed epochs within 30 days: a pattern needs ≥3 epochs across ≥2 calendar dates ("mood ≠ habit" — same-day repetitions alone never propose); "not now" patterns need ≥2 dayparts; positives are stricter (repeat 4/3; other-app plays 5/3). Nothing applies by itself (A3 §3.4; B2 §3). Accepting is an explicit yes: it appends a normal explicit signal — a global thumb — with `detail.proposal_id` for provenance and no synthesized reason (H2 §F3); artist-subject proposals append no event — the decision is recorded and the surface says to follow the artist (B5 §4).

## Isolation — and how it is proven

The guarantee is byte-equality, not a promise: derive for a day-1 moment, append arbitrary day-2 implicit events, derive again — byte-identical output; day-1 implicit events never move day-2 values (B2 §2; C1's probes: 20/0). The suite also exercises boundaries (29:59 keeps / 30:00 exact keeps / 30:01 splits; midnight with a 60-second gap), flood bounds (20 loves / 20 skips ⇒ |bonus| ≤ 0.15), determinism (reversed and interleaved insertion orders byte-identical; lab re-runs identical, hash 6532f3f3…37ab3a), hide expiry at exactly +30:00, reset semantics, and proposal boundaries (2 epochs ⇒ none; 3/2 ⇒ exactly one). C1 re-ran all of it adversarially from the code (probe batches 20/0, 41/0, 33/0); brain-lab scenarios cover the same ground: **05-fast-learning** (within-epoch stream reorders the next resolve; hides re-skips), **06-isolation** (same stream at now+16h: `learning-adjust-zero`, `learning-hides-empty`, `learning-resolve-identical`), **07-forget** (`learning_reset` clears the epoch's evidence).

## Exploration — built, off by default

The layer ships a deterministic exploration hook, **off by default**; when off, the derived view is byte-identical to a build without exploration (B2 §6). Reason: for a single listener, exploration noise is indistinguishable from a mood change — the exact confusion the isolation work prevents; determinism and honest exposure records are product promises; the novelty/satiation trade-off is one only the user can strike (A3 §3.5). If ever enabled by the user: one slot, seeded from `hash(epoch_id, counter)`, recorded as such.

## Honest limits

- All magnitudes are **candidate values** from the dossier/v1 lineage — hypotheses, not tuned evidence; nothing is tuned on real listening; fixtures are synthetic (A3 §6; B2 §7).
- Reliability weights exist only for **bpm** (`tempo_confidence`; spot-checks write full confidence); other axes use placeholder 1.0.
- Proposal thresholds are conservative, untested candidates; failure mode: too few proposals, never wrong automatism.
- Axis collinearity is contained — small skip weight, corroboration gates, honest notes — not solved.
- Two single-switch calls stay open: strict `global_only` scope persistence, and the epoch-wide skip-hide.

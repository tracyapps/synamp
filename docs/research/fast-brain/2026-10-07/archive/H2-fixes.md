# H2 — Hotfix receipt: integration & web surfaces (F3 / F4 / F5 / F6 / F8)

Writer: H2 (hotfix engineer — integration + web) · Date: 2026-10-06 late → 2026-10-07 00:00 CDT
Repo: `/Users/tapps/_dev/web-apps/SynAmp` @ `feat/fast-learning-brain` (shared tree; other writers active — see §Concurrency)
Scope (sole-writer files): `apps/brain/src/index.ts`, `apps/brain/src/query/evaluate.ts`, `apps/brain/src/learning/proposals.ts` (strings only), `apps/brain/src/query/hide-union.test.ts`, `apps/web/src/{Describe.tsx,BrainSession.tsx,App.tsx}`, `apps/web/src/styles/{describe.css,brain.css}`
Constraints honoured: additive/back-compat where possible · native strip-types (no build step added) · no `pnpm install` · no git commits · no edits outside the scope list.

---

## Files changed (8)

| File | Fix(es) | Kind |
|---|---|---|
| `apps/brain/src/index.ts` | F3 | `applyProposalAccept()` rewritten: direct append, no `reason`, `detail.proposal_id` |
| `apps/brain/src/query/evaluate.ts` | F4 | hidden split: `hidden`/`hidden_by_you` = persistent removes; new `counts.hidden_by_session`; union unchanged |
| `apps/brain/src/learning/proposals.ts` | F5 | 5 × `suggested_action` strings (strings only — no logic touched) |
| `apps/brain/src/query/hide-union.test.ts` | F4 | assertions updated to split semantics + **new test** "hidden split (C2 F4)" (3 → 4 tests) |
| `apps/web/src/Describe.tsx` | F4/F6/F8 | `Evaluation` mirror (+`hidden_by_session`, +`sequencing_applied`); session-hides muted line; confidence words; "Order: …" line |
| `apps/web/src/BrainSession.tsx` | F5 | pre-click consequence line (`Accept: …`) + confirmations reworded to match |
| `apps/web/src/styles/describe.css` | F4/F8 | `.describe__session-hides`, `.describe__sequencing` |
| `apps/web/src/styles/brain.css` | F5 | `.brain__proposal-note` |

`App.tsx` reviewed — **no change required** (it neither mirrors `Evaluation` nor renders hides; `Describe`/`BrainSession` are self-contained). `Playlists.tsx` reviewed but **not edited**: it renders `ResultView` from the same `Evaluation`, and the dead Restore is eliminated by the data split (the restore list can no longer contain epoch hides). `sequence.ts`/`interpret.ts` edits in the tree belong to other writers.

---

## F3 — accept must not synthesize a reason

**Before** (`applyProposalAccept`):
```ts
const record = (signal: "thumb_down" | "thumb_up") => recordFeedback(events, {
  event_id: eventId, signal, track_id: proposal.subject, scope: "global",
  ...(signal === "thumb_down" ? { reason: "wrong_vibe" as const } : {}),   // ← synthesized reason
  session_id: sessions.get().id,
});
```
**After** (index.ts): acceptance appends directly via `events.append(...)` (stable id keeps the retry dedupe; `event_id` validation of `recordFeedback` was only needed for the removed `reason` path):
```ts
events.append({
  id: `proposal-${proposal.id.replace(/[^A-Za-z0-9_-]/g, "-")}`,
  ts: Date.now(), signal, track_id: proposal.subject, scope: "global",
  session_id: sessions.get().id, source: "server", policy_version: POLICY_VERSION,
  detail: { proposal_id: proposal.id },          // provenance, not a reason
});
```
Kinds mapped exactly as specified: `track_repeat_skip` / `not_now_pattern` → `thumb_down`; `repeat_positive` / `external_play_positive` (track) → `thumb_up`; artist subjects → **no event** (decision recorded only, as before). Reason codes stay user-authored (derive’s reject-centroid still only fires on the user’s own `wrong_energy`/`wrong_vibe`).

**Runtime evidence** (route smoke, real server; `evidence/h2/smoke-output.txt`):
```json
{"id":"proposal-pr1-84de4598d8fb","ts":1791349108704,"signal":"thumb_down","track_id":"sample-001",
 "scope":"global","session_id":"61245596-…","source":"server","policy_version":"epoch-v1",
 "detail":{"proposal_id":"pr1:84de4598d8fb"}}
```
No `reason` key; `detail.proposal_id` present; retry dedupe preserved (stable id).

## F4 — hides must not masquerade as "Removed by you"; no dead Restore

**Before** (`evaluate.ts`): `hidden = strict ∩ (removed ∪ epochHides)`; `counts.hidden_by_you = hidden.length` — persistent removes and session hides shared one list/count, and the UI offered Restore for both (a silent no-op for epoch hides).

**After** (`evaluate.ts`): the exclusion **union is unchanged** (both still leave `strict`, near-miss filtering unchanged), but the reporting is split:
```ts
const removedIds = …feedback.removed(playlistId ?? "")…;
const epochHiddenIds = …adaptive.epochHides?.()…;
const hiddenIds = new Set([...removedIds, ...epochHiddenIds]);          // exclusion union — intact
const hidden = pass.strict.filter((row) => removedIds.has(row.track.id))…;   // "Removed by you" (restorable)
const hiddenBySession = pass.strict.filter((row) =>
  epochHiddenIds.has(row.track.id) && !removedIds.has(row.track.id)).length;
…
counts: { …, hidden_by_you: hidden.length, hidden_by_session: hiddenBySession }
```
Documented edge rule: a track that is *both* persistently removed and epoch-hidden is reported **once**, under “Removed by you” (the lasting cause, and the one Restore can undo); `hidden_by_session` therefore counts only hides that actually clear when the session ends (keeps the muted line’s promise literally true). `/plans/draft` preview and `/plans/evaluate` share the same `evaluatePlan(policyOptions())` path — smoke-verified parity.

**Describe.tsx** (all three surfaces: draft preview, evaluate view, smart-playlist explain):
- counts row “Removed by you / N hidden” and the `Removed by you (N)` restore details now receive persistent removes only;
- new muted line when `counts.hidden_by_session > 0`:
  `“N hidden while this session lasts — clears when the session ends (use “Forget this session” on The Brain to clear now).”`

**Runtime evidence** (smokes): draft preview `hidden_by_session = 1`, `hidden = []`, `hidden_by_you = 0`, hidden track absent from strict; `/plans/evaluate` identical; smart-playlist explain with a persistent remove: `hidden_by_you = 1`, `hidden_by_session = 1`, restore list = the removed track only (epoch hide **not** listed), after Restore the list empties while the epoch hide survives (hence the split).

## F5 — consequences stated before the click, matching after

**`proposals.ts` `suggested_action`** (strings only):
| kind | before | after |
|---|---|---|
| `track_repeat_skip` | “exclude this track from that playlist, or give it a thumbs down there” | “Keeps it out of suggestions everywhere (a global thumbs-down) — or exclude it from that playlist instead” |
| `artist_repeat_skip` | “exclude {artist} in that playlist” | “Records your decision — no automatic change; edit the playlist to exclude {artist}” |
| `not_now_pattern` | “give it a global thumbs down — it seems wrong for you in general” | “Keeps it out of suggestions everywhere (a global thumbs-down) — you decide” |
| `external_play_positive` (artist) | “follow the artist or give their tracks a thumbs up” | “Records your decision — no automatic change; follow the artist from the Library” |
| `external_play_positive` (track) / `repeat_positive` | “give this track a thumbs up” / “pin or boost it in the playlist” | “Adds a global thumbs-up — future lists weigh it in” |

**`BrainSession.tsx`**: each proposal now shows a muted pre-click line `Accept: {consequence}` —
- negatives → “Keeps it out of suggestions everywhere (a global thumbs-down).”
- positive track kinds → “Adds a global thumbs-up — future lists weigh it in.”
- `artist_repeat_skip` → “Records your decision — no automatic change; edit the playlist to exclude the artist.”
- external artist → “Records your decision — no automatic change; follow the artist from the Library.”

Confirmations (`acceptDone`) now match: “Recorded a global thumbs-down — it stays out of suggestions everywhere.” / “Recorded a global thumbs-up — future lists weigh it in.” / “Recorded — no automatic change; … if you want that.”
*Deviation, stated honestly:* for the external-artist kind the spec’s artist sentence ends “edit the playlist to exclude the artist”, which mismatches that kind’s behaviour (no playlist involved; the action is follow). First clause kept verbatim; the tail names the follow action instead.

## F6 — no fabricated “% sure”

**Before**: `<small>{Math.round(reading.confidence * 100)}% sure</small>` — a heuristic rule constant rendered as a calibrated probability.
**After**: `<small>{confidenceWord(reading.confidence)}</small>` with `≥ 0.6 → “likely”`, `≥ 0.35 → “possibly”`, else `“a guess”`. No percentage rendering remains in `Describe.tsx` (grep-verified).

## F8 — sequencing notes visible

**Before**: `sequencing_applied` returned by the API but rendered nowhere; `Evaluation` type omitted it.
**After**: type mirror adds `sequencing_applied?: string[]`; `ResultView` renders, only when non-empty, one muted line `Order: {notes.join("; ")}` (style `.describe__sequencing`, `13px` muted, plain paragraph → accessible). Covers draft preview + evaluate + explain in one place.

**Runtime evidence**: `sequencing_applied: ["arc build: … — 100% coverage"]` present in both smoke transcripts (note wording is owned by `sequence.ts`; another writer sharpened it mid-run to name the proxy — my renderer is agnostic).

## C3 copy discipline on H2 surfaces

- `not_now_pattern` softened per C3 F-COPY-1.5 → “…— you decide”.
- F-SURF-1 (sequencing note invisible) → fixed (F8 above).
- No clinical/overclaim language introduced; no lexicon/culture strings touched (owned by h1).

---

## Verification (final capture `evidence/h2/verify-output.txt`, run 2026-10-07T04:59:26Z)

```
## pnpm --filter @synamp/brain test
exit=1 (1 = expected: only the pre-existing macOS librarian red)
ℹ tests 212  ℹ pass 210  ℹ fail 1  ℹ skipped 1  ℹ duration_ms 877.1
test at src/librarian/librarian.test.ts:149:1   ← pre-existing (case-folded "Ani Difranco"/"Ani DiFranco" path compare)

## pnpm --filter @synamp/brain type-check   → exit=0
## pnpm --filter @synamp/web type-check     → exit=0
## pnpm --filter @synamp/web build          → exit=0 · “✓ built in 950ms” (vite 6.4.3, 136 modules)
```

Baseline before H2 edits: 210 tests / 208 pass / 1 fail (same librarian) / 1 skip. Delta: **+2 tests** — one is mine (`hide-union.test.ts` 3→4, isolated run 4/4), the other is the concurrent wave-hotfix writer’s `sequence.test.ts` addition (isolated run 9/9). The librarian red and the single skip are the pre-existing, accepted ones — no new failing or flaky tests.

Route smokes (scratch, strip-types, real server against temp dirs; scripts + transcript in `evidence/h2/`):
- `smoke1-routes.mjs` → accept shape (F3), draft/evaluate parity + no masquerade (F4), `sequencing_applied` (F8): **all ok**.
- `smoke2-playlist-explain.mjs` → smart-playlist explain: persistent remove in the restore list, epoch hide counted separately, restore behaves, epoch hide survives (the exact reason the split exists): **all ok**.
- Note: a smoke-driven accept without a matching player session id starts a new epoch (epochs split on session change by design) — seeded so the checks run in the realistic order. Real flows carry the installation session id on both sides.

## Concurrency note (shared tree)

Other hotfix writers were editing `sequence.ts`/`sequence.test.ts` (C1 wave fix) and `intent/interpret.ts` (genre-context guard) during H2 verification. One intermediate type-check at 04:58:35Z caught `interpret.ts` mid-edit (TS18048); their next write fixed it and the 04:59Z re-run is green. H2 files were untouched by others (mtimes verified). Final numbers above are from the 04:59Z capture; re-run after all writers stop for the definitive chapter numbers.

## Not fixed here / carried

- **Per-track Restore for epoch hides**: intentionally not built — the spec’s chosen direction (split the display, keep the exclusion union) is implemented; epoch hides remain clearable via “Forget this session”, and no surface offers a dead button any more.
- **C3 lexicon strings** (F-COPY-1 items 1/2/3/4/6) and **F-SURF-2 caveat surfacing**: out of H2 scope by dispatch (“lexicon strings belong to h1”).
- **C2 F1/F2 docs, F9–F15** and **C1’s wave bug**: other writers’ scope (wave + genre guard were being fixed concurrently, as seen in the tree).
- `hidden_by_session` overlap rule (§F4) is a judgment call: a both-removed-and-hidden track sits in the persistent count only. One-line change if C4 prefers “everything currently suppressed this session” semantics.
- No new route tests were added to the repo (unit coverage for the split lives in `hide-union.test.ts`; route evidence is the two smoke scripts under `evidence/h2/`, deliberately kept out of the app code per the no-new-tools constraint).

## Evidence files

- `evidence/h2/smoke1-routes.mjs` — route smoke #1 (F3 accept event shape; F4 draft/evaluate parity; F8).
- `evidence/h2/smoke2-playlist-explain.mjs` — route smoke #2 (F4 persistent vs session hides on the explain surface; restore behaviour).
- `evidence/h2/smoke-output.txt` — verbatim transcripts of both smokes.
- `evidence/h2/verify-output.txt` — final brain test / type-checks / build capture with exit codes.

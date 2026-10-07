# SynAmp Fast Learning Brain — shared context (task: synamp-fast-brain)

This file is the shared brief for every subagent on this task. Read it fully before working.
You are not working alone; do not touch artifacts that are not yours. Write only to files assigned to you.

## The ask (user's own words, condensed — treat as requirements)

1. Translate between raw metrics and natural-language goals: requests that are accurate,
   partially accurate, or completely inaccurate; vague (or overly specific); goal-specific
   language ("I need to focus", "pump me up to do this task / win this game", "I want to dance").
2. Most importantly: learn FAST from actions/feedback to adjust and fine-tune smart playlists
   that get smarter — but the learning must NOT be influenced by behaviour/feedback from a
   different day, session, or even hour. Human moods and needs change rapidly; so must the
   "brain" of SynAmp.
3. Challenge "dominant culture" bias; draw on knowledge from various Indigenous cultures
   around the globe.
4. Raw measurements are a moving target: a slow tempo with high note intensity, complex
   instrumentation, polyrhythms or non-Western / less common time signatures can confidently
   report inaccurate metrics.
5. Music is deeply personal: a single tone or motif can trigger opposite reactions, sometimes
   for the same person on a different day.
6. Connect the dots between scientific studies about sound and the brain.
7. Work closely with the Music Psychologist and Data Science & ML agents.
8. Pivot freely: existing code may be changed/rewritten where new findings demand it.
9. Deliverables: organised code library; docs incl. sources/studies appendix; production notes,
   calculations, diagrams, logic, review methods and tests; agent instructions incl. bias,
   safety and ethics pitfalls.

## Where things live

- Repo: `/Users/tapps/_dev/web-apps/SynAmp` — engineering happens on branch
  `feat/fast-learning-brain` (created off `main`). Research/audit agents: read-only.
- Cluster workspace (ALL artifacts for this task): `/Users/tapps/.openclaw-autoclaw/agents/algorithm-scientist/workspace/.cluster/synamp-fast-brain/`
- Plan: read `docs/synamp/plans/AGENT-ROADMAP.md` first, then
  `docs/synamp/ARCHITECTURE.md` (§6–7, §11), `docs/synamp/plans/BEAT-TIMING.md`,
  `docs/research/synamp-brain-dossier.html`, `docs/research/synamp-sound-booth-plan.html`,
  `docs/research/beat-timing-findings-2026-09-29.md`, `docs/synamp/DECISIONS.md`.
- Brain code: `apps/brain/src/` — query layer in `src/query/`, session/feedback in `src/session/`,
  HTTP API in `src/index.ts`. Web app: `apps/web/src/` (React + Vite).
- No build step for the brain: Node ≥22 `--experimental-strip-types`. Tests: `node --test`.

## Verified facts already confirmed by the mainline (do not re-derive; extend or challenge with evidence)

### Query layer (P2, exists)
- `src/query/signals.ts`: signal registry. Every plan field canonicalised here; unknown fields are
  rejected or returned as structured "unsupported asks", never guessed. Each field: kind, unit,
  range, stage, status (`produced` / `declared` / `metadata`), null meaning, status gates
  (`eligibleWhen: beat_status=tracked` for beat fields; `timing_status=measured_relative_to_fitted_grid`
  for microtiming/swing), `nearMiss` widths. Aliases map research spellings → canonical; anything
  else rejected. `KNOWN_UNSUPPORTED` lists fields research names that have no producer.
- Key fields TODAY: produced = bpm (+tempo_confidence, pulse_clarity, onset_rate, percussiveness,
  lufs_integrated, loudness_range, crest_factor, dynamic_complexity, clipping_density, spectral_*),
  beat-stage (beat_grid_strength, beat_interval_cv, tempo_drift, microtiming_tightness,
  microtiming_signed, swing_ratio — status-gated), all uncertain on non-Western material.
  Declared-but-no-producer = vocal_fraction, instrumental, instruments.* , arousal, valence,
  danceability, mood, mode, chord_change_rate, dissonance, structure_repetition. Metadata = artist,
  album, genre (tags only; missing tag ≠ absence), year, duration_s. On a real library the declared
  fields are *unknown* for every track until producers land — designs must degrade honestly.
- `src/query/plan.ts`: closed, versioned plan schema v2.0 + validator + stable SHA-256 hash.
  Constraints have hard/soft, `source_phrase`, `confidence`, `proxy`, `unknown_policy`
  (exclude/include/neutral). Explicit exclusions must be hard, must use `exclude` policy on audio
  fields, and are auto-added to `require_confirmation_for`. `ignore_never_relax` refused. Relaxation
  ladder = only drop_boost / widen_numeric, declared per plan. `encoderText()` strips negations
  before any future text–audio encoder sees text. Sequencing: only `arc:"flat"` supported today;
  `build`/`cooldown`/`peak`/`wave` currently become "unsupported asks" (an extension target).
- `src/query/evaluate.ts`: deterministic evaluation. Filter channel ∪ similarity channel → hard
  guard on the union; strict tier + separately-labelled near-miss tier; declared ladder only;
  artist/album caps + MMR; per-track reasons from measured values; honest counts
  (excluded/unknown/unverified). `EvaluateOptions` accepts a `FeedbackView` (re-rank inside strict
  tier, hide removed) and `playlistId`.
- `src/query/draft.ts`: rule-based draft parser standing in for an LLM. Recognises the dossier's
  flagship phrases (no words / no <instrument> / nothing too slow or relaxing / focus / energetic /
  calm / bpm ranges / exclude <genre> / sounds like <title>). Emits an UNTRUSTED plan object that
  goes through `validatePlan()` exactly as LLM output will; unparsed text is reported, never guessed.
- `src/query/library.ts`: file-backed library signals (`LIBRARY_SIGNALS_PATH`, format
  `synamp.library-signals/1`); re-read on change; sample fixture is synthetic
  (`apps/brain/fixtures/library.sample.json`, 60 tracks, regenerate with `make-sample-library.mjs`).

### Session & feedback (P3, exists)
- `src/session/events.ts`: append-only JSONL event log; client-supplied `event_id` dedupe; undo is a
  new event; torn last line skipped; fsync on append. Signal union: love/thumb_up/thumb_down/
  remove/restore (explicit), full_play/skip_early/skip_late/repeat (server-classified),
  external_play/now_playing, interrupted/playback_error/seek/started, receipt, exposure.
  Events carry session_id, playlist_id, plan_hash, rank_shown, play_ms, duration_ms, reason, scope.
- `src/session/session.ts`: server-owned session; `replaceQueue` snapshots membership and logs
  exposure ("deterministic_rank" — no invented propensities); classification: early skip =
  playedMs < min(30 s, 25 % of track); heard-through ≥ 80 %; errors/seeks/interruptions/previous
  never become dislikes.
- `src/session/feedback.ts`: `deriveFeedback(events, now, canonical)` — pure replay derivation;
  heuristic-v1: love = strong global boost (half-life 180 d), playlist signals 30 d half-life,
  early-skip pattern (2× in one playlist) small penalty, global negative only when explicit or
  seen in ≥2 playlists; remove hides from ONE playlist (restore undoes); other-app plays small
  global positive. Bounded application: `feedbackBonus(v)=0.15*tanh(v/2)`, inside strict tier only;
  every track shows `score_breakdown` + "your listening: …" reasons. No queue/ML training.
- `src/library/spotcheck.ts`: human tempo verification (right / half / double / tap; 3-based metre
  ratios recognised; "no steady beat"). Corrections applied inside `currentLibrary()`; a correction
  only holds while the measured BPM matches the checked one. This is the seed of a
  "human-verified" reliability tier.
- POLICY_VERSION currently `"heuristic-v1"`; meaning changes = new version + re-derive (events
  never change).

### Docs conventions (AGENT-ROADMAP)
- Work packages P0–P6 with owners; every slice lands with: confirmed / not done / unverified /
  next smallest experiment; tests counted ("Brain NN/NN"); evidence states preserved (a candidate
  signal stays candidate even when code exists). Fixtures are never evidence about real music.

## Engineering constraints (frozen — violating these breaks the build)

- Node `--experimental-strip-types`: NO enums, NO namespaces, NO parameter properties, no
  `satisfies`-only runtime constructs beyond strip support; import specifiers include the `.ts`
  extension; type-only imports via `import type`; no TS path aliases.
- Everything must be deterministic and replayable: derivations are pure functions of
  (event log, library, config, now) — never hidden mutable state; take `now` as a parameter.
- Null is never zero; unknown is honest; never widen an explicit exclusion automatically;
  all score adjustments bounded and explainable (per-track reasons).
- All artifacts in English. Cite only sources actually retrieved during this task (search/open
  them yourself). No fabricated citations. Mark confidence (High ≥2 independent sources / Medium
  one authoritative / Low weak / Conflict).
- Subagent return format (mandatory): **conclusion / evidence / analysis / gaps and risks /
  suggested final-report placement**. If there is no evidence for something, say so — never
  disguise guesses as conclusions.
- Subagents do not produce final Office files. Write your assigned markdown artifact; the
  mainline assembles deliverables.

## File map for this task (who writes what)

- `A1-music-psychology.md` — Music Psychologist agent (goal-language research pack)
- `A2-cross-cultural-metrics.md` — cross-cultural & bias researcher
- `A3-learning-science.md` — Data Science & ML agent (session-scoped learning designs)
- `A4-code-integration-map.md` — interface audit (extensions, baseline test evidence)
- `B1-*.md`, `B2-*.md`, `B3-*.md`, `B4-*.md` — engineering round receipts (code in repo)
- `C1..C4-*.md` — review round (code correctness, bias/ethics, psychology, production readiness)
- `review.md`, `brief.md`, `DELIVERY/` — mainline assembly

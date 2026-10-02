# @synamp/brain

The SynAmp brain: playlist model, library intelligence wiring, and the
authoritative playback session.

## Why this exists

Everything SynAmp does that off-the-shelf music servers do *not* — nested and
roll-up playlists, natural-language playlist generation, thumbs/skip feedback,
and the shared session that party clients hang off — lives here, not in the
library core. See `docs/synamp/ARCHITECTURE.md` §6–§7 and §11.

## Run it

No build step — Node strips the TypeScript types directly.

```bash
pnpm --filter @synamp/brain start      # node --experimental-strip-types src/index.ts
pnpm --filter @synamp/brain dev        # ...with --watch
pnpm --filter @synamp/brain type-check
```

```bash
curl -s localhost:3001/health          # {"status":"ok",...}
curl -s localhost:3001/api/v1/session  # {"nowPlaying":null,"queue":[],...}
```

## Playlists (first Phase 2 slice)

Run the brain and web dev servers, then open `http://localhost:5173` to create
folders, manual playlists, and roll-ups. For logic testing, track IDs can be any
unique labels; actual playback will require Subsonic song IDs.
Roll-ups resolve their source on every read, so edits to child playlists appear
immediately. Merge, shuffle, and interleave are available; weighted and smart
playlists, library search, track playback, and Subsonic export are later slices.

Playlist state currently persists in `apps/brain/data/playlists.json` for local
development. This is an interim single-process store until the Postgres model is
ready. Set `PLAYLIST_DATA_PATH` to move it. The NAS app profile mounts it under
`DATA_DIR/brain`; back up that directory. Run `pnpm --filter @synamp/brain test`
for the resolver checks.

The deployed app profile requires `PLAYLIST_API_TOKEN`. Enter it in the web UI
when prompted; the browser keeps it in session storage for that tab. Local
development listens on `127.0.0.1` and permits requests without a token unless
you set one.

## Smart playlists — the query layer (AGENT-ROADMAP P2)

Natural-language playlists flow through four small modules in `src/query/`:

| Module | Job |
|---|---|
| `signals.ts` | **Signal registry.** Every field a plan may use, with unit, range, producer stage, status (`produced` / `declared` / `metadata`), what null means, and status gates (microtiming only counts when `timing_status` is measured). Research aliases (`instrument.piano`, `instrumental_score`, `microtiming_deviation.signed`…) map to canonical names; anything else is rejected, never guessed. |
| `plan.ts` | **Closed, versioned plan schema + validator.** Typed operators, bounded values, hard/soft rules, per-predicate `unknown_policy`, and a SHA-256 hash that ignores key order. Unsupported fields become structured asks (hard ones flagged `unenforced`). `ignore_never_relax` is refused; explicit exclusions are always added to `require_confirmation_for` and cannot sit on the relaxation ladder. `encoderText()` strips negated spans before anything could reach a text–audio encoder. |
| `evaluate.ts` | **Deterministic evaluation.** Filter channel ∪ similarity channel, then hard guards on the union. Kleene logic for unknowns. Strict tier, separately labelled near-miss tier, declared ladder only, artist/album caps + MMR, per-track reasons from measured values, and excluded/unknown/unverified counts. |
| `draft.ts` | **Rule-based draft parser** — a stand-in for the local LLM. Recognises the dossier's flagship phrases (no words / no <instrument> / nothing too slow or relaxing / focus / energetic / calm / bpm ranges / exclude <genre> / sounds like <title>). Its output is validated exactly as LLM output will be. |

**Honesty rules the tests pin down:** null is never zero; an unmeasured piano
fails “no piano”; a missing genre tag passes “exclude punk” only as *unverified*;
under-fill returns fewer tracks plus near misses, never a silently widened
exclusion. These are fixture tests of logic — not evidence any classifier is
accurate on real music.

**Library data.** The brain reads per-track signals from `LIBRARY_SIGNALS_PATH`.
Point it at the analyzer's export (`synamp-analyze export`, format
`synamp.library-signals/1`) to query real analysed music; an unknown `format`
is refused. The default, `fixtures/library.sample.json`, is a **synthetic**
60-track library — regenerate with `node fixtures/make-sample-library.mjs`. The file is re-read when it changes,
so saved smart playlists pick up new tracks without a restart. Most fields the
flagship prompt needs (voice, instruments, arousal, mood) are `declared` with no
producer yet: on a real library every track is *unknown* for them until P4
lands, and strict exclusions will honestly return nothing.

## Listening, feedback and learning (AGENT-ROADMAP P3)

`src/session/` makes the brain the source of truth for what you actually hear:

| Module | Job |
|---|---|
| `events.ts` | **Append-only event log** (`EVENTS_PATH`, JSON Lines, fsynced). Retries dedupe on a client-supplied `event_id`; an undo is a new event, never an edit; a torn last line from a crash is skipped. |
| `session.ts` | **Server-owned session.** Starting a playlist copies it into a queue *snapshot* (membership changes don't reshuffle what's playing) and logs exposure. Players report physical facts — start, progress, seek, pause, ended, skip, previous, jump, error, stop — and the server classifies them. |
| `feedback.ts` | **Explicit feedback + v1 re-ranker.** Love / not-for-this / remove / restore with explicit scope, and a replayable derivation of preferences from the log. |
| `stream.ts` | **Audio for the web player** from `LIBRARY_PATH`, by library-relative path from the analyzer export, via signed expiring URLs with range support. |

**How a stop is read.** Ended, or left after 80% → *heard through* (that
playlist). Left before min(30 s, 25% of the track) → *early skip*; otherwise
*late skip* — both scoped to the session only. Errors, seeks, interruptions
(starting something else) and “previous” are recorded but never count as
dislikes.

**How feedback re-ranks (policy `heuristic-v1`).** Love is a strong global
boost; thumbs up/down apply in the scope you chose; heard-through and replays
boost within that playlist; *remove* hides the track from that playlist only
(undo with *restore*); two early skips in the same playlist become a small
penalty there; a negative goes global only when explicit or seen in ≥ 2
playlists. Playlist signals decay with a 30-day half-life, global ones 180
days. The adjustment is bounded (±0.15), applied only inside the strict tier,
and shown per track as `score_breakdown` plus a “your listening: …” reason — so
it re-orders but can never get a track past a hard rule. Magnitudes are the
dossier's candidate values, not tuned.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/api/v1/session` | the playback session; each queue entry says if it is `playable` and carries a signed `stream_url` |
| POST | `/api/v1/session/queue` | `{event_id, playlist_id, start_index?}` → snapshot a playlist into the queue |
| POST | `/api/v1/session/report` | `{event_id, report:{type, entry_id, …}}` → apply a player report (idempotent) |
| POST | `/api/v1/feedback` | `{event_id, signal: love/thumb_up/thumb_down/remove/restore, track_id, scope, playlist_id?, reason?}` |
| GET | `/api/v1/events?limit=` | recent listening events, newest first |
| GET/HEAD | `/api/v1/tracks/:id/stream?exp&sig` | audio with range support (signed link; no bearer token) |
| GET | `/api/v1/playlists` | all nodes in creation order |
| POST | `/api/v1/playlists` | create a folder, playlist, or roll-up |
| GET | `/api/v1/playlists/:id/resolve` | live track list |
| POST | `/api/v1/playlists/:id/tracks` | add a track to a manual playlist |
| DELETE | `/api/v1/playlists/:id/tracks/:index` | remove a track |
| DELETE | `/api/v1/playlists/:id` | delete an unreferenced, empty node |
| POST | `/api/v1/playlists` with `{type:"smart", name, plan, prompt?}` | save a smart playlist (the plan, not tracks) |
| GET | `/api/v1/playlists/:id/explain` | smart playlist: full evaluation (tiers, reasons, counts) |
| POST | `/api/v1/plans/draft` | `{prompt}` → recognised rules, validated plan, preview |
| POST | `/api/v1/plans/evaluate` | `{plan}` → validation + evaluation |
| GET | `/api/v1/plans/fields` | the signal registry |
| GET | `/api/v1/library` | library signals source: version and track count |

## Config

All via environment (see `src/config.ts`): `BRAIN_PORT`, `BRAIN_HOST`,
`DATABASE_URL`, `LIBRARY_PATH`, `CORE_URL`, `PLAYLIST_DATA_PATH`,
`PLAYLIST_API_TOKEN`, `LIBRARY_SIGNALS_PATH`, `EVENTS_PATH`, `SESSION_PATH`
(the last two default to `events.jsonl` / `session.json` beside the playlist
store). The token protects every `/api/v1` route except streams, which use
signed links derived from it.

## Next (Phase 1–2)

- Postgres + pgvector connection and migration of the interim playlist store.
- Subsonic passthrough to the library core.
- Weighted roll-ups and playlist export.
- Analyzer → brain signal export (replaces the JSON library file).
- A local LLM behind the same `validatePlan()` gate as the draft parser.
- WebSocket/SSE channel for session state (clients currently poll/refresh).
- Scrobble/now-playing bridge so Subsonic apps' plays reach the event log too.

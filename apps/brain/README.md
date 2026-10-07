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

## Plays from other apps, and Last.fm

**IDs survive moves.** The analyzer mints a track's ID from the first path it
had and keeps it when the file is moved or renamed (export `aliases` lists later
path IDs). The brain therefore maps a path to a track by looking it up in the
library index, falling back to hashing only for paths it hasn't indexed, and
counts feedback recorded under an old ID for the track's current one.

**Capture (`src/subsonic/`).** The edge sends Subsonic traffic (`/rest/*`) to the
brain, which forwards every call to Navidrome unchanged — audio is piped, not
buffered. When Navidrome accepts an app's `scrobble` call, the brain looks the
song up with the app's own credentials and appends `external_play` (or
`now_playing`) to the event log. A call Navidrome rejects records nothing, so
auth stays Navidrome's job. Navidrome's real file path (with
`ND_SUBSONIC_DEFAULTREPORTREALPATH`) maps to the same ID the analyzer uses —
`p:` + sha256(library-relative path) — so the same song is the same track
whichever app played it. Apps report plays but never skips, so these count as a
weak positive — never a negative. Under the shipped default (`epoch-v1`) an
other-app play scores only inside the live epoch (`played in your other apps this
session`, +0.25, like the other implicit signals), and it reaches across sessions
only as a proposal once the pattern repeats (≥ 5 epochs across ≥ 3 dates); the
legacy `heuristic-v1` derivation keeps the older small global boost.

**Last.fm (`src/lastfm/`, optional).** Set `LASTFM_API_KEY` and
`LASTFM_API_SECRET` to offer it; connect from the web app (Last.fm web auth,
protected by a one-time state value). Then:

- Only plays that start while scrobbling is **on** are sent; off means off.
- Last.fm's rule: longer than 30 s, played for half its length or 4 minutes.
  (Other apps apply that rule themselves before reporting a play.)
- Names come from tags only — the file's (analyzer export,
  `metadata_source: "tags"`) or Navidrome's. Folder-guessed names are held and
  shown, never sent.
- The outbox is derived from the event log, so nothing is lost across restarts
  or outages. Batches of 50, oldest first. Retries only Last.fm's retryable
  errors (11, 16, 29, network) with backoff up to an hour; an invalid session
  pauses until you reconnect; other refusals are recorded once and shown.
- “Now playing” is sent best-effort when a track starts.

## Goal language and session-scoped learning (fast-learning brain)

The fast-learning-brain slice turns goal language into validated plans, and plans into
adjustments that live and die with the listening session.

| Module | Job |
|---|---|
| `intent/lexicon.ts` | **Goal lexicon** — nine EN goals (focus, pump up, dance, calm, sleep, catharsis, nostalgia, drive, chores) as *soft* preference bundles: library-relative bands, arcs, plain-language assumptions, culture notes. Nothing here is hard, and nothing is guessed. |
| `intent/interpret.ts` | **`interpretGoal()`** — composes the draft parser with the lexicon and classifies the ask: `specific` / `partial` / `contradictory` / `vague` / `impossible`. Every reading passes `validatePlan()`; contradictions return two readings; vague or impossible asks return a few plain-language questions instead of an invented plan. |
| `learning/` | **Epoch-scoped learning (`epoch-v1`)** — one combined, bounded adjustment with per-part reasons: persistent explicit cells + live-epoch evidence + artist propagation + reliability-weighted centroids. Saturation stays in `evaluate.ts` (`0.15·tanh`). |

**Epochs.** Learning is scoped to a listening *epoch*, derived from the event log: a
session change, a gap over 30 minutes, or a new local day ends one and starts the
next (missing session ids are their own bucket; dayparts label the start). Implicit
signals (skips, replays, full plays, other-app plays) score only inside the live
epoch — 30 minutes after its last event — and die at its boundary, a hard mask rather
than decay; explicit signals (love, thumbs, remove) persist. Two early skips in an
epoch, or “not now”, hide the track for the rest of that epoch. Patterns from closed
epochs return only as **proposals**, and change nothing until you confirm one.
Exploration exists but is OFF by default.

**See it.** `GET /api/v1/brain/session` shows the active epoch, hides, proposals,
reliability notes and per-track adjustments; `POST /api/v1/brain/forget` resets the
current epoch (an append-only `learning_reset` marker — events are never edited).
Setting **`listening_policy`** is `epoch-v1` (default) or `legacy-v1`; `legacy-v1` is
the unchanged `heuristic-v1` path, so switching is a re-derive from the same log,
never a migration. Details and evidence: `docs/synamp/plans/FAST-LEARNING-BRAIN.md`.

## Missing tracks (`src/library/`)

`albums.ts` groups the library index into album folders and compares a folder
with a MusicBrainz release; `musicbrainz.ts` is a polite client (one shared
queue, ~1 request/s, User-Agent with `MUSICBRAINZ_CONTACT` — required to
start matching); `missing.ts` holds the background matcher, the per-folder
results (`albums.json`), your notes (`missing-notes.json`) and the list itself,
which is recomputed from the current library so re-ripped tracks drop off on
their own. Nothing here touches the music files. Details and decisions:
`docs/synamp/plans/LIBRARY-CARE.md` step 3.

## Organising the library (`src/library/organise.ts`, `src/librarian/`)

Propose → review → apply. The brain **only proposes**: `organise.ts` builds
readable decisions from the library index and the MusicBrainz matches —
artist spelling merges, and per-album naming (`Album (Year)`, `01 - Title`,
`1-01 - Title`, disc folders folded in, compilations to `Various Artists/`;
each part is a setting) — and keeps your approvals. An approval holds for one
revision of a decision; if the proposal changes, it asks again. Conflicts
(a name that's taken) can't be approved.

**The librarian** is a separate process and the only part of SynAmp with
write access to the music. It polls the brain for approved batches, checks
every file first (refuses the whole decision if anything moved or would be
overwritten), renames — never copies, retags or overwrites — puts things back
if a step fails, moves artwork and other files along with their folder,
removes folders left empty (deleting only `.DS_Store`/`._*`/`Thumbs.db`), and
journals every move to `RENAME_JOURNAL_PATH`. The analyzer reads the same
journal, so moved tracks keep their analysis and history. Any batch can be
undone (newest first). Until the next analyzer export, the brain follows the
recorded moves for files that really moved (`PathOverlay`), so they keep
playing.

```bash
LIBRARIAN_MUSIC_PATH=/Volumes/music/library \
RENAME_JOURNAL_PATH=/Volumes/music/.synamp/renames.jsonl \
SYNAMP_BRAIN_URL=http://localhost:3001 SYNAMP_BRAIN_TOKEN=… \
node --experimental-strip-types src/librarian/main.ts          # add --once for one round
```

On the NAS it runs as the `librarian` compose profile (see deploy/README.md).
It refuses to start without a writable library or a journal path. Unsent
reports wait in `LIBRARIAN_STATE_DIR` and are delivered first next time.

## Adding new music (`src/library/import.ts`, `tags.ts`)

Two doors, one pipeline: files copied into `incoming/` on the NAS, and files
dragged into the web app (streamed by `PUT /api/v1/import/upload` into
`incoming/_web/<upload>/`, written to a temporary name, size- and
checksum-checked, then renamed into place). The brain reads their tags (a
small built-in reader for MP3/ID3, FLAC and M4A — no dependencies), falls back
to `Artist/Album/` folder names, and proposes one **New music** decision per
arriving album: existing artist spellings and album folders are reused (re-rips
fill the album in), names follow the organise settings, byte-identical copies
are set aside in `incoming/_duplicates/` (never deleted), and a different file
with the same name is kept as "(2)". Files touched in the last 30 s wait. The
librarian files approved arrivals; across disks it copies, compares checksums,
and only then removes the original. Import journal lines carry `source`/
`target` instead of `from`/`to`, so the analyzer treats them as new files, not
renames. `INCOMING_PATH` turns it on; `UPLOAD_MAX_MB` caps a single file.

## Discography gaps (`src/library/discography.ts`)

Albums by artists you love that you don't have yet. Artists are scored from
the library and listening events (top 50 followed automatically; follow or
unfollow anyone), resolved to MusicBrainz (from step 3's matched albums when
possible, else a search; namesakes wait for you), and their release groups —
minus bootleg-only ones — are compared with your albums by release group and
title. Gaps carry New / Coming flags, Want / Not interested, and plain search
links (MusicBrainz, Bandcamp, Apple Music, Spotify, YouTube Music, Discogs).
Background checking shares the one MusicBrainz client and re-checks monthly.
State: `discography.json` beside the playlist store.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness |
| GET | `/api/v1/session` | the playback session; each queue entry says if it is `playable` and carries a signed `stream_url` |
| POST | `/api/v1/session/queue` | `{event_id, playlist_id, start_index?}` → snapshot a playlist into the queue |
| POST | `/api/v1/session/report` | `{event_id, report:{type, entry_id, …}}` → apply a player report (idempotent) |
| POST | `/api/v1/feedback` | `{event_id, signal: love/thumb_up/thumb_down/remove/restore, track_id, scope, playlist_id?, reason?}` |
| GET | `/api/v1/events?limit=` | recent listening events, newest first |
| GET | `/api/v1/brain/session` | the learning readout: listening policy, active epoch (or paused), hides, undecided proposals, reliability notes, per-track adjustments |
| POST | `/api/v1/brain/forget` | `{scope: "epoch"}` → append a `learning_reset` marker; the event log is never edited, only marked |
| POST | `/api/v1/brain/proposals` | `{id, action: "accept" \| "dismiss"}` → decide one cross-epoch suggestion |
| GET/HEAD | `/api/v1/tracks/:id/stream?exp&sig` | audio with range support (signed link; no bearer token) |
| any | `/rest/*` | Subsonic pass-through to the library core (Navidrome auth); captures scrobbles |
| GET | `/api/v1/listening` | plays captured from other apps + Last.fm status |
| POST | `/api/v1/analysis/progress` | the analyzer's progress report (`synamp.analysis-progress/1`) |
| GET | `/api/v1/library/health` | latest analyzer progress (with `stale`) + library index stats |
| GET | `/api/v1/missing` | summary, missing rows, review queue, found-again, matcher state |
| GET | `/api/v1/missing.csv` | the missing list as CSV |
| POST | `/api/v1/missing/:id` | `{status?, tags?, note?}` for one missing track |
| POST | `/api/v1/missing/match` | `{action: "start" \| "pause"}` the MusicBrainz matcher |
| GET | `/api/v1/albums/record?key=` | a folder's match and alternative editions |
| POST | `/api/v1/albums/search` | `{key, title?, artist?}` search MusicBrainz by hand |
| POST | `/api/v1/albums/choose` | `{key, release_id \| null}` pick an edition, or skip the folder |
| GET | `/api/v1/organise?kind&status&q&offset&limit` | proposals (one page), summary, settings, recent batches, librarian status |
| POST | `/api/v1/organise/review` | `{ids \| filter, status: approved/skipped/proposed}` |
| POST | `/api/v1/organise/settings` | naming settings |
| POST | `/api/v1/organise/apply` | queue every approved, conflict-free decision as one batch |
| POST | `/api/v1/organise/undo` | `{batch}` put a batch back (newest first) |
| PUT | `/api/v1/import/upload?upload&path` | one file from the web app → `incoming/_web/<upload>/<path>` (`x-content-sha256` optional) |
| POST | `/api/v1/import/rescan` | look at `incoming/` again now |
| GET | `/api/v1/discography` | gaps per followed artist, review queue, settings, checker state |
| GET | `/api/v1/discography/artists?q=` | library artists with scores and follow state |
| POST | `/api/v1/discography/follow` | `{key, follow}` |
| POST | `/api/v1/discography/check` | `{action: "start" \| "pause"}` |
| POST | `/api/v1/discography/search` / `choose` | find / pick the MusicBrainz artist (`mbid: null` skips) |
| POST | `/api/v1/discography/note` | `{id, status: want/ignore/none}` |
| POST | `/api/v1/discography/settings` | `{albums, eps, singles, include_other, auto_follow}` |
| GET | `/api/v1/analyzer` | the background analyzer: worker status, running/queued commands, recent results |
| POST | `/api/v1/analyzer/request` | `{action: update/scan/export/analyze}` (Library strip buttons) |
| POST | `/api/v1/analyzer/stop` | pause analysis after the current track; cancel what's waiting |
| POST | `/api/v1/analyzer/settings` | `{update_after_librarian}` |
| POST | `/api/v1/analyzer/claim` · `/commands/:id` · `/commands/:id/check` | the worker on the Mac: ask for work, report, "should I stop?" |
| POST | `/api/v1/librarian/claim` | the librarian asks for work (also its heartbeat) |
| POST | `/api/v1/librarian/jobs/:id` | the librarian reports what it moved |
| POST | `/api/v1/lastfm/connect` | → `{url}` to sign in on Last.fm |
| GET | `/api/v1/lastfm/callback?state&token` | Last.fm returns here (state-protected, no bearer) |
| POST | `/api/v1/lastfm/settings` | `{enabled}` turn scrobbling on/off |
| POST | `/api/v1/lastfm/flush` / `disconnect` | send now / forget the session |
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
`PLAYLIST_API_TOKEN`, `LIBRARY_SIGNALS_PATH`, `EVENTS_PATH`, `SESSION_PATH`,
`CORE_MUSIC_PATH` (default `/music`), `LASTFM_API_KEY`, `LASTFM_API_SECRET`,
`LASTFM_STATE_PATH`, `PUBLIC_URL`, `MUSICBRAINZ_CONTACT`. Organise state lives in `organise.json` and `organise-moves.jsonl` beside the playlist store. Import: `INCOMING_PATH`, `UPLOAD_MAX_MB`. The librarian: `LIBRARIAN_MUSIC_PATH`, `LIBRARIAN_INCOMING_PATH`, `RENAME_JOURNAL_PATH`, `SYNAMP_BRAIN_URL`, `SYNAMP_BRAIN_TOKEN`, `LIBRARIAN_STATE_DIR`, `LIBRARIAN_POLL_SECONDS`. Events, session and Last.fm state default to
`events.jsonl` / `session.json` / `lastfm.json` beside the playlist store. The token protects every `/api/v1` route except streams, which use
signed links derived from it.

## Next (Phase 1–2)

- Postgres + pgvector connection and migration of the interim playlist store.
- Subsonic passthrough to the library core.
- Weighted roll-ups and playlist export.
- Analyzer → brain signal export (replaces the JSON library file).
- A local LLM behind the same `validatePlan()` gate as the draft parser.
- WebSocket/SSE channel for session state (clients currently poll/refresh).
- ListenBrainz as a second scrobble target (same outbox design).

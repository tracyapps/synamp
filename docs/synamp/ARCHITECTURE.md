# SynAmp — Architecture

## 1. Reframing the project

You described two different things, and it helps to separate them:

- **A player** (the thing with a window, a playlist, and a visualizer). This is
  what Webamp is. It is the *small* part.
- **A music system** (library, scan, metadata, streaming, transcoding, smart
  playlists, AI analysis, sessions, party controls, remote access). This is the
  *large* part, and it has no UI at all.

Webamp has no server, no library, no metadata and no transcoding. So "fork
Webamp" gets you ~5% of what you asked for. The good news: the other 95% is a
solved problem in the open-source world, and you can stand on it instead of
rebuilding it.

The plan is therefore **not** "modify Webamp". It is:

> Build a **library/streaming core** that speaks Subsonic, put a **SynAmp brain**
> service next to it for intelligence and playlists, and put a **new web
> front-end** in front of both — keeping Webamp's visualizer and classic skin as
> one optional "mode".

## 2. What to keep from the Webamp fork

| Component | Verdict | Why |
|---|---|---|
| `packages/webamp` skin engine & window layout | **Keep as a mode, not the base** | Full Winamp skin support is a genuine crown jewel for nostalgia, but its layout is fixed-pixel, absolutely-positioned, and hostile to "use all my big screens". Use it for a "Classic" mode; don't build the new library UI on it. |
| Milkdrop / Butterchurn visualizer (already integrated + patched here) | **Keep — high value** | Directly delivers the "visualizers for fun" wish with almost zero work. |
| `.wsz` skin parsing / skin database | **Keep, optional** | Great for a skin gallery later; not on the critical path. |
| Playlist component | **Reference only** | Winamp's playlist is a flat list. Your needs (folders, nesting, roll-ups, 100k items) need a new model. |
| `winamp-eqf` (EQ presets), `ani-cursor` | **Keep** | Small, MIT, reusable. |
| `webamp-modern` prototype | **Ignore** | Unfinished experiment. |
| Build system (pnpm + turbo + vitest + TS) | **Keep** | Modern and sane; reuse for the new front-end. |

Net: this repo is a useful drawer of parts and a licensing-clean starting point,
but the new system will be new code.

## 3. System overview

```
                          ┌───────────────────────────────────────────┐
   Your Mac / browser ──▶ │  SynAmp Web (React + TS, responsive)      │
                          │  library · playlists · queue · DJ · party │
                          └───────────────┬───────────────────────────┘
                                          │  REST + WebSocket (session state)
   Existing native apps ──▶ ┌────────────▼────────────┐
   (play:Sub, substreamer,  │   SynAmp Brain (API)     │
    Symfonium, Feishin…)    │   playlists · AI · queue │
        │  Subsonic API     └────────────┬────────────┘
        └──────────────────────────────┐ │
                          ┌────────────▼─▼────────────┐        ┌──────────────────┐
                          │  Library Core             │◀──────▶│ Analysis Worker  │
                          │  (Navidrome)              │        │ (on your Mac /   │
                          │  scan · tags · transcode  │        │  cloud, NOT NAS) │
                          │  · Subsonic/OpenSubsonic  │        └────────┬─────────┘
                          └────────────┬──────────────┘                 │ writes
                                       │                                ▼
                                 NAS music share              ┌──────────────────┐
                                       │                      │  Brain DB        │
                                       └─────────────────────▶│  Postgres +      │
                                                              │  pgvector        │
                                                              └──────────────────┘
```

Five services, one Docker Compose stack:

1. **Library Core** — indexes the music share, serves files, transcodes on the fly, exposes Subsonic/OpenSubsonic.
2. **SynAmp Brain** — the differentiator: playlist model, AI features, session/queue state, feedback.
3. **Web front-end** — the SynAmp experience.
4. **Brain DB** — Postgres + pgvector (embeddings + rules + playlists).
5. **Edge** — reverse proxy + TLS, and Tailscale/Cloudflare for remote access.

## 4. The Library Core decision

**Recommendation: adopt Navidrome as the library core (at least initially).**

| Option | Pros | Cons |
|---|---|---|
| **Navidrome** (Go) | Mature; fast scanning of huge libraries; transcoding built in; Subsonic + OpenSubsonic; smart playlists already exist; single binary, Docker-friendly; Raspberry-Pi-class | GPL-3.0; extending it means writing Go; its playlist model won't do your folders/roll-ups |
| Write our own core (TS/Node) | Full control; one language | You rebuild scanning, tagging, transcoding, Subsonic, caching — a year of undifferentiated work before you get to any of the fun features |
| Jellyfin | Has native apps everywhere | Music model is second-class; far less hackable for this |

The pragmatic reading: **you will get to "streaming my whole library anywhere"
weeks sooner by adopting Navidrome**, and none of the features you actually care
about are blocked by it — because those features live in the Brain, which talks
to the core over an API. If the core ever becomes the constraint, the Brain's
clean boundary means we can swap it out.

If you'd rather have one language (TypeScript) everywhere and accept the
timeline cost, the alternative is a custom Node/TS core. That's a real choice,
not a wrong one — flag it and we'll decide before Phase 1.

## 5. Interop: the Subsonic bet

This is the highest-leverage decision in the whole project.

If the stack speaks **Subsonic/OpenSubsonic**, then "native app on my phone and
my computer" is *already solved*:

| Platform | Existing clients (subset) |
|---|---|
| iOS | play:Sub, substreamer, Amperfy, Symfonium (also Android) |
| Android | Symfonium, DSub, substreamer, Tempo, Ultrasonic |
| Desktop (mac/win/linux) | Feishin, Supersonic, Sonixd |
| Car | CarPlay / Android Auto via the above |

Consequences:

- Playback on phone/desktop works **before SynAmp's own UI is polished**.
- CarPlay/driving is covered for free.
- Offline sync / downloads are covered for free.

What those third-party apps **won't** have: the AI playlists, nested/roll-up
playlists, DJ mode, party tools. That's fine — that's exactly what draws you to
the SynAmp web app. Design intent: **the Brain exports ordinary Subsonic
playlists**, so even a third-party client sees your generated playlists; the
advanced ones are simply consumed through SynAmp's own UI.

## 6. The Brain — the differentiator

This is where "analyze, categorize, tag, organize, clean up 4,000 artist
folders" and "make me a playlist that feels like these two Ani DiFranco songs"
become real.

### 6.1 The hard constraint: the NAS cannot do this

Synology NAS boxes have low-power CPUs and **no usable GPU**. Running audio
embedding models or LLMs on the NAS would take days for 100k tracks and would
fight the file-serving workload.

**Design rule: analysis is offline and off-box.** The Brain DB and the serving
path live on the NAS; the *worker* runs wherever there's compute — your Mac
(Apple Silicon is excellent for this), a spare machine, or a cloud GPU you rent
by the hour. Results are just data, so they sync trivially.

### 6.2 Multi-signal library intelligence

No single technique answers your prompts. The design is a **fusion** of several
signals, each stored per track:

| Signal | Source | Answers |
|---|---|---|
| **Audio embeddings** (512-d) | CLAP / music2vec-class models | "sounds like *Fire Door*"; free-text vibe queries |
| **Audio features** | Essentia / Discogs-EffNet / musicnn | BPM, key, energy, danceability, mood, "no words" (instrumental score), instrument presence (**piano detection**) |
| **Existing tags** | file metadata | genre, year, artist — cheap, already there |
| **Lyrics** | LRCLIB / Genius + embeddings | themes like "revolution, social justice, feminist" |
| **Artist metadata** | MusicBrainz | relationships, gender (best-effort), era, scene |

Then an **LLM layer** turns your natural language into a structured query over
those signals. Your examples map cleanly:

> "ambient focus, no words, no piano, high energy, less meditative"
> → CLAP text-embedding match + `instrumental=high` + `piano=low` +
> `energy=high` + `mood=negative(meditative)`.

> "revolution / social justice / free palestine / feminist, mostly female
> artists, no punk"
> → lyrics-embedding similarity + `gender=female` boost +
> `genre≠punk` exclusion.

> "songs with a similar feel to Ani DiFranco's *Hat Shaped Hat* and *Fire Door*"
> → pure audio-embedding nearest-neighbour to those two specific tracks. This
> captures the *specific sonic character of those recordings*, which is exactly
> what you asked for (and why it correctly won't pull in *Subdivision*).

**Honest caveat:** "mostly female artists" is the weakest signal. Gender is
not reliably inferrable from audio or metadata and any model that claims to is
error-prone. Treat it as a soft ranking boost with a manual override, and say so
in the UI. Don't promise it as a filter you can trust.

### 6.3 Feedback loop (thumbs / skip / remove)

Every signal you named becomes training data:

- 👍 / 👎 → per-playlist affinity vector + explicit positive/negative exemplars.
- "remove from this playlist" → hard negative for *that* playlist.
- Skip-within-N-seconds → implicit negative; full play-through → implicit positive.
- 👍 can also **expand** the playlist: nearest-neighbour around the liked track.

Start simple (adjust the query embedding + a boost/penalty re-ranker). Only
graduate to a learned re-ranker once there's real feedback volume. This keeps v1
explainable — you can see *why* a track is in the list.

### 6.4 Auto-updating

A filesystem watcher on the music share triggers incremental indexing. New files
are queued for analysis; as embeddings arrive they become eligible for playlists
**immediately, with no restart or refresh**. This is a first-class requirement,
not an afterthought: the queue and the "playlist is a live query" model have to
be designed in from the start.

### 6.5 Storage

- **Brain DB: Postgres + pgvector.** 100k tracks × 512 floats ≈ 200 MB of
  vectors — trivial. pgvector gives you ANN search with no extra service.
- Lighter alternative if you want zero DB server: **SQLite + sqlite-vec** (single
  file, trivial backup). Fine for one writer, worse with concurrent workers.
- Recommendation: Postgres, because the Brain will have a web UI + workers +
  background jobs all touching it.

## 7. Playlist data model (the heavyweight feature)

Your requirements: dozens→hundreds of playlists, nested folders, "roll-up"
aggregates that randomize across a folder subtree, and dynamic/rule-based lists.

Model it as a **tree of nodes**, each node one of:

```
Node = Folder  { children: Node[] }                       // pure container
     | Playlist{ entries: (TrackRef | NodeRef)[], order }  // ordered / manual
     | Smart   { rules: Rule[], live: true }               // rule-driven, cached
     | Rollup  { source: NodeRef, mode: merge|shuffle|interleave|weighted }
```

- **`Rollup` is recursive**: a roll-up of a folder containing folders containing
  roll-ups resolves to the union of everything beneath it, with the chosen mode.
  This is exactly "randomize all the songs of all the playlists within a folder,
  which might itself be in a folder".
- **Smart playlists** hold rules (`bpm 90..110 AND instrumental>0.9 AND mood≠calm`)
  and are re-evaluated on library change — so they inherit the auto-update
  behaviour you asked for.
- **Export**: materialize any node as a plain Subsonic playlist so third-party
  clients can see it.
- **UI**: a file-manager-style tree (multi-column, drag/drop, multi-select) with
  **virtualized lists** — non-negotiable at 100k rows; a naive DOM will die.

Note: Navidrome already has *smart playlists* via `.nsp` JSON files, but no
folder nesting and no roll-ups. So the authoritative playlist model lives in the
Brain; Navidrome's engine is a useful reference, not the owner.

## 8. Streaming, transcoding, and remote access

- **Local**: serve the original file directly. Lossless stays lossless.
- **Remote**: transcode on the fly (Subsonic's `maxBitRate`, ffmpeg in the
  container). Your home *upload* bandwidth is the bottleneck — remote streaming
  of FLAC is usually impossible. Plan for ~192–320 kbps (Opus/AAC) remotely,
  and make quality a per-network setting.
- **Remote access options**:
  - **Tailscale** (recommended for you): private, device-level, no port
    forwarding, free personal tier, works from your phone/Mac as if on-LAN.
  - **Cloudflare Tunnel**: better if you want a public URL, guest access, or
    you're behind CGNAT/carrier NAT. Slightly more setup and a third party in the
    path.
  - **Synology QuickConnect / port-forward**: avoid; weakest security story.
- **Guest/party traffic** should be a *separate, restricted* route (LAN-scoped or
  token-scoped), never the admin surface.

## 9. Playback engine (browser)

- Use a real `<audio>` element for streaming (supports HTTP range requests;
  don't fetch-and-decodeArrayBuffer). Use the Web Audio API for EQ, gain,
  visualizer, and scheduling.
- **Gapless**: classic dual-`<audio>`-element ping-pong, or MediaSource for
  tighter control.
- **Crossfade**: dual elements with a gain ramp — straightforward.
- **DJ mode** (the hard one): needs pre-analysed **BPM + key** to pick
  harmonically compatible tracks (Camelot wheel) and beat-match.
  - Tempo-align with a *pitch-preserving* time-stretch (SoundTouch / rubberband-wasm),
    not `playbackRate` (which shifts pitch).
  - "Skip mid-song and blend seamlessly" = run the same transition machinery on
    an interrupt, not a hard cut.
  - Browser beat-matching is genuinely hard; for the highest quality, an
    optional **server-side pre-rendered mix** (ffmpeg) is the fallback.

## 10. Online radio

- **Radio Browser API** (`radio-browser.info`) — free, community-driven, ~50k+
  stations, JSON REST, searchable by country/genre/tag/bitrate. This is
  functionally the same thing your Bose SoundTouch's directory did.
- Support user-added stream URLs (Icecast/Shoutcast/HTTP AAC/MP3) and favorites.
- **Now-playing metadata** for streams comes over ICY; proxy stream requests
  through the server to dodge CORS and to normalise it.
- Radio should be a first-class "source" alongside the local library, so it can
  live in playlists and the queue.

## 11. Sessions, party tools, DJ display

**Architectural rule: the server owns the playback session.**

Define a `Session { nowPlaying, queue, history, controls, participants }` on the
brain, and drive *every* client from it over WebSocket/SSE. The host, a guest's
phone, and a wall-mounted DJ display are then all just thin views of the same
state.

Do this **early, even before the party features exist** — if state lives in the
browser instead, party tools become a painful retrofit.

Then:

- **Guest requests**: a separate lightweight route (`/party/<token>`), LAN-scoped
  or token-scoped, no login friction, reached by a printed QR code. Search +
  request + maybe upvote.
- **DJ display**: a separate `/display` route optimised for a big screen — large
  now-playing, up-next, queue reorder, transport. Anyone can "play DJ"; the host
  can lock it down.
- Because both are thin clients of the shared session, they work on an old iPad
  or a spare monitor with a browser and nothing else installed.

## 12. Clients

| Client | Strategy |
|---|---|
| **Web** | The main deliverable: React + TS, responsive, virtualized, themeable. |
| **Desktop (menu bar)** | **Tauri** shell around the web app. Gives the brain.fm-style tray/menu-bar mini-player, global media keys, launch-at-login, ~2.5 MB installer. (Webamp Desktop already proves the Electron route; Tauri is the smaller, better version.) |
| **Mobile** | Phase 1: **existing native Subsonic apps** (see §5). Phase 2: own app (React Native/Expo or Tauri Mobile) — only if the web experience proves something the existing apps can't do. Note: iOS PWAs are unreliable for background audio, so don't plan on a PWA for the phone. |
| **Car** | Via the existing Subsonic apps (CarPlay/Android Auto). |

This is why native apps go on the roadmap rather than the critical path: **you
already get them**, and your scarce effort should go where nothing exists yet.

## 13. Skins & layout

Two modes, deliberately:

- **Modern** (default): responsive, fluid, themeable. CSS custom-property design
  tokens. Built for 100k-item libraries on large screens. This is where the
  library/playlist work happens.
- **Classic** (optional): the original fixed-size Winamp skin, powered by the
  existing Webamp skin engine. Pure nostalgia, not the daily driver.

You said exactly this: flexible sizing matters more than `.wsz` compatibility. So
we do **not** make the absolute-positioned winamp skin system the base — we offer
it as a mode.

## 14. Visualizers

- **Butterchurn / Milkdrop** — keep, already integrated and patched in this repo.
- The **SoundJam "floating rainbow circles"** memory is worth recreating as a
  small custom WebGL/Canvas visualizer (or hunting a similar Milkdrop preset).
  Treat as a fun side quest, not a milestone.

## 15. Deployment on Synology

A single **Docker Compose** stack via DSM's Container Manager:

```yaml
services:
  edge:      # Caddy/nginx: TLS + reverse proxy
  web:       # SynAmp front-end (static build)
  brain:     # SynAmp API: playlists, AI, session
  core:      # Navidrome (Subsonic) — music share mounted read-only
  db:        # Postgres + pgvector (brain state)
  # worker:  # analysis — runs on your Mac/cloud, NOT here
```

- Mount the music share **read-only** into `core` (and, if needed for tagging,
  read-write into the worker only).
- ffmpeg ships inside the container for transcoding; Intel Synology boxes can do
  VA-API hardware transcode, but that's a later optimisation.
- Packaging for other Synology users later = shipping this compose file + a
  wizard, which is why the clean service split matters now.

## 16. Constraints & risks

| Risk | Impact | Mitigation |
|---|---|---|
| NAS lacks GPU/CPU for AI | Analysis infeasible on-device | Off-box worker; results are just data |
| Home upload bandwidth | Remote lossless impossible | Transcode remotely; per-network quality presets |
| Messy metadata on 100k files | AI prompts misfire | Bootstrap with a metadata pass (beets/Picard) *before* the semantic layer |
| Gender inference ("female artists") | Unreliable | Soft boost + manual override; never promise as a hard filter |
| Third-party clients don't show AI features | Feature gap on phone initially | Export plain playlists to Subsonic; SynAmp web/app carries the advanced UI |
| Browser DJ-mode quality | Beat-matching is hard | Interruptible crossfade first; server-side mix rendering for the top tier |
| Auto-update expectation | Playlists must react to new files live | Design the queue + "playlist = live query" model from the start |

## 17. Licensing (matters because you may release this)

| Component | License | Implication |
|---|---|---|
| Webamp | **MIT** | Clean to reuse and redistribute. |
| Butterchurn | MIT | Clean. |
| Navidrome | **GPL-3.0** | Fine to self-host. If you *distribute* a modified product that includes it, GPL obligations apply (source availability). |
| Essentia | **AGPL-3.0** | Strongest: AGPL's network clause can trigger if you offer the service to others over a network. Use the models as a separate service, or pick permissively-licensed models, if you plan to distribute. |
| Radio Browser | Data, community | Attribute; be a good citizen (cache, don't hammer). |

None of this blocks a personal, self-hosted SynAmp. It only matters if you
publish a Synology package for others — decide the licence strategy **before**
you build the AI layer, because swapping the analysis stack later is expensive.

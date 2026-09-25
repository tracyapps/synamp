# SynAmp — Roadmap

Sequencing principle: **get you off your streaming subscriptions as early as
possible**, then build the things that don't exist anywhere else.

The "replace Spotify/Apple Music/whatever" milestone is deliberately **Phase 1**,
not the end — because that only needs library + player + remote access, and
every one of those has a mature open-source answer. The differentiators (AI
library intelligence, roll-up playlists, DJ mode, party tools) come after, and
the architecture is designed so they slot in without rework.

Legend: 🎯 goal · 📦 deliverables · ✅ done-when · ⚠️ risk

---

## Phase 0 — Foundations and the two real decisions

🎯 Agree the shape of the system before writing the app.

📦
- Decide **library core**: adopt Navidrome vs build a custom Node/TS core (§4 of ARCHITECTURE).
- Decide **licence strategy** (§17) — it changes what analysis stack we may use.
- Reset the repo: retain `packages/webamp`, `packages/ani-cursor` and
  `packages/winamp-eqf` as a parts drawer, retire the rest of the fork, and
  scaffold the new app packages (`web`, `brain`, `worker`) alongside.
- Stand up the Docker Compose skeleton (edge, web, core, db).

✅
- A `docker compose up` on the Mac serves Navidrome against a sample folder and a
  Subsonic client can connect and play.
- The three decisions above are written down.

⚠️ Don't over-scaffold. Phase 0 is a weekend, not a month.

---

## Phase 1 — "Cancel the subscriptions" (the milestone that matters)

🎯 Stream your real library, anywhere, on all your devices.

📦
- Navidrome (or custom core) scanning the **real** NAS music share.
- Remote access via **Tailscale**; verify from phone on cellular.
- Transcoding profiles: original on LAN, ~256 kbps on WAN.
- Install 2–3 **existing Subsonic native apps** (one iOS, one desktop) and
  confirm playback, background audio, lock-screen controls, CarPlay.
- Subsonic playlist import so your existing playlists come across.

✅
- You play your own music from your phone on cellular and from your Mac at home.
- You can delete (or downgrade) a streaming subscription without losing access
  to your music.
- A third-party native app plays your library with working lock-screen controls.

⚠️ Upload bandwidth; metadata quality on a 4k-artist library (expect a cleanup
pass — see Phase 3, but a `beets`/Picard pass may be needed here first).

**This is the phase that changes your life. Everything after it is upside.**

---

## Phase 2 — The playlist system that scales

🎯 Playlists as good as (better than) the old Winamp experience, at library scale.

📦
- Playlist **tree model**: folders, nesting, ordering, drag/drop, multi-select.
- **Roll-up playlists** with `merge | shuffle | interleave | weighted` modes.
- Smart/rule-based playlists (BPM, key, energy, mood, instrumental, piano…).
- **Virtualized** list rendering (100k rows).
- Export to Subsonic playlists so native apps can see them.
- A **SynAmp web player** (the new front-end) — library browse, playlists, queue.

✅
- You build a folder of a dozen playlists, drop a roll-up on top, hit shuffle, and
  it correctly randomises across everything beneath it (recursively).
- Scrolling a 100k-track library is smooth.

⚠️ Playlist-tree performance and drag/drop UX are the real work here, not the DB.

---

## Phase 3 — The Brain v1: library intelligence

🎯 The thing no one else has: "make me a playlist that sounds like X".

📦
- **Analysis worker** (on the Mac/cloud, **not** the NAS) producing per track:
  - audio embeddings (CLAP-class)
  - BPM, key, energy, danceability, mood
  - instrumental/"no words" score, instrument presence (**piano**)
  - lyrics text + lyric embeddings
- **Brain DB** (Postgres + pgvector) + resumable job queue for 100k+ tracks.
- **Natural-language → structured query** LLM layer.
- "Sounds like these two specific tracks" via embedding nearest-neighbour.
- **👍/👎, skip, remove-from-playlist** capture + a simple, *explainable*
  re-ranker.
- **Live updates**: new files analysed in the background appear in playlists with
  no refresh.
- Show *why* each track is included (this is what makes it trustworthy).

✅
- "ambient focus, no words, no piano, more energetic" returns a credible list.
- "similar feel to Hat Shaped Hat + Fire Door" returns tracks that are *sonically*
  close and excludes the wrong-Ani tracks.
- Adding an album to the NAS surfaces it in smart playlists without a restart.

⚠️ First analysis pass on a large library is hours-to-days; **design the queue to
be resumable and to run incrementally** from day one. Gender inference must ship
as a soft, overridable boost, not a trustworthy filter.

---

## Phase 4 — Quick wins: radio + visualizers

🎯 Cheap, high-delight features, delivered in parallel with heavier phases.

📦
- **Radio Browser** integration: search ~50k stations by country/genre/tag,
  favourites, user-added stream URLs, ICY now-playing (proxied to avoid CORS).
- Radio as a first-class source in playlists and the queue.
- **Butterchurn/Milkdrop** visualizer re-enabled in the new UI (reuse from the
  fork).
- Optional custom visualizer (the SoundJam rainbow-circles memory).

✅
- You find and play a world radio station the way SoundTouch used to let you.
- Visualizers work in the modern UI.

⚠️ Essentially none — this is the "have fun" phase.

---

## Phase 5 — Gapless, crossfade, DJ mode

🎯 Seamless listening; party-grade transitions.

📦
- Gapless playback (dual-element / MSE).
- Crossfade with configurable duration and curve.
- **DJ mode**: BPM + key harmonic matching (Camelot), pitch-preserving tempo
  alignment, energy-aware ordering.
- **Interruptible transitions**: skipping mid-song crossfades smoothly instead of
  cutting.

✅
- A DJ-mode set with no audible gaps at track boundaries.
- Mid-song skip blends rather than jumps.

⚠️ Browser beat-matching quality is the risk; optional server-side ffmpeg mix
rendering is the quality fallback.

---

## Phase 6 — Party tools

🎯 Host a party where guests request songs from their phones.

📦
- **Server-owned session** (this must already exist from Phase 2 — verify).
- **Guest request** page at `/party/<token>`, reached by a printed QR code;
  LAN- or token-scoped; search + request (+ upvote).
- **DJ display** at `/display`: big-screen now-playing, up-next, reorder,
  transport; host lock/unlock.
- Optional: guest app (iOS/Android) with search history and favourites.

✅
- A guest scans the wall QR, requests a song, and it appears in the host queue.
- An old iPad on `/display` can reorder and skip.

⚠️ Scope creep magnet. Ship the thin version, watch what people actually use.

---

## Phase 7 — Native clients & distribution

🎯 Menu-bar player; own mobile app; maybe a Synology package for others.

📦
- **Tauri desktop app**: tray/menu-bar mini-player (the brain.fm pattern), global
  media keys, launch-at-login.
- **Mobile app** (React Native/Expo or Tauri Mobile) — only if the existing
  Subsonic apps leave a real gap.
- **Synology package**: publishable Compose stack + installer wizard.

✅
- A SynAmp icon in your Mac menu bar that starts music in one click.
- (Optional) someone else installs SynAmp on their Synology without your help.

⚠️ Distribution drags licensing (GPL/AGPL) to the front — that's why Phase 0
decides it.

---

## Cross-cutting, must-not-be-deferred

These are the things that are cheap now and painful if retrofitted:

1. **Server-owned session state** (needed by party tools, DJ display, multi-room).
2. **"Playlist = live query"** so new files appear without a refresh.
3. **Resumable, incremental analysis queue.**
4. **Virtualized list UI** from the first render of a big library.
5. **Clean service boundary** between Library Core / Brain / Web → keeps the core
   swappable and makes the Synology package possible.

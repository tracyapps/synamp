# SynAmp — Decision Log

Accepted decisions and the hardware baseline they were made against.
Status: **Phase 0**. Anything marked *(provisional)* can be revisited.

## Hardware baseline (as supplied 2026-09-23)

| Role | Spec |
|---|---|
| **NAS** | Synology **DS1825+**, AMD **Ryzen V1500B** (x86-64, 4C/8T, **no iGPU**), DSM **7.4.1-90080** |
| **Library** | **274 GB**, **45,739 files** (growing — more to be added) |
| **Brain machine** | MacBook Pro (Nov 2024), **Apple M4 Pro**, **48 GB**, macOS Tahoe 26.6.2 |
| **Network** | **1 Gbps symmetric** fiber (measured slightly above) |

### What this changes

- **x86-64 on the NAS is good news.** Standard `amd64` Docker images run natively;
  no ARM build friction for Navidrome, Postgres/pgvector, Caddy, ffmpeg.
- **No iGPU → no hardware transcode.** Irrelevant here: that only matters for
  *video*. **Audio** transcoding is cheap — a 4C/8T V1500B will serve and
  transcode several simultaneous audio streams without breaking a sweat.
- **274 GB / ~45.7k files is a modest library.** Everything fits comfortably; the
  first full analysis pass on the M4 Pro is **hours, not days**. Good — we can be
  generous with model quality.
- **1 Gbps symmetric** means remote streaming of even large lossless files is
  genuinely viable. Transcoding stays in the plan for mobile-data and weak-uplink
  clients, but we are not forced into low bitrates.
- **M4 Pro + 48 GB** can host the analysis pipeline *and* a local LLM for the
  natural-language→query layer. That keeps prompt/library data private and avoids
  per-query API cost.

## Decisions

### D1 — Library core: adopt **Navidrome** *(accepted)*
Scanning, tagging, transcoding and the Subsonic API are solved, undifferentiated
work. Stand on Navidrome; layer SynAmp on top. Keep the service boundary clean so
the core stays swappable.
*Revisit if:* Navidrome's data model blocks a Brain feature badly enough that
forking it is cheaper than the workaround.

### D2 — Interoperability: speak **Subsonic/OpenSubsonic** *(accepted)*
This is what makes "native apps on Mac and phone" a solved problem instead of a
build. Existing clients (play:Sub, substreamer, Symfonium, Feishin, …) get
playback, lock-screen, CarPlay and offline for free. The Brain exports ordinary
Subsonic playlists so even third-party clients see generated playlists.

### D3 — Native apps: **use existing clients; build our own shells later** *(accepted)*
Do not build iOS/Android/desktop players from scratch now. Phase 7 adds a **Tauri**
menu-bar desktop shell (the brain.fm pattern) and a mobile app only if a real gap
appears. Note: iOS PWAs cannot reliably do background audio, so a PWA is not the
phone strategy.

### D4 — Analysis compute: **off-NAS, on the M4 Pro** *(accepted)*
The NAS has no GPU. The analysis worker runs on the Mac (or cloud) and writes
plain data into the Brain DB. Design it as an **offline, resumable, incremental**
job queue so it tolerates interruption and runs in the background.

### D5 — Remote access: **Tailscale** *(accepted)*
Private, device-level, no port forwarding, free personal tier. **Cloudflare
Tunnel** is the later option if a public/guest URL is ever needed (the party
request page can be handled separately and LAN/token-scoped).

### D6 — Licensing strategy *(provisional)*
Personal self-hosting is unaffected by any of this. But because a Synology package
for others is a stated future goal:
- Reusable with care: Webamp (**MIT**), Butterchurn (**MIT**) — clean.
- **Navidrome is GPL-3.0**; **Essentia is AGPL-3.0.** AGPL's network clause is the
  sharp edge.
- Working position: **prefer permissively-licensed models**; keep AGPL components
  out of any *network-offered* serving path; treat heavy analysis as offline
  build-time tooling whose *outputs* (data) are what ship.
- **Decide properly before distributing.** Swapping the analysis stack later is
  expensive, so do not bake an AGPL dependency into the serving path.

### D7 — Repository layout *(accepted)*
Product monorepo; the Webamp fork is kept intact as a source of parts (Classic
mode + Butterchurn) rather than the foundation.

```
apps/web          SynAmp front-end (React + TS + Vite)
apps/brain        SynAmp API (Node + TS) — playlists · AI · session state
services/analyzer Analysis worker (Python) — runs on the Mac, not the NAS
packages/*        Webamp fork — kept as-is (Classic mode + Milkdrop)
tools/roadmap     Markdown → single-file HTML roadmap generator
deploy/           docker-compose stack for the Synology
docs/synamp/      This plan
docs/roadmap/     Generated visual roadmap
```

## Open items (not blocking)

- Final licence pass before any distribution (D6).
- Whether the Brain DB is Postgres+pgvector (recommended) or SQLite+sqlite-vec.
- ffmpeg hardware acceleration on the V1500B — irrelevant for audio; skip.
- Party-request page: token-scoped vs LAN-scoped — decide in Phase 6.

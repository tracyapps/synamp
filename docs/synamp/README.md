# SynAmp — Plan & Decisions

> Status: research/architecture draft (v0.1). This is the source of truth for
> scope decisions. Everything here is a proposal to react to, not a commitment.

## TL;DR — the one big finding

**You do not need to build native apps.**

There is an existing, standardized wire protocol for "my own music server":
**Subsonic / OpenSubsonic**. Every serious self-hosted music server speaks it,
and — more importantly — **dozens of polished native players already exist**
that speak it on iOS, Android, macOS, Windows, Linux, plus CarPlay/Android Auto.

So the plan is: build **one great web app** + **one smart server**. The server
also speaks Subsonic. Your phone and your Mac then get *real native apps on day
one* (you just pick a favorite client), and all your effort goes into the parts
that don't exist anywhere else — the library intelligence, the playlist system,
and the DJ/party experience.

The second finding: **Webamp is MIT-licensed (clean to reuse)** but it is only a
*player UI*. It contains no server, no library, no streaming, no metadata. Almost
everything you asked for is server-side or library-side, so treat Webamp as a
source of components (mainly the Milkdrop visualizer) rather than a foundation.

## Decisions at a glance

| # | Question | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | Native apps on Mac/phone? | **Don't build them.** Speak Subsonic and use existing clients (play:Sub, substreamer, Amperfy, Symfonium, Feishin…). Build your own only for the menu-bar mini-player and later mobile niceties. | High |
| 2 | Build the library server from scratch? | **No.** Stand on a mature Subsonic server (Navidrome) for scan/transcode/stream, and layer SynAmp on top. Rebuilding a scanner + transcoder + Subsonic API is a year of undifferentiated work. | High |
| 3 | Where does the AI run? | **Not on the NAS.** Synology CPUs have no usable GPU. Run analysis on your Mac (or cloud) and sync the results. Design it as an offline, resumable pipeline. | High |
| 4 | Remote access | **Tailscale** for you personally (private, zero-config, no port-forwarding). Cloudflare Tunnel later if you want a public/guest URL. | High |
| 5 | Webamp as the foundation? | **Partly.** Keep Butterchurn (Milkdrop visualizer) and optionally the classic skin as a nostalgia *mode*. Do not build the new UI on its fixed-pixel skin layout. | High |
| 6 | Desktop "menu bar" player | **Tauri** wrapper around the SynAmp web app. ~2.5 MB installer vs ~85 MB for Electron. | Medium-High |
| 7 | Mobile playback | Use **existing native Subsonic apps**. iOS PWAs cannot reliably do background audio (WebKit bug 198277), so a PWA is the wrong tool for phone playback. | High |
| 8 | Data model for playlists | Own it in a **SynAmp "brain" service** (own DB), export to Subsonic playlists so third-party clients see them. | Medium-High |
| 9 | Online radio | **Radio Browser API** (radio-browser.info) — free, community, ~50k stations, JSON REST. This is exactly what Bose SoundTouch's directory was. | High |
| 10 | Licensing caution | Reusing **Navidrome (GPL-3.0)** and **Essentia (AGPL-3.0)** has implications *if you distribute this to other people*. MIT/self-host-only is fine. | High |

## Open questions for you

1. **Which Synology model do you have?** This determines CPU, RAM, and whether
   hardware transcoding is available. It also tells us how big the analysis
   offload has to be.
2. **Rough size of the library** — you mentioned 4,000+ artist folders. Track
   count and total TB matter for indexing and for how long the first AI pass runs.
3. **What Mac do you have (Apple Silicon?)** — it may be a great place to run the
   analysis pipeline and even to host the "brain" during development.
4. **Upload bandwidth at home** — remote streaming of lossless files needs a lot;
   this decides how aggressive transcoding must be.
5. Do you want to start building after this, or keep iterating on the plan first?

**Hardware baseline resolved (2026-09-23):** DS1825+ / Ryzen V1500B (x86-64, no
iGPU) · 274 GB / 45,739 files · M4 Pro MacBook Pro 48 GB as the brain machine ·
1 Gbps symmetric fiber. See [`DECISIONS.md`](./DECISIONS.md#hardware-baseline-as-supplied-2026-09-23).

## Read next

- [`DECISIONS.md`](./DECISIONS.md) — accepted Phase 0 decisions + hardware baseline
- [`STORAGE-LAYOUT.md`](./STORAGE-LAYOUT.md) — proposed NAS share layout + migration steps
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the system fits together
- [`ROADMAP.md`](./ROADMAP.md) — phased plan, with the "replace my streaming
  services" milestone deliberately early
- [`../roadmap/index.html`](../roadmap/index.html) — generated visual roadmap
  (built from `ROADMAP.md`; run `pnpm roadmap:build` to regenerate)

## Sources consulted (this session)

Background reading that backs the recommendations above:

- Subsonic client ecosystem & smart playlists — navidrome.org; subsonic.org (Subsonic Apps);
  apps.apple.com (SubStreamer)
- Desktop clients — github.com/jeffvli/sonixd; wiki.archlinux.org (Feishin);
  discourse.flathub.org (Supersonic)
- Audio analysis / auto-tagging — essentia.upf.edu; github.com/MTG/essentia;
  transactions.ismir.net (Essentia.js); cyanite.ai; arxiv.org (music autotagging);
  themusicase.com (CLAP embeddings); beets.readthedocs.io
- Metadata cleanup — community.metabrainz.org; popsci.com (MusicBrainz Picard)
- Online radio directory — news.ycombinator.com (radio-browser JSON, ~50k stations);
  publicapis.io; apis.io
- Remote access — needtoknowit.com.au; wundertech.net; xda-developers.com; synoforum.com
- Desktop shell — tech-insider.org; levminer.com; gethopp.app
- iOS PWA limits — bugs.webkit.org (#198277); magicbell.com
- Licensing — dev.co (Navidrome GPL-3.0); privacytools.io

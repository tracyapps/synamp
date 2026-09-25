# SynAmp — Plan & Decisions

> Status: Phase 0 decisions accepted. This document is the source of truth for
> scope decisions; the accepted calls live in [`DECISIONS.md`](./DECISIONS.md)
> and the sections below are the reasoning behind them.

## How this plan changed

This project began as a fork of Webamp, a browser reimplementation of Winamp,
on the assumption that the music app would be grown out of it. Surveying the
ecosystem changed the shape of the plan:

- **Webamp is only a player UI** — no server, no library, no scanning, no
  metadata, no streaming, no transcoding. Forking it reaches a small fraction of
  the goal, so "modify Webamp" was the wrong shape for the project.
- **Subsonic/OpenSubsonic already solved "talk to my own music server"** — it is
  a de-facto standard, with polished native clients already available for phone
  and desktop (play:Sub, substreamer, Symfonium, Feishin, …) including
  CarPlay/Android Auto. Native apps never needed to be written.
- **Navidrome already solved the library core** — scan, tag, transcode and the
  Subsonic API are years of undifferentiated work that did not need redoing.

So the plan moved from *"modify Webamp"* to *"build a music system that keeps
Webamp's parts as components"*: the classic skin engine as an optional Classic
mode, and the Milkdrop/Butterchurn visualizer, reused rather than rebuilt. The
upstream-only packages that came with the fork — demo site, documentation site,
skin database, social-preview generator, modern-skin prototype, examples — have
been removed from this repository. What remains from the fork is a small parts
drawer: `packages/webamp`, `packages/ani-cursor`, `packages/winamp-eqf`.

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

## Hardware baseline (resolved)

Every question this section used to ask is answered, and the answers are the
baseline that each decision here was made against:

| Role | Spec |
|---|---|
| NAS | Synology DS1825+, AMD Ryzen V1500B (x86-64, no iGPU), DSM 7.4.1-90080 |
| Library | 274 GB / 45,739 files (growing) |
| Brain machine | MacBook Pro, M4 Pro, 48 GB |
| Network | 1 Gbps symmetric fiber |

See [`DECISIONS.md`](./DECISIONS.md#hardware-baseline-as-supplied-2026-09-23)
for what each of these implies for the design.

## Read next

- [`DECISIONS.md`](./DECISIONS.md) — accepted Phase 0 decisions + hardware baseline
- [`STORAGE-LAYOUT.md`](./STORAGE-LAYOUT.md) — proposed NAS share layout + migration steps
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the system fits together
- [`ROADMAP.md`](./ROADMAP.md) — phased plan, with the "replace my streaming
  services" milestone deliberately early
- [`../roadmap/index.html`](../roadmap/index.html) — generated visual roadmap
  (built from `ROADMAP.md`; run `pnpm roadmap:build` to regenerate)

## Sources consulted

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

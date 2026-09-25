# SynAmp

A self-hosted music system for one person's library: your files, your hardware,
no streaming subscription. SynAmp runs on a Synology NAS and aims to add the
things off-the-shelf music servers don't have — natural-language playlists,
roll-up playlists, a DJ mode, and party tools — on top of a mature library core.

## Origin and pivot

This project started as a **fork of [Webamp](https://github.com/captbaritone/webamp)**,
a browser reimplementation of Winamp, on the assumption that the music app would
be grown out of it. Surveying the ecosystem changed that plan:

- **Webamp is only a player UI.** It has no server, no library, no scanning, no
  metadata, no streaming and no transcoding. Forking it reaches a small fraction
  of the goal, so "modify Webamp" was the wrong shape for the project.
- **Subsonic/OpenSubsonic already solved "talk to my own music server".** It is a
  de-facto standard wire protocol, and polished native clients already exist for
  phone and desktop — play:Sub, substreamer, Symfonium, Feishin and more,
  including CarPlay/Android Auto. There was no reason to write native apps.
- **Navidrome already solved the library core.** Scanning, tagging, transcoding
  and the Subsonic API are years of undifferentiated work that did not need
  redoing.

So the plan pivoted from *"modify Webamp"* to *"build a music system that keeps
Webamp's parts as components"*: the classic skin engine as an optional Classic
mode, and the Milkdrop/Butterchurn visualizer, reused rather than rebuilt. The
upstream-only packages that came with the fork — the demo site, the documentation
site, the skin database, the social-preview generator, the modern-skin prototype
and the usage examples — have been **removed from this repository**, because
nothing here uses them and they only obscured what the project now is. The full
fork history remains in git, and upstream is one remote away.

The plan itself, including the decisions this pivot rests on, is in
[`docs/synamp/`](docs/synamp/README.md).

## What it is made of

| Part | Where | Role |
|---|---|---|
| Library core | `deploy/` (Navidrome, PostgreSQL + pgvector) | Scan, tag, transcode, stream; speaks Subsonic/OpenSubsonic to native clients |
| SynAmp brain | `apps/brain` | Playlists, library intelligence, the authoritative playback session |
| SynAmp web | `apps/web` | The new front-end: library, playlists, queue, later DJ and party views |
| Analysis worker | `services/analyzer` | Off-NAS audio analysis (embeddings, BPM/key, mood). **Runs on the brain machine, not the NAS** |
| Parts drawer | `packages/webamp`, `packages/ani-cursor`, `packages/winamp-eqf` | Retained fork pieces: classic skin engine, `.ani` cursors, Winamp `.eqf` parsing |
| Tooling | `tools/roadmap` | Generates the visual roadmap from `docs/synamp/ROADMAP.md` |

The NAS is a Synology DS1825+ (AMD Ryzen V1500B, x86-64, no GPU). Anything that
needs a GPU runs on a separate "brain machine" instead.

## Development

Requires Node.js ≥ 22 and pnpm 9.

```bash
pnpm install

pnpm brain:dev    # API on :3001
pnpm web:dev      # UI on :5173 (Vite proxies /api and /health to the brain)
```

The brain has no build step — Node strips the TypeScript types at runtime. The
web app is type-checked and bundled with Vite.

```bash
pnpm type-check        # brain, web, and the retained packages
pnpm --filter @synamp/web build
pnpm roadmap:build     # regenerate docs/roadmap/index.html from the roadmap markdown
```

## Deploying

The NAS stack is Docker Compose: Navidrome plus PostgreSQL always, and the
brain/web/edge services behind an `app` profile. See
[`deploy/README.md`](deploy/README.md) for the layout, the one-time DSM setup and
the gotchas that only show up on Synology.

## Documentation

- [`docs/synamp/README.md`](docs/synamp/README.md) — plan, TL;DR and the decision table
- [`docs/synamp/DECISIONS.md`](docs/synamp/DECISIONS.md) — accepted decisions and the hardware baseline
- [`docs/synamp/ARCHITECTURE.md`](docs/synamp/ARCHITECTURE.md) — full system design
- [`docs/synamp/ROADMAP.md`](docs/synamp/ROADMAP.md) — phased plan
- [`docs/synamp/STORAGE-LAYOUT.md`](docs/synamp/STORAGE-LAYOUT.md) — NAS share layout
- [`docs/roadmap/index.html`](docs/roadmap/index.html) — generated visual roadmap
- [`deploy/README.md`](deploy/README.md) — deploying and operating the NAS stack

## Lineage and licence

The code in this repository is released under the [MIT License](LICENSE.txt). It
is a fork of [captbaritone/webamp](https://github.com/captbaritone/webamp) —
thank you to Justin Frankel and everyone at Nullsoft for Winamp, and to
captbaritone for the Webamp reimplementation. The Winamp name, interface and
sample audio file remain the property of Nullsoft.

Personal self-hosting is unaffected by third-party licensing, but the stack does
depend on **Navidrome (GPL-3.0)** and, for analysis, potentially **Essentia
(AGPL-3.0)**. That matters if SynAmp is ever distributed to other people — see
the licensing decision in [`docs/synamp/DECISIONS.md`](docs/synamp/DECISIONS.md).

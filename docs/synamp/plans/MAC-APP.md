# SynAmp for Mac — how the app is built

Part of [the 2027 plan](../../business/plan-2027-simple-install.md) (backlog
B12, gates G1 and G2). Written October 14, 2026.

## What it is

One app, `SynAmp.app`. You open it, choose your music folder, and SynAmp
starts. Everything that ran in Docker on the NAS runs inside the app instead,
on your Mac. Phones and other computers still play through it, the same way
they played through the NAS.

## The pieces inside

Everything SynAmp already is, unchanged, plus a small native shell that starts
and looks after it.

| Piece | What it is | How it runs in the app |
|---|---|---|
| **Shell** | New: Swift (SwiftUI + AppKit), `apps/mac/` | The app itself: menu-bar icon, the SynAmp window, first run, start at login, updates. Starts and stops everything below. |
| **Brain** | `apps/brain` (Node) | A bundled Node runtime runs it. It also serves the web app now (`WEB_ROOT`), so there's one address and no nginx or Caddy. |
| **Librarian** | `apps/brain/src/librarian` (Node) | Same Node runtime, its own process, the only one allowed to change music files. |
| **Navidrome** | Go program (GPL-3) | Its official build, as a separate program. Only the brain talks to it (`127.0.0.1`); phone apps reach it through the brain's `/rest` as before. |
| **Listening** | `services/analyzer` (Python) | A bundled Python with the analyzer and ONNX Runtime installed. Runs `synamp-analyze worker` against the local brain. |
| **ffmpeg / ffprobe** | Programs | For lighter streams and reading odd files. Needs an LGPL build to bundle (see open questions). |
| **Web app** | `apps/web/dist` | Built files, served by the brain. Shown in the app's own window. |

Not inside: Postgres. Nothing in the code uses it yet (the brain keeps its data
in JSON files), so the app leaves it out.

## Where things live on the Mac

- **The app:** `/Applications/SynAmp.app`. Nothing in it changes while it runs.
- **SynAmp's own data:** `~/Library/Application Support/SynAmp/` (`brain/`,
  `librarian/`, `navidrome/`, `listening/`, `models/`, `settings.json`).
- **Logs:** `~/Library/Logs/SynAmp/` (one file per piece, kept small).
- **Your music:** wherever you chose. SynAmp reads it; only the librarian
  writes, and only after you approve a change, exactly as on the NAS.
- **The access token:** made on first run and kept in the macOS Keychain.

## Starting and stopping

The shell is the supervisor:

1. Pick a free port (8380 first) and write each piece's settings.
2. Start Navidrome, then the brain (wait for `/health`), then the librarian
   and the listening worker.
3. If a piece stops unexpectedly, start it again after a short wait that grows
   each time (1 s, 2 s, 4 s … up to a minute), and say so in the menu.
4. **Quit** asks each piece to stop (SIGTERM), waits up to 10 s (the librarian
   up to 2 minutes, to finish a batch it's applying), then stops what's left.
5. Closing the window does not stop SynAmp: music keeps playing to phones and
   listening carries on. The menu-bar icon shows it's running; Quit stops it.

## Phones and other computers

The brain listens on the local network (with the access token, as on the NAS)
so phones at home can play. Away from home stays the Tailscale route the
"Listen anywhere" checklist already explains. The Mac must be awake: while
SynAmp is listening to the library or something is playing through it, the app
asks macOS not to sleep (an IOKit power assertion), and lets it sleep again
otherwise. A Settings switch turns that off.

## First run (G2)

A short native window, then the web app takes over:

1. **Welcome.** One sentence on what SynAmp does.
2. **Where's your music?** A folder picker. If the folder is on a NAS, a note
   that the NAS needs to stay connected.
3. **What to expect.** "Listening to your library takes a while the first
   time. A newer computer finishes sooner, and you can play music the whole
   time." Optional: start at login (on by default).
4. SynAmp opens on the Library, with "Listen to these first" offered so the
   first playlist comes the same day.

Every step works with VoiceOver and the keyboard, and nothing depends on colour.

## Updates

Sparkle 2 (MIT), the standard Mac updater: it checks a feed on synamp.app or
GitHub Releases, shows what's new, and installs a signed update. Same
behaviour as the NAS notice: skip a version, remind later, turn checks off.

## Signing and notarization

- Signed with the owner's **Developer ID Application** certificate (already on
  the Mac) and the hardened runtime, every bundled program included.
- Node needs the JIT entitlement (`com.apple.security.cs.allow-jit`).
- Notarized with `notarytool`; needs an App Store Connect API key or an
  app-specific password from the owner (owner action, by Nov 30).
- Not sandboxed (distributed outside the App Store): SynAmp must read a music
  folder the user picks, run helper programs and serve the local network.

## Builds

- Built by a script (`apps/mac/scripts/build-app.sh`) from a Swift package: no
  Xcode project to merge, and it runs in CI on a macOS runner.
- Two downloads, Apple Silicon and Intel, rather than one universal app: each
  bundled runtime (Node, Python, ONNX Runtime, Navidrome, ffmpeg) is per chip,
  and two smaller downloads beat one double-size one. The download page picks
  the right one for the visitor.
- macOS 14 (Sonoma) or newer: ONNX Runtime's current Apple Silicon build needs
  it, and one minimum keeps testing simple.
- Every bundled program is a pinned version with a pinned SHA-256, like the
  Docker images.

## Order of work

1. **Brain serves the web app** (`WEB_ROOT`). Done October 14.
2. **The shell's core**: paths, settings for each piece, port choice, the
   supervisor with restart and stop rules, tested with `swift test` (22 tests,
   also in CI on a macOS runner). Done October 14.
3. **A runnable app from the repo** on the owner's Mac: the shell plus the
   pieces from local copies (system Node, a downloaded Navidrome, the analyzer's
   own environment). Done October 14: `apps/mac/scripts/run-dev.sh` with one
   artist folder on the NAS share (430 songs) — all four pieces started in
   order in 2 s, the web app loaded from the brain, Navidrome scanned the folder
   in 16 s, listening ran every stage including singing/instruments (ONNX), and
   Quit stopped everything newest-first in about a second.
4. **SynAmp's own window** (a WebKit view): music keeps playing when it's
   closed; links to other sites open in the browser; file pickers and
   downloads work; the token goes into the page before its scripts run.
   Quit (menu, ⌘Q, logout or `kill`) stops every piece first; programs left
   running after a force quit or crash are stopped at the next start (only
   if they're still the same program). Done October 14.
5. **Packaging**: bundled runtimes, signing, notarization, a DMG.
6. **First run, menu bar, start at login, sleep, updates** (G2). Start at
   login (SMAppService, the menu's "Start at login", with a link to System
   Settings when macOS wants approval) and keep-awake done October 14: the
   brain's `GET /api/v1/system/activity` says whether SynAmp is playing,
   streaming to a phone (a /rest/stream in the last 10 min) or listening to the
   library; the app asks every minute and holds an IOKit
   PreventUserIdleSystemSleep assertion only then (the display may still sleep).
   Seen on the owner's Mac: "SynAmp is listening to your library" in
   `pmset -g assertions` while analysing, gone after Quit.

## Open questions

- **ffmpeg licence:** Homebrew's ffmpeg is a GPL build. Bundling needs an LGPL
  build (built in CI from source, configured without GPL parts) or dropping
  ffmpeg and losing lighter streams on the Mac app until it's sorted.
- **Navidrome (GPL-3):** shipped unmodified as a separate program; the app's
  credits link its source. Confirm with the B06 rights review.
- **The PANNs model:** bundle it, or download on first run? Depends on the
  weights licence answer (B06). Until then, the app downloads the checkpoint
  from Zenodo and converts it — which needs PyTorch, so a published ONNX copy
  is the realistic route once the licence allows.
- **Where new music lands** (`incoming/`): on the NAS it's a folder beside
  `library/`. In the app, likely `SynAmp Incoming` beside the chosen folder;
  decide with the first-run design.
- **One window or the browser:** decided — the app's own window, with "Open in
  browser" in the menu. Still to check by ear: audio keeps playing with the
  window closed (the page stays loaded, so it should).

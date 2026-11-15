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

## SynAmp somewhere else (connections)

The same app covers the person whose SynAmp already runs on a NAS or another
computer. In the first run (or **Connection settings…** in the menu) they pick
"It's already running on my NAS or another computer" and give:

- the **address at home** (`Syd.local:8080`), checked on the spot: does SynAmp
  answer there, and does it accept the access token?
- the **access token** (kept in the Keychain, apart from this Mac's own);
- optionally the **address away from home**. If Listen anywhere is already set
  up, the app reads the name from SynAmp and fills this in itself;
- **When I'm away from home:** Ask me (default) / Connect automatically / Stay offline.

In this mode the app starts none of SynAmp's pieces. `ConnectionMonitor` asks
`/health` at home every 20 seconds, and straight away when the network changes
(`NWPathMonitor`). Two missed answers in a row count as away (one is a restart
or a Wi-Fi hiccup). Then, if the remote address answers:

- **Ask me:** "You're away from home. Connect remotely?" as a sheet in the
  window when it's open, otherwise as a notification; the menu has the same
  two choices the whole time. The answer lasts until home answers again.
- **Connect automatically:** the window moves to the remote address.
- **Stay offline:** nothing connects; the menu still offers "Connect remotely".

Home always wins: as soon as it answers, the window goes back to it. Nothing
here ever asks Finder to mount anything, so nothing pops up uninvited.

The first time the app talks to an address on the home network, macOS asks
"Allow SynAmp to find devices on your local network?". Until that's allowed,
home looks like it isn't answering; the setup check says so in its message.

**Listening from this Mac.** A NAS is usually too slow to listen to songs, and
its install has no listening piece, so a computer does it. With "Use this Mac
to listen to the library" on, the app runs the listening worker itself (no
Terminal, no background agent to install), pointed at the home address:

- the person chooses the music folder as this Mac sees it
  (`/Volumes/music/library`). It must be the folder the NAS uses: the app checks
  for the `.synamp` notes folder beside it and says so if it's missing;
- the share's address is read from the folder (`ListenFolder.shareURL`), so
  listening can reconnect it at home; away it waits quietly;
- what it learns (`library-signals.json`) and the rename journal live in
  `.synamp` beside the music, where the NAS reads them; its own working data
  stays in Application Support on this Mac;
- only this Mac's listening keeps it awake, not music the NAS is playing.

If listening can't start, the connection still works and the menu says so.

Not yet: turning Listen anywhere on from the app; a NAS install started from
the app.

## What the menu says

Like a VPN's menu: one look says what SynAmp is doing. The first line is where
things stand (Running, Connected to SynAmp at home, Away from home…). Under it,
from `GET /api/v1/system/status` (asked every 10 seconds at wherever SynAmp
answers, home or remote):

- **Playing / Paused:** the song, and "Playing to a phone app".
- **Music:** connected, not connected, or out of reach from this network.
- **Listening to your library:** songs done of the total, and the time left
  while it's running.
- **Listen anywhere:** on (with the address) or not set up, with a button that
  opens that screen.

Lines appear only when there's something true to say; no answer clears them.
Everything is words (`StatusWords`), so VoiceOver reads the same thing and
nothing depends on the icon or a colour.

## Open on your phone

**Open on your phone…** in the menu shows a QR code per address: "At home"
(this Mac's `.local` name and port, or the NAS's home address) and, when Listen
anywhere is set up for a SynAmp somewhere else, "Away from home". The code
holds the address with the access token after the `#`, so the phone opens
SynAmp already signed in; the web app takes the token out of the address at
once (`access-handoff.ts`). The address is also shown in words without the
token, with a Copy link button, and a line saying who to show the code to.

The web app's top bar has the same status as the menu (`SystemStatus.tsx`,
`system-status.ts`): a button with the one thing most worth knowing, opening
to the full lines. That's the status on a phone.

## The music folder: missing, or moved

**Missing.** If the music folder isn't there when SynAmp starts (a drive not
plugged in, a share not connected), nothing is started and the menu says
"SynAmp can't find your music folder (…). If it's on a drive or a NAS, connect
it, then choose Try again." Started on a folder that isn't there, every song
would look deleted.

**Change music folder…** (menu, when SynAmp runs on this Mac). After the folder
is chosen, listening is asked whether it's the same music in a new place
(`synamp-analyze reroot --from <old> --to <new> --check`: an even spread of up
to 200 known songs, looked for at the same place under the new folder). The
person then sees one of:

- **Same music, new place** (four in five or more are there): everything
  learned is carried over with `reroot` before the restart. It rewrites the
  paths in listening's database, including the "first known as" paths song IDs
  are made from, so IDs, plays, playlists and feedback stay put and no song is
  listened to again. If it fails, the folder is not changed.
- **This looks like different music**: the folder changes and listening starts
  from the beginning; what's known about the old folder stays in the database.
- **Couldn't check**: nothing is carried over on a guess; songs are recognised
  by their sound as they're read, which is slower.

Not checked yet: what Navidrome keeps (its own play counts and stars) when its
music folder changes. SynAmp's favourites are its own and are sent to Navidrome
again.

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
   Scripts done October 14 (`apps/mac/README.md`): Node 22.23.3, Python 3.12.15
   (python-build-standalone 20261003) with the locked analyzer requirements,
   Navidrome 0.64.2, the built web app and build.json; app 439 MB, DMG 139 MB
   (Apple Silicon). Tried ad-hoc signed on the owner's Mac: every piece ran
   from inside the app (no Homebrew Node, no repo), listening ran all five
   stages including ONNX voice, Quit left nothing running. Developer ID
   signing and notarization need the owner at the keyboard once (Keychain
   prompt; `notarytool store-credentials`). After the first run, listening
   starts by itself (update + analyze).
6. **First run, menu bar, start at login, sleep, updates** (G2). Start at
   login (SMAppService, the menu's "Start at login", with a link to System
   Settings when macOS wants approval) and keep-awake done October 14: the
   brain's `GET /api/v1/system/activity` says whether SynAmp is playing,
   streaming to a phone (a /rest/stream in the last 10 min) or listening to the
   library; the app asks every minute and holds an IOKit
   PreventUserIdleSystemSleep assertion only then (the display may still sleep).
   Seen on the owner's Mac: "SynAmp is listening to your library" in
   `pmset -g assertions` while analysing, gone after Quit.
   Updates done October 14: Sparkle 2.10.0 (SwiftPM; framework in
   Contents/Frameworks, XPC helpers removed as the app isn't sandboxed), a feed
   per chip at releases/latest/download/appcast-<chip>.xml, made and signed by
   scripts/make-appcast.sh (CI does it for a tag when SPARKLE_PRIVATE_KEY
   exists). The app checks daily only when it carries a valid public key, and
   the menu offers "Check for updates…" then.

## Open questions

- **ffmpeg licence:** Homebrew's ffmpeg is a GPL build. Bundling needs an LGPL
  build (built in CI from source, configured without GPL parts) or dropping
  ffmpeg and losing lighter streams on the Mac app until it's sorted.
- **Navidrome (GPL-3):** shipped unmodified as a separate program; the app's
  credits link its source. Confirm with the B06 rights review.
- **The PANNs model:** bundle it, or download on first run? Depends on the
  weights licence answer (B06). Until then, the app downloads the checkpoint
  from Zenodo and builds the ONNX model itself, without PyTorch
  (`synamp-analyze model build`, about 10 s; checked against PyTorch's own
  answers, largest difference 1.7e-05). A published ONNX copy would only save
  the download size.
- **Where new music lands** (`incoming/`): on the NAS it's a folder beside
  `library/`. In the app, likely `SynAmp Incoming` beside the chosen folder;
  decide with the first-run design.
- **One window or the browser:** decided — the app's own window, with "Open in
  browser" in the menu. Still to check by ear: audio keeps playing with the
  window closed (the page stays loaded, so it should).

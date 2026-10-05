# SynAmp — first run on the NAS

The order matters. **Use Navidrome last.** It identifies tracks by their
path, so anything renamed after it has collected plays loses those play counts
in Navidrome (SynAmp keeps its own). It starts with everything else
(Container Manager starts every service in the project), but that's harmless
while nobody plays through it: it simply re-scans after each change. So: tidy
first, then set up Navidrome and your apps, then run the long analysis.

| Phase | Where | How long | Changes music files? |
|---|---|---|---|
| 0. Safety net | NAS | 5 min | no |
| 1. Put SynAmp on the NAS | Mac + NAS | 20 min | no |
| 2. Start SynAmp — without Navidrome | DSM | 10 min | no |
| 3. First scan and export | Mac | ~1 hour | no |
| 4. Match albums (missing tracks) | browser | a few hours, unattended | no |
| 5. Organise | browser | as long as you like | **yes** — reviewed, undoable |
| 6. Navidrome | browser | a few minutes | no |
| 7. The big analysis | Mac | days, resumable | no |

Each phase ends with **Done when**, so you know it worked before moving on.

---

## 0. Safety net

1. DSM → **Snapshot & Replication** → take a snapshot of the `music` shared
   folder. (If it isn't offered, the volume isn't Btrfs; turn on the share's
   Recycle Bin instead, and make a backup before phase 5.)
2. Turn on SSH if it's off: **Control Panel → Terminal & SNMP → Enable SSH**.

**Done when** the snapshot is listed.

## 1. Put SynAmp on the NAS

1. On the NAS (`ssh tapps@Syd.local`), make the folders. Don't use `sudo`, so
   they belong to you (1026), which is who the brain and librarian run as:

   ```bash
   mkdir -p /volume1/docker/synamp/data/navidrome /volume1/docker/synamp/data/postgres \
     /volume1/docker/synamp/data/caddy /volume1/docker/synamp/data/caddy-config \
     /volume1/docker/synamp/data/brain /volume1/docker/synamp/data/librarian
   mkdir -p /volume1/music/.synamp /volume1/music/incoming
   ```

   Synology doesn't create missing folders for containers; skipping this makes
   them fail with `Bind mount failed`.

2. On the Mac, connect the `docker` share (Finder → Go → Connect to Server →
   `smb://Syd.local/docker`), then copy the app over, without the bulky or
   private bits:

   ```bash
   cd /Users/tapps/_dev/web-apps/SynAmp
   rsync -a --exclude node_modules --exclude dist --exclude data --exclude .env \
     apps deploy /Volumes/docker/synamp/
   ```

   (Run the same command again whenever you want to update the NAS copy.)

3. On the NAS, create the settings file:

   ```bash
   cd /volume1/docker/synamp/deploy
   cp .env.example .env
   ```

   Then edit `.env` (`vi .env`, or open it from the `docker` share in a text
   editor). Set:

   | Setting | Value |
   |---|---|
   | `MUSIC_PATH` | `/volume1/music/library` |
   | `MUSIC_SHARE` | `/volume1/music` |
   | `INCOMING_PATH` | `/volume1/music/incoming` |
   | `DATA_DIR` | `/volume1/docker/synamp/data` |
   | `POSTGRES_PASSWORD` | anything long and random |
   | `PLAYLIST_API_TOKEN` | long and random — make one with `openssl rand -hex 32` and keep a copy; the web app and the Mac both need it |
   | `PUID` / `PGID` | `1026` / `100` |

   The rest (MusicBrainz contact, Last.fm keys, SynAmp's address, upload
   limit) is set in the web app under **Settings** — no need to edit this file
   for them.

**Done when** `/volume1/docker/synamp/` holds `apps/`, `deploy/` and `data/`,
and `.env` is filled in.

## 2. Start SynAmp — without Navidrome

In DSM, open **Container Manager** → **Project** → **Create**:

| Field | Value |
|---|---|
| Project name | `synamp` |
| Path | `/volume1/docker/synamp/deploy` |
| Source | **Use existing docker-compose.yml** |

Then **Next** (skip the Web Station portal) → **Done**. Container Manager
builds SynAmp and starts it — the first build takes a few minutes; its log
window shows progress.

Navidrome (`core`) starts too, but leave it alone until phase 6. The librarian (the only part allowed
to change music files) starts too, but does nothing until you apply a batch
you approved — and **Pause file changes** in the Organise panel holds it
whenever you like.

Open `http://Syd.local:8080` and enter the `PLAYLIST_API_TOKEN` when asked.
Then open **Settings** (bottom of the page) and enter your email as the
MusicBrainz contact.

**Done when** the page loads.

## 3. First scan and export (Mac)

The analyzer runs on the Mac and reads the music over the network share.
First mount the `music` share in Finder (Go → Connect to Server →
`smb://Syd.local/music`).

**3a. Settings, once.** In Terminal, paste these three lines:

```bash
mkdir -p ~/SynAmp-data
cp /Users/tapps/_dev/web-apps/SynAmp/services/analyzer/mac-env.example.sh ~/SynAmp-data/env.sh
open -a TextEdit ~/SynAmp-data/env.sh
```

In TextEdit, replace `PASTE_YOUR_TOKEN_HERE` with your `PLAYLIST_API_TOKEN`
(keep the quotes around it), save, and close.

**3b. Install, once.** Paste:

```bash
brew install chromaprint
cd /Users/tapps/_dev/web-apps/SynAmp/services/analyzer
uv pip install -e ".[dev]"
```

(If `uv` says there is no virtual environment, run `uv venv --python 3.12`
first, then the last line again. `chromaprint` is optional but recommended:
it recognises the same song across formats.)

**3c. Scan and export.** Paste:

```bash
cd /Users/tapps/_dev/web-apps/SynAmp/services/analyzer
source ~/SynAmp-data/env.sh
uv run synamp-analyze scan
uv run synamp-analyze export --out /Volumes/music/.synamp/library-signals.json
```

`scan` lists every file (it doesn't analyse anything yet) — a few minutes.
The first `export` reads every file's tags over the network, several at a
time, and prints how far along it is with time left; later exports reuse what
it read and take seconds. Stopping it (Ctrl-C) keeps what it has read so far.

In any new Terminal window, run the `cd` and `source` lines again before
other `synamp-analyze` commands.

> Paste commands exactly as shown. The Mac's Terminal (zsh) doesn't accept
> notes after a `#` on a pasted line, or `<` `>` around placeholders.

**Done when** the **Library** strip in the web app shows your track and
album counts.

**3d. Let the analyzer run in the background — the last Terminal step on the
Mac.** Paste:

```bash
cd /Users/tapps/_dev/web-apps/SynAmp/services/analyzer
uv run synamp-analyze install-agent
```

From now on the analyzer starts by itself whenever you log in, and takes its
orders from the **Library** strip in the web app: **Scan for changes**,
**Start analysis**, **Pause analysis**. After every batch you apply in
Organise, it scans and updates the library list by itself. (To remove it:
`uv run synamp-analyze uninstall-agent`.)

If the Library strip says the music isn't reachable: macOS may ask whether
"zsh" or "python" may access files on a network volume — allow it (System
Settings → Privacy & Security → Files and Folders).

## 4. Match albums with MusicBrainz

Web app → **Missing tracks** → **Start checking**. It works through every
album folder at about one request a second — a few hours for your library.
It's fine to leave it running overnight and to close the browser.

Then:

- **Needs your choice**: pick the right edition for albums it wasn't sure
  about (or skip ones that aren't on MusicBrainz).
- **Discography gaps** → **Start looking up** (a few minutes for your top 50).

**Done when** "not checked yet" reaches zero. This comes before organising
because merges use MusicBrainz's spelling of each artist.

## 5. Organise

1. The Organise panel should say "The librarian is running". (It started in
   phase 2. If it says it isn't: Container Manager → Container →
   `synamp-librarian` → **Start**.)
2. **Start small.** Approve two or three proposals, press **Apply**, and look
   at those folders in Finder. Try **Undo this batch** once so you've seen it
   work.
3. Then work through the rest in batches — artist merges first, then albums.
   Skip anything you'd rather keep as it is.
4. After each batch, the analyzer scans and updates the library list by
   itself (you'll see it in the Library strip). That's what lets analysis and
   history follow the moved files. If you switched that off: **Scan for
   changes** in the Library strip.
5. Want a break from changes? Switch on **Pause file changes** in the
   Organise panel. A batch already under way finishes; nothing new starts.

**Done when** you're happy with the folders. It doesn't have to be perfect —
anything you change later is handled, it just costs Navidrome its play counts
for those tracks (SynAmp keeps its own).

## 6. Navidrome, Tailscale and your apps

The web app walks you through this: open **Listen anywhere** (under the
Library strip). It checks Navidrome and the apps for you and gives the
addresses to type. In short:

Open `http://Syd.local:4533`, create the Navidrome admin account, and wait for
its scan to finish (a few minutes). Then point your phone/desktop apps at
`http://Syd.local:8080` (never `:4533`, or plays bypass SynAmp) and check
playback (deploy README, "Bring it up").

**Done when** an app plays a track through `:8080`.

## 7. The big analysis

Web app → **Library** strip → **Start analysis**.

It measures tempo, loudness, beat and more for every track — days for ~45,000
tracks — and keeps the Mac awake while it works. **Pause analysis** stops it
after the current track; **Start analysis** carries on where it left off. It
updates the library list every hour along the way, so smart playlists get
better as it goes. The strip shows progress and time left.

---

## Updating SynAmp

Two steps, no Terminal on the NAS:

1. On the Mac: `synamp-sync` (copies the new version to the NAS).
2. The web app then shows **An update is ready to install** at the top. Do
   what it says: DSM → Container Manager → **Project** → `synamp` →
   **Stop**, then **Action** → **Build** (Build is greyed out while the
   project runs). Stop takes a few seconds; the librarian finishes a batch
   it's in the middle of first.

SynAmp is unavailable for a few minutes while it rebuilds. Let a batch in
Organise finish first (or switch on **Pause file changes**); analysis on the
Mac carries on by itself. **Settings → About this install** shows the version
that's running.

### Already running SynAmp from Terminal? Switch once

If you started SynAmp with `dc up` before, hand it over to Container Manager
once:

1. On the Mac: `synamp-sync`.
2. On the NAS, one last time: `dc down` — this removes the containers only;
   your data, settings and music stay where they are. (Without Terminal:
   Container Manager → **Container**, select every `synamp-…` container,
   **Action** → **Stop**, then **Action** → **Delete**.)
3. Create the project as in phase 2.

If you still want the `dc` shortcut for logs, the profile flags are no longer
needed:

```bash
alias dc='sudo /usr/local/bin/docker compose -f /volume1/docker/synamp/deploy/docker-compose.yml --env-file /volume1/docker/synamp/deploy/.env'
```

---

## If something goes wrong

- **A container won't start**: Container Manager → **Container** → select it
  → **Details** → **Log** (brain, web, edge, librarian, core).
- **Project → Build says a container name is already in use**: the old
  Terminal-started containers are still there — see "Switch once" above.
- **Web app shows no tracks**: the export file isn't at
  `/volume1/music/.synamp/library-signals.json`, or `.env` is missing
  `MUSIC_SHARE`. Re-run phase 3's `export`.
- **Librarian says it can't write**: check `PUID`/`PGID`, and that
  `/volume1/docker/synamp/data/librarian` exists and belongs to you.
- **A batch went wrong**: **Undo this batch** in the Organise panel; if needed,
  restore from the phase 0 snapshot.

# SynAmp — first run on the NAS

The order matters. **Navidrome is started last.** It identifies tracks by
their path, so anything renamed after its first scan looks deleted and re-added
to it. So: tidy first, then let Navidrome scan, then run the long analysis.

| Phase | Where | How long | Changes music files? |
|---|---|---|---|
| 0. Safety net | NAS | 5 min | no |
| 1. Put SynAmp on the NAS | Mac + NAS | 20 min | no |
| 2. Start SynAmp — without Navidrome | NAS | 10 min | no |
| 3. First scan and export | Mac | ~1 hour | no |
| 4. Match albums (missing tracks) | browser | a few hours, unattended | no |
| 5. Organise | browser | as long as you like | **yes** — reviewed, undoable |
| 6. Navidrome's first scan | NAS | a few minutes | no |
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
   | `MUSICBRAINZ_CONTACT` | your email (sent only to musicbrainz.org) |
   | `PUID` / `PGID` | `1026` / `100` |

**Done when** `/volume1/docker/synamp/` holds `apps/`, `deploy/` and `data/`,
and `.env` is filled in.

## 2. Start SynAmp — without Navidrome

On the NAS (all `docker compose` commands in this guide run on the NAS, from
`/volume1/docker/synamp/deploy`):

```bash
cd /volume1/docker/synamp/deploy
sudo docker compose --env-file .env --profile app up -d --build db brain web edge
```

Naming the four services is what keeps Navidrome (`core`) switched off.

**Why `sudo`:** on DSM only root may use Docker, so without it you get
`permission denied … docker.sock`. You'll be asked for your DSM password. If
it then says `docker: command not found`, use the full path:
`sudo /usr/local/bin/docker compose …` (`which docker` shows it). The
containers still run as you (1026), so their files belong to you.
The first build takes a few minutes.

Open `http://Syd.local:8080` and enter the `PLAYLIST_API_TOKEN` when asked.

**Done when** the page loads and `sudo docker compose ps` shows no `core`.

## 3. First scan and export (Mac)

The analyzer runs on the Mac and reads the music over the network share.
Mount the `music` share (`smb://Syd.local/music`), then in Terminal:

```bash
cd /Users/tapps/_dev/web-apps/SynAmp/services/analyzer
brew install chromaprint        # optional, recommended: recognises the same song across formats
uv venv --python 3.12 && uv pip install -e ".[dev]"     # first time only

export LIBRARY_PATH=/Volumes/music/library
export ANALYZER_DB_PATH=$HOME/SynAmp-data/analyzer.sqlite3      # on the Mac's own disk, never the share
export RENAME_JOURNAL_PATH=/Volumes/music/.synamp/renames.jsonl
export SYNAMP_BRAIN_URL=http://Syd.local:8080
export SYNAMP_BRAIN_TOKEN=<your PLAYLIST_API_TOKEN>
mkdir -p $HOME/SynAmp-data

uv run synamp-analyze scan
uv run synamp-analyze export --out /Volumes/music/.synamp/library-signals.json
```

`scan` lists every file (it doesn't analyse anything yet). The first `export`
reads every file's tags over the network, so it's the slow one; later exports
reuse what it read.

Tip: put the `export` lines in a file (e.g. `~/SynAmp-data/env.sh`) and run
`source ~/SynAmp-data/env.sh` in each new Terminal window.

**Done when** the **Library** strip in the web app shows your track and
album counts.

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

1. On the NAS, start the librarian (the only part of SynAmp allowed to change files):

   ```bash
   sudo docker compose --env-file .env --profile app --profile librarian up -d librarian
   ```

   The Organise panel should say "The librarian is running".

2. **Start small.** Approve two or three proposals, press **Apply**, and look
   at those folders in Finder. Try **Undo this batch** once so you've seen it
   work.
3. Then work through the rest in batches — artist merges first, then albums.
   Skip anything you'd rather keep as it is.
4. After each batch, on the Mac:

   ```bash
   uv run synamp-analyze scan && uv run synamp-analyze export --out /Volumes/music/.synamp/library-signals.json
   ```

   This is what lets analysis and history follow the moved files.
5. When you're done: `sudo docker compose stop librarian`.

**Done when** you're happy with the folders. It doesn't have to be perfect —
anything you change later is handled, it just costs Navidrome its play counts
for those tracks (SynAmp keeps its own).

## 6. Navidrome's first scan

```bash
sudo docker compose --env-file .env up -d core
```

Open `http://Syd.local:4533`, create the Navidrome admin account, and wait for
its scan to finish (a few minutes). Then point your phone/desktop apps at
`http://Syd.local:8080` (never `:4533`, or plays bypass SynAmp) and check
playback (deploy README, "Bring it up").

**Done when** an app plays a track through `:8080`.

## 7. The big analysis (Mac)

```bash
caffeinate -i uv run synamp-analyze analyze
```

`caffeinate` stops the Mac sleeping while it works. This measures tempo,
loudness, beat and more for every track, and takes days for ~45,000 tracks.
It can be stopped (Ctrl-C) and restarted any time; it carries on where it
left off. The Library strip shows progress and time left.

Every so often (say once a day), run `export` again so smart playlists see
the new results.

---

## If something goes wrong

- **A container won't start**: `sudo docker compose logs <name>` (brain, web,
  edge, librarian, core).
- **Web app shows no tracks**: the export file isn't at
  `/volume1/music/.synamp/library-signals.json`, or `.env` is missing
  `MUSIC_SHARE`. Re-run phase 3's `export`.
- **Librarian says it can't write**: check `PUID`/`PGID`, and that
  `/volume1/docker/synamp/data/librarian` exists and belongs to you.
- **A batch went wrong**: **Undo this batch** in the Organise panel; if needed,
  restore from the phase 0 snapshot.

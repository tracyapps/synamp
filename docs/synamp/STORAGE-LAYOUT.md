# SynAmp — NAS storage layout

> Status: **implemented** (2026-09-23). The library was reorganised and verified;
> the application has not been deployed yet. This file records the layout and why
> it is shaped this way.

## What we observed

Inspected from the Mac on 2026-09-23:

- `/Volumes/music` is mounted over **AFP** (`afpfs`), from host `Syd`.
- The share root holds **4,132 entries**, almost all artist folders.
- Non-library entries sitting at the root: `.DS_Store`, `.TemporaryItems`,
  `deploy/`, `itunes/`, `Compilations/`, `Greatest Hits of Ty & Ingrid/`.
- The `deploy/` folder on the share is a **copy** — the repository copy is intact.

## Proposed layout

```
/volume1/
├── music/                          SHARE — the library, and nothing else
│   ├── library/                    ← Navidrome scans HERE  (4,199 entries)
│   │   ├── Aaron Shust/
│   │   ├── Fleetwood Mac/
│   │   └── …
│   └── incoming/                   new rips / downloads awaiting filing
│                                   (outside the scan root, on purpose)
│
└── docker/synamp/                  the application, inside the existing docker share
    ├── deploy/                     compose + Caddyfile + .env
    ├── data/                       postgres · navidrome · caddy state
    └── backups/
```

## Why this shape

**The important separation is at the share level, not inside the music folder.**
Application files and the audio library have different lifecycles, different
backup needs, and different access rules. Mixing them is what makes a media
server unpleasant to maintain later.

**The `library/` nesting is the smaller win, but worth taking** — you are right to
want it:

- The scan root becomes bounded. Junk at the share root (`.DS_Store`,
  `.TemporaryItems`, `@eaDir`, future `incoming/`) is never walked.
- There is somewhere obvious to put unsorted music (`incoming/`) without it
  polluting the artist list.
- It costs almost nothing **if done on the NAS**: a same-volume move is a
  metadata-only rename, so 4,000 folders move in seconds, not hours.

## Do it before the first scan

This is the part that matters most.

Navidrome identifies tracks by their path. **Scan the library first, then move it,
and Navidrome sees every track as deleted and re-added** — you lose play counts
and ratings, and playlist entries pointing at old paths break. So:

1. Decide the layout.
2. Move the files.
3. *Then* point Navidrome at `/volume1/music/library` and let it scan.

Doing it the other way round is the expensive mistake.

## How to move it

**Do it on the NAS itself** — over SSH, or with File Station. Do **not** do it
from the Mac over the AFP mount: you get slow per-item round trips, and the new
folders end up with the wrong ownership and Synology ACLs.

### Safety first

- If the volume is **Btrfs**, take a **snapshot** (Snapshot & Replication) — the
  move becomes instantly reversible.
- Otherwise, enable the **Recycle Bin** for the share in Control Panel.
- You have a 274 GB library and no usable backup story yet. Fix that before you
  start reorganising, not after.

### Then, with the tested script

`tools/nas/reorganize-library.sh` does the move **and verifies it**. It is
**dry-run by default** — nothing moves until you pass `--apply`.

Get it onto the NAS (it must run there, not over the network mount):

```bash
# from the Mac
scp tools/nas/reorganize-library.sh tapps@Syd.local:/tmp/

# then, over SSH
ssh tapps@Syd.local
chmod +x /tmp/reorganize-library.sh
/tmp/reorganize-library.sh                        # dry run — shows the plan
/tmp/reorganize-library.sh --apply                # asks you to type MOVE
```

What it guarantees:

- **Dry run first.** Prints exactly what would move, and how many entries are skipped.
- **Refuses to run against a network mount.** If `$MUSIC_ROOT` is a mounted
  filesystem, it stops — that catches the Mac-side mistake before it happens.
- **Never clobbers.** If `library/<name>` already exists, the item is skipped and
  reported as a collision; nothing is overwritten.
- **Verifies afterwards.** Library count must equal (before + moved), and the
  share root must contain only the skipped names. Any mismatch exits with code 3.
- **Idempotent.** Re-running on an already-organised share reports "nothing to
  move" and changes nothing.
- Real artist names with spaces, `&`, and `[brackets]` are handled correctly.

It always skips `library/`, `incoming/`, `@eaDir`, `#recycle`, and **`deploy/`** —
app files must not end up inside the library. Moving `deploy/` out of the share
is a separate, deliberate step (the script prints the command when it finishes).

Exit codes: `0` ok · `1` error · `2` bad usage · `3` verification mismatch.

## The alternative, if you would rather not move anything

Navidrome supports **`.ndignore`** files: an empty `.ndignore` inside a directory
tells the scanner to skip that whole directory. So you *can* leave everything at
the root and just drop an empty `.ndignore` into `deploy/` (and later
`incoming/`).

That is the zero-risk option, and it is legitimate. It is also a band-aid: every
new non-music folder at the root needs another ignore file, and the root stays a
mix of library and non-library. Nesting is cleaner if you are willing to do it
once, now.

## macOS junk

macOS constantly recreates `.DS_Store` and `._*` AppleDouble files on network
shares. They are noise in the library, and `.DS_Store` is already 272 KB at your
share root.

Stop it regenerating network-side junk:

```bash
defaults write com.apple.desktopservices DSDontWriteNetworkStores -bool true
```

### Also worth doing while you are in there

- **Switch the Mac mount from AFP to SMB** (`smb://Syd/music`). Apple deprecated
  AFP back in 10.13; SMB is the supported, faster path, and it is what Docker
  Desktop handles better.
- Check whether Synology is creating `@eaDir` folders in the library (it does
  when media indexing is on). If they appear, add them to the scanner's ignore
  list rather than letting them into the index.

## Where Docker actually runs

**On the NAS**, via DSM's Container Manager — that is the target architecture.
Docker Desktop on the Mac is a development convenience, not the deployment.

Two things to know:

- Docker is **not** installed "on a volume". On macOS it runs containers inside a
  Linux VM, and a host path must be listed in **Settings → Resources → File
  Sharing** before a container can bind-mount it. On Synology there is no such
  step — Container Manager maps paths directly.
- **Do not put the app's database on a network mount.** Postgres on an AFP/SMB
  share is a corruption risk (network filesystems do not give the file locking a
  database needs). For local development, mount the music **read-only** and keep
  all app data on the Mac's own disk. Never bind-mount the DB onto the NAS share.

## Result of the move (verified 2026-09-23)

The library was reorganised with `tools/nas/reorganize-library.sh` and checked
from the Mac afterwards:

- the share root now holds only `library/` and `incoming/`
- `library/` holds **4,199** entries
- `deploy/` is no longer inside the music share
- the Mac mount is **SMB** (`smbfs`), not AFP

## Deployment path

1. `deploy/` lives at `/volume1/docker/synamp/deploy` (it does not belong inside
   the library).
2. `MUSIC_PATH=/volume1/music/library` — mounted read-only into the containers.
3. `DATA_DIR=/volume1/docker/synamp/data` — everything the app writes, and the
   only thing to back up.
4. Keep secrets in `deploy/.env` on the NAS only — never in the repo, never inside
   the music share.

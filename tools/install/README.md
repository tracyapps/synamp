# Guided setup

On the server, from the SynAmp folder's `deploy/` directory:

```sh
sudo ./setup.sh            # asks, shows the plan, changes nothing until you type yes
sudo ./setup.sh --start    # not on a Synology: also starts SynAmp and waits until it answers
sudo ./setup.sh --yes --show-token   # later: print the access token the app asks for
```

What it does: finds your music folder and the user who owns it, creates the
app-data folders, `incoming/` and `.synamp/` (the Brain's and librarian's
folders go to the music owner), writes `deploy/.env` from `.env.example` with
new random secrets (file mode 600, never printed unless you ask), then runs the
preflight below. It never moves or changes music files, and refuses a layout it
can't support: music not in `MUSIC_SHARE/library`, app data inside the music
share, or root as the music owner.

Safe to run again: an existing `.env` is kept exactly as it is, and only
missing folders are created. Every run leaves a receipt in `DATA_DIR/receipts/`
(steps, timings, failed check IDs; no paths, names or secrets).

DSM has no Node, so `setup.sh` runs [`setup.mjs`](setup.mjs) in the pinned Node
image from `apps/brain/Dockerfile`, with no network and `/volume*` mounted at
the same paths. A server with Node 22+ uses its own (set
`SYNAMP_SETUP_IN_CONTAINER=1` to use the image anyway). On a Synology it stops
at "ready" and names the Container Manager steps: a Project created there stays
manageable from DSM, while a Terminal start later collides with it (see
FIRST-RUN "Switch once").

Rehearsed October 12 on Linux x86-64 Docker with a Synology-shaped layout
(`/volume1/...`, music owned by uid 1026): fresh setup through the container
route, a second run that left `.env` byte-identical, `--start` to six healthy
services in about 35 seconds, the token accepted, and a FLAC streamed through
the edge's Subsonic route by `tools/nas/check-playback.mjs`. Not yet run on DSM
or Container Manager; that remains the B04 trial below.

# Read-only NAS preflight

B04's prerequisite check (the guided setup above runs it for you). Not a
supported-hardware claim.
Run it on the intended Linux x86-64 NAS, from an inspected source checkout:

```sh
node tools/install/preflight.mjs --env /absolute/path/to/deploy/.env
node --test tools/install/preflight.test.mjs
```

Node 22 or newer is required. Use the actual absolute settings path; no owner
hostname, UID or checkout location is assumed. Keep `deploy/` beside `apps/`.
The script reads settings as literal data, never sources a shell file, creates
no directories, and never starts, stops, builds or updates services. It invokes
only Docker info, Compose version and quiet configuration validation, with
timeouts. Raw Docker output and settings values are suppressed. Exit 0 means
all implemented prerequisites passed, 1 means prerequisites failed, and 2 means
invalid invocation or a check could not complete.

Create the directories and secrets yourself after reviewing
`deploy/.env.example`. Use unique generated secrets; the script checks length
and obvious placeholders, not cryptographic entropy. It refuses shell expansion
and escaping in this first version; it does not rewrite an existing .env.
An unsuccessful check can be rerun after fixing the reported prerequisite.

The current Compose librarian expects `MUSIC_SHARE/library` and
`MUSIC_SHARE/incoming` exactly. Pointing MUSIC_PATH elsewhere while the librarian
still sees `/share/library` is not an eligible trial. Resolved symlinks cannot
put DATA_DIR inside the music share. State bind directories and `.synamp` must
already exist. Directory access reflects the invoking user only.

Before starting a trial, separately verify DSM/Container Manager, the actual
container UID/GID, local storage, disk/memory capacity, free ports, a local Docker
context (not a remote daemon), private access and backup/restore. Passing on a
Mac or with a simulated Docker runner does not verify NAS setup. No Docker/DSM,
cold-install, throughput, native-client or upgrade result has been established
by the local tests. Record each attempt using the receipt below.

## Private attempt receipt

Keep this outside the repository; do not include tokens, URLs, paths or contacts
in public issues. Use a random attempt/household ID.

```text
Attempt ID / build SHA / source dirty / date:
Server model / architecture / DSM / Container Manager / Docker / Compose:
Mac model / OS / analyzer version / browser version:
Library track count / formats / selected-subset count:
Backup and restore evidence:
Preflight exit / failed IDs / unresolved manual checks:
Start timestamp / active setup minutes / assistance minutes:
Completed timestamp or failed/abandoned stage:
First export timestamp / measured, unmeasured, failed counts:
First playlist / first ten minutes played timestamps:
Unassisted / assisted recovery / non-friend status:
Upgrade, data rollback and restart evidence:
Known blockers / private evidence location:
```

Never discard a failed or abandoned attempt when calculating install success.
Start with a copy/trial library and optional writes disabled. A small-library
first-listen procedure still needs hardware validation; the owner procedure in
`docs/synamp/FIRST-RUN.md` is not cold-install evidence.
# Brain-state recovery rehearsal

The [offline recovery tool](RECOVERY.md) creates a private, checksummed Brain
state backup and restores it only into a fresh trial directory. It never
stops services or replaces current state. Music, analyzer databases and other
services have separate backup requirements.

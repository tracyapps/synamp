# Deploying SynAmp on the Synology NAS

Target: **DS1825+** (AMD Ryzen V1500B, x86-64) running **DSM 7.4.1** with
**Container Manager** installed.

Read [`../docs/synamp/STORAGE-LAYOUT.md`](../docs/synamp/STORAGE-LAYOUT.md) for
why the layout is shaped this way.

## Filesystem layout

```
/volume1/
├── music/
│   ├── library/              ← the scanned library      (MUSIC_PATH)
│   └── incoming/             new rips awaiting filing
└── docker/synamp/
    ├── deploy/               this folder
    └── data/                 postgres · navidrome · caddy   (DATA_DIR)
```

The music share is mounted **read-only** into the containers. Everything the app
*writes* lives under `DATA_DIR`, which is also the only thing you need to back up.

## 1. One-time setup

1. In DSM, install **Container Manager** from Package Center.
2. Create the app state directories (SSH, as an admin user):

   ```bash
   mkdir -p /volume1/docker/synamp/data/navidrome
   mkdir -p /volume1/docker/synamp/data/postgres
   mkdir -p /volume1/docker/synamp/data/caddy
   mkdir -p /volume1/docker/synamp/data/caddy-config
   mkdir -p /volume1/docker/synamp/data/brain
   ```

   **Synology's Docker does not auto-create bind-mount host directories.** If you
   skip this, every service fails with `Bind mount failed: '…' does not exist`.
   Stock Docker creates them silently; DSM does not. This bites people coming from
   Linux every time.

   The Postgres image fixes ownership of its own data directory on first start, so
   no `chown` is needed by hand.
3. Put `deploy/` at `/volume1/docker/synamp/deploy`.
4. Copy `.env.example` to `.env` and edit it:

   ```bash
   cd /volume1/docker/synamp/deploy
   cp .env.example .env
   ```

   At minimum: `MUSIC_PATH`, `DATA_DIR`, a real `POSTGRES_PASSWORD`, and a
   long random `PLAYLIST_API_TOKEN` if using the `app` profile.

   **Never put `.env` inside the music share**, and never commit it. It is
   already gitignored.

## 2. Bring it up

```bash
cd /volume1/docker/synamp/deploy

docker compose --env-file .env up -d                  # library core + database
docker compose --env-file .env --profile app up -d    # + brain, web, edge
```

Then:

- **SynAmp web app** → `http://<nas>:8080/`
- **Navidrome** (library admin, Subsonic server) → `http://<nas>:4533/`
- **Subsonic API** for native clients → `http://<nas>:8080/rest/`

Create the first Navidrome admin account in its web UI and wait for its initial
scan to finish. From the Mac, set `SUBSONIC_USER` and `SUBSONIC_PASSWORD` in the
process environment, then check the same Subsonic route native clients will use:

```bash
node tools/nas/check-playback.mjs http://<nas>:8080
```

The check authenticates, finds one indexed track, and reads a short audio sample.
Run its local regression checks with `node --test tools/nas/check-playback.test.mjs`.
Use the Tailscale URL from a remote machine to verify that route too. The
credentials should not be stored in `deploy/.env` or shell history; use your
shell's private environment or a local secret manager.

In each native client, use `http://<nas>:8080` (or its Tailscale address) as the
server URL. Choose **original quality** on Wi-Fi/LAN and a **256 kbps** mobile
profile in the client. Navidrome honors Subsonic `maxBitRate` requests; it cannot
infer LAN versus cellular from a request arriving over Tailscale. Verify actual
phone playback and lock-screen/CarPlay controls in the client before marking
Phase 1 complete.

The first Navidrome scan of a ~4,200-album library takes a few minutes; watch it
at `http://<nas>:4533/`.

## Plays from other apps, and Last.fm

Native apps reach Navidrome **through the brain** (`/rest/*` → brain → core).
The brain passes every call through untouched and, when Navidrome accepts an
app's `scrobble`, records the play. For that to work:

- **Point apps at the edge** (`http://<nas>:8080`), never at `:4533` directly —
  plays sent straight to Navidrome bypass SynAmp.
- **Real paths.** Compose sets `ND_SUBSONIC_DEFAULTREPORTREALPATH=true`, which
  applies to players Navidrome sees for the first time. For apps you already
  connected, open Navidrome → your profile → **Players**, pick each app and turn
  on **Report Real Path**. Without it, plays are still recorded but show as
  “could not be matched” in SynAmp.
- Apps report plays, not skips, so they only ever count as a mild positive.

**Last.fm (optional).** Put `LASTFM_API_KEY` / `LASTFM_API_SECRET` in `.env`,
restart the app profile, then in SynAmp open **Listening history & Last.fm →
Connect Last.fm**. It scrobbles plays from the SynAmp player and from your
other apps, only while switched on, using names from tags (never folder
guesses). **Do not also link Last.fm inside Navidrome** (Settings → Personal →
Last.fm), or plays from other apps are sent twice. The session key is stored in
`DATA_DIR/brain/lastfm.json` — keep that directory private.

## Organising the library (the librarian)

The **Organise the library** panel proposes tidier names and folders; nothing
changes until you approve and apply. Applying needs the **librarian**, the one
service with write access to the music. It is opt-in:

1. Take a Btrfs snapshot of the music share first (Snapshot & Replication).
2. In `deploy/.env` set `PUID`/`PGID` to the owner of the music files. Over
   SSH on the NAS, `ls -ln /volume1/music/library | head -5` shows them as the
   3rd and 4th columns (e.g. `1026 100`); `id tapps` should agree. Check
   `MUSIC_SHARE` (default `/volume1/music`) and create `/volume1/music/.synamp`
   for the journal.
3. `docker compose --env-file .env --profile app --profile librarian up -d`
4. On the Mac, point the analyzer at the same journal:
   `RENAME_JOURNAL_PATH=/Volumes/music/.synamp/renames.jsonl`, then run
   `scan` and `export` after a batch, so analysis follows the moved files.

Stop it again with `docker compose stop librarian` when you're not organising.

### Adding new music

Two doors, one review: copy albums into `/volume1/music/incoming/` (Finder,
over the `music` share), or drag files and folders onto **Add music** in the
web app (copies; your originals stay put). Either way they appear under
**New music** in the Organise panel, named to the standard: tracks for an album
you already have go into that album's folder, an artist you already have keeps
its folder spelling, and a file identical to one already there is set aside in
`incoming/_duplicates/` (never deleted). Approve, Apply, and the librarian files
them. Files still being copied into `incoming/` wait until they've been still
for 30 seconds. The brain needs read-write on `incoming/` only (`INCOMING_PATH`);
the library stays read-only for everything but the librarian.

## 3. Remote access

Put **Tailscale** in front rather than port-forwarding: install the Synology
Tailscale package, then reach the NAS at its Tailscale name from your phone and
Mac as if you were on the LAN.

When you want a public hostname, give Caddy a real domain in `Caddyfile` and open
only 443. Note that **`.app` domains are HSTS-preloaded** — `synamp.app` can only
ever be served over HTTPS, which is fine (Caddy handles certificates) but means
there is no plain-HTTP fallback.

## What does NOT run here

The **analysis worker** (`services/analyzer`) deliberately runs on the brain
machine — the M4 Pro — not on the NAS. The V1500B has no GPU; audio-embedding and
LLM inference would be unusably slow here and would compete with file serving.
The worker writes results into the `db` service, which *does* run on the NAS.

## Notes

- Audio transcoding is cheap: the V1500B handles several simultaneous audio
  streams. Hardware acceleration is irrelevant (that is a video concern).
- The `--profile app` services build from the relative contexts `../apps/brain`
  and `../apps/web`, so `deploy/` has to sit **inside the repo** (`<repo>/deploy`,
  with `<repo>/apps/` present). Copying only `deploy/` to the NAS is not enough
  for that profile. The base profile still gives you a working library +
  Subsonic server on its own.
- **Never bind-mount `DATA_DIR` from a network share.** Postgres needs real file
  locking; a network filesystem can corrupt it. Local disk or the NAS only.

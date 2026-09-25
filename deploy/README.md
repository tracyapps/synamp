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

   At minimum: `MUSIC_PATH`, `DATA_DIR`, and a real `POSTGRES_PASSWORD`.

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

The first Navidrome scan of a ~4,200-album library takes a few minutes; watch it
at `http://<nas>:4533/`.

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

# SynAmp candidate release verification

This procedure implements B03 checks; it is not permission to commit, push,
publish, deploy, change branch protection or modify a running library. Use the
[business gates](../business/90-day-roadmap.md) to decide release eligibility.

## Reproduce the supported code checks

Use Node 22/24 and pnpm 9.12.0. Install from `pnpm-lock.yaml` with
`pnpm install --frozen-lockfile`. The candidate runtime checks intentionally
cover Brain and the current web/site/tool surfaces; root vendor-package suites
are separate and are not claimed by this procedure.

```sh
pnpm --filter @synamp/brain test
pnpm --filter @synamp/brain type-check
pnpm brain:readback:type-check
node --experimental-strip-types --test tools/*.test.mts tools/brain-lab/*.test.mts tools/nas/*.test.mjs tools/install/*.test.mjs tools/release/*.test.mjs
pnpm --filter @synamp/web build
pnpm --dir site test
pnpm --dir site build
git diff --check
```

Provide ffmpeg for generated-audio conversion checks. Do not count the existing
cross-filesystem skip as proof of copied-file verification; run that configured
test on a genuine second filesystem for the release gate. The macOS CI job
fails if its temporary volume cannot exercise actual case-insensitive aliases.
The Linux job covers separate case-sensitive directory behavior when hosted CI
has run; this session's Mac checks alone do not prove it.

## Isolated analyzer checks

Never sync dependencies into the owner's running analyzer environment to make
CI work. Create a dedicated absolute path outside the checkout and active state:

```sh
UV_PROJECT_ENVIRONMENT=/absolute/private/ci-analyzer-venv \
  uv sync --locked --extra dev --python 3.12 --project services/analyzer
UV_PROJECT_ENVIRONMENT=/absolute/private/ci-analyzer-venv \
  uv run --no-sync --project services/analyzer python -m pytest services/analyzer/tests -q
```

Do not install the listen extra or fetch weights for the default CI job. Voice
tests use stand-in model outputs; this is bookkeeping/contract evidence, not
PANNs inference accuracy or licensing clearance. The October 11 local run uses
Python 3.12.13 and uv 0.12.1; dependency versions are fixed by the committed
`services/analyzer/uv.lock`. Decoder deprecation warnings are retained.

## Browser checks

With the repository's existing Puppeteer/Chromium available, run:

```sh
node tools/player/check-actions.mjs /absolute/private/evidence/player
node tools/player/check-library-finder.mjs /absolute/private/evidence/library-finder
node tools/player/check-library-playback.mjs /absolute/private/evidence/library-playback
node tools/player/check-library-layout.mjs /absolute/private/evidence/library-layout
node tools/player/check-updates.mjs /absolute/private/evidence/updates
```

The harness starts isolated Brain/web processes and generated audio, records
results/screenshots, and cleans up its stores/processes. A separate Node 22
Ubuntu browser CI job runs all three harnesses with the Chrome build pinned by
the locked Puppeteer dependency. Ordinary Node jobs keep downloads disabled.
Runtime dependencies follow the [Puppeteer Linux guidance](https://pptr.dev/troubleshooting),
using Ubuntu 24.04 package names. Assertions remain in hosted logs; screenshots
are temporary runner files, not uploaded artifacts. Do not infer browser success
from unit checks, a build, or workflow lint.
The Library harnesses also cover artist changes, album failure/retry, file
reveal requests, clicked-track identity and actual generated-audio startup from
the full App while stopped, paused and playing. Brain tests include cold large
Explorer queries yielding to other server work. None of these checks establish
owner-NAS latency, physical Finder selection or by-ear audio quality.
Correction/shortage, update and restore coverage still needs build-specific
review beyond these harnesses.

## Hosted checks and candidate identity

The workflow is [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
Its action pins were resolved against official repositories; configuration was
checked using checksum-verified [actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12).
The setup follows the official [Node action](https://github.com/actions/setup-node)
and [uv action](https://github.com/astral-sh/setup-uv) inputs.

Record SHA, dirty state, actual image/build identity, runtime versions, command
exit codes, counts, skip reasons, hardware and private evidence locations for
every candidate. Local workflow lint is not a GitHub run. Once a separately
authorized push exists, require all six jobs to pass on that exact SHA:
two Node/Linux jobs, a browser job, macOS rename job and two analyzer jobs. Branch protection
configuration needs its own explicit authorization and hosted verification.

Passing software checks cannot close G4: actual install cohorts, quality raters,
mature retention, backups/restores, data rollback, private access, device/audio
checks, rights decisions, purchase/refund flow and support capacity remain
separate evidence. See the [October 11 receipt](../business/execution-2026-10-11.md).

## Making a release

From a commit whose checks are green on `main`:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

[`release.yml`](../../.github/workflows/release.yml) runs every release check
again; only if all pass does [`tools/release/publish.sh`](../../tools/release/publish.sh)
build the brain and web images for x86-64 (with the version in About this
install), push them to `ghcr.io/tracyapps/synamp-brain` and `synamp-web`, and
make `synamp-<version>.zip` pinned to their digests. The GitHub Release is a
**draft**: read it, then press **Publish release**. A tag with a suffix
(`v0.2.0-beta.1`) becomes a pre-release.

The first time, check each package's settings on GitHub (Packages → the
package → Package settings) shows it as **public**, so installs can download
it without signing in.

The zip holds the release Compose file (images pinned by digest; generated by
`tools/release/compose.mjs`), the guided setup, the recovery tool and the
licence; never `.env` or data, so unzipping a release over an install keeps
both. Updating and going back are the same move: back up DATA_DIR, unzip the
release you want, then Container Manager → Project → synamp → Action → Build.
Going back after an update that changed stored data needs that backup.

Rehearsed October 12 with a private registry on Linux x86-64 Docker (stand-in
base image; Alpine's package server is blocked in that sandbox): v0.1.0
published and installed from its zip with the guided setup (images pulled, not
built: 32s to healthy), a playlist added, v0.2.0 unzipped over it (3s; version
0.2.0; playlists kept; `.env` byte-identical), then back to v0.1.0 the same way
(3s; version 0.1.0; playlists kept), and a FLAC streamed through the edge.
Not yet run on DSM or Container Manager, or with a release that changes stored
data.

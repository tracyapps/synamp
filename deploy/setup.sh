#!/bin/sh
# SynAmp setup for your server. Run it from this folder, as an administrator:
#
#   sudo ./setup.sh
#
# It asks a few questions, shows you the plan, and changes nothing until you
# say yes. Safe to run again: it keeps your settings and finishes what's left.
# It never touches your music files.
#
# DSM has no Node of its own, so the setup steps (tools/install/setup.mjs) run
# inside the same pinned Node image SynAmp is built from. Other Linux servers
# with Node 22 or newer use their own.
#
# Options are passed on to setup (see: sudo ./setup.sh --help), plus:
#   --start   start SynAmp from here when setup is done (not on a Synology:
#             there, start it from Container Manager so it stays manageable).
set -eu

deploy=$(cd "$(dirname "$0")" && pwd)
root=$(dirname "$deploy")
start=no
for arg in "$@"; do [ "$arg" = "--start" ] && start=yes; done
# Everything except --start goes to setup.mjs.
for arg in "$@"; do shift; [ "$arg" = "--start" ] || set -- "$@" "$arg"; done

say() { printf '%s\n' "$*"; }
stop() { say "$*"; exit 1; }

if [ -f /etc/synoinfo.conf ]; then synology=yes; else synology=no; fi
[ "$(id -u)" = 0 ] || stop "Run setup as an administrator: sudo ./setup.sh"
[ -f "$root/tools/install/setup.mjs" ] || stop "Keep this deploy folder beside the apps and tools folders it came with."

docker=$(command -v docker || true)
[ -n "$docker" ] || [ ! -x /usr/local/bin/docker ] || docker=/usr/local/bin/docker
[ -n "$docker" ] || stop "Docker isn't installed. On a Synology, install Container Manager from Package Center, then run setup again."
arch=$("$docker" info --format '{{.Architecture}}' 2>/dev/null || true)
case "$arch" in
  x86_64|amd64) ;;
  "") stop "Docker isn't running, or this user can't reach it. On a Synology, open Container Manager once, then run setup again." ;;
  *) stop "SynAmp is tested on Intel/AMD (x86-64) servers. This one reports \"$arch\"." ;;
esac
"$docker" compose version >/dev/null 2>&1 || stop "This Docker has no Compose. Update Container Manager (or install the Docker Compose plugin)."

node_ok() { command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; }
# SYNAMP_SETUP_IN_CONTAINER=1 uses the pinned image even when this server has Node.
if [ "${SYNAMP_SETUP_IN_CONTAINER:-}" != 1 ] && node_ok; then
  node "$root/tools/install/setup.mjs" --no-docker-checks "$@" || exit $?
else
  # The Node image the Brain is built from: one pinned version for everything.
  image=$(sed -n 's/^FROM \(node:[^ ]*\).*/\1/p' "$root/apps/brain/Dockerfile" | tail -n 1)
  [ -n "$image" ] || stop "Couldn't find SynAmp's Node image in apps/brain/Dockerfile."
  # Folders appear at the same paths inside, so the paths you type are the real ones.
  mounts="-v $root:$root -v /etc/passwd:/etc/passwd:ro"
  for volume in /volume*; do [ -d "$volume" ] && mounts="$mounts -v $volume:$volume"; done
  tty="-i"; [ -t 0 ] && tty="-it"
  say "Getting the setup helper ready (a one-time download)..."
  # shellcheck disable=SC2086 # mounts and tty are lists of words on purpose
  "$docker" run --rm $tty --network none $mounts -w "$root" "$image" \
    node tools/install/setup.mjs --no-docker-checks "$@" || exit $?
fi

cd "$deploy"
"$docker" compose --env-file .env config --quiet >/dev/null 2>&1 \
  || stop "Docker can't read the settings together with docker-compose.yml. Check .env for a changed line, then run setup again."

port=$(sed -n 's/^HTTP_PORT=\([0-9]*\).*/\1/p' .env | tail -n 1); port=${port:-8080}
say ""
if [ "$start" = yes ] && [ "$synology" = no ]; then
  say "Starting SynAmp. The first start builds it, which takes a few minutes..."
  "$docker" compose --env-file .env up -d --build --wait --wait-timeout 900 \
    || stop "SynAmp didn't start. See what went wrong with: sudo docker compose logs --tail 50"
  if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$port/health" >/dev/null 2>&1; then
    say "SynAmp is running: open http://$(hostname):$port"
  else
    say "SynAmp started, but didn't answer on port $port yet. Give it a minute, then open http://$(hostname):$port"
  fi
else
  say "Ready. To start SynAmp:"
  if [ "$synology" = yes ]; then
    say "  1. Open Container Manager, then Project, then Create."
    say "  2. Project name: synamp. Path: $deploy"
    say "  3. Choose \"Use the existing docker-compose.yml\", then Next, then Done."
    say "     The first build takes a few minutes; its log window shows progress."
  else
    say "  sudo ./setup.sh --start     (or: sudo docker compose up -d --build)"
  fi
  say "Then open http://$(hostname):$port"
fi
say "SynAmp will ask for your access token the first time. To see it: sudo ./setup.sh --yes --show-token"

#!/bin/sh
# Try SynAmp for Mac from a checkout of the repository, on this Mac:
# builds the web app and the app, fetches Navidrome, makes sure listening's
# Python is ready, then opens SynAmp.app pointed at this checkout.
#
#   apps/mac/scripts/run-dev.sh
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$here/../.." && pwd)
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
"$here/scripts/fetch-navidrome.sh"
( cd "$repo/apps/web" && [ -d node_modules ] || npm ci --no-audit --no-fund ) >/dev/null
( cd "$repo/apps/web" && npm run build ) >/dev/null
( cd "$repo/services/analyzer" && uv sync -q --extra listen )
"$here/scripts/build-app.sh" >/dev/null
# `open` doesn't pass environment variables, so start the app's program directly.
# Its data stays in apps/mac/build/dev-data, apart from a real install.
SYNAMP_DEV_REPO="$repo" SYNAMP_DEV_SUPPORT="$here/build/dev-data" nohup "$here/build/SynAmp.app/Contents/MacOS/SynAmp" >"$here/build/SynAmp-dev.log" 2>&1 &
echo "SynAmp started from $repo (log: $here/build/SynAmp-dev.log)"

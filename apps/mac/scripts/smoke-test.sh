#!/bin/sh
# Check a packaged SynAmp.app's insides work on this Mac, without a window:
# each bundled program starts, Python has listening, and the SynAmp server
# answers and serves the web app.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
rt="${APP:-$here/build/SynAmp.app}/Contents/Resources/runtime"
"$rt/node/bin/node" --version
"$rt/navidrome/navidrome" --version
"$rt/python/bin/python3" -c "import synamp_analyzer.cli, onnxruntime, numpy, scipy, soundfile; print('python: listening ready, onnxruntime', onnxruntime.__version__)"
tmp=$(mktemp -d)
mkdir -p "$tmp/music" "$tmp/data"
( cd "$rt/brain" && WEB_ROOT="$rt/web" LIBRARY_PATH="$tmp/music" PLAYLIST_DATA_PATH="$tmp/data/playlists.json" \
  LIBRARY_SIGNALS_PATH="$tmp/data/library-signals.json" BRAIN_PORT=38380 CORE_URL=http://127.0.0.1:1 UPDATE_CHECKS=off \
  BUILD_INFO_PATH="$rt/build.json" "$rt/node/bin/node" --experimental-strip-types src/index.ts > "$tmp/brain.log" 2>&1 & echo $! > "$tmp/pid" )
ok=0
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:38380/health >/dev/null 2>&1 && { ok=1; break; }; sleep 0.5; done
web=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' http://127.0.0.1:38380/ || true)
kill "$(cat "$tmp/pid")" 2>/dev/null || true
[ "$ok" = 1 ] || { cat "$tmp/brain.log"; echo "the SynAmp server didn't answer"; exit 1; }
echo "server: answering; web app: $web"
case "$web" in "200 text/html"*) ;; *) echo "the web app wasn't served"; exit 1 ;; esac
echo "smoke test passed"

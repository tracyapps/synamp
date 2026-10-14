#!/bin/sh
# Gather everything SynAmp.app carries inside it, for this Mac's chip, into
# apps/mac/build/bundle/runtime (then build-app.sh puts it in the app):
#
#   node/bin/node        Node 22 (runs the SynAmp server and library care)
#   brain/               apps/brain/src (no dependencies to install)
#   web/                 apps/web, built
#   navidrome/navidrome  Navidrome (phone apps)
#   python/              Python 3.12 with the analyzer and ONNX Runtime
#   build.json           which code this is (Settings → About this install)
#   LICENSES/            the licences of what's bundled
#
# Every download is a pinned version checked against its SHA-256.
# Not bundled yet: ffmpeg (needs an LGPL build), the listening model (licence).
#
#   apps/mac/scripts/bundle-runtime.sh            # VERSION=0.3.0 to stamp a release
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
here=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$here/../.." && pwd)
case "$(uname -m)" in
  arm64) node_arch=arm64; py_arch=aarch64
         node_sha=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53
         py_sha=316a463172740e71d8dca1f2730784e325f3f720941137b5d674d5801a632213 ;;
  x86_64) node_arch=x64; py_arch=x86_64
          node_sha=8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8
          py_sha=a8fd7a91852f19b6d959793ef41fad048631ccb2a334a9ecdf573255298f7978 ;;
  *) echo "No SynAmp build for $(uname -m)"; exit 2 ;;
esac
NODE_VERSION=22.23.3
PY_VERSION=3.12.15
PY_RELEASE=20261003

out="$here/build/bundle/runtime"
cache="$here/build/downloads"
rm -rf "$out"
mkdir -p "$out/LICENSES" "$cache"

fetch() { # url sha256 file
  if [ ! -f "$cache/$3" ] || ! echo "$2  $cache/$3" | shasum -a 256 -c - >/dev/null 2>&1; then
    curl -fsSL -o "$cache/$3.part" "$1"
    echo "$2  $cache/$3.part" | shasum -a 256 -c - >/dev/null
    mv "$cache/$3.part" "$cache/$3"
  fi
}

echo "· Node $NODE_VERSION"
node_file="node-v$NODE_VERSION-darwin-$node_arch.tar.gz"
fetch "https://nodejs.org/dist/v$NODE_VERSION/$node_file" "$node_sha" "$node_file"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tar -xzf "$cache/$node_file" -C "$tmp"
mkdir -p "$out/node/bin"
cp "$tmp/node-v$NODE_VERSION-darwin-$node_arch/bin/node" "$out/node/bin/node"
cp "$tmp/node-v$NODE_VERSION-darwin-$node_arch/LICENSE" "$out/LICENSES/node.txt"

echo "· SynAmp server"
mkdir -p "$out/brain"
cp -R "$repo/apps/brain/src" "$out/brain/src"
cp "$repo/apps/brain/package.json" "$out/brain/package.json"
find "$out/brain/src" -name '*.test.ts' -delete
SYNAMP_VERSION="${VERSION:-}" "$out/node/bin/node" --experimental-strip-types "$repo/apps/brain/src/version.ts" "$repo/apps" > "$out/build.json"

echo "· Web app"
( cd "$repo/apps/web" && { [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null; } && npm run build >/dev/null )
cp -R "$repo/apps/web/dist" "$out/web"

echo "· Navidrome"
"$here/scripts/fetch-navidrome.sh" >/dev/null
mkdir -p "$out/navidrome"
cp "$here/build/runtime/navidrome/navidrome" "$out/navidrome/navidrome"
[ -f "$here/build/runtime/navidrome/LICENSE" ] && cp "$here/build/runtime/navidrome/LICENSE" "$out/LICENSES/navidrome.txt"

echo "· Python $PY_VERSION with listening"
py_file="cpython-$PY_VERSION+$PY_RELEASE-$py_arch-apple-darwin-install_only.tar.gz"
fetch "https://github.com/astral-sh/python-build-standalone/releases/download/$PY_RELEASE/$(printf '%s' "$py_file" | sed 's/+/%2B/')" "$py_sha" "$py_file"
tar -xzf "$cache/$py_file" -C "$out"   # → $out/python
cp "$out/python/lib/python3.12/LICENSE.txt" "$out/LICENSES/python.txt" 2>/dev/null || true
# Exactly the locked versions (uv.lock), then the analyzer itself.
( cd "$repo/services/analyzer" && uv export -q --frozen --no-dev --extra listen --no-emit-project --format requirements-txt ) > "$tmp/requirements.txt"
uv pip install -q --python "$out/python/bin/python3" --break-system-packages --no-cache --require-hashes -r "$tmp/requirements.txt"
uv pip install -q --python "$out/python/bin/python3" --break-system-packages --no-cache --no-deps "$repo/services/analyzer"
# Parts of Python SynAmp never uses.
rm -rf "$out/python/lib/python3.12/test" "$out/python/lib/python3.12/idlelib" "$out/python/lib/python3.12/tkinter" \
       "$out/python/lib/python3.12/turtledemo" "$out/python/lib/python3.12/ensurepip" "$out/python/share"
find "$out/python" -name '__pycache__' -type d -prune -exec rm -rf {} +
"$out/python/bin/python3" -c "import synamp_analyzer.cli, onnxruntime, numpy, scipy, soundfile; print('  python ok')"

du -sh "$out" | awk '{print "· runtime: " $1}'
echo "$out"

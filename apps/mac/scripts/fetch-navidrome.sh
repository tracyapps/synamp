#!/bin/sh
# Download Navidrome for this Mac's chip into build/runtime/navidrome/, checked
# against its pinned SHA-256 (same version as deploy/docker-compose.yml).
#
#   apps/mac/scripts/fetch-navidrome.sh            # this Mac's chip
#   ARCH=amd64 apps/mac/scripts/fetch-navidrome.sh # an Intel build
set -eu
VERSION=0.64.2
case "${ARCH:-$(uname -m)}" in
  arm64|aarch64) arch=arm64; sha=8b0a7798001453719ad50c12f7025a6044546c4a3568efe51feb296681f29956 ;;
  x86_64|amd64)  arch=amd64; sha=bc872847dcd1c0d760bb9b8730f2a3c876e0ff0679e5440755c37697f2804a23 ;;
  *) echo "No Navidrome build for $(uname -m)"; exit 2 ;;
esac
here=$(cd "$(dirname "$0")/.." && pwd)
out="$here/build/runtime/navidrome"
file="navidrome_${VERSION}_darwin_${arch}.tar.gz"
mkdir -p "$out"
if [ -x "$out/navidrome" ] && [ "$(cat "$out/VERSION" 2>/dev/null)" = "$VERSION-$arch" ]; then
  echo "Navidrome $VERSION ($arch) already here"; exit 0
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/$file" "https://github.com/navidrome/navidrome/releases/download/v$VERSION/$file"
echo "$sha  $tmp/$file" | shasum -a 256 -c - >/dev/null
tar -xzf "$tmp/$file" -C "$tmp" navidrome LICENSE README.md 2>/dev/null || tar -xzf "$tmp/$file" -C "$tmp"
cp "$tmp/navidrome" "$out/navidrome"
[ -f "$tmp/LICENSE" ] && cp "$tmp/LICENSE" "$out/LICENSE"
chmod 755 "$out/navidrome"
echo "$VERSION-$arch" > "$out/VERSION"
echo "Navidrome $VERSION ($arch) → $out"

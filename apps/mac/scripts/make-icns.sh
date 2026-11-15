#!/bin/sh
# Make apps/mac/icon/AppIcon.icns from AppIcon-1024.png (every size macOS asks for).
# Run on a Mac after changing the picture; the .icns is kept in the repo so
# building the app needs nothing extra.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
src="$here/icon/AppIcon-1024.png"
set_dir=$(mktemp -d)/AppIcon.iconset
mkdir -p "$set_dir"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$src" --out "$set_dir/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$src" --out "$set_dir/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$set_dir" -o "$here/icon/AppIcon.icns"
echo "$here/icon/AppIcon.icns"

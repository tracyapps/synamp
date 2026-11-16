#!/bin/sh
# Put SynAmp.app on a disk image with a shortcut to Applications: the download.
# The window that opens shows what to do (apps/mac/dmg: picture, icon places).
#
#   VERSION=0.3.0 apps/mac/scripts/make-dmg.sh   → build/SynAmp-0.3.0-<chip>.dmg
#
# Needs dmgbuild (`pip install dmgbuild`): it lays the window out without
# opening Finder, so it works on a build machine. PLAIN_DMG=1 skips the layout.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
app="${APP:-$here/build/SynAmp.app}"
chip=$(uname -m | sed 's/x86_64/intel/;s/arm64/apple-silicon/')
mkdir -p "$here/build"
dmg="$here/build/SynAmp-${VERSION:-dev}-$chip.dmg"
stage=$(mktemp -d); trap 'rm -rf "$stage"' EXIT
rm -f "$dmg"

if [ "${PLAIN_DMG:-0}" = "1" ]; then
  cp -R "$app" "$stage/SynAmp.app"
  ln -s /Applications "$stage/Applications"
  hdiutil create -quiet -volname "SynAmp" -srcfolder "$stage" -fs HFS+ -format ULFO -ov "$dmg"
else
  if command -v dmgbuild >/dev/null 2>&1; then build="dmgbuild"
  elif python3 -c 'import dmgbuild' 2>/dev/null; then build="python3 -m dmgbuild"
  else
    echo "make-dmg: dmgbuild is missing. Install it (pip install dmgbuild), or set PLAIN_DMG=1 for a window with no picture." >&2
    exit 1
  fi
  # One picture file holding the normal and the Retina drawing.
  tiffutil -cathidpicheck "$here/dmg/background.png" "$here/dmg/background@2x.png" -out "$stage/background.tiff" >/dev/null
  $build -s "$here/dmg/settings.py" -D app="$app" -D here="$here" -D background="$stage/background.tiff" "SynAmp" "$dmg" >/dev/null
fi
[ "${SIGN_IDENTITY:--}" = "-" ] || codesign --force --timestamp --sign "$SIGN_IDENTITY" "$dmg"
du -h "$dmg" | awk '{print $2 " (" $1 ")"}'

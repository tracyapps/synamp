#!/bin/sh
# Put SynAmp.app on a disk image with a shortcut to Applications: the download.
#
#   VERSION=0.3.0 apps/mac/scripts/make-dmg.sh   → build/SynAmp-0.3.0-<chip>.dmg
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
app="${APP:-$here/build/SynAmp.app}"
chip=$(uname -m | sed 's/x86_64/intel/;s/arm64/apple-silicon/')
dmg="$here/build/SynAmp-${VERSION:-dev}-$chip.dmg"
stage=$(mktemp -d); trap 'rm -rf "$stage"' EXIT
cp -R "$app" "$stage/SynAmp.app"
ln -s /Applications "$stage/Applications"
rm -f "$dmg"
hdiutil create -quiet -volname "SynAmp" -srcfolder "$stage" -fs HFS+ -format ULFO -ov "$dmg"
[ "${SIGN_IDENTITY:--}" = "-" ] || codesign --force --timestamp --sign "$SIGN_IDENTITY" "$dmg"
du -h "$dmg" | awk '{print $2 " (" $1 ")"}'

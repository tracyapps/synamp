#!/bin/sh
# Sign SynAmp.app and every program and library inside it, inside-out, with the
# hardened runtime (needed for notarization).
#
#   SIGN_IDENTITY="Developer ID Application: tracy apps (65LD7TZAL3)" apps/mac/scripts/sign-app.sh
#   apps/mac/scripts/sign-app.sh            # no identity: ad-hoc, for trying it on this Mac
#
# The first real signing asks macOS for the key: "codesign wants to access key …
# in your keychain" — choose Always Allow.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
app="${APP:-$here/build/SynAmp.app}"
identity="${SIGN_IDENTITY:--}"
ent="$here/scripts/entitlements-runtime.plist"
if [ "$identity" = "-" ]; then
  flags="--force --sign -"           # ad-hoc: no hardened runtime (it would refuse ad-hoc libraries)
else
  flags="--force --options runtime --timestamp --sign"
fi
sign() { # file [entitlements]
  if [ "$identity" = "-" ]; then codesign $flags ${2:+--entitlements "$2"} "$1"
  else codesign $flags "$identity" ${2:+--entitlements "$2"} "$1"; fi
}
runtime="$app/Contents/Resources/runtime"
count=0
if [ -d "$runtime" ]; then
  # Libraries first, then programs (a program's signature covers what it loads).
  find "$runtime" -type f \( -name '*.so' -o -name '*.dylib' \) | while read -r f; do
    file -b "$f" | grep -q Mach-O && sign "$f"
  done
  find "$runtime" -type f -perm -u+x ! -name '*.so' ! -name '*.dylib' | while read -r f; do
    if file -b "$f" | grep -q Mach-O; then
      case "$f" in
        */node/bin/node|*/python/bin/python3*) sign "$f" "$ent" ;;
        *) sign "$f" ;;
      esac
    fi
  done
  count=$(find "$runtime" -type f \( -name '*.so' -o -name '*.dylib' -o -perm -u+x \) | wc -l | tr -d ' ')
fi
sign "$app"
codesign --verify --deep --strict "$app"
echo "signed $app ($count files inside) as ${identity}"

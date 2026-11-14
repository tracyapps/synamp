#!/bin/sh
# Everything, in order: bundle the runtime, build the app with it, sign, make
# the disk image, and (with NOTARIZE=1) notarize it.
#
#   VERSION=0.3.0 SIGN_IDENTITY="Developer ID Application: tracy apps (65LD7TZAL3)" NOTARIZE=1 \
#     apps/mac/scripts/package-app.sh
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
"$here/scripts/bundle-runtime.sh"
BUNDLE=1 "$here/scripts/build-app.sh" >/dev/null
"$here/scripts/sign-app.sh"
dmg=$("$here/scripts/make-dmg.sh" | awk '{print $1}')
if [ "${NOTARIZE:-0}" = 1 ]; then "$here/scripts/notarize.sh" "$dmg"; fi
echo "$dmg"

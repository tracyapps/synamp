#!/bin/sh
# Send the signed disk image to Apple to be checked (notarized), then attach
# Apple's ticket so it opens without warnings, even offline.
#
# Once, store your credentials in the Keychain (an app-specific password from
# appleid.apple.com, or an App Store Connect API key):
#   xcrun notarytool store-credentials SynAmp --apple-id <you> --team-id 65LD7TZAL3
# Then:
#   apps/mac/scripts/notarize.sh build/SynAmp-0.3.0-apple-silicon.dmg
set -eu
dmg="${1:?the .dmg to notarize}"
profile="${NOTARY_PROFILE:-SynAmp}"
xcrun notarytool submit "$dmg" --keychain-profile "$profile" --wait
xcrun stapler staple "$dmg"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature -v "$dmg"

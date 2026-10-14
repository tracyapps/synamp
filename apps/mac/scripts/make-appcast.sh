#!/bin/sh
# The update feed for one chip: appcast-<chip>.xml, naming this release's disk
# image and its EdDSA signature (Sparkle checks it before installing anything).
#
#   VERSION=0.3.0 SPARKLE_KEY_FILE=~/sparkle-private-key apps/mac/scripts/make-appcast.sh build/SynAmp-0.3.0-apple-silicon.dmg
#   (no SPARKLE_KEY_FILE: sign_update uses the key in your login Keychain)
#
# Attach it to the GitHub release next to the disk image; the app reads
# releases/latest/download/appcast-<chip>.xml, so the newest published
# release is always the one offered.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
dmg="${1:?the .dmg}"
version="${VERSION:?VERSION, e.g. 0.3.0}"
chip=$(uname -m | sed 's/x86_64/intel/;s/arm64/apple-silicon/')
tool=$(find "$here/.build/artifacts" -path '*Sparkle/bin/sign_update' -type f | head -n 1)
[ -x "$tool" ] || { echo "Build the app first (Sparkle's tools come with it)"; exit 2; }
if [ -n "${SPARKLE_KEY_FILE:-}" ]; then sig=$("$tool" --ed-key-file "$SPARKLE_KEY_FILE" "$dmg")
else sig=$("$tool" "$dmg"); fi
name=$(basename "$dmg")
url="https://github.com/tracyapps/synamp/releases/download/v$version/$name"
notes="https://github.com/tracyapps/synamp/releases/tag/v$version"
out="$(dirname "$dmg")/appcast-$chip.xml"
cat > "$out" <<XML
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>SynAmp for Mac ($chip)</title>
    <item>
      <title>SynAmp $version</title>
      <pubDate>$(LC_ALL=C date -u '+%a, %d %b %Y %H:%M:%S +0000')</pubDate>
      <sparkle:version>$version</sparkle:version>
      <sparkle:shortVersionString>$version</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>$notes</sparkle:releaseNotesLink>
      <enclosure url="$url" type="application/octet-stream" $sig />
    </item>
  </channel>
</rss>
XML
echo "$out"

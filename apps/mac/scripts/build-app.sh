#!/bin/sh
# Build SynAmp.app from this package.
#
#   apps/mac/scripts/build-app.sh          # → apps/mac/build/SynAmp.app
#
# This first version is for trying the app on a Mac with a checkout of the
# repository: start it with SYNAMP_DEV_REPO=<repo> (scripts/run-dev.sh does), and
# it uses Homebrew's Node and ffmpeg, the analyzer's own Python environment and
# the Navidrome from fetch-navidrome.sh. Bundling those inside the app, signing
# and notarizing come next (docs/synamp/plans/MAC-APP.md).
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
config=${CONFIG:-release}
cd "$here"
swift build -c "$config" --product SynAmp
bin="$(swift build -c "$config" --show-bin-path)/SynAmp"
app="$here/build/SynAmp.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/SynAmp"
version=$(git -C "$here" describe --tags --always 2>/dev/null || echo dev)
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>SynAmp</string>
  <key>CFBundleDisplayName</key><string>SynAmp</string>
  <key>CFBundleIdentifier</key><string>org.synamp.app</string>
  <key>CFBundleExecutable</key><string>SynAmp</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.0.0</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <!-- A menu-bar app: no Dock icon. -->
  <key>LSUIElement</key><true/>
  <key>NSHumanReadableCopyright</key><string>SynAmp</string>
  <key>NSLocalNetworkUsageDescription</key><string>SynAmp plays your music to phones and other computers at home, and reads music on your network drive.</string>
</dict>
</plist>
PLIST
# Ad-hoc signature for trying it on this Mac; Developer ID signing comes with packaging.
codesign --force --sign - "$app" >/dev/null
echo "$app"

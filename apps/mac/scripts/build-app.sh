#!/bin/sh
# Build SynAmp.app from this package.
#
#   apps/mac/scripts/build-app.sh          # → apps/mac/build/SynAmp.app
#
# Two ways to use it:
# - Development: start the app with SYNAMP_DEV_REPO=<repo> (scripts/run-dev.sh
#   does) and it uses this checkout and the Mac's own Node.
# - The real thing: BUNDLE=1 puts build/bundle/runtime (scripts/bundle-runtime.sh)
#   inside the app, then scripts/sign-app.sh, make-dmg.sh and notarize.sh.
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
if [ "${BUNDLE:-0}" = 1 ]; then
  [ -d "$here/build/bundle/runtime" ] || { echo "Run scripts/bundle-runtime.sh first"; exit 2; }
  cp -R "$here/build/bundle/runtime" "$app/Contents/Resources/runtime"
fi
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
  <key>CFBundleShortVersionString</key><string>${VERSION:-0.0.0}</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <!-- A menu-bar app: no Dock icon. -->
  <key>LSUIElement</key><true/>
  <key>NSHumanReadableCopyright</key><string>SynAmp</string>
  <key>NSLocalNetworkUsageDescription</key><string>SynAmp plays your music to phones and other computers at home, and reads music on your network drive.</string>
</dict>
</plist>
PLIST
# Ad-hoc signature for trying it on this Mac; scripts/sign-app.sh signs it for real.
codesign --force --deep --sign - "$app" >/dev/null
echo "$app"

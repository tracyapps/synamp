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
# --disable-keychain: SwiftPM otherwise looks in the Keychain for github.com
# passwords before downloading Sparkle, and waits on a permission prompt.
swift build --disable-keychain -c "$config" --product SynAmp
bin="$(swift build --disable-keychain -c "$config" --show-bin-path)/SynAmp"
app="$here/build/SynAmp.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$bin" "$app/Contents/MacOS/SynAmp"
if [ "${BUNDLE:-0}" = 1 ]; then
  [ -d "$here/build/bundle/runtime" ] || { echo "Run scripts/bundle-runtime.sh first"; exit 2; }
  cp -R "$here/build/bundle/runtime" "$app/Contents/Resources/runtime"
fi
version=${VERSION:-0.0.0}
chip=$(uname -m | sed 's/x86_64/intel/;s/arm64/apple-silicon/')
# Updates: one feed per chip, on the newest GitHub release. Without the public
# key (SPARKLE_PUBLIC_KEY) the app doesn't check for updates at all.
feed="https://github.com/tracyapps/synamp/releases/latest/download/appcast-$chip.xml"
# Sparkle (a framework) goes in Contents/Frameworks, where the program looks for it.
sparkle="$(swift build --disable-keychain -c "$config" --show-bin-path)/Sparkle.framework"
if [ -d "$sparkle" ]; then
  mkdir -p "$app/Contents/Frameworks"
  cp -R "$sparkle" "$app/Contents/Frameworks/"
  # Not sandboxed, so Sparkle's XPC helpers aren't needed (Sparkle's own advice).
  rm -rf "$app/Contents/Frameworks/Sparkle.framework/Versions/B/XPCServices" "$app/Contents/Frameworks/Sparkle.framework/XPCServices"
  install_name_tool -add_rpath "@executable_path/../Frameworks" "$app/Contents/MacOS/SynAmp" 2>/dev/null || true
fi
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
  <key>CFBundleShortVersionString</key><string>$version</string>
  <key>CFBundleVersion</key><string>$version</string>
  <key>SUFeedURL</key><string>$feed</string>
  <key>SUPublicEDKey</key><string>${SPARKLE_PUBLIC_KEY:-}</string>
  <key>SUEnableAutomaticChecks</key><true/>
  <key>SUScheduledCheckInterval</key><integer>86400</integer>
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

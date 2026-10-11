#!/bin/zsh
set -eu
cd "${0:A:h}"
output="$PWD/dist/SynAmp Companion.app"
mkdir -p "$output/Contents/MacOS"
swiftc main.swift -o "$output/Contents/MacOS/SynAmpCompanion" -framework AppKit -framework WebKit -framework Carbon -target "$(uname -m)-apple-macos13.3"
cat > "$output/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SynAmpCompanion</string>
<key>CFBundleIdentifier</key><string>app.synamp.companion</string>
<key>CFBundleName</key><string>SynAmp Companion</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>13.3</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoadsInWebContent</key><true/></dict>
</dict></plist>
PLIST
codesign --force --sign - "$output"
printf 'Built %s\n' "$output"

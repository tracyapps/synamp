#!/bin/sh
# GitHub only: put the Developer ID certificate (a .p12, base64, from the
# repository's secrets) in a temporary keychain so sign-app.sh can use it.
#   MACOS_CERT_P12, MACOS_CERT_PASSWORD → prints the signing identity
set -eu
keychain="$RUNNER_TEMP/synamp-signing.keychain-db"
password=$(uuidgen)
printf '%s' "$MACOS_CERT_P12" | base64 --decode > "$RUNNER_TEMP/cert.p12"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$RUNNER_TEMP/cert.p12" -P "$MACOS_CERT_PASSWORD" -A -t cert -f pkcs12 -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple: -k "$password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
rm -f "$RUNNER_TEMP/cert.p12"
security find-identity -v -p codesigning "$keychain" | sed -n 's/.*"\(Developer ID Application: [^"]*\)".*/\1/p' | head -n 1

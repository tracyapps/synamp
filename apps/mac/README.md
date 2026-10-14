# SynAmp for Mac

The menu-bar app that starts and looks after SynAmp's pieces on a Mac. How it
fits together: [docs/synamp/plans/MAC-APP.md](../../docs/synamp/plans/MAC-APP.md).

## Try it from this checkout

    apps/mac/scripts/run-dev.sh

Uses this checkout, the Mac's Node and the analyzer's own Python. Its data
stays in `apps/mac/build/dev-data` (nothing touches a real install).

## Make the real app

    VERSION=0.3.0 \
    SIGN_IDENTITY="Developer ID Application: tracy apps (65LD7TZAL3)" \
    NOTARIZE=1 \
      apps/mac/scripts/package-app.sh

In order, it:

1. `bundle-runtime.sh`: downloads Node, Python and Navidrome (pinned versions,
   checked against their SHA-256), installs the analyzer with exactly the
   locked versions, builds the web app → `build/bundle/runtime` (about 440 MB).
2. `build-app.sh` with `BUNDLE=1`: `build/SynAmp.app` with that runtime inside.
3. `sign-app.sh`: signs every program and library inside, then the app, with
   the hardened runtime. Without `SIGN_IDENTITY` it signs ad-hoc (this Mac only).
4. `make-dmg.sh`: `build/SynAmp-<version>-<chip>.dmg` (about 140 MB).
5. `notarize.sh` (with `NOTARIZE=1`): sends it to Apple and staples the ticket.

### Once, before the first notarized build

Store your notarization credentials in the Keychain (an app-specific password
from appleid.apple.com → Sign-In and Security → App-Specific Passwords):

    xcrun notarytool store-credentials SynAmp --apple-id <your Apple ID> --team-id 65LD7TZAL3

The first real signing also asks "codesign wants to access key…": choose
**Always Allow**.

## Not inside yet

- **ffmpeg** (needs an LGPL build): without it, lighter streams are off and
  phone apps get the original files.
- **The listening model** (licence question, B06): until it can be bundled or
  downloaded, singing/instruments/moods need the model made once with
  `uv run --extra convert synamp-analyze model convert` and placed in
  `~/Library/Application Support/SynAmp/models`.
- **Intel build**: `bundle-runtime.sh` builds for the Mac it runs on; an Intel
  build needs an Intel Mac (or a CI runner).

## Tests

    cd apps/mac && swift test

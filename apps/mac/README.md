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
4. `make-dmg.sh`: `build/SynAmp-<version>-<chip>.dmg` (about 140 MB). Needs `dmgbuild` (`pipx install dmgbuild`).
   The window it opens is designed in `dmg/`: `background.html` is the picture (edit, then `node dmg/render.mjs`),
   `settings.py` is the window size and where the icons sit.
5. `notarize.sh` (with `NOTARIZE=1`): sends it to Apple and staples the ticket.

### Once, before the first notarized build

Store your notarization credentials in the Keychain (an app-specific password
from appleid.apple.com → Sign-In and Security → App-Specific Passwords):

    xcrun notarytool store-credentials SynAmp --apple-id <your Apple ID> --team-id 65LD7TZAL3

The first real signing also asks "codesign wants to access key…": choose
**Always Allow**.

## On GitHub

`.github/workflows/mac-app.yml` packages the app for **Apple Silicon and Intel**
(macos-15 and macos-15-intel runners) whenever the Mac app changes, runs the
Swift tests and `smoke-test.sh` (each bundled program starts; the server
answers and serves the web app), and keeps the disk images for 14 days. For a
version tag it adds them to the draft release. With these repository secrets it
signs and notarizes too; without them it builds an ad-hoc test app:

- `MACOS_CERT_P12` (base64 of your Developer ID Application certificate,
  exported from Keychain Access as .p12) and `MACOS_CERT_PASSWORD`
- `NOTARY_KEY_P8` (an App Store Connect API key, the .p8 file's text),
  `NOTARY_KEY_ID`, `NOTARY_ISSUER`

## Updates (Sparkle)

The app checks once a day for a newer version (its own feed per chip, on the
newest GitHub release), shows what's new, and lets you install, skip it or be
reminded later. Every update is signed; the app refuses one that isn't.

Once, make the update-signing key (it lives in your login Keychain):

    apps/mac/.build/artifacts/sparkle/Sparkle/bin/generate_keys

It prints the public key: save it as the repository **variable**
`SPARKLE_PUBLIC_KEY`. For GitHub to sign updates, export the private key
(`generate_keys -x sparkle-private-key`) into the **secret** `SPARKLE_PRIVATE_KEY`,
then delete that file. Builds without the public key never check for updates.

## Not inside yet

- **ffmpeg** (needs an LGPL build): without it, lighter streams are off and
  phone apps get the original files.
- **The listening model** (licence question, B06): until it can be bundled or
  downloaded, singing/instruments/moods need the model made once with
  `uv run --extra convert synamp-analyze model convert` and placed in
  `~/Library/Application Support/SynAmp/models`.
- **Intel build** on your own Mac: `bundle-runtime.sh` builds for the Mac it
  runs on, so Intel builds come from the GitHub workflow.

## Tests

    cd apps/mac && swift test

## The app's own small windows (`ui/`)

The setup window and "Open on your phone" are web pages in `apps/mac/ui`, shown
in a web view (`PanelWindow.swift`). They use the web app's own `tokens.css` and
`ui.css` (`ui/styles` and `ui/assets` are links to the web app's folders; link folders, not single files, which the web view won't load), so they look like
SynAmp without a second copy of the design. `panel.css` adds only layout.

- Edit them like any page. To look at one in a browser, open it with a state:
  `setup.html?state={"place":"elsewhere"}`. Outside the app, button presses are
  written to the console.
- `bridge.js` is the whole contract: the page calls `SynAmp.send(action, data)`,
  the app answers with `SynAmp.on(type, …)`. The window sizes itself to the page.
- While one of these windows (or SynAmp's main window) is open, the app is in
  the Dock and Command-Tab; with none open it is a menu-bar icon only.
- `build-app.sh` copies the folder into the app, following the links.

## "Connect the Mac app" links

`synamp://connect?home=…&token=…&away=…` opens the setup window with the
connection filled in (`ConnectLink.swift`). SynAmp's web page makes the link in
Settings (`apps/web/src/connect-link.ts`). It only fills the form in: the person
still presses Connect, and the address is checked as usual.

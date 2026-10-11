# Player actions and display controls

Updated 2026-10-11. Source changes are local; deployment and owner acceptance remain open.

- **Not for this** saves playlist-scoped feedback when the song has a playlist source, then advances exactly once. Outside a playlist it retains the existing global feedback scope. **Remove** saves the playlist exclusion, then advances. Failed feedback never skips. Saving succeeded but advancing failed is reported separately. Undo restores the exclusion without jumping backward.
- **Love** saves a durable preference, fills the heart, and says Loved. Repeated presses while saving or after a saved love do not append more love events. No unlike operation is introduced.
- **Skip** acknowledges immediately at the controls; the engine reports the crossfade phase. A full-width status sits directly under the controls, including on mobile and display windows.
- **More like this** chooses a measured sound match for the very next slot without interrupting the current song or recording a permanent Love. Smart-playlist hard constraints, explicit removes and active policy hides still apply, with no relaxation ladder. The current/previous tracks and copies of the same recording are excluded. An upcoming match moves next with its entry and playlist provenance; otherwise a library match is inserted without pretending it belongs to the playlist. Missing sound analysis or no eligible match is an explicit shortage.
- The web app supports Option/Alt + Shift shortcuts, ignores typing targets and repeated keydown, and retains Media Session/headphone controls. A separate Mac companion owns its WebKit playback window and registers global hotkeys.
- Visuals show song/artist plus Play/Pause, Skip, Love, Not for this, Remove and More like this. Fullscreen targets the document (dialogs cannot themselves request fullscreen). Canvas capture mirrors video into one or more controlled windows with live shared actions and no additional audio. Each screen window opens from a separate click to respect popup blocking. Screen discovery is optional and permission-gated; manual placement remains available. Closing visuals closes windows, stops capture tracks, and restores scrolling.

## Ownership and entry points

| Surface | Files |
| --- | --- |
| Playback and action lifecycle | `apps/web/src/Player.tsx`, `SongControls.tsx`, `player-commands.ts`, `audio/engine.ts` |
| Similar-next endpoint and ranking | `apps/brain/src/index.ts`, `session/similar.ts`, `session/session.ts` |
| Visuals and windows | `apps/web/src/visuals/Visuals.tsx`, `VisualDisplays.tsx`, `styles/visuals.css` |
| Mac menu and global shortcuts | `apps/companion-macos/main.swift`, `build.sh`, `README.md` |

## Repeatable local verification

```sh
pnpm --filter @synamp/brain type-check
pnpm --filter @synamp/web build
node --experimental-strip-types --test apps/brain/src/session/{session,similar,feedback}.test.ts tools/{player-commands,transition,visual-looks}.test.mts
node tools/player/check-actions.mjs
node tools/visuals/check-sizing.mjs
./apps/companion-macos/build.sh
git diff --check
```

The action browser harness uses the real Brain API, temporary persisted stores, real Player/Visuals components, and generated WAV files. It verifies saves, automatic advance, failed-save behavior, undo, persistent loves, similarity ordering, keyboard typing protection, real crossfade acknowledgement, fullscreen, live popup actions, multiple display video streams, cleanup, and mobile availability. Focused logic tests passed (29 checks), the action browser harness passed (15 flows), and the web/Brain type checks and web/native builds passed. The broader Brain suite has 302 passing tests, one skip, and one failure in the untouched librarian artist-merge capitalization fixture (`DiFranco` versus `Difranco`). This is not an all-suite-green handoff.

The separate sizing harness uses real WebGL across viewport/DPR/reopen cases. Neither proves the quality of similarity on real music or physical monitor placement.

## Remaining acceptance, in order

1. Review and deploy the matching Brain/web version through the existing release process (not authorized by this source task).
2. Open the built companion against that version, sign in, play a real smart playlist, and verify hotkeys while working in another app; check sleep/wake, window-close/background playback, headset keys, and shortcut conflicts. Native source compiles locally; runtime owner behavior remains unverified.
3. Check Chromium screen permissions and blocked-popup recovery, Safari/WebKit manual placement, disconnecting an external display, multiple physical screens, keyboard focus, and VoiceOver. Browser automation verifies separate windows on one virtual display only.
4. Test real-library sound vectors and playlist shortages during a workday. No listening-quality claim follows from synthetic cosine fixtures.
5. Package a signed/notarized companion, choose install/login/update behavior, and make a user-facing download before calling native distribution complete.

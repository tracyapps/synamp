# SynAmp Companion for Mac

A small menu-bar app that keeps SynAmp playing when its window is closed. The menu shows the current song, Love/Loved, Skip, Not for this, Remove from playlist, More like this next, and Visuals. Commands use the same player as the web interface.

Build on macOS with Apple's command-line developer tools:

```sh
./apps/companion-macos/build.sh
open "apps/companion-macos/dist/SynAmp Companion.app"
```

On first launch, enter your SynAmp web address, connect with your access token if required, and play music **in the companion's window**. Its WebKit login is separate from Safari/Chrome. The companion controls its own player; it does not remotely control an existing browser tab. Close its window to leave music playing, reopen from the menu, or Quit to stop it. New web controls also need to be available at the chosen SynAmp address.

Global shortcuts use **Control + Option + Command**, plus:

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Right arrow | Skip |
| L | Love |
| N | Not for this, then next song |
| R | Remove from the current playlist, then next song |
| M | Queue a similar song next |
| V | Open the window and show visuals |

The menu can turn global shortcuts off. If another app has registered a shortcut, the menu reports the conflict. These are registered hotkeys, so the app does not request Accessibility or Input Monitoring access. Keyboard shortcuts while the web app is focused use **Option/Alt + Shift** with the same keys (and Left arrow for Previous).

Visuals can open separate windows, which you can move to other displays and make fullscreen. Automatic screen selection depends on the browser's Window Management API; WebKit uses the manual window option. Separate display windows mirror the same canvas and do not start extra music players. Closing visuals closes their display windows.

The local build is ad-hoc signed for this machine's architecture. It is not a notarized distributable, installed app, login item, or automatic updater. Release packaging, real global-hotkey use, WebKit playback/background behavior, and physical monitor placement remain owner checks.

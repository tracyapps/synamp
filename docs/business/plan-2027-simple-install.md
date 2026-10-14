# SynAmp plan: a simple install first, launch in 2027

Decided by the owner on **October 13, 2026**. This replaces the release dates in
the [90-day roadmap](90-day-roadmap.md) (Nov 24 / Dec 1 / Dec 15). Its gates,
quality bar and "never move a gate to keep a date" rule still apply.

## The decision, in one paragraph

SynAmp won't launch on a setup only technical people can install. Before testing
with real people, it becomes **one app you download and open**: no Docker, no
command line, no "which chip do I have?". Testers can then include people who
have never heard of a container, which makes their results more honest, and the
time spent on a smooth first run should pay back in people who stay. The paid
early-access release moves to **spring 2027**.

## What "simple install" means

- **Download, open, point it at your music.** The music can be on the computer,
  an external drive, or a NAS the computer can see.
- **One honest requirement:** the computer running SynAmp, and the music, need
  to stay on for the smart features to work. Phones and other computers play
  through it.
- **No chip question.** It runs on Apple Silicon and Intel Macs, then Windows.
  We only say: "Listening to your library takes a while the first time. A newer
  computer finishes sooner, and you can play music the whole time."
- **The NAS (Docker) install stays**, as the option for people who want it.

## Schedule

| When | What | Done when |
|---|---|---|
| Oct 13 – Oct 25 | **Any chip, lighter listening.** Release images for Intel/AMD *and* ARM. The singing-and-instruments step runs on ONNX Runtime instead of PyTorch (smaller, and works on Intel Macs and Windows). | **G0:** both image types published from one tag; new listener matches the old one on real songs; the owner's NAS on the current build. |
| Oct 26 – Dec 6 | **SynAmp for Mac, inside.** One app that carries the server, Navidrome, ffmpeg and the listener, and starts them together. | **G1:** installs and plays on the owner's Mac and on one other Mac, from a folder and from a NAS share. |
| Nov 16 – Jan 10 | **The first run.** "Where's your music?", plain progress, a first playlist from picked songs the same day; menu-bar icon, start at login, no sleeping mid-listen, automatic updates; Apple signing and notarization. | **G2:** three watched first runs with people who aren't technical, each reaching a playlist without help. |
| Oct 19 – Dec 20 | **Small NAS pilot (optional, 3–5 technical friends).** Keeps listening-quality work moving while the app is built. | Listening scores from at least three real libraries. |
| Jan 11 – Feb 7 | **Mac beta, wave 1:** ten people, at least half not technical. | **G3:** ≥9 of 10 install without live help; ≥60% get a useful playlist within 72 hours. |
| Jan 25 – Mar 7 | **SynAmp for Windows.** Same app; folder paths and file moves tested on Windows. | Installs and plays on two Windows PCs. |
| Feb 8 – Mar 21 | **Wave 2:** Mac and Windows, at least five strangers. | **G4:** same bar as G3 on both, every attempt counted. |
| Jan 11 – Mar 21 | **Rights, offer and checkout** (the slow emails go out in October). | Rights answered or defaults chosen; test purchase and refund work. |
| **Apr 6, 2027** | **Paid early access** (working target). | **G5:** four-week return ≥50% with ≥10 people, no open serious bugs, tested backup/restore and updates. |
| Mar 16 / May 4 | Stretch (Mac only) / fallback. | Same gate. |
| May 31 | Review. | **G6** scorecard. |

## What changes, what doesn't

- **Moved later:** paid early access (Dec 2026 → Apr 2027), recruiting the main
  test waves (Oct → Jan), the January 9 scorecard (→ May 31).
- **Moved earlier:** a signed desktop app and Windows support. The 90-day plan
  had both after launch.
- **Unchanged:** the listening quality bar, the safety and restore checks, the
  rights questions (send them now; replies take weeks), no secret telemetry,
  and "nothing changes in your library until you approve it".
- **Still off the path:** a native phone app, hosted cloud, Linux desktop app,
  beat-locked DJ mixing.

## Work estimate

At the owner's 20–25 hours a week, with Claude doing most of the coding:

| Work | Rough size |
|---|---|
| Both chip types | about a day |
| Listener on ONNX Runtime, checked against the old one | a few days |
| Mac app: packing, starting/stopping, folders, updates, signing | 4–6 weeks |
| First run and menu bar | 2–3 weeks (overlaps) |
| Windows | 2–4 weeks |
| Testing waves and support (owner time) | about 5 hours a week from January |

## Owner actions

- **Apple Developer account** ($99/year) by **Nov 30**, for signing the Mac app.
- **Rights emails** (Last.fm, LRCLIB, PANNs weights, name) by **Oct 19**: the
  slowest dependency, and the app makes the PANNs weights question more pressing
  because the app would include them.
- Optional NAS pilot: name 3–5 technical friends by **Oct 26**.
- Windows signing (a certificate, or Microsoft's signing service) by **Jan 15**.
- Find 5 non-technical people for watched first runs by **Dec 15**.

## Open questions

- Price and offer: unchanged hypothesis ($39 launch / $49), to retest in Feb–Mar.
- Does the app include the PANNs model weights, or download them on first run?
  Depends on the licence answer.

<!--
  The SynAmp roadmap, as shown on synamp.app/roadmap and the homepage.

  This file is the source. Every push to main rebuilds the site from it, so
  the public roadmap is always the current one. When something ships, tick it
  here in the same commit:

    - [x] done
    - [~] being built right now
    - [ ] not started

  A phase's badge works itself out: every item ticked → "Done"; anything ticked
  or under way → "In progress"; nothing yet → "Next" (if the phase says
  `next: yes`) or "Planned".

  Write for listeners, not developers: what it does for them, not how.
  "Recently shipped" at the bottom is newest first: `- YYYY-MM-DD — what changed`.
-->

## Foundations
id: foundations
number: 0
short: Foundations
goal: Decide what SynAmp is made of before building it, so later features slot in without starting over.
- [x] Pick a proven music server to build on, so playback is solid from day one
- [x] Keep the heavy listening work on your computer, not your NAS
- [x] One install that starts everything SynAmp needs

## Cancel the subscriptions
id: listen-anywhere
number: 1
short: Listen anywhere
goal: Play your own music anywhere — phone, car, computer — so a streaming subscription becomes optional.
- [x] Your whole library, streaming from your own server
- [x] A guided checklist to listen away from home, privately, with no port forwarding
- [~] Lock-screen controls, background play and CarPlay through phone apps you already know
- [x] Bring your existing playlists across
- [ ] Lighter streams on mobile data, full quality at home

## Library care
id: library-care
number: ✦
short: Library care
goal: Leave your library better than SynAmp found it — tidy, complete, and safe to change.
- [x] Every track keeps its history when you rename or move it
- [x] See how big your library is and how far along the analysis is
- [x] A list of every album with missing tracks, that clears itself as you fill the gaps
- [x] Tidy artist and album names with a preview first — nothing changes until you approve, and everything can be undone
- [x] Add new music by dragging it in
- [x] Find albums you don't have yet from the artists you love
- [x] Spot second copies of the same song and keep the better one (the other is set aside, never deleted)
- [ ] Fix song details inside the files (artist, album, track numbers)
- [ ] Add music straight from Dropbox

## Playlists that scale
id: playlists
number: 2
short: Playlists
goal: Playlists as good as the old Winamp days — better, even — for a library of any size.
- [x] Describe a playlist in plain words and get it, with a reason for every song
- [x] Folders for your playlists
- [x] Playlists of playlists: shuffle a whole folder at once
- [x] Your SynAmp playlists show up in your phone apps
- [ ] Smooth scrolling through a hundred thousand songs

## The Brain
id: brain
number: 3
short: The Brain
goal: The part nobody else has: "make me a playlist that sounds like this."
- [~] Listens to every song in your library: tempo, energy, loudness, rhythm
- [x] Learns from what you skip, love and remove
- [x] Double-check the measurements yourself: tap along to the beat
- [ ] Knows which songs have words, and which have piano (or guitar, or horns)
- [ ] "Sounds like these two songs"
- [ ] Understands moods and lyrics

## Radio and visualizers
id: radio
number: 4
short: Radio & visualizers
next: yes
goal: The fun stuff: world radio and visuals that dance with the music.
- [x] Thousands of radio stations by country, genre and mood
- [ ] Radio stations in your playlists, right next to your own music
- [x] Milkdrop-style visualizers, back again

## Gapless, crossfade and DJ mode
id: dj
number: 5
short: DJ mode
goal: Seamless listening, with party-grade transitions.
- [ ] Gapless albums: no silence between tracks
- [ ] Crossfade, set to your taste
- [ ] DJ mode: songs matched by tempo and key so mixes flow
- [ ] Skip mid-song and it blends instead of cutting

## Party tools
id: party
number: 6
short: Party tools
goal: Host a party where friends request songs from their phones.
- [ ] Guests scan a QR code and request songs (and vote)
- [ ] A big-screen "now playing" display for the TV or an old iPad
- [ ] You stay in charge of the queue

## Apps and sharing
id: apps
number: 7
short: Apps
goal: SynAmp in your menu bar, and maybe on other people's servers too.
- [ ] A menu-bar player for your Mac
- [ ] A SynAmp phone app, if the existing apps leave a real gap
- [ ] An easy installer so others can run SynAmp on their own NAS

## Recently shipped
- 2026-10-06 — MilkDrop visuals are back, dancing to your music or the radio, with a gentler mode that’s on by default
- 2026-10-06 — World radio: search thousands of stations by name, country or kind, and keep your favourites
- 2026-10-06 — Bring your playlists across from iTunes, Music, Winamp and other players — folders too
- 2026-10-06 — Your SynAmp playlists show up in your phone apps, and stay up to date by themselves
- 2026-10-06 — Shuffle a whole folder of playlists with one button
- 2026-10-06 — Browse and search your albums and songs, play them, and add songs to playlists by name
- 2026-10-06 — The app gets its new look: a menu down the side, a player that stays at the bottom, and easier-to-read text
- 2026-10-05 — The library page explains when analysis is waiting on a library update, instead of looking stuck
- 2026-10-05 — Second copies of the same song: keep the better one, set the other aside (never deleted)
- 2026-10-04 — "Listen anywhere" checklist: set up private access from your phone, step by step
- 2026-10-04 — Tap along to check the measured tempo of any song
- 2026-10-04 — Settings you can change without touching config files
- 2026-10-03 — Find albums you don't have yet from artists you love
- 2026-10-03 — Drag and drop new music into your library
- 2026-10-02 — Tidy names and folders with a preview and one-click undo
- 2026-10-02 — A list of every album with missing tracks
- 2026-10-01 — Describe a playlist in plain words

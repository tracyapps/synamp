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
- [x] Lighter streams on mobile data, full quality at home

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
- [x] Fix song details inside the files (artist, album, track numbers)
- [ ] Add music straight from Dropbox

## Ready for your server
id: ready
number: ✦
short: Ready to install
goal: Make SynAmp something you can set up, trust and keep up to date on your own server, without the developer there to help.
- [~] A guided setup that checks your server is ready before it changes anything
- [~] Hear a first playlist from part of your library, without waiting for all of it to be listened to
- [~] See which version you're running, update safely, and go back if an update goes wrong
- [~] Backups of your playlists, history and settings that have been tested by actually restoring them
- [ ] A public report of how well playlists work on real libraries, with every miss counted

## Playlists that scale
id: playlists
number: 2
short: Playlists
goal: Playlists as good as the old Winamp days — better, even — for a library of any size.
- [x] Describe a playlist in plain words and get it, with a reason for every song
- [x] Folders for your playlists
- [x] Playlists of playlists: shuffle a whole folder at once
- [x] Your SynAmp playlists show up in your phone apps
- [x] Smooth scrolling through a hundred thousand songs

## The Brain
id: brain
number: 3
short: The Brain
goal: The part nobody else has: "make me a playlist that sounds like this."
- [~] Listens to every song in your library: tempo, energy, loudness, rhythm
- [x] Learns from what you skip, love and remove
- [~] Smart mixes keep adding songs as you listen; play any saved playlist once or let it keep going
- [~] Clear feedback beside the buttons, automatic next song after a rejection, and “more like this” for the next song
- [x] Double-check the measurements yourself: tap along to the beat
- [~] Knows which songs have words, and which have piano (or guitar, or horns)
- [~] "Sounds like these two songs"
- [~] Understands moods and lyrics

## Radio and visualizers
id: radio
number: 4
short: Radio & visualizers
next: yes
goal: The fun stuff: world radio and visuals that dance with the music.
- [x] Thousands of radio stations by country, genre and mood
- [x] Radio stations in your playlists, right next to your own music
- [x] Milkdrop-style visualizers, back again
- [~] Fullscreen visuals with song controls and extra display windows
- [~] Mac menu-bar controls and global keyboard shortcuts

## Gapless, crossfade and DJ mode
id: dj
number: 5
short: DJ mode
goal: Seamless listening, with party-grade transitions.
- [x] Gapless albums: no silence between tracks
- [x] Crossfade, set to your taste
- [~] DJ mode: songs matched by tempo and key so mixes flow
- [x] Skip mid-song and it blends instead of cutting

## Party tools
id: party
number: 6
short: Party tools
goal: Host a party where friends request songs from their phones.
- [x] Guests scan a QR code and request songs (and vote)
- [x] A big-screen "now playing" display for the TV or an old iPad
- [x] You stay in charge of the queue

## Apps and sharing
id: apps
number: 7
short: Apps
goal: SynAmp in your menu bar, and maybe on other people's servers too.
- [ ] A menu-bar player for your Mac
- [ ] A SynAmp phone app, if the existing apps leave a real gap

## Recently shipped
- 2026-10-13 — Fixed: a playlist preview sometimes dropped under the “What I understood” notes on the left instead of sitting in the main column
- 2026-10-13 — Listen to these first: tick some artists, albums or songs in the Library and SynAmp listens to them before the rest of your library, so your first playlist can come from them in an hour instead of days. The Library strip shows how many are ready, and you can forget your picks at any time
- 2026-10-13 — Library: opening an artist or album group no longer jumps the page, what’s inside a group is indented under it, the title bar and table headings stay at the top as you scroll, row buttons fit on one line, and a Full screen view spreads the Library across the whole window. Playing from the Library shows only the buttons that apply, plus “Make a smart playlist from this”
- 2026-10-12 — SynAmp tells you when a new version is out and what’s new in it. Skip a version, get reminded in a few days, or turn the checks off in Settings; they only read GitHub’s public list of releases and send nothing about you or your music
- 2026-10-12 — Ready-made releases are on the way: SynAmp shows its version number, nothing has to be built on your NAS, and updating (or going back to an earlier version) is one download and one button in Container Manager
- 2026-10-12 — Guided setup: one command asks where your music is, shows you the plan, and changes nothing until you say yes. It makes the folders and private settings for you, checks the server is ready, and never touches your music. Every install now gets exactly the same versions of the parts SynAmp is built on
- 2026-10-12 — Fixed: pressing Pause while a song is still loading now keeps it paused, instead of starting it anyway
- 2026-10-12 — Compilations stay under Various Artists: a mixed album where a few songs carry their own artist tag is no longer filed under that one artist, or looked up under their name when SynAmp checks for missing tracks. Library care pages also answer faster on big libraries
- 2026-10-12 — Fixed: picking a song right after switching artists could show “Playing” with no sound
- 2026-10-11 — “Reveal in Finder” on any song shows you its file on your Mac, and album lists that got stuck on “Loading…” now say what went wrong and offer Retry
- 2026-10-10 — Songs with lyrics no longer count as instrumental, even when SynAmp’s listening missed the voice (about 530 songs in the first library it was tried on). With LRCLIB switched on, SynAmp now also looks up words for songs it heard no singing in, last
- 2026-10-10 — Playlist previews: hear a 30-second clip of any song before you save (whatever was playing pauses, then carries on), and mark songs that don’t fit. They stay out of that playlist, and if you say “it has words”, SynAmp stops counting that song as instrumental everywhere
- 2026-10-09 — Library: group by two things at once (say, decade then artist) in folding sections, tick a whole group or single songs, then play, shuffle, play next, add to a playlist, favourite or tidy them in one go; in the table, artist and album names go to their pages
- 2026-10-09 — Favourites: heart artists, albums and songs, show just your favourites in the Library, and see them as favourites in your phone apps too (stars there come back here). The Brain gives them a small head start that fades as it learns what you want right now
- 2026-10-09 — Library: switch between Artists, Albums and Songs, open any artist’s page (their albums, the albums they appear on, every song), open an album’s songs right where it is or on its own page, and right-click anything for more
- 2026-10-09 — Lyrics: SynAmp reads the words already inside your music files, and can look up missing ones on LRCLIB, a free community lyrics site, if you switch it on in Settings. The words stay private on your NAS
- 2026-10-09 — The Brain: “How does this feel?” plays a song and asks whether it feels calm or lively, sad or happy. Your answers are what SynAmp checks its new mood readings against before any playlist uses them
- 2026-10-08 — Albums play with no gap at all (joined to the exact sample), skipping mid-song blends into the next song, and “Play as a DJ set” orders a playlist by tempo and key with longer blends; SynAmp now learns each song’s key as your library is listened to
- 2026-10-08 — SynAmp can fix song details inside your MP3 and FLAC files (album, year, track numbers…) from MusicBrainz: you review every change, and Undo puts the old details back exactly
- 2026-10-08 — The Library scrolls smoothly through your whole collection: no more “Show more”, and dragging the scrollbar to the middle of 100,000 songs shows them straight away
- 2026-10-08 — Library care: settings show “Saved” right where you changed them, duplicate copies keep the cleaner file name, single CDs no longer get “1-01” names, and “Open in Finder” for albums and the duplicates folder
- 2026-10-08 — “Sounds like these songs”: pick up to five songs and get a playlist that sounds like them, as your library gets listened to
- 2026-10-08 — Choose how much of your Mac the analysis may use, with more at night or while you’re away from the Mac, and plain advice on when to change it
- 2026-10-08 — SynAmp now listens for singing and instruments, so “no words” and “no piano” work as your library gets listened to
- 2026-10-08 — Ambient and other beatless music no longer gets a made-up tempo, and analysis runs several songs at once on your Mac, so it finishes days sooner
- 2026-10-08 — Library: save the filters you use as named views, share a link to them, and turn every song that matches into a playlist in one go
- 2026-10-07 — Library care: tick proposals (shift-click for a whole run) and approve or skip them together, and long lists of problems from a batch fold into one line
- 2026-10-07 — Visuals: heart the looks you love, hide the ones you don’t, jump to any look from a list, and let them change by themselves through just your favourites
- 2026-10-07 — Lighter streams on mobile data: SynAmp’s player switches to a smaller stream away from home and keeps full quality at home, and Listen anywhere shows how to do the same in your phone app
- 2026-10-06 — Put radio stations in your playlists, right next to your own music
- 2026-10-06 — Party mode: guests scan a code to ask for songs and vote, a big “now playing” screen for the TV, and every request waits for your yes
- 2026-10-06 — SynAmp’s own player works from your lock screen, headphone buttons and keyboard media keys
- 2026-10-06 — Crossfade between songs (albums still play straight through), a volume control, and the next song ready before this one ends
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

# Library care — leave the library better than we found it

Status: planned 2026-10-02; steps 1–6 done (step 4: renames and moves; step 5 without Dropbox). Open: 4b writing tags, Dropbox import. Owner request, shaped against
the existing plan: ROADMAP Phase 1 already expects a metadata cleanup pass, and
ARCHITECTURE §16 says to clean metadata *before* the semantic layer. The Brain
dossier already chose the tools: MusicBrainz (CC0 core) for release data and
Chromaprint/AcoustID for recording identity, run as a separate process because
Chromaprint is LGPL.

## What the owner wants

1. **See analysis happening** — progress, failures, time left.
2. **A missing-tracks list** — years of iTunes losses left albums with holes.
   Every album's missing tracks in one sortable, filterable list with the
   owner's own tags, notes and statuses, which clears itself as re-ripped tracks
   arrive.
3. **Organise while scanning** — merge spelling variants of the same artist,
   add track numbers, apply one naming convention.
4. **Import** — drag files into the web app, or drop them into `incoming/`
   (the same pipeline, two doors), and later straight from Dropbox. Files are
   matched, named, checked for duplicates and filed into `library/`.
5. **Discography gaps** — releases by artists you love that you don't own,
   with links to listen or buy.

## Why this comes before the big analysis pass

Renaming or retagging breaks identity in two places:

- SynAmp named a track by a hash of its path. A rename orphaned its analysis,
  plays, loves and playlist removals.
- Navidrome also identifies tracks by path (STORAGE-LAYOUT): moving files after
  its first scan loses play counts and breaks playlist entries. It has not been
  deployed yet, so now is the cheapest moment to tidy.
- Writing tags changes the bytes, and the analyzer re-analyses any file whose
  size or mtime changes — 45k files.

So: **identity first, then read-only reports, then changes.**

## Principles

- **Propose → review → apply.** Nothing is renamed, retagged, merged or moved
  silently. A scan produces a plan grouped into readable decisions ("merge
  *Ani Difranco*, *Ani DiFranco*, *DiFranco, Ani* → *Ani DiFranco* (14
  folders)"); the owner approves batches.
- **Every change is journaled and undoable** (`renames.jsonl`: from, to, audio
  hash, reason, batch). Take a Btrfs snapshot before a batch.
- **Only the librarian writes.** Navidrome, the brain and the web app keep the
  music share read-only. A separate librarian process gets write access, so a
  bug elsewhere cannot damage files.
- **Verify every copy** by checksum before anything is considered transferred;
  a "move" deletes the source only after verification.
- **Duplicates by content, not name.** Byte-identical files: skip by default.
  Same recording in another format/quality: keep both (owner's default), named
  by format/bitrate (`01 - Title [320k].mp3` beside `01 - Title.flac`), never by
  date. A "preferred version" flag can come later.
- **Names that survive both macOS and the NAS:** a configurable template,
  default `Album Artist/Album (Year)/[Disc-]NN - Title.ext`; no `: / \ ? * " < > |`,
  no trailing dots or spaces, length-capped.

## Steps

| # | Step | Writes files? | Depends on |
|---|---|---|---|
| 1 | **Track identity + rename journal** | no | — |
| 2 | Library health & analysis progress view | no | 1 |
| 3 | **Missing-tracks list** (MusicBrainz release matching, edition choice, tags/notes/status, auto-resolve) | no | 1 |
| 4 | Organise: plan → review → apply, journal + undo | yes (librarian) | 1, 3 |
| 5 | Import: web drop + `incoming/` watcher (+ Dropbox later) | yes (librarian) | 4 |
| 6 | Discography gaps (+ new-release alerts) | no | 3 |

### 1 — Track identity + rename journal (this slice)

- New first analyzer stage `identity`: an **audio hash** (sha256 of the decoded
  audio, so tag edits and renames do not change it) and, when `fpcalc` is
  installed, a **Chromaprint fingerprint** (recognises the same recording across
  formats; feeds AcoustID/MusicBrainz in step 3 and duplicate grouping in 4).
- A file whose bytes changed but whose audio did not (a retag) **keeps its
  analysis** instead of being re-analysed.
- A new path whose audio matches a vanished file is a **move**: it inherits that
  track's ID and analysis.
- The librarian's `renames.jsonl` is read on `scan`, so planned moves carry
  identity without even decoding.
- Exported IDs stay stable across moves (minted from the first path seen, so
  every existing ID is unchanged); the export lists `aliases` and `audio_hash`,
  and the brain maps Navidrome paths through the library index, not by hashing.

**Step 1 result (2026-10-02).** Implemented in the analyzer (`identity.py`,
`store.py` identity tables, `pipeline.py` reuse, export `aliases`/`audio_hash`)
and brain (path lookup via the library index, alias-aware feedback). Confirmed
by 7 new analyzer tests (72/72) and 2 brain tests (55/55): tags don't change the
hash; a retag keeps analysis with dsp/beat forbidden from running; a move keeps
the exported ID and analysis; a copy reuses measurements but is a separate
track; a journaled rename is recognised with decoding forbidden, and re-reading
the journal is harmless; tracks analysed before the stage existed get only that
stage. The fingerprint path is tested with a stand-in `fpcalc`; real Chromaprint
output on real files is unverified until `brew install chromaprint` on the Mac.
Also fixed: finished jobs were never re-opened for a newly added stage, so the
README's "adding a stage back-fills automatically" was not true until now.

### 2 — Library health & analysis progress (done 2026-10-02)

The analyzer pushes `synamp.analysis-progress/1` reports to the brain
(`SYNAMP_BRAIN_URL`, `SYNAMP_BRAIN_TOKEN`) every ~15 s while analysing and at
the end of each scan/run: state, per-stage coverage, queue, unreadable files,
fingerprint coverage, rate and time left. The brain type-checks and keeps the
latest (on disk), and flags it stale after two minutes of silence mid-run. The
web app's **Library** strip shows a progress bar, time left and the current
file, with details: per-stage bars, waiting/unreadable/missing counts,
recognised-not-re-analysed, Chromaprint hint, failures, and collection stats
from the export (tracks, artists, albums, tag- vs folder-named, duplicate
copies). Also: `synamp-analyze stats` now prints per-stage progress
(`--json` too). Tests: analyzer 77/77 (snapshot, ETA, delivery with token,
unreachable/failing brain, throttling), brain 58/58.

### 3 — Missing tracks (done 2026-10-02)

**Engine decision.** beets' `missing` plugin only works on albums already
imported into beets' own database with MusicBrainz IDs, which means running
its importer over the library first. For a read-only report that is the wrong
way round, so step 3 talks to MusicBrainz directly (brain `library/`). beets is
still the candidate engine for step 4/5, where it would actually write.

How it works:

- **Album folders** are the unit (disc sub-folders like `CD2/` fold in; loose
  files at the root are skipped). Names come from tags, else the folder; the
  year from tags or `Album (1998)`.
- **Matching** runs in the brain as a background job at MusicBrainz's pace
  (one request per ~1.1 s, User-Agent with `MUSICBRAINZ_CONTACT`). A
  MusicBrainz release ID in the tags (Picard) is used directly. Otherwise:
  search, then compare up to three candidate tracklists with the files (titles
  compared loosely — remaster suffixes, accents, punctuation, `&`; disc/track
  number plus length as a fallback). The plain official CD edition wins ties
  over deluxe/bonus editions; the others stay as "Wrong edition?" choices.
  Uncertain folders and ones search couldn't find go to **Needs your choice**.
- **The list** is recomputed from the current library every time, so a
  re-ripped track disappears by itself after the next export. Your status
  (Missing / Want / Ordered / Have the CD / Don't need), tags and notes are
  kept separately and survive re-matching; noted tracks that turn up move to
  **Found again**. CSV download for spreadsheets.
- Matching is resumable (results saved per folder), pausable, retries
  MusicBrainz's busy responses with backoff up to 15 min, and never loops on a
  folder within a run.

The analyzer export now carries `track_no`/`disc_no` (tags, else a leading
number in the filename), `track_total`, `disc_total`, `year` and `mb_albumid`.

Confirmed: brain 70/70 (12 new: grouping, title matching, one-track album lists
nine missing, number+length fallback, polite client spacing and escaping,
tag-ID lookup with one request, edition choice, review/no-match, auto-clearing
with notes kept, choosing/skipping editions, matcher resume/backoff/errors, CSV
quoting); analyzer 78/78. **Live against real MusicBrainz:** a folder holding
only "03 - Gravel" from *Little Plastic Castle* matched the 1998 US CD edition
and listed the other 11 tracks with lengths; a made-up album went to review;
status/tags saved and appeared in the CSV.

### 4 — Organise (done 2026-10-02: renames and moves)

**Engine decision.** Not beets, for this slice. Renaming needs no autotagger:
the plan is built from what SynAmp already knows (the export's tags and
numbers, step 3's MusicBrainz matches), and beets' importer would have to take
over the library and its own database to do it, with no way to review
decision by decision. Writing tags *inside* files (4b) is where a tag library
or beets earns its place; that comes later and goes through the same
review/journal/undo path.

How it works:

- **The brain proposes** (`apps/brain/src/library/organise.ts`), read-only.
  Two kinds of decision: **artist merges** (spellings that compare equal —
  case, accents, `&`/and, "The", "Surname, Name" when the other spelling
  exists; the MusicBrainz spelling wins, then the tagged one) and **album
  folders** (`Album (Year)` with the tag year, else MusicBrainz's; `01 - Title`
  / `1-01 - Title` with numbers from tags, the filename, or the matched
  release; disc folders folded in; compilations to `Various Artists/`; extra
  copies get `(2)`; a taken folder name gets the MusicBrainz edition, else is
  flagged). Every part is a setting. Loose files in an artist folder are left
  alone.
- **You review** in the web app's *Organise the library* panel: each decision
  says in plain words what it does, with before → after and every file move.
  Approve, skip, or decide later, one at a time or everything shown. An
  approval is for one revision; if the proposal changes it asks again.
- **The librarian applies** (`apps/brain/src/librarian/`), a separate process
  and the only one with write access. Per decision: check everything first,
  rename (never copy, retag or overwrite), put back on failure, carry artwork
  and other files along, remove emptied folders (deleting only `.DS_Store`,
  `._*`, `Thumbs.db`, `desktop.ini`), and journal every move to
  `renames.jsonl` — shared with the analyzer, so analysis and history follow.
  In one batch, artist merges run first and album decisions follow the files.
- **Undo** puts a batch back, newest first. Until the analyzer re-exports, the
  brain follows recorded moves for files that really moved, so they keep
  playing; MusicBrainz matches are carried to the new folder names.
- Deploy: opt-in `librarian` compose profile, running as the share owner
  (`PUID`/`PGID`), journal at `/volume1/music/.synamp/`.

Confirmed: brain 83/83 (13 new — naming, plan cases, rebasing, reviews and
revisions, batch/claim/re-claim/report, undo, overlay, matches carried; the
librarian on real temp folders: apply with artwork and junk, refusal leaves
everything untouched, mid-failure rollback, path-escape refusal, artist merge,
the poll loop with a lost report re-sent). **Live:** brain + librarian over
HTTP on a sample library — 5 decisions (a merge, years, `1-01` disc folding, a
compilation) applied in one batch, 11 journal lines, old folders gone, the plan
empty afterwards; then undone back to the original layout. The panel was
checked in a browser at desktop and phone widths.

Not yet: writing tags (4b); album-artist re-filing by tags; a Btrfs snapshot
before each batch is the owner's step for now (documented).

### 5 — Import (done 2026-10-03; Dropbox later)

Two doors, one pipeline, the same review as organising:

- **`incoming/` on the NAS**: copy albums in with Finder. Files changed in the
  last 30 s are "still arriving" and wait.
- **Drag and drop in the web app** (or Choose files / Choose a folder): copies
  only — the owner's originals are never touched. The brain streams each file
  into `incoming/_web/<upload>/` under a temporary name, checks its size (and the
  browser's SHA-256 when the page is on HTTPS), then renames it into place. The
  brain gets read-write on `incoming/` only; the library stays read-only.
- **The proposal** (`apps/brain/src/library/import.ts`): tags from the files
  (`tags.ts`: ID3v2.2–2.4/ID3v1, FLAC Vorbis comments, iTunes MP4 atoms; no
  dependencies), else `Artist/Album/` folder names, else flagged. One "New
  music" decision per arriving album. An artist already in the library keeps
  its folder spelling; an album already there is **filled in** (re-ripped
  missing tracks land in their album and drop off the missing list after the
  next export); otherwise a new `Album (Year)` folder. Track names follow the
  organise settings; disc folders fold in.
- **Duplicates by content**: a file byte-identical to one already in that album
  folder (under any name) is **set aside** in `incoming/_duplicates/`, never
  deleted. A different file with the same name is kept as "(2)". (Same
  recording in another format simply has another extension, so both are kept.)
- **Filing** is the librarian's: same precheck / rollback / journal / undo.
  On one filesystem it's a rename; across disks it copies, compares SHA-256,
  and only then removes the original. In a batch, new music goes first. Import
  journal lines use `source`/`target` (not `from`/`to`), so the analyzer sees
  new files rather than renames (tested on the analyzer side too).
- Deploy: the librarian now mounts the whole share (`MUSIC_SHARE`) so
  `incoming/` → `library/` is a same-filesystem rename; journal at
  `.synamp/renames.jsonl` in the share.

Confirmed: brain 91/91 (tags from real ID3/FLAC/MP4 layouts and junk files,
the incoming scan, filling existing albums, folder-name fallback, disc folders,
compilations, unknowns flagged, duplicates set aside / versions as "(2)",
artwork with loose uploads, batch ordering and undo across areas, the librarian
filing from incoming, a real cross-filesystem copy-and-verify); analyzer 79/79.
**Live:** browser upload of loose files and of a whole album folder, plus a
folder copied into `incoming/`; an identical copy of a track already in the
library was set aside; approved, applied by the librarian, filed into the
existing album and two new ones, `incoming/` left empty apart from
`_duplicates/`. Checked at desktop and phone widths.

Also fixed: the web app used `crypto.randomUUID()`, which browsers only offer
on HTTPS pages — opened as `http://nas:8080`, playing a playlist would have
failed. It now falls back to `getRandomValues`.

Not yet: Dropbox as a third door; automatic filing without review; recognising
the same recording in a different format as a duplicate (needs the analyzer's
fingerprints).

### 6 — Discography gaps (done 2026-10-03)

Read-only toward the music (`apps/brain/src/library/discography.ts`):

- **Who you love**: every artist folder scored by tracks and albums kept, plays
  (SynAmp's own full plays and plays from other apps) and loves. The top 50
  are followed automatically (a setting); follow or unfollow anyone in
  *Artists you follow*.
- **Which MusicBrainz artist**: from albums already matched in step 3 when
  they carry the artist ID (album lookups now keep artist and release-group
  IDs), else a name search. One clear match is taken; namesakes go to **Which
  artist?** for the owner to pick (or skip).
- **What they released**: the artist's release groups (an album across all its
  editions), leaving out ones MusicBrainz knows only as bootlegs
  (`release-group-status=website-default`). Albums by default; EPs, singles and
  live/compilation/soundtrack/remix releases are settings.
- **What you don't have**: compared by release group where known, else by
  loosely compared title (remaster/deluxe suffixes ignored). Each gap shows
  year and type, **New** (last ~4 months) or **Coming <date>**, Want / Not
  interested, and plain search links to listen or buy: MusicBrainz, Bandcamp,
  Apple Music, Spotify, YouTube Music, Discogs (CD/vinyl). No accounts or APIs.
- Checking runs in the background at MusicBrainz's pace (sharing the one rate-
  limited client), pausable, with backoff; each artist is re-checked monthly,
  which is what surfaces new releases.

Confirmed: brain 96/96 (scores and follows, artist ID from matched albums
with no search, clear vs ambiguous names, owned by group and title, type and
bootleg filters, new/upcoming, not-interested hidden, checker and monthly
re-check, choosing an artist, link encoding). **Live** against MusicBrainz:
Ani DiFranco and Tracy Chapman looked up, 30 albums listed as not owned; the
bootleg filter removed two stray entries. Panel checked in a browser.

Not yet: alerts outside the app (email/push) for new releases; using
Last.fm history to find artists you love but don't own at all.

### Missing tracks: extra sources worth importing

- An old **iTunes Library XML** / `.itl` backup lists every track iTunes ever
  knew, with play counts — the most exact record of what was lost.
- **Time Machine** backups may still hold the files.
- **Last.fm history** shows tracks played in the past.
- Some purchases may be re-downloadable from Apple.

### Engine

Prefer **beets** (MIT) as the matching/naming/import engine — MusicBrainz
autotagger, path templates, copy/move import, `missing` and `duplicates`
plugins — with SynAmp providing the review UI, the journal and the identity
link. Same reasoning as Navidrome: don't rebuild a mature core. Evaluate in
step 3 before committing; MusicBrainz allows ~1 request/second with a
contact User-Agent, so matching 4k albums is an overnight background job.

### Next (owner request, 2026-10-04): resolve merges blocked by duplicates

Some artist/album merges can't be approved because a track already exists at
the target ("“…” already exists"). When the two files are **the same
recording** — same audio fingerprint (Chromaprint) or same audio hash, similar
length — offer **"Keep the better copy, set the other aside"** on that
conflict instead of blocking the merge:

- Keep: higher quality (lossless > lossy, then bitrate), then better tags.
- The other copy moves to `_duplicates/` beside `incoming/` — never deleted,
  journaled and undoable like any other move.
- Only offered when identity is certain; "same name, different recording"
  (live vs studio, remaster) stays a conflict for a person to decide.
- Needs fingerprints from the analysis run, so it gets more useful as the
  15-day analysis progresses. Lower priority than finishing the cleanup.

### Later extras

- ReplayGain tags from the loudness the analyzer already measures.
- Missing album art.
- Dropbox as a third import door (Dropbox API, read-only scope, copy into
  `incoming/`).

## Naming decisions (owner, 2026-10-02)

The owner asked for the most standard conventions. These follow MusicBrainz
Picard's defaults and MusicBrainz's own conventions, so other tools agree:

- **Compilations** go under **`Various Artists/`** — MusicBrainz's official album
  artist for compilations, so a tagged compilation files itself there naturally.
  Existing `Compilations/` folders will be proposed for merging into it (step 4,
  with review).
- **Album folders include the year:** `Album Artist/Album (Year)/`. Where two
  editions of one album would collide (remaster, anniversary, deluxe…), the
  edition is added from MusicBrainz's disambiguation — e.g. `Album (1994)` and
  `Album (2014) [20th Anniversary Edition]` — so versions sit side by side.
- **Multi-disc albums:** one folder, disc number prefixed on the track:
  `1-01 - Title.flac`, `2-01 - Title.flac` (Picard's default). Single-disc
  albums stay `01 - Title.flac`.

All three stay settings; these are the defaults.

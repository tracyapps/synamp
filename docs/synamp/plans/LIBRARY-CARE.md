# Library care — leave the library better than we found it

Status: planned 2026-10-02; steps 1–3 done, step 4 (organise) next. Owner request, shaped against
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

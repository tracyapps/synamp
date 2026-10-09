# Research-to-implementation roadmap

Updated 2026-09-29. This is the execution companion to the product
[roadmap](../ROADMAP.md), not a replacement for the Phase 1 listening milestone.
Research sources: [Brain dossier](../../research/synamp-brain-dossier.html)
(chapters 3–9), [Sound Booth plan](../../research/synamp-sound-booth-plan.html)
(chapters 2–6), and [accepted decisions](../DECISIONS.md).

## What is actually implemented

The analyzer has resumable SQLite jobs, synthetic DSP checks and a beat stage.
The web app manages a playlist tree; the brain has an interim playlist store and
a session endpoint. The current web surface does not yet provide real playback
telemetry. “Add a skip logger in one day” in the research assumes a player that
is not present here. A producer named in research is not an implemented producer.

The 2026-09-29 slice repaired the beat refactor, replaced the dense-onset rejection
gate, separated timing abstention from beat detection, persisted reasons and
method identity, and made tempo autocorrelation use FFT. See the
[findings and verification](../../research/beat-timing-findings-2026-09-29.md).
Full real-music microtiming remains open.

### 2026-10-01 — P2 first slice landed (partial)

`apps/brain/src/query/`: signal registry, closed v2.0-subset plan validator with
stable hash, deterministic evaluator (two channels → hard guard on union, strict
+ near-miss tiers, declared ladder only, caps/MMR, reasons, counts), and a
rule-based draft parser standing in for the LLM. Smart playlists persist the
canonical plan + hash and resolve live against `LIBRARY_SIGNALS_PATH` (synthetic
sample by default). Web: “Describe what you want to hear” panel.

- **Confirmed (fixtures):** flagship prompt obeys every exclusion incl. after the
  similarity union; zero/two results reported without padding; malformed and
  unsupported plans fail with paths/asks; aliases round-trip to the same hash;
  hash stable under key order; unknown never passes an explicit audio exclusion;
  missing genre tag ≠ absence; timing predicates gated on `timing_status`; new
  library rows join saved plans without re-saving. `node --test`: 23/23; `tsc`
  clean for brain and web.
- **Not done:** queue snapshots (no queue exists yet — P3); `loosen_soft_to_hard`
  / `swap_field_proxy` ladder actions; quota constraints; non-flat arcs;
  `clap_text` (no encoder); analyzer export/import (P1 deliverable 5); P1
  stage-revision persistence. The registry lives brain-side; a test checks every
  non-metadata field exists on `AnalysisResult`, but the analyzer does not yet
  consume it.
- **Unverified:** everything about real music. Voice, instrument, arousal and
  mood fields have no producer, so real tracks are unknown for them.
- **Next smallest experiment:** ~~analyzer `export` command~~ — done, below.

### 2026-10-01 — P1 deliverable 5: analyzer → brain export (partial P1)

`synamp-analyze export` writes `synamp.library-signals/1` (`export.py`). Fields are
exported per stage only while the job record counts the stage done, so changed
files and `--redo-stage` withhold stale values. Null is omitted. IDs hash the
library-relative path, so sample and full library agree. Titles/artists are
path-derived (`metadata_source: "path"`); no tag reader yet. The brain refuses
unknown formats.

- **Confirmed:** 8 new analyzer tests (stale withholding, redo-stage scope,
  sample/full ID agreement, missing files, atomic write, every stage output
  classified as exported or internal) — analyzer 64/64; brain cross-checks that
  every exported name is a `produced` registry field — brain 25/25. End-to-end on
  synthetic click tracks: scan → analyze → export → “nothing too slow, under 140
  bpm” returned exactly the 100 and 128 BPM tracks; “no piano” returned no strict
  tracks and four “not measured” near misses.
- **Not done:** stage revisions/fingerprints (P1 1–4) — `beat_method` is exported
  per track but a changed algorithm still needs `--redo-stage`; Postgres sync;
  tag-based metadata; joining IDs to Navidrome song IDs for playback.
- **Next smallest experiment:** run `export` on the owner's 200-track sample and
  try tempo/pulse prompts on it. In code: P3 — real playback events — so the
  feedback loop has a source of truth.

### 2026-10-01 — P3 first slice: real playback events and scoped feedback (partial)

`apps/brain/src/session/`: append-only JSONL event log with client-id dedupe;
server-owned session with queue snapshots and exposure records (no invented
propensities — `policy: deterministic_rank`); player reports classified
server-side (early/late skip, heard-through, repeat; errors, seeks, interruptions
and previous are never dislikes); explicit love / thumbs / remove / restore with
declared scope; `heuristic-v1` re-ranker derived by replaying the log, bounded
and applied only inside the strict tier, with per-track `score_breakdown`.
Signed-URL streaming from `LIBRARY_PATH` lets the SynAmp web player be a real
event source. Web: player bar, feedback controls, “Removed by you” with restore.

- **Confirmed:** 14 new brain tests (39/39 total; `pnpm --filter @synamp/brain
  test` now also runs the query and session suites, which it previously
  skipped): play→skip persists session-scoped; remove→resolve hides only in
  that playlist and restore undoes it; report/queue/feedback retries are
  idempotent; interruption, error and seek produce no preference; restart
  restores session and dedupe; torn log line recovery; loving a piano track
  does not get it past “no piano”; corroborated global negatives; decay; stream
  signing, expiry, traversal/symlink escape and range requests. In a real
  browser on synthetic click-track audio: play → skip logged `skip_late` at
  3.3 s of a 12 s track (relative floor 3 s); a played-out track logged
  `full_play` at 12000 ms and auto-advanced; love and remove recorded and the
  smart playlist recomputed without the removed track.
- **Not done:** Subsonic/Navidrome scrobble bridge (third-party app plays are
  not captured); WebSocket/SSE push; `queue_up`/`queue_remove` signals;
  exploration budget; Rocchio/taste vector (v2); offline evaluation. Events
  live in a local file, not Postgres.
- **Unverified:** every magnitude, threshold and half-life is the dossier's
  candidate value; nothing is tuned on real listening yet.
- **Next smallest experiment:** listen for a week on the 200-track sample with
  the web player, then read `/api/v1/events` and check whether skips and
  removals match what you meant. In code: the Navidrome scrobble bridge, or the
  first P4 producer (voice/instrument) so “no words”/“no piano” work on real music.

## Dependency order and ownership

| Priority | Work package | Depends on | Write owner / main surfaces |
|---|---|---|---|
| P0 | Beat measurement and held-out evaluation | Current repair | Rhythm: analyzer `beat.py`, rhythm tests; detailed plan below |
| P1 | Stage revisions and signal registry | Current model contract | Analyzer persistence: `models.py`, `store.py`, `queue.py`, `pipeline.py` |
| P2 | Typed deterministic query compiler | Signal registry interface; can use fixtures | Brain query: new schema/compiler modules |
| P3 | Real playback events and scoped feedback | Session/playback integration | Player/session: brain event store + web transport |
| P4 | Model/provenance audit and feature producers | P1; benchmark manifest | Model stages, one producer per owner |
| P5 | Recording similarity, harmony and structure | P4 + P2 | Retrieval/ranking and producer-specific modules |
| P6 | Owner study, then conditional booth | Trustworthy stimuli; P3 feedback stream | Local study tools and protocol |

P0 and P1 may proceed independently after agreeing schema additions. P2 can
start against fixtures; it must not claim real retrieval works until P4 supplies
validated signals. P3 need not wait for ML. Keep one owner for shared schema and
lockfiles, and integrate those changes before producer branches. Any future
agent should read repository instructions and current diffs first, state its
acceptance criteria, preserve existing edits, and leave fresh test evidence.

## P0 — Rhythm

Follow [BEAT-TIMING.md](BEAT-TIMING.md) in order: freeze the benchmark, establish a
local reference, attribute target events, aggregate with coverage, then test the
perceptual hypothesis. Highest priority is evidence quality, not acceptance rate.

## P1 — Versions, null semantics and the producer registry

Problem: `stages_done` records completion but does not automatically invalidate
outputs after an algorithm changes. `beat_method` now identifies new beat results;
old rows still require `analyze --redo-stage beat`. A package version alone cannot
identify which stage revision produced a partly resumed row.

Deliverables:

1. Registry mapping each stored signal to stage, unit, range, nullable meaning,
   schema version, algorithm/model revision and evidence/status requirement.
   Reconcile research aliases explicitly: `microtiming_deviation.signed` →
   `microtiming_signed`, `production_vec.*` → `production.*`, `instrument.*` →
   `instruments.*`, `instrumental_score` → `instrumental`. Reject unknown aliases.
2. Persist completed stage revisions and configuration/checkpoint fingerprints.
   Queue only missing/stale stages; declare dependent-stage invalidation.
3. Keep result publication and completion markers recoverable across crashes.
   Do not expose stale scalar fields as current while a replacement is queued.
4. Migrate old payloads idempotently. Distinguish not attempted, measured,
   insufficient evidence and extraction failure. Null is never a negative label.
5. Define analyzer export/import to the brain separately from the local SQLite
   queue. The current code does not implement Postgres synchronization.

Exit tests: unchanged files at unchanged revisions are skipped; changed beat
revision reruns beat without DSP; changed decode/onset dependencies invalidate
consumers; interrupted migration/run resumes; old JSON loads; diagnostics survive
serialization; unknown produced fields fail loudly. Add versioned export tests
before asserting brain cache invalidation works. Do not move SQLite onto SMB.

## P2 — Query schema, compiler and live plans

Problem: the dossier's JSON example is a design sketch, not a safe validator.
Several properties lack types, it contains unsafe relaxation actions, and many
listed fields have no producer. Implement the supported subset explicitly.

Files: new `apps/brain/src/schema/query-plan.ts`, compiler/evaluator tests,
playlist persistence integration. Preserve manual and roll-up behavior.

1. Define a closed versioned schema with typed operators and values, bounded
   numbers, source phrases, hard/soft intent, unknown policy and proxy provenance.
   Consume P1's registry; unsupported fields return structured unsupported asks.
2. Compile plans deterministically to predicates. The LLM may produce a plan,
   never SQL or invented track IDs. Metadata and lyrics remain data.
3. Separate affirmative retrieval text from explicit exclusions. Test “no piano,”
   “no words,” “exclude punk or country,” and conflicting asks. A negation test
   must exercise the encoder-bound text, not only a regex in isolation.
4. Evaluate hard guards after combining filter and ANN candidate channels too.
   Unknown instrument/vocal measurements fail strict exclusion checks; missing
   genre tags are not evidence of genre absence. Beat timing predicates require
   an eligible version/status, never a null-to-zero conversion.
5. Underfill returns the strict subset and separately labelled near misses.
   Reject `ignore_never_relax`; do not automatically widen an explicit exclusion.
6. Store the canonical plan and stable hash, store/index/model versions and
   deterministic reasons. Refresh membership on relevant data/version changes.
   Keep playback queue snapshots separate from changing playlist membership.

Exit: fixture-based flagship prompt obeys every exclusion, including after ANN
union and re-ranking; zero/two results are honest; malformed/unsupported plans
fail usefully; aliases round-trip; hash is stable under irrelevant object order;
new analyzed tracks refresh saved plans without changing an in-flight queue.
Do not describe fixtures as proof of classifier accuracy on real music.

## P3 — Playback and personal feedback

Problem: the research prioritizes usage data correctly, but real events need a
real source of truth. `/api/v1/session` alone does not establish playback.

1. Establish server-owned session IDs, recording IDs, queue positions, source
   playlist/plan IDs and actual playback transitions through the Subsonic path.
2. Add append-only exposure and event records with stable event IDs and retry
   deduplication. Capture play duration/fraction, context, policy version, reason
   and explicit scope. Do not fabricate propensities for deterministic ranking;
   record policy semantics and add probabilities only for real randomized choices.
3. Capture skip, removal, repeat, love and interruption distinctly. Offer optional
   “wrong energy,” “wrong genre/vibe,” “not now/interrupted” reasons. Network
   failures and manual seeking are not dislikes.
4. Ship a small explainable re-ranker. Removal applies to this playlist; a skip
   remains session-scoped; global dislikes need explicit action or corroboration.
   Store score breakdowns, make derived affinities replayable, permit rollback.

Exit: one real play→skip and one remove→resolve flow persist correctly; retries
are idempotent; interruption produces no dislike; restart restores session/event
consistency; removal never leaks globally; hard query filters survive re-ranking.
Test against an isolated local event store, not the live library database.

## P4 — Feature producers and model clearance

Run an exact-artifact audit before choosing/downloading weights. Research has
contradictions: its tables call some stacks shippable while its footnotes leave
checkpoint terms unverified. Preserve those uncertainties. Record code revision,
checkpoint URL/hash, weight licence, data/output terms, required notices and
commercial/distribution status separately. Do not infer permissions from a code
licence or assume offline numeric outputs resolve all restrictions.

First producers: piano and voice probabilities/timelines for explicit exclusions;
then audio and text-aligned embeddings for exemplar retrieval. Use deterministic
DSP tonal/structure baselines where meaningful. Keep private restricted-model
experiments and outputs outside distributable assets. Each stage needs decode
and channel/sample-rate policy, versioned configuration, memory/runtime measures,
nullable failure behavior, resumability tests and an independent evaluation set.

Exit: stored values and versions survive interruption; resource use measured on
the M4 Pro; false-negative rates for piano/voice reported by mix type; calibrated
thresholds selected on development data and checked on held-out recordings.
“No piano” is a probabilistic detector policy, never an absolute guarantee.

## P5 — Recording similarity, harmony and structural change

Split into three independently owned producers after P1's contract lands:

- **Similarity/era:** retain recording identity and separate fingerprints,
  composition/cover identity and duplicate policy. Compare positive exemplars
  and negative exemplars without reducing retrieval to artist equality. Use
  multi-view production/timbre/embedding features, including segment views.
  Stereo width needs stereo decode; current mono DSP cannot produce it. Give
  reverb/noise-floor features a producer or leave them unsupported. Evaluate
  against independently supplied listening judgements, held out by album and
  artist where applicable. Neither release year nor clusters derived from the
  tested vectors are independent sonic-era truth.
- **Harmony:** chroma/profile baseline → key/mode confidence → chord timeline
  with no-chord/unknown spans → changes per supported second → progression
  representation. Test known synthesized progressions, inversions, modulation,
  transposition and dense mixes. Key similarity is not progression similarity;
  progression similarity is not a demonstrated mood predictor.
- **Structure:** segment novelty/repetition, intros/outros and change points.
  Bound quadratic self-similarity memory; preserve timestamps. Test repeated
  sections and known changes; evaluate real boundaries independently. Aggregate
  with coverage and distribution summaries so one average cannot hide an arc.

Exit: every advertised field has a tested producer and registry entry; candidate
signals stay labelled candidate until independent real-data validation; similarity
retrieves owner-approved examples beyond metadata baselines; unknown cover IDs
remain unknown. Any sequencing heuristic must be bounded and deterministic—do
not implement an exact shortest Hamiltonian path for 500 tracks.

## P6 — Owner study and conditional booth

Build a local study only after objective fixtures recover their construction
parameters. The Sound Booth plan proposes 80–120 clips, hidden duplicates,
anchors, matched rendering tiers and 60–80 owner-only timing trials. Preserve
loudness measurements, rendered event timing, bank/renderer versions and seeds.
Distinguish exact generator parameters from perceived emotion and induced effect.
Split by composition and renderer to expose synthetic-to-real overfitting.

Before collection, freeze question wording, outcome, analysis and thresholds.
Resolve document inconsistencies explicitly: the friends-pilot conversion gate
is 30% in chapter 3 and 40% in chapter 6; chapter 4 rejects low-agreement layers
while the launch table allows α ≥0.4. They are not interchangeable acceptance
rules. A mechanics pilot cannot establish population reliability or a personal
threshold. No need to ask the owner to resolve these before building objective
analyzer tests; do resolve them before enrolling people.

Exit for a local study: duplicates meet the predeclared tolerance, manipulated
parameters track the intended construct, rendering-tier bias is measured, and
timing discrimination rises above chance where the proposed predicate needs it.
Failure means repair/retire the construct, not quietly move the threshold.
A public booth is a later separate decision after owner study and pilot results,
with contributor terms, privacy, hosting and release choices resolved. Do not
build public infrastructure or recruit people as a default follow-on task.

## Handoff format for every work package

Leave the exact inputs, changed contract/version, fresh commands and exit codes,
benchmark denominator and exclusions, unresolved failures, and next smallest
experiment. Label results as confirmed, partial, unverified or failed. Preserve
research evidence states; do not promote a candidate because code now exists.

### 2026-10-01 — Plays from other apps + optional Last.fm scrobbling (P3 continued)

The edge now routes Subsonic (`/rest/*`) through the brain, which forwards every
call to Navidrome unchanged (streams piped) and records `external_play` /
`now_playing` only for scrobbles Navidrome accepted. Real paths
(`ND_SUBSONIC_DEFAULTREPORTREALPATH`) map onto the analyzer's IDs. The analyzer
export now reads tags (tinytag, MIT, cached per file). Optional Last.fm
scrobbling: web-auth connect with a one-time state, on/off periods, Last.fm's
play rule, outbox derived from the event log, 50-per-batch, retry only
retryable errors, pause on invalid session, tag-sourced names only.

- **Confirmed:** brain 53/53 (14 new: pass-through incl. a 300 KB stream,
  accepted vs rejected scrobble, form POST with several ids, path → ID matches
  the Python value, signing, play rule, state-protected connect, on/off
  periods, no resend after restart, batching 120 → 50/50/20, backoff on 11,
  pause on 9, refusals not retried, folder names held). Analyzer 65/65 (tags
  read, folder fallback, cache). Live check: a scrobble through the running
  brain against a stand-in core was captured as `external_play`, matched to the
  exported track's ID, and appeared as waiting in the Last.fm panel; a rejected
  scrobble recorded nothing; a forged callback was refused.
- **Not verified against the real services:** no real Navidrome and no real
  Last.fm account were used. First real run: connect one app through the edge,
  play a track past half, check `/api/v1/listening`, then connect Last.fm and
  watch it arrive.
- **Not done:** ListenBrainz; inferring skips from other apps (they don't report
  them — left unknown on purpose); historical import of Navidrome play counts.

### 2026-10-02 — Library care step 1: track identity + rename journal

New plan: [LIBRARY-CARE.md](LIBRARY-CARE.md) (identity → health view → missing
tracks → organise → import → discography gaps), added to ROADMAP before Phase 2.
Step 1 landed: analyzer stage `identity` (audio hash over decoded samples,
optional Chromaprint via `fpcalc`) runs first; retags keep analysis; moves
inherit analysis and the exported ID (minted from the first path; `aliases`
list later ones); copies reuse measurements as separate tracks; the librarian's
rename journal is applied on `scan` without decoding; finished jobs are now
re-opened for newly added stages. Brain maps paths via the library index and
counts feedback under old IDs. Analyzer 72/72, brain 55/55. Unverified: real
Chromaprint output; decode determinism across macOS decoder updates for `.m4a`
(a changed decoder would change hashes and look like new audio — the cost is
re-analysis, not data loss).

### 2026-10-02 — Library care step 2: library health and analysis progress

Analyzer `status.py` (SQL snapshot, run clock, best-effort throttled reporter)
pushes progress to brain `POST /api/v1/analysis/progress`; brain `library/health.ts`
validates, persists and flags stale reports; `GET /api/v1/library/health` adds
index stats. Web `LibraryHealth.tsx` strip with native `<progress>` bars. Naming
defaults recorded in LIBRARY-CARE.md (Various Artists, `Album (Year)`, `1-01`
disc prefixes). Analyzer 77/77, brain 58/58; live check: a real analyzer run on
38 synthetic files reported to a running brain (37 done, 1 unreadable, 1
duplicate recognised); the panel was checked in a browser with a simulated
45k-track mid-run report. Next: step 3, missing tracks (MusicBrainz matching).

### 2026-10-02 — Library care step 3: missing-tracks list

Brain `library/albums.ts` (folder grouping, loose title matching, release diff),
`library/musicbrainz.ts` (rate-limited client, contact UA), `library/missing.ts`
(background matcher with edition preference and review queue, notes store,
recomputed list, CSV). Analyzer export adds track/disc numbers, year and
`mb_albumid`. Web `MissingTracks.tsx`: matcher controls, filters, sorting, tags
and notes, edition chooser, found-again, CSV download. beets deliberately not
used for this read-only step (see LIBRARY-CARE.md). Brain 70/70, analyzer 78/78,
plus a live run against MusicBrainz. Next: step 4, organise (propose → review →
apply), the first step that writes to the library.

### 2026-10-02 — Library care step 4: organise (renames and moves)

Brain `library/naming.ts` (safe names, standard forms, artist keys, safe
relative paths) and `library/organise.ts` (plan of artist-merge and album
decisions, revisioned reviews, batches with merge-first rebasing, librarian
job queue with re-claim, report validation, undo, `PathOverlay`, match
carrying). New `src/librarian/` process (`apply.ts`, `main.ts`): precheck,
rename-only, rollback, companions, empty-folder pruning, journal, persisted
unsent reports. Web `OrganiseLibrary.tsx` panel; compose `librarian` profile.
beets not used for path-only organising (see LIBRARY-CARE.md). Brain 83/83;
live apply + undo through brain and librarian on a sample library. Next: step 5,
import (web drop + `incoming/`), or 4b tag writing.

### 2026-10-03 — Library care step 5: import

Brain `library/tags.ts` (dependency-free ID3/FLAC/MP4 tag reader),
`library/import.ts` (incoming scanner with settle time and tag cache, "new
music" decisions that reuse existing artist/album folders, content duplicates
set aside, versions kept), streamed web upload endpoint into
`incoming/_web/`, moves with areas (library / incoming) through organise,
librarian and undo, copy-and-verify across filesystems. Web `AddMusic.tsx`
(drop zone, file and folder pickers, progress) inside the Organise panel;
`ids.ts` fixes `crypto.randomUUID` on plain-HTTP pages. Compose: brain gets
`incoming/` read-write, the librarian mounts the whole share. Brain 91/91,
analyzer 79/79; live browser upload → review → librarian filing. Next: step 6
(discography gaps) or 4b (writing tags); Dropbox later.

### 2026-10-03 — Library care step 6: discography gaps

Brain `library/discography.ts` (artist scores from library + listening events,
auto/manual follows, MusicBrainz artist resolution via matched albums or
search with a review queue, release-group browse with bootleg filter, gap
report with new/upcoming flags, notes, listen/buy search links, background
checker with monthly re-check); `musicbrainz.ts` gains artist search,
release-group browse, and artist/release-group IDs on release lookups. Web
`DiscographyGaps.tsx`. Brain 96/96; live MusicBrainz check. Library care plan
complete apart from 4b (writing tags) and Dropbox import.

### 2026-10-04 — First real run; the analyzer moves into the app

The owner's first run on the NAS (FIRST-RUN.md) surfaced and fixed: brain
not pointed at the export; edge depending on Navidrome; `sudo` and compose
profiles on DSM (`dc` alias); web image built with npm instead of corepack
pnpm; zsh-safe Mac commands (settings file); a silent, single-threaded first
export (now 8 files at a time, with progress, committing as it goes); a
librarian report too big for the 256 KB request limit (now 128 MB) and no
progress during big batches (now a live bar). Principle agreed with the
owner: every step that has worked by hand gets baked into the app. First of
those: the analyzer is now a background worker (`synamp-analyze worker`,
macOS login item via `install-agent`) driven from the Library strip — Scan
for changes, Start / Pause analysis — and scans + exports by itself after
each librarian batch. Brain 99/99, analyzer 85/85; live: buttons → worker →
scan, export, analyse, pause.

**Baking it in, part 2: Settings and an always-on librarian.** A **Settings**
panel replaces editing `deploy/.env` for MusicBrainz contact, Last.fm API key
and secret, SynAmp's address and the upload limit (`apps/brain/src/settings.ts`,
`GET/POST /api/v1/settings`): `.env` gives the starting values, saved values
win and apply without a restart, clearing a field goes back to `.env`, and
secrets never go back to the browser (key shown as "…last4", secret as
"saved"). The librarian is now in the `app` profile, so it starts with
everything else and waits; **Pause file changes** (`POST
/api/v1/organise/pause`, an accessible switch in the Organise panel) holds it
— a batch under way finishes, nothing new starts, and the pause survives
restarts. Brain 100/100; live: settings validation and save, Last.fm becoming
available without a restart, pause switch. Next candidates: install and
update through Container Manager instead of SSH; writing tags (4b); Dropbox
import.

**Baking it in, part 3: install and update from Container Manager.** No more
profiles for the app: `docker compose up` (what Container Manager's Project
runs) starts db, brain, web, edge and librarian; Navidrome sits behind the
`navidrome` profile, switched on with `COMPOSE_PROFILES=navidrome` in `.env`
(verified: compose reads it from the project's `.env`). The brain image is
built from `apps/` and fingerprints the brain + web code at build time
(`src/version.ts` → `build.json`; Docker re-runs that step only when the code
changed). At runtime it fingerprints the NAS copy (`../apps` mounted
read-only at `/source`) and `GET /api/v1/system` says `same` / `waiting`. The
web app shows **An update is ready to install** with the two DSM steps
(Container Manager → Project → synamp → Action → Build) and **About this
install** in Settings. Updating is now `synamp-sync` + one button. Brain
102/102; compose config checked with and without the profile; live: notice
appears after a copied change, Settings shows the version.

**Fixes from the first days of the big analysis (2026-10-04).** (1) The
Library strip's **Details** never hid anything: `.health__details { display:
grid }` overrode the `hidden` attribute. Fixed there, plus a global
`[hidden] { display: none !important }`. (2) Fingerprints were "off" even
with Chromaprint installed: the launchd worker starts with a bare PATH that
lacks `/opt/homebrew/bin`. `find_fpcalc()` now also looks in Homebrew's
folders, and `backfill_fingerprints()` fills in tracks analysed without it
(fpcalc only; runs at the start of analysis and as soon as the tool appears
mid-run). (3) The worker restarts itself into a new version: it fingerprints
its own `.py` files (`code_stamp`), and when they change it stops after the
current track, queues the analysis again and exits; launchd (KeepAlive) starts
the new code 30 s later. Analyzer 87/87.

**Container Manager, as it really behaves (2026-10-04).** Two assumptions
failed on the real NAS: (1) Container Manager starts every service in the
project, ignoring compose profiles, so Navidrome started early — the profile
is gone and the docs say "don't use Navidrome until organised" instead
(harmless: no plays recorded yet). (2) **Build** reused existing images, so
updates never arrived (the update notice stayed, the web app stayed old).
`pull_policy: build` on brain, librarian and web makes every Build rebuild
from the NAS copy; Docker's cache keeps unchanged builds quick.

**Check the measurements (2026-10-04).** A panel under the Library strip plays
a random analysed track (native `<audio>`, starting 45 s in) and asks whether
its measured tempo is right: Sounds right / Real tempo is half / double /
Something else / Skip, or **Tap along** (≥4 taps → BPM; the verdict is
derived within 8 %). `library/spotcheck.ts` keeps the answers
(`DATA_DIR/brain/spotchecks.json`), reports accuracy overall and split by the
analyzer's `tempo_confidence` (≥ 0.5), and applies corrections in
`currentLibrary()` (half/double/tapped → `bpm`, `tempo_confidence: 1`). A
correction only holds while the measured BPM is the one checked; a
re-analysis that measures differently wins and the track can be checked
again. Undo takes back the last answer. Brain 104/104.

**Stop didn't stop (2026-10-04).** Container Manager greys out Build while the
project runs, and its Stop never finished: Node as a container's first process
ignores SIGTERM. Brain now exits on SIGTERM/SIGINT (stores are written
atomically, nothing to flush); the librarian leaves at once when idle and
finishes the batch in hand when working (`stop_grace_period: 2m`); both run
with `init: true`. Measured: brain 18 ms, idle librarian 9 ms.

**Listen anywhere + metre-aware spot-checks (2026-10-04).** Phase 1 as a
guided checklist (`ListenAnywhere.tsx`, `src/setup.ts`, `GET/POST
/api/v1/setup`): Navidrome running (live `/ping`), Navidrome account,
Tailscale on the NAS (its tailnet name → the "Anywhere" address with a Copy
button), Tailscale on the phone, a Subsonic app (links Navidrome's app list;
warns off `:4533`), "SynAmp hears your apps" (live: plays reported through the
proxy, by app), and a Wi-Fi-off test. The owner's first tempo checks raised
6/8 and non-Western metres: tapping now recognises three-based relations
(×3, ×⅓, ×1.5, ×⅔ → `other_level`, the tapped tempo is used), "No steady
beat" (`tempo_confidence: 0`), and the summary adds "found the pulse" (right
at some metrical level) next to strict accuracy. This is the human evidence
BEAT-TIMING R4 asks for; the analyzer itself still reports one tempo (R2's
multiple metrical hypotheses are the real fix). Brain 107/107.

**Container Manager Stop keeps failing (2026-10-05), cause unknown.** After the
SIGTERM fix, `docker compose stop` from the CLI stops all six containers in
2–6 s, but Container Manager's Stop/Restart still log "failed" with no detail
(nothing in /var/log/messages). The compose file validates with the NAS's
exact compose (v2.20.1). First failure came after the `pull_policy: build`
build, but nothing proves the link. Development updates now go through the
CLI (`up -d --build`, folded into the owner's `synamp-sync`); revisit when
there's an error message to go on.

**Duplicate-blocked merges (2026-10-05).** Merges and album renames that
collide with the *same recording* keep the better copy and set the other aside
in `incoming/_duplicates/` (never deleted, undoable) — details in
LIBRARY-CARE.md. New: `library/duplicates.ts` (sameness from audio hash or a
Chromaprint sketch + length; quality ranking; pair keys),
`POST /api/v1/organise/keep` ("Keep the other copy instead"), setting
`set_aside_duplicates`, librarian precheck that understands a place emptied
earlier in the same decision, and free names in `_duplicates/`. Analyzer:
`fpsketch.py` decodes stored fingerprints (verified bit-for-bit against
`fpcalc -raw`; ~0.4 ms a track); the export adds `fp_sketch`,
`audio_duration_s`, `quality`; tag cache v3 (one full tag re-read). Brain
115/115, analyzer 93/93 (with and without fpcalc; `test_status` no longer
assumes fpcalc is absent). Live on temp folders with real brain + librarian
processes: plan → pick → bad pick refused → approve → apply → files as planned
→ undo → every file back. **Unverified:** the 0.15 bit-error threshold on real
transcodes and remasters (only synthetic audio so far); the web panel was
type-checked, not seen in a browser.

### 2026-10-06 — Fast learning brain: goals in, session-scoped learning out

New plan: [FAST-LEARNING-BRAIN.md](FAST-LEARNING-BRAIN.md). Translation layer
(`src/intent/`): nine-goal lexicon + `interpretGoal()` classify asks as specific /
partial / contradictory / vague / impossible — every reading passes `validatePlan()`,
contradictions return two readings, vague/impossible return plain-language asks,
never an invented plan. Session-scoped learning (`src/learning/`, policy
`epoch-v1`): epochs derived from the event log (30-min idle gap, local day, session
change; 30-min live window), implicit evidence masked at the epoch boundary,
persistent explicit cells + epoch evidence + artist propagation + reliability-
weighted centroids combined into one bounded value applied inside the strict tier,
repeat-skip / not-now hides, cross-epoch proposals as the only channel that outlives
a session, exploration default OFF. Non-flat arcs (`query/sequence.ts`, accepted by
`plan.ts`) close the roadmap's sequencing extension target; harness
`tools/brain-lab/` (one command, 8 scenarios).

- **Confirmed:** Brain 218 tests — 216 pass + 1 pre-existing macOS librarian
  case-fold failure + 1 skip (both carried from the 149-test baseline; B1's
  earlier 205 and the 210/208 review capture are superseded — 218/216 is the
  final capture); new intent/sequencing and learning tests green; type-check
  exit 0 (brain + web). Lab: 8 scenarios · 86 checks — 0 fail · 0 pending · 5
  documented skips (final capture; the earlier 64-check capture's single red was
  fixed with a regression test — re-run green and byte-identical modulo the
  timestamp). Isolation, half-life, flood bounds and
  determinism are test-asserted (scenario 06: same stream at now+16 h byte-identical
  to baseline).
- **Not done:** P4 producers (declared fields stay unknown on real music — the wall
  for “no words”-style goals); proposals unproven (thresholds the most speculative
  constants); every magnitude untuned.
- **Unverified:** real music, real listening — fixtures only; reliability weights
  exist for bpm only.
- **Next smallest experiment:** one real-library session, then read
  `GET /api/v1/brain/session` and check that hides, adjustments and proposals match
  what you meant — tune the P-values only after that.

### 2026-10-07 — Preserve fast-brain research and begin the follow-up

The Autoclaw feature is merged (`be308a56`). The [research library](../../research/index.html)
now indexes its complete immutable 321-file archive, checksum manifest, report
TOC/appendix, source packs, reviews and evidence. Current work states and errata
live in its catalog; [FAST-BRAIN-FOLLOW-UP.md](FAST-BRAIN-FOLLOW-UP.md) provides
files, owners, dependencies and acceptance checks through FB14.

First slice: unsupported numeric residue stays visible (`intent-v2`), reading
caveats/culture notes reach expandable UI, queue readout respects playlist scopes,
Settings exposes policy rollback, and negative proposal copy describes a score
change rather than a guaranteed exclusion. The maintained dossier's memory
statistic attribution is corrected from primary indexed excerpts. Read-only
`tools/brain-lab/readback.mts` starts the real-library evaluation workflow with
explicit snapshots, clock/timezone and unchanged inputs. Fresh evidence is linked
from the follow-up receipt; historical counts are not current verification.

Remaining: owner session read-back before tuning; odd/layered metre correction;
tempo reliability decision; P4 producers; explicit arc-protection design; proposal
lifecycle; richer arc experiments; reviewed public knowledge-base export. No
public site or model-accuracy claim is implied by these local changes.

## Library exploration and Galaxy

The [Library Explorer / Galaxy handoff](LIBRARY-EXPLORER.md) owns the catalog
views, advanced filters, identity review, annotations and visual discovery
sequence (LE01–LE10), plus the independently verified MilkDrop sizing fix
(VB01). The [HTML research entry](../../research/library-explorer/2026-10-07/index.html)
contains the TOC, private census, approved concept and evidence appendix.
The initial explorer and Galaxy hierarchy are local implementations;
collaboration paths depend on reviewed multi-artist identity. Preserve physical
folder keys and do not interrupt the running Brave/NAS analyzer to replay scratch
checks. Public exports must exclude private catalog samples and operational logs.


### October 7 tester workflow: saved views and filter playlists

LE03a/LE08a source slice: `apps/web/src/library-view-state.ts`, `useLibraryView.ts`, `SavedLibraryViews.tsx`, `FilterPlaylistDialog.tsx`, `LibraryExplorer.tsx`, query-aware `App.tsx`; backend `library/explorer-selection.ts`, shared explorer selection, `PlaylistStore.createSnapshot`, and authenticated routes in `index.ts`. Integrator owns UI/state/schema; one backend owner owns persistence. No active analyzer or NAS state changes.

[Canonical acceptance and remaining dependencies](LIBRARY-EXPLORER.md#october-7-tester-workflow-follow-up) and [fresh receipt](../../research/library-explorer/2026-10-07/saved-views-playlists-verification.md): named local views and version-1 links restore refresh/Back/Forward; full-filter song preview precedes atomic manual playlist creation; retries are idempotent within the 10-minute server receipt. Corrupt state remains intact until reset. Large selections reject explicitly above 100k; never truncate. IDs must still exist; ongoing analysis signal changes are allowed. Nested pivots, annotations, reviewed release identity, graph paths and richer Galaxy layouts remain separately planned. Deployment and tester onboarding on the live build remain unverified and require their own bounded rollout.


### 2026-10-08 — dsp_core revision 2, stage revisions, parallel analysis

Investigation (12k of 46k analysed): "no words" can never match (no voice
producer); focus fell back on tempo/loudness; dsp_core rev 1 gave every track a
confident tempo (Music for Airports 1/1: 121 BPM, confidence 1.0); the beat stage
refused 91% of tracks; the launchd agent ran as ProcessType Background on one
efficiency core (~29 s a track).

- **dsp_core rev 2:** `pulse_clarity` = median beat-period autocorrelation
  contrast over 8 s windows of a 1 s-detrended log-flux envelope;
  `pulse_steadiness` = share of windows agreeing on tempo (octaves allowed);
  `tempo_status` measured / no_steady_beat / too_short; bpm and
  tempo_confidence only with a steady beat (clarity ≥ 0.30, steadiness ≥ 0.50).
  On ~100 owner songs: ~9/10 beat-led songs measured, 3/19 ambient (those with
  a real pulse), 0 classical.
- **Stage revisions (P1, minimal):** `models.STAGE_REVISIONS`; results record
  `stage_revisions`; `requeue_outdated` reopens only the outdated stage.
- **Parallel analysis:** `cfg.workers` (default 4) capped by cores − 2 and
  RAM/12 GB; spawn process pool; recordings over 15 minutes run alone.
  Agent plist: ProcessType Standard, Nice 10 (reinstall the agent once).
- **Still open:** onset_rate barely separates ambient from pop (3.5–5.9/s at
  the 10th–90th percentile); the beat stage's own gate (insufficient pulse
  evidence on 91%); voice/instrument producer (next).

### 2026-10-08 — voice stage (P4 first producer): singing/speech and instruments

`services/analyzer/src/synamp_analyzer/listen.py`, stage `voice` (revision 1),
opt-in extra `listen` (torch, torchlibrosa); the launchd agent runs
`uv run --extra listen`. Model: PANNs CNN14 (code MIT, network reimplemented in
listen.py and checked identical to the reference `panns_inference` outputs on
the owner's Mac; weights Zenodo 3987831, SHA-256 0dc499e4…, downloaded once to
~/panns_data). **Weights licence / AudioSet terms not yet confirmed — private,
owner-only until they are.**

Fields: `vocal_fraction` (share of ≤30 ten-second windows with any singing or
speech class > 0.10), `instrumental` = 1 − vocal_fraction, `instruments.<name>`
(share of windows with that instrument > 0.10), `voice_peak`, `voice_method`.
Exported flat as `instruments.piano` etc. (export.EXPORTED_GROUPS).

Check on the owner's library ("no words" = vocal_fraction ≤ 0.10): instrumental
Eno/Budd/Balmorhea 19/19 pass; sung pop/rock/folk (Cher, Bon Jovi, Ani DiFranco,
Annie Lennox, Madonna, Dave Matthews) 0/29 pass; Eno's own songs 7/8 caught
(missed: "Third Uncle", voice buried in the mix). Wordless choirs count as voice
(Music for Airports 2/1). Piano is clear on piano pieces (Music for 3 Pianos
0.95). About 5 s a song on CPU (2 threads per process).

Next: owner labels (a "has words?" spot-check like the tempo one) to calibrate
the 0.10 threshold; confirm the weights licence before any distribution.

### 2026-10-08 — Settings: memory for analysis (steady, set hours, or while away)

Settings → "Analysis on your Mac". Brain: `AnalyzerControl.settings.memory`
`{mode: steady|hours|away, normal_gb|null, more_gb|null, from, to, away_minutes}`
(null = recommended), sent to the worker with every claim and analysis check;
the worker reports `memory_gb`, `cores` and `memory_now {gb, songs, why}`.
Worker: `allowance.py` works out "right now" on the Mac (its clock; HIDIdleTime
from `ioreg` for "away") and `run_analyze(memory_gb=callable)` follows changes
mid-run (fewer songs as started ones finish; the process pool is rebuilt when
idle). Songs at once = memory ÷ 3 GB, within cores − 2, memory − 4 GB and
ANALYZER_WORKERS (default now 16). Recommended: a quarter of the Mac (3–12 GB);
"more" recommended: half, keeping 8 GB. The web mirrors the arithmetic in
`apps/web/src/analysis-memory.ts` (tests: tools/analysis-memory.test.mts).

### 2026-10-08 — "Sounds like these songs" (sound vectors, voice stage revision 2)

Analyzer: the voice stage (now revision 2, so songs already done are redone
once) also keeps CNN14's 2048-number embedding per window, averages it, and
projects it to 128 numbers with a fixed random projection (seed 20261008),
stored as base64 int8 `sound_vector` (exported top level). METHOD gains
`/vec128`. Brain: `library.attachSoundVectors` decodes them, centres on the
library mean and normalises into `track.embedding`, so the existing exemplar
ranking (`exemplar_pos`, channel "similar") works. `/plans/draft` takes
`like: [id…]` (≤5; prompt may be empty). Web: Describe → "Sounds like these
songs" picker (search, add up to 5, remove; focus kept).

Check on the owner's library (9 artist/style groups × 12 songs, top-5 cosine
neighbours): same group 2.6–4.8 of 5 (mean 3.3) against 0.5 by chance;
Berlioz 4.8, Budd 3.6, Eno ambient 2.7, Bon Jovi 2.6 (mixes with Beastie Boys
and Cher — plausibly alike in sound).

### 2026-10-08 — care polish: "Saved" beside the change, cleaner duplicate names, disc numbering, Open in Finder

- `apps/web/src/ui/SaveNote.tsx` + `useSaveNote()`: one live-region note per section, shown beside the control
  last changed (Saving… → ✓ Saved — what; failures as role=alert). Used in Analysis on your Mac, Playback
  (localStorage; `writePrefs` now returns false when the browser won't keep it), Discography "What counts",
  Missing tracks rows, Organise pause / naming settings / "Keep the other copy". Prefer it for any autosave.
- Duplicates: `betterCopy` true tie keeps the copy without " (2)" / " copy"; album plans sort plain names
  before their "(2)" copies (`byCleanNameFirst`), which also stops two different songs swapping names.
- Disc numbers (owner saw single CDs proposed as "1-01"): on his library 22 albums, mostly single CDs
  matched to a deluxe/CD+DVD MusicBrainz edition. Now the release's disc is used only when the files can't
  tell discs apart (no number, or two different songs sharing one number); a lone release disc is ignored.
  Flattened 2-CD folders now get 1-01 and 2-01 (before: both 1-01, then "(2)").
- Open in Finder: POST /api/v1/analyzer/reveal {area: library|incoming, path} → the Mac worker's
  reveal thread (POST /api/v1/analyzer/reveals every 3 s, also during analysis) runs `open` on the folder
  inside the already-mounted share (smb:// links were tried: Finder mounts each subfolder as its own volume).
  Only paths inside the library or incoming/; nearest existing parent if the folder isn't there.

### 2026-10-08 — Smooth scrolling through 100,000 songs (Library)

- Web: `library-window.ts` (pure; tools/library-window.test.mts) + `useLibraryWindow.ts`. Only rows near the
  screen are drawn; gaps (spacer rows/items) keep the scrollbar the full length. Heights are measured with a
  ResizeObserver (wrapped titles, opened albums), unmeasured rows use the running average, "Loading…"
  stand-ins are drawn at the expected height and never measured. When rows above the screen change height,
  the hook keeps the first visible row in place (CSS scroll anchoring is off: Safari lacks it). The row with
  keyboard focus is always drawn. Scroll events are caught on `document` in the capture phase (the app scrolls
  `.app__main`, not the window). Pages of 100 are fetched only for what's near the screen; a changed
  `library_version` reloads the view. Table: `aria-rowcount`/`aria-rowindex`; list/grid: `aria-setsize`/`aria-posinset`.
  Grid: a "line" is a row of cards (`cardsPerRow`).
- Brain `explore.ts`: the filtered+sorted result is remembered per library and filter (last 8), sort keys and
  folded text are worked out once (Intl.Collator), and the default view is warmed after start and each export.
  100k songs: first build ~2.7 s (warmed in the background), later pages ~1 ms, a new sort ~75 ms, a search ~0.3 s.
- Known limits: a screen reader's browse mode reads only the drawn rows (row numbers say "of 100,000");
  the table header doesn't stick (the table's horizontal scroller prevents it).

### 2026-10-08 — LIBRARY-CARE 4b: song details written into files (Organise kind "tags")

- `apps/brain/src/library/tag-writer.ts` (pure, no deps): MP3 (ID3v2.3/2.4; ID3v2.2 carried over to
  2.3 frame for frame, PIC→APIC; ID3v1 kept in step) and FLAC (Vorbis comments; padding absorbs size
  changes). Only the changed frames/comments are replaced, new ones first; every other frame kept byte for
  byte. Refused with a plain reason: unsynchronised/extended/footer ID3 headers, damaged frames, v2.2
  frames with no v2.3 name (e.g. iTunes CM1), FLAC with ID3 in front, ".mp3" files that aren't MPEG
  inside. M4A not written yet. Owner's library: 90% MP3, 10% M4A, no FLAC.
- Checked on 400 of the owner's real MP3s (copies; library read-only): 387 written and verified (audio
  SHA-256 identical, tags read back, decodes as before, cover art kept), 11 refused (5 damaged frames,
  3 v2.2 RVA → since mapped to RVAD, 2 unsynchronised, 1 CM1), 2 originals that already fail to decode
  (same error before and after). Found and fixed a reader bug: an empty ID3 frame stopped tags.ts reading
  the rest of the tag.
- Brain: `song-details.ts` TagCache reads tags from the files (read-only /music, background, 150 ms per
  2 s, persisted to data/tag-cache.json); `detailDecisions` proposes per trusted match (confident, chosen
  by you, or MB ID in the files): fill missing (default on), fix track/disc numbers (on), MusicBrainz
  spelling (off). Organise settings carry the three switches. Album renames now use the trusted
  release's track numbers when the file's differ (fix_track_numbers), so a batch with both doesn't name
  "07 - Fuel" while writing track 2.
- Librarian: `tags-apply.ts` checks every file still says what was reviewed, keeps the old tag parts in
  `.synamp/tag-backups/<batch>/` (LIBRARIAN_TAG_BACKUPS), writes beside + fsync + read back + rename,
  all-or-nothing per album, journals `{retag: path}` (the analyzer's rename replay ignores it; the scan
  re-identifies the file and keeps its analysis because the audio hash is unchanged). Undo restores only
  files still exactly as SynAmp left them. E2E in the cloud (brain + librarian + web): apply → tags
  correct, decodes; undo → all three files byte-identical to the originals.
- Open: M4A writing; per-track artist credits (MbTrack has none yet, so only missing artists are filled
  from the album artist, never on Various Artists); tag-backups clean-up (they're small: tag parts only).

### 2026-10-08 — Gapless albums, skip blends, DJ mode, song keys (tonal stage)

- Analyzer `tonal.py` (stage `tonal`, revision 1, before voice): 11 kHz chroma from a spectrum whitened
  by a 31-bin median (drums and hiss drop out), Krumhansl–Kessler profiles, `key` ("A minor"), `mode`
  (signal, now produced), `camelot` ("8A"), `key_strength`, `key_margin` (vs the best key a DJ couldn't
  mix with), `key_status` measured|unclear|too_short (strength < 0.72 or margin < 0.03 → no key).
  Checked on 150 of the owner's songs vs Essentia KeyExtractor (bgate): 122 keyed, 80 % exact,
  +11 % DJ-compatible, 9 % disagree. Log-compressed chroma and Temperley profiles were far worse.
  ~1 s a song (plus a decode). Reference venv on the Mac: ~/SynAmp-data/keyref (validation only).
- Brain: `session/gapless.ts` reads encoder delay/padding (MP3 LAME/Lavc tag in the Xing/Info frame;
  M4A iTunSMPB) for entries near the playhead (`gapless` on the session entry, plus `bpm`, `camelot`).
  `session/dj.ts`: `djOrder` (greedy from the first song + 2-opt ≤ 400 songs; cost = tempo gap with
  half/double time, Camelot distance, small loudness term; keys with strength < 0.8 trusted less;
  unmeasured songs kept). `/session/queue` takes `order: "dj"`; the session carries `mix: "dj"` and
  entries a `dj_note`.
- Web: `audio/engine.ts` — every song through Web Audio (one shared AudioContext with the visuals):
  ElementVoice (streamed <audio>, 3 pooled, tapped once) and BufferVoice (decoded; used for album runs
  at full quality ≤ 20 min, deviceMemory ≥ 4). Gapless = next buffer `start(endsAt)`; encoder silence
  trimmed only when the browser left it (`trimFor`). Crossfades/skip blends are AudioParam curves
  (equal power), so background tabs don't stall them; crossfades never exceed a third of the song.
  `audio/transition.ts` decides gapless / crossfade / cut and DJ blend length (16 beats, 6–12 s).
  Settings: "Blend when I skip" (on). Safari: navigator.audioSession.type = "playback".
- Checked in Chromium with a recorder on the engine output: a continuous tone split into three MP3s
  plays back with no gap and no discontinuity (max sample step 0.0045, the tone's own); crossfade and
  skip blend leave no silence. (Occasional single-sample steps at render-quantum boundaries appeared in
  headless runs mid-song too: headless audio underruns, not transitions.)
- Next: beat-locked DJ mixes (needs beat grids for most songs and a time-stretcher, e.g. SoundTouch).
  To check by ear: the web player on the owner's iPhone with the screen locked.

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

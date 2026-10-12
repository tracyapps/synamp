# Roadmap execution — October 12, 2026

Starting source: `f988fb64`, clean. This continuation changes local source and
creates private baseline artifacts. No deployment, hosted CI, owner audio
playback, independent rating or closed release gate is claimed.

## B03/B05: browse work no longer runs on the playback server thread

Earlier live measurements established that an Explorer request delayed a
simultaneous health request. The current synchronous filter, grouping and sort
pipeline shares the playback HTTP thread. The separate silent-Play fix is
already present in the starting source; it does not remove this server stall.

`apps/brain/src/library/explore-service.ts` and `explore-worker.ts` now run the
GET Explorer pipeline on one worker thread. The HTTP route and background
warmup use it. Only browse metadata is copied, once per immutable library
snapshot; signals, embeddings and analysis provenance stay out of the worker.
It retains the existing filter/group/sort/page functions, validates queries with
the same public errors, bounds waiting work to sixteen requests and rejects
waiting callers on shutdown/failure. A failed worker is replaced on the next
request. Source snapshot changes and revised favourites stay isolated.

Scope: the read-only Explorer GET path. Playlist preview/pick evaluation,
initial export parsing, near-playhead gapless file reads, other pages and
background tag work still have synchronous portions. This is not a claim that
all server stalls or HTTP 499 causes are repaired.

Fresh checks on the Mac, Node 24.13.0:

- Five focused service tests pass, including a cold 46,000-track query that
  allows the main event-loop heartbeat to run, result parity, concurrent
  snapshots/favourites, invalid-query recovery and bounded shutdown.
- Brain suite: 331 tests, 330 pass, zero failures, one existing cross-disk skip.
  Brain TypeScript passes.
- Existing Library/Finder browser harness passes through the new GET route.
  Full-App Library playback browser checks pass all six scenarios, including
  actual generated-waveform output; zero captured browser exceptions.
- `git diff --check` passes. No frontend code changed in this continuation.

Read-only current-owner-metadata local experiment, 45,118 exported tracks:
synchronous grouped/title-sorted query 368 ms, zero timer callbacks while
running and a 368 ms largest timer gap. Worker cold query 435 ms, 72 callbacks,
33 ms largest gap; repeat 13 ms. Results are deeply identical. Source metadata
was loaded once before these timings; cache state and concurrent host activity
limit elapsed-time comparisons. This demonstrates local event-loop isolation,
not a NAS speedup. Private evidence: `/tmp/synamp-explorer-responsiveness.json`,
`/tmp/synamp-explorer-worker-library-evidence/` and
`/tmp/synamp-worker-library-playback-evidence/`.

## B01/B02: freeze the owner's challenge selections

Private run root:
`/Users/tapps/SynAmp-data/business-baseline/2026-10-12-challenge-01/`.
The workbook is unchanged. All thirty filled Challenge rows match exactly one
current exported track; seventeen have listening notes. The original random
200 sample stays separate and unchanged. The capture includes workbook/export
hashes, exact source rows, verbatim owner notes, declared parent counts and
recomputed subset stage counts. Files are private, outside Git; no music audio
was copied or heard.

Twenty-six selected tracks mark all five stages complete. Four mark none in
this export; their measurements remain unknown. The source export has changed
since October 11: 45,118 exported of 46,267 catalog entries, with its declared
1,149 missing-on-disk and 6,070 withheld-stale counts preserved in the receipt.
These categories are not assumed disjoint or evidence of permanent deletion.
The running analyzer was not interrupted or reconfigured.

The frozen twelve-request suite on these thirty tracks records six
evaluated/unrated, three interpretation reviews and three manual pending.
Q01 returns zero because `not_relaxing` is unknown for all thirty. Q02/Q03 return
twelve, Q04 ten, Q05 nine and Q09 three. Missing features and strict shortages
are retained, not relaxed. Owner selections/group names and freeform notes are
not silently converted into adjudicated labels: Heard-it cells are blank,
some quiet-voice rows explicitly describe instruments, and no independent
rater has scored audible fit. The listening quality gate remains unassessed.

`reports/challenge-30-capture-time-baseline.json` is authoritative and uses the
receipt's exact capture clock. The earlier fixed-noon-clock report is retained
as superseded; all twelve case results are identical. The private
`reports/challenge-listening-review.md` maps returned songs back to spreadsheet
rows and lists the four selections without current completion markers.

Next: verify the worker and the existing playback/compilation fixes on the
installed NAS build; review the four unmeasured challenge tracks after normal
analysis refresh; use the private baseline report to collect actual listening
judgments. Investigate Q01's unsupported `not_relaxing` producer separately
before changing any supported promise or threshold. B04 cold-install and
B05 restore/device evidence remain open in the main backlog.

## B04/B05: offline Brain-state recovery tooling

`tools/install/brain-state.mjs` now captures a private regular-file Brain-state
copy with a SHA-256 manifest, verifies its complete file set, and restores only
into a fresh directory. Source/target overlap, existing outputs, symlinks,
special files, changed copies, unsafe/duplicate manifest entries and integrity
failures are refused. It requires the owner's explicit stopped-writer
attestation and documents its bounded file/size envelope. It never stops a
service, changes Compose or replaces current state. Incomplete outputs remain
for inspection. Backups are not signed and cannot establish power-loss or
live-database consistency.

Seven fresh tests pass, including real PlaylistStore, SessionStore, EventLog
and WordChecks restore/restart, torn final-log recovery, source-byte
preservation and negative safety cases. The new [recovery procedure](../../tools/install/RECOVERY.md)
separates Brain from music/journals/tag backups, Mac SQLite, other services,
secrets and image identities. Installed NAS restore, complete-system backup,
single-writer enforcement and actual data rollback remain open.

## B03: browser checks in release CI

A separate Node 22 / Ubuntu 24.04 job now installs the locked Puppeteer Chrome
build and runs all three isolated player/Library harnesses. Ordinary Node jobs
still skip browser downloads. Fresh local execution passed all player actions,
Library navigation/reveal checks and six full-App playback assertions; actual
generated audio was measured. `actionlint 1.7.12` and whitespace checks pass.
This configures six hosted jobs; it is not evidence of a hosted run. Browser
screenshots remain temporary runner files and assertions stay in job logs.
Hosted Node 22/Linux browser compatibility still needs the user's push.

## B05: refuse silent reset of critical user stores

Words/tempo/mood corrections, favourites and runtime settings previously caught
all read/parse errors as a first run. Ten regression checks reproduced this gap.
The loaders now allow defaults only for ENOENT; malformed JSON, read failures,
wrong envelope/container shapes and incompatible format markers stop startup
without writing. Error text excludes JSON contents and credentials. Legacy
unversioned objects and omitted optional fields remain compatible. Recovery
steps preserve originals and require a fresh-directory rehearsal. This is
container/envelope validation, not comprehensive record-schema validation or
power-loss durability. Other optional/cache loaders remain separate work.

Fresh verification: Brain typecheck passes; Brain suite reports 341 tests,
340 passed, zero failures and the existing one cross-filesystem skip. The
seven offline recovery tests still pass with these stricter loaders.

## B07: offline denominator-complete beta scorecard

`tools/beta-scorecard.mjs` reports aggregate install, 72-hour activation and
mature W4 counts from an owner-maintained private JSON snapshot. It retains
failed/assisted attempts, missing replies and unobserved activation; excludes
immature windows; reports unknown zero-denominator rates; validates dates,
ordering, consent references, duplicate households and an intentionally small
schema. No network, contact data, automatic telemetry or actual tester registry
is created. The [operating guide](../beta/README.md) defines explicit elapsed-day
windows and separates this slice from recruitment, permissions, support, rights
and actual cohort evidence. Five initial regression checks pass, including the
six-retained/two-inactive/two-missing example. B07 remains open for real operation.

Broader fresh verification: all 72 selected root/lab/NAS/install tool checks
pass and the web production build passes. These are local Node 24 checks;
hosted Node 22 compatibility is still pending. No real tester data was used.

Final state-loader review also found ENOENT from a dangling state symlink could
look like a missing file. That case now refuses startup and preserves the link;
eleven focused state-loading checks pass, along with typecheck and recovery
checks. Valid symlinked stores retain their earlier read behavior.

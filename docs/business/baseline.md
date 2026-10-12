# B01 baseline and release scope

Updated October 12, 2026. Original source base:
`8568c9b8e04e1f5c355c9fb86028f55aadb67823`; current local feature commits are
listed in [the October 12 receipt](execution-2026-10-12.md). The
[October 11 receipt](execution-2026-10-11.md) retains earlier evidence. This page
is the starting point for implementers, not launch proof.

## Narrow candidate promise

One owner, one personally controlled music library, private-network access;
Synology x86-64 Container Manager and an Apple Silicon Mac analyzer are the
initial **candidate** combination. The repo names DS1825+/DSM 7.4.1 and an M4
Pro, but current changes have not been verified on that installed combination.
Do not advertise a supported combination until an actual attempt receipt passes.

The proposed listening job is an explainable playlist from measured library
signals, with visible shortages and corrections. Natural-language coverage is
bounded: the frozen baseline currently flags several requests for interpretation
review. Manual playlists and browser-local saved Library views exist; local tests
do not establish installed-owner playback. Librarian writes remain reviewed and
optional, on a separate trial library or after verified backup/restore. M4A tag
writing remains outside the writable promise. Mood, precise vocal character,
beat-locked DJ mixing, public internet hosting, household accounts and cloud are
outside the paid-EA promise pending their own evidence.

## Current evidence ledger

| Evidence class | Current observation | What is still missing |
|---|---|---|
| Local code/temp files | Brain 341 pass/one existing skip; three player/Library browser harnesses; 72 selected tool checks; web build; offline real-store restore and refusal of damaged critical state | Hosted CI, installed server filesystem, power-loss/full-disk/second-writer proof |
| Synthetic library | Frozen twelve-case baseline: six evaluated but unrated, three interpretation reviews, three manual cases pending after the measured steady-beat parser repair | Actual musical fit, audible false negatives and independent raters |
| Owner-library snapshot | Consented private random-200 and challenge-30 captures; twelve frozen requests evaluated locally with shortages and unmeasured tracks retained; no listening ratings inferred from notes | Actual installed candidate/build, playback latency, throughput, by-ear quality, independent raters and full workday |
| Independent customer | No attempts or users claimed | Eligible cold attempts, assistance, activation and mature retention |

**G0 remains open:** first playback and quality/throughput on the actual candidate
hardware are not demonstrated. B01's scope/evidence map is available; B01 is not
closed. Start with [the evaluation procedure](listening-evaluation.md) and
[NAS preflight](../../tools/install/README.md). Use the existing private frozen
captures for the next listening review; do not search personal mounts or interrupt an owner analysis. Snapshot evaluation is
not evidence of live installed performance.

## Reads, writes and outbound services

This is a source inventory, not a packet capture or licensing clearance. Owners
for each follow-up are roles in the [backlog](execution-backlog.md).

| Surface | Reads and writes | Follow-up owner / unresolved evidence |
|---|---|---|
| Brain | Music mounted read-only; exported signals from shared `.synamp`; JSON stores and JSONL events under DATA_DIR/brain; uploaded files under incoming | B05: second writer, bounds, interrupted state, restore and private auth |
| Librarian | Sole library-file writer; reviewed moves/tag writes; journal and tag backups under music share `.synamp`; worker/report state under DATA_DIR/librarian | B05: actual apply/undo, unchanged audio, crash/recovery and unsupported formats |
| Analyzer on Mac | Reads network music; local SQLite state; exports library signals to the music share; reports progress/control to Brain | B02/B04: stage counts, small-subset wait/resume; do not manipulate the running worker |
| Navidrome | Read-only music, own database/cache under DATA_DIR/navidrome; streams and authenticates through Brain/edge | B05/B06: actual client route, GPL distribution inventory |
| Postgres/Caddy | Compose state under DATA_DIR; Postgres is provisioned but current Brain stores remain file-backed | B04/B05: actual image versions, backups, safe rollback |
| MusicBrainz | Metadata lookups, contact in User-Agent; cached album/discography state in Brain | B06: exact usage/attribution disposition before distribution |
| Last.fm | Optional authentication/scrobbling sends track metadata; session/delivery state stored privately | Founder/B06: commercial decision unresolved; default-off is not clearance |
| Lyrics | Reads embedded tags; optional LRCLIB requests/cache under Brain state; lyrics affect words evidence | Founder/B06: external data rights unresolved; no commercial inclusion assumed |
| Radio | Radio Browser directory lookups and selected station streaming through relay; Brain radio state | B06: add directory/station terms to per-artifact inventory |
| Voice model | Opt-in PANNs weight download from Zenodo to Mac cache; inference on audio | B06: match exact artifact and terms; no redistribution decision claimed |
| Catalog links | MusicBrainz/Bandcamp/Apple Music/Spotify/YouTube/Discogs links open externally on user action | B08: distinguish navigation links from server lookups |
| Public website | Separate subscription/contact APIs and provider configuration | B08: retain consent promises; no product telemetry inferred from site forms |

Source seams: `deploy/docker-compose.yml`, `apps/brain/src/{config,index}.ts`,
`apps/brain/src/{library,lastfm,radio}/`, and
`services/analyzer/src/synamp_analyzer/{config,export,worker,listen}.py`.
Chromaprint fingerprint computation is not evidence of an AcoustID network call;
any future lookup needs a separate disposition. Full transitive licenses, fonts,
artifacts and external-provider terms remain B06 work.

Back up app state **and** music-share journals/tag backups and music according to
the recovery policy, plus the Mac analyzer database. DATA_DIR alone cannot restore
music changes or analyzer progress. Do not copy a live database as if that were a
verified consistent backup.

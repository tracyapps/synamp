# Library Explorer / Galaxy / MilkDrop — local verification

Historical first-slice receipt, 2026-10-07: source was uncommitted when these checks ran and was subsequently merged. The newer fullscreen/table work is documented in [its own receipt](workspace-table-verification.md). The running Brave/NAS app and analyzer were not restarted, deployed, moved, retagged or written by these checks.

## Confirmed checks

| Requirement | Fresh evidence | Result |
| --- | --- | --- |
| Entity filtering, exact/glob/fuzzy, AND/OR/NOT, dates, full-result grouping, paging and Unicode | `node --experimental-strip-types --test apps/brain/src/library/explore.test.ts apps/brain/src/library/galaxy.test.ts apps/brain/src/library/browse.test.ts`; [log](evidence/library-tests.log) | 23 tests pass. Includes repeated-star wildcard input and one-code-point `?`. |
| Public route boundary | Existing `brain-readout.test.ts` now checks unauthorized GETs to all 4 new routes, authorized exploration/artist detail, invalid year HTTP 400 and absent random result | Included in final Brain suite; affected integration test passes. |
| HTTP data contract | Isolated child Brain :39821, private temporary stores, five synthetic tracks; [receipt](evidence/http-smoke.json) | Full-result group counts before pagination, filter HTTP 400, numeric Galaxy paging, Unicode search, selected detail, constrained random and missing artist HTTP 404. |
| List/grid/table and columns | Chromium browser against built app :39822 and isolated Brain | Album tracks expand in list/grid; expansion survives view switching. Columns/table preference survives reload. Table scrolls locally on 390 px portrait without body overflow. |
| Advanced live filters | Actual browser inputs against the API | Multi-type selection, `bjorkk` fuzzy search, 1990–2000 inclusive range, grouping into 2Pac, two-rule AND then OR. Response invalidation and disabled updating-result actions are implemented; a dedicated delayed-response race was not separately exercised. |
| Galaxy discovery and actions | Actual browser controls/API results | Artist→album→song; raw featured-credit search reaches 2Pac candidate; random constrained by full pool; zoom 125%, Reset, SVG drag, keyboard Enter. Per-song add creates exactly track `a` in a scratch playlist; album action queues only selected artist IDs `a,b`. |
| Responsive Galaxy | Built app, 1440×1000 desktop, 390×844 portrait, 844×390 landscape | Portrait recomputes logical canvas to 360 px world width with readable direct labels and separate detail continuation. Screenshots below. Keyboard list and zoom/reset duplicate gestures. |
| Real catalog scale/data | Read-only JSON snapshot, direct real functions; [receipt](evidence/real-library-smoke.json) | 46,117 file records; first page 24 of 5,490 candidate/raw planets; parsed 2Pac 236 files / 37 source album folders, no detail truncation. Full-file inputs hashed. Single-process timings are observations, not NAS/device benchmarks. |
| Actual MilkDrop WebGL sizing | `node tools/visuals/check-sizing.mjs docs/research/library-explorer/2026-10-07/evidence/visuals`; [receipt](evidence/visuals/results.json) | Retina startup/resize, DPR-only, DPR cap, phone, landscape, reopen; final viewport equals drawing buffer. Background wheel containment and Close/Escape style restoration. |
| Types/build | Brain type-check; Web build includes Web type-check; [Brain log](evidence/brain-typecheck.log), [Web log](evidence/web-build.log) | Exit 0. Galaxy is a separate lazy chunk; no visualization dependency added. |
| Broad regression | `pnpm --filter @synamp/brain test`; [full log](evidence/brain-suite.log) | **238 tests: 236 pass, 1 known macOS case-fold failure, 1 `/dev/shm` skip; exit 1.** No new failing test. |
| Documentation integrity | `pnpm research:build`, `pnpm research:check`; local report-link check | Current catalog, all 321 preserved archive hashes and referenced report files checked. |

The carried failure is `librarian.test.ts`'s “artist merge: whole folders…” fixture: case-insensitive macOS retains `Ani Difranco` versus expected `Ani DiFranco`. It was present before this request. It is not hidden as a passing full suite.

## Screens and design contract

- [Approved illustrative concept](galaxy-concept.png), [approval/contract](concept-provenance.json).
- [Actual local Galaxy desktop](evidence/galaxy-desktop.png), [portrait](evidence/galaxy-mobile.png), [landscape](evidence/galaxy-landscape.png).
- [Library table desktop](evidence/library-table-desktop.png), [portrait](evidence/library-table-mobile.png).
- [MilkDrop Retina frame](evidence/visuals/retina-fullscreen.png).

App screenshots use a **synthetic five-track smoke fixture**, not the owner's library. The screenshot player queue contains scratch metadata with no audio files; actions prove correct IDs and playlist persistence, not audio delivery. A focused browser script initially used ambiguous/changed accessible labels; selectors were corrected and those interactions passed. Earlier connection-refused console entries came from deliberate scratch-server stop/restart. No live browser tab was operated.

Browser step summary: [machine-readable receipt](evidence/browser-checks.json). Owned scratch browser and servers were stopped after verification.

## Remaining boundaries

This is the initial Galaxy hierarchy slice. Collaboration edges/paths, durable notes/tags, full nested pivot dimensions, whole-filter playlist creation, most-played aggregation and floating/tree/flower layouts remain explicitly planned in [the canonical handoff](../../../synamp/plans/LIBRARY-EXPLORER.md).

Browser checks do not establish physical-device, screen-reader, actual Brave playback, real installed-app update, or NAS performance. MilkDrop proof uses generated audio and actual WebGL in an isolated component. The owner's live analysis should continue; deployment and confirmation in that app are separate work.

Private source census, operational paths and logs must be excluded from a future public knowledge base. No public site was published, no commit/push was made, and no music files or live metadata stores were changed.

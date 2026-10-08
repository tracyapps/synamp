# Library Explorer and Galaxy

Owner: SynAmp. Request: 2026-10-07. Local source work; the live Brave/NAS app and its active analyzer are independent of these scratch checks. No music tags, folder moves, commits, deployment, or public publication are part of this change.

Research entry: [HTML with TOC and appendix](../../research/library-explorer/2026-10-07/index.html). Private evidence: [census](../../research/library-explorer/2026-10-07/census.md), [provenance JSON](../../research/library-explorer/2026-10-07/library-census.json). These private files must be excluded from a future public build.

## The product idea

Library is the precise workspace: live search, multi-type results, rules, grouping, table columns, list/grid/table. Galaxy is a separate discovery space: artist planets, album/song drill-down, random rediscovery, and eventually paths through credited collaborations. They should share identity, filters, and actions so a Galaxy selection can become a regular library view or playlist.

The visualization library remembered in the brainstorm is **D3.js**. D3's hierarchy, force, and zoom modules fit later tree/radial/network work. The initial bounded SVG view needs no new visualization dependency. Power BI can demonstrate similar ideas, but this feature belongs inside the existing browser app and must use its authenticated API.

## What the library actually contains

The stable exported snapshot contained 46,117 track records, 5,597 raw track-artist labels and 8,387 folder album groups. Only 22.235% of tracks had Album Artist and 0.284% had a release MBID. These are file/label counts, not deduplicated recordings or verified artist identities. The user's live analyzer later reported 10,299 / 47,117; that is a different, newer counter.

“Dirty Harry, Green Lantern, &” has 34 tracks across 19 folders. None has Album Artist or a release MBID. This is physical fragmentation, not just a duplicate row. Some tracks are credited outside the 2Pac family. Same title and year therefore support a **review candidate**, not an automatic identity merge.

## Organization choices

| Choice | Benefit | Boundary |
| --- | --- | --- |
| Album Artist + retained track Artist | One album owner/group without losing featured performers | Album Artist must be consistent per reviewed release. A collaboration album can retain a joint album credit. |
| Explicit multiple artists + display credit | Individual artist browsing and trustworthy collaboration paths | Extend tag reader/exporter and store artist IDs/roles. Preserve the original display string and join phrase. Do not split every comma, ampersand, slash, `and`, or `x`. |
| Various Artists / compilation / soundtrack metadata | Soundtracks and mixed compilations stay together | Compilation and soundtrack are different concepts. A single-artist soundtrack need not be Various Artists. These fields are absent from the current export. |
| Reviewed virtual release grouping | Tidy SynAmp browsing without moving files | New virtual key references every source folder; preserve folder identity for Library Care, missing-track checks and undo. |
| Picard / beets metadata cleanup | Portable corrected tags across music programs | Preview release/edition match and changed tags first. The current importer/organizer must not silently rewrite the live catalog. |
| Physical folder filing | A portable artist/album/disc hierarchy | A later approved dry run must cover collisions, original paths/tags, aliases, rescan order and recovery. |

Navidrome documents Album Artist, separate display and multi-valued credits, and configurable album PIDs. Beets uses album artist in its default filing scheme, with separate compilation/soundtrack paths. These are useful models; changing the running Navidrome PID config is a migration, not a display preference. See the report appendix for current primary documentation.

## Current implementation contract

`GET /api/v1/library/explore` is read-only and uses the existing access-token boundary. It returns paginated song/album/artist-credit rows and grouping counts computed **before paging**. Albums retain physical folder keys, including existing numbered-disc folding. Artist rows retain whole credits; `AC/DC` and `Earth, Wind & Fire` do not become invented people.

- Multi-select songs/albums/artist credits. Default: albums. No selected types means zero results.
- Quick query and up to 12 field rules combine with AND or OR. A contains query requires every word; OR combines complete criteria, not individual words within a criterion. NOT negates its individual rule. Year and type constraints always intersect the text expression.
- Fields: title, track/album credit, album artist, album, genre, any. Album searches also inspect contained track credits; a matching album is the whole album. Artist counts describe its whole catalog; a date range admits artists with at least one dated track in range.
- Exact means whole field after case/accent normalization, retaining punctuation. Glob is whole-field `*` / `?`, with all other characters literal and no raw regex. Unicode `?` matches one code point. Fuzzy allows one edit for words of length 4–7, two for 8+, and requires short words to match exactly. It assists search; it never edits names.
- Date ranges are inclusive; unknown dates do not match a bounded range. Unknown values display as unknown, not fabricated zeroes.
- Group by album artist, artist credit, album title, decade, genre. This is the first pivot layer. An entity may appear in multiple groups; group counts count entities, not songs, and can overlap. A title group never merges source releases.
- Sort by every data column: title/type/artist/album artist/album/year/song count/duration/genre, ascending or descending across the full result before paging. Missing values stay last in either direction. Stable tie-breaks; at most 200 rows per API page, 60 per UI page.
- List keeps expandable tracks; grid keeps the same album actions. Table exposes sortable data headings, draggable move handles, pointer/keyboard resize edges, and a Columns settings button directly above the table. Its dialog controls visibility, order and pixel widths (80–800 px); title/actions remain visible but can move and resize. Actions has no data sort. Keyboard arrows on move/resize handles and dialog buttons provide alternatives to dragging. Presentation preferences use versioned best-effort browser storage. The v2 presentation preference retains order, widths, visibility and sort and migrates v1 view/visibility. Search/filter/layout state now persists separately as strict version 1; named views and shareable links are covered below.
- Stale requests are invalidated during debounce and on unmount. Updating/error results cannot initiate playback or playlist additions. Last results remain visible during refresh; errors are explicit.

Galaxy API uses `GET /library/galaxy`, `/library/galaxy/artist?key=…`, and `/library/galaxy/random?q=…`. The view is separately lazy-loaded at `#/galaxy`. Initial scope: planets, search, layouts, pan/zoom, drag, random selection from the full filtered pool, album/song inspection and existing playback/playlist actions. Exact bounds and evidence are recorded in verification.md.

Explicit feat/ft/featuring credits can be grouped into a candidate base planet, visibly marked **parsed credit**. This does not create a verified collaboration edge or rewrite the raw credit. Distinct album source folders remain distinct in the detail panel. Size means file count; it does not mean unique recordings, popularity, influence or listening preference. Play counts are absent from the export, so “most played” cannot be claimed yet.

## Approved Galaxy design

[Concept board](../../research/library-explorer/2026-10-07/galaxy-concept.png): desktop, portrait, landscape. User approved on 2026-10-07: “Yes—start with planets and album/song drill-down.” Approval covers the initial discovery hierarchy, not the invented counts/links or a finished collaboration model.

Locked: separate navigation section; graph is dominant; compact search/layout/random/zoom controls; direct artist labels; selected-node emphasis; full browser workspace with top Back/menu controls, anchored bottom player and a content-height floating selected-artist card; song-count area encoding; visible data caveats; keyboard/list alternative; no hover-only actions. Flexible: exact spacing, responsive breakpoints, bounded layout geometry. Intentional first-slice deviations: no network edges, notes/tags, artist portraits, album art, floating animation or full nested visual tree until those underlying contracts exist. Detail inspection provides the album/song hierarchy. Empty art never implies retrieved artwork.

Initial renderer: one bounded SVG instance, React owns accessible controls and selection. Deterministic positions avoid force-layout churn; node area encodes count and has a minimum usable hit area. Visual positions do not imply similarity. Galaxy hides the ordinary sidebar and occupies the entire bounded middle viewport. The shared shell owns header/content/player rows; ordinary content scrolls inside main rather than moving the sidebar or body. Wheel (including Ctrl+wheel trackpad pinch) zooms at the cursor over the canvas; two touch pointers pinch around their midpoint. Gesture listeners stay confined to the canvas. Zoom buttons/reset and a native artist list duplicate gesture navigation. No sensors, account integration, provider uploads, paid BI dependency or WebGL requirement.

## Dependency-ordered work

| ID | Outcome | Depends | Write surface / owner | Acceptance and evidence |
| --- | --- | --- | --- | --- |
| LE01 | Private read-only census | none | research/library-explorer; research owner | Hash, timestamp, bounded sample, no source writes; complete. |
| LE02 | Filters, grouping, views and columns | LE01 | library/explore.ts; LibraryExplorer.tsx; UI owner | Full-result counts, validated rules, Unicode/glob/typo bounds, real API and browser checks. Verified locally; API/browser receipt. |
| LE03 | Full pivot hierarchy | LE02, LE03a | explorer service/UI; same owner | Ordered dimensions artist→album→song, aggregates never from loaded page only; collapsed groups and clear duplicate memberships. Nested hierarchy remains planned. |
| LE03a | Named views, refresh and shared state | LE02 | library-view-state.ts, useLibraryView.ts, SavedLibraryViews.tsx; UI owner | Strict version-1 filters/group/sort/layout; refresh and Back/Forward round-trip; invalid data preserved; named views and token-free links. Implemented locally; saved-view receipt. |
| LE04 | Reviewed virtual releases | LE01 | new library identity seam + Library Care; identity owner | Preview all 19 example folders, conflicting owners/editions, approve/reject/revert, track credits retained, source keys preserved. No title-only merge. Planned. |
| LE05 | Durable multi-artist identities | LE04 | tags.ts, analyzer tag/export schema, identity service | Explicit plural tags/MBIDs/roles, display credit and provenance, ambiguous values queued for review, aliases stable across moves. Planned. |
| LE06 | Galaxy planets and drill-down | LE01; approved design | galaxy.ts; Galaxy.tsx; visualization owner | Search full pool, random beyond first page, area meaning, unknowns/candidates visible, gesture+keyboard alternatives, desktop/mobile checks. Verified initial local slice; API/browser receipt. |
| LE07 | Collaboration paths / layouts | LE05, LE06 | graph service + renderer; visualization owner | Toggle edges; selected neighborhood first; only verified credit edges by default; candidate edges optional dashed; bounded BFS shortest path explains supporting tracks and no-path/unknown result. Album co-appearance never labeled collaboration. Planned. |
| LE08 | Notes, tags, favorites and playlist actions | LE02, stable IDs | dedicated annotation store/API + common entity menu | Durable searchable user text, canonical alias migration, scope explicit, escaped rendering, export/recovery. Favorites reuse existing explicit-feedback semantics. Context menu has a visible keyboard equivalent. Annotation storage remains planned; filter→playlist snapshot is implemented separately in LE08a. |
| LE08a | Playlist from all filtered songs | LE02, LE03a | explorer-selection.ts, PlaylistStore.createSnapshot, index.ts, FilterPlaylistDialog.tsx; backend/UI owners | Full song-level filters and global order before paging, count/sample preview, immutable server receipt, atomic save and idempotent retry. Explicit expiry/missing-ID/100k rejection. Implemented locally; saved-view receipt. |
| LE09 | Most played / rediscovery metrics | LE06; event aggregation | read-only event metric service | Valid plays and time window explicit, absent/imported history coverage shown, no assumed0 for unknown; deterministic ranking, random uniform by chosen entity type, optional weighted mode labeled. Planned. |
| LE10 | Layout polish and scale | LE06; LE07 only for relationship layouts | layout worker/renderer | Tree/radial/flower geometry, drag connected branch as a unit, pins/reset, semantic zoom, reduced motion and battery-aware pause. Profile real 5k+ labels; SVG for bounded labeled neighborhoods, Canvas fallback only when measured scale needs it. Planned. |
| VB01 | MilkDrop full-canvas sizing | none | visuals/Visuals.tsx; visualizer owner | Renderer viewport equals backing canvas at DPR1/2/cap, resize/reopen and mobile; scroll locks restore on Close/Escape. Complete in isolated real-WebGL checks. |

One owner per shared schema and renderer. Do not run parallel writers against the index, App, tag schema or live stores. Integrator owns combined type-check/build and report status. Keep this handoff and the research catalog current when a planned slice becomes real.

## Validation and rollout boundary

Focused backend invariants plus actual HTTP/browser behavior are required. Use unique scratch data and ports; never reuse the running Brave session/analyzer stores. Run the existing Brain suite and both affected type-checks/build after integration. A carried macOS case-fold fixture failure is not a passing suite; retain its exact status.

Local Mac query timings on the 46,117-record snapshot were about 196 ms for initial album index/query, 62 ms mixed 2Pac query, 128 ms fuzzy Fleetwood query and 252 ms full song grouping. Single observations exclude network/serialization/rendering and are not NAS or device performance proof. Repeat the complete workflow on the owner’s running system after separately authorized deployment.

Public KB later: publish reviewed explanatory articles and generated examples, retaining citations and evidence status. Exclude private census, raw library samples, source paths, browser logs and owner notes by construction. No site is published by this work.

## October 7 workspace/table follow-up

User priority: table controls are launch-critical; elaborate Galaxy design is exploratory while analysis continues. Current source changes use existing read-only endpoints and browser-local presentation storage. The owner's NAS analyzer and Brave tab remain untouched. New evidence is separate from the historical initial-slice receipt: [workspace/table verification](../../research/library-explorer/2026-10-07/workspace-table-verification.md).

Next Galaxy visual iteration (LE10, after this bounded viewport/gesture slice): support several content-height cards at once, pinned to their related planet with a visible connector and a close action. Cards should follow that planet during pan/zoom and dragging; edge clamping, overlap/collision avoidance and keyboard focus must remain predictable. Decide a bounded open-card limit and accessible card switcher; retain a compact collapsed state. This requires a multi-selection/detail cache and explicit per-card position model before subtle floating motion. Acceptance: desktop/portrait/landscape, dragging a planet with its card attached, opening/closing several cards without losing playback controls, reduced-motion behavior, and a full-catalog device profile. Single selected-artist floating inspection in this slice does not establish multiple pinned cards.

LE02 acceptance extension: every data header toggles ascending/descending and exposes aria-sort; sort applies globally before paging, unknowns last. Every column including Title/Actions can move and resize; widths and order survive reload. Columns opens a native keyboard-accessible settings dialog at the top of the table, with checkbox visibility, explicit earlier/later controls, numeric widths and reset. Drag handles/edges have keyboard alternatives. Verify with actual browser gestures and matching API responses, not only DOM mutations.

## October 7 tester workflow follow-up

[Fresh saved-view and playlist verification](../../research/library-explorer/2026-10-07/saved-views-playlists-verification.md) records this source slice. The public API gains authenticated `GET /api/v1/library/explore/selection` and `POST /api/v1/library/explore/playlist`; no analyzer restart, metadata write or tag migration is involved.

Named views store exact search/rules, selected display types, inclusive year range, grouping and selected group, sort/direction and list/grid/table in `synamp-library-saved-views-v1` (up to 50 names, 80 characters each). Last view uses `synamp-library-state-v1`; share links use a version-1 `library_view` hash parameter. Links contain filters and never the token or current page query parameters. Column order/width/visibility remain independent presentation preferences. Views are browser-local, downloadable for backup, and are not account-synced. Invalid storage/link schemas surface an error and are preserved until an explicit reset; saved-view writes cannot silently discard corrupted entries. Filter typing updates the current history entry; opening a saved view or artist drill-down creates a Back/Forward checkpoint. History does not create an entry for every keystroke.

Create playlist evaluates **songs**, using the same text/rules/year/group constraints and global sort. Displaying albums or artist credits does not expand every song in a matched aggregate: each song must itself match. The preview labels this and returns the whole count plus at most eight examples. It is a fixed manual playlist, not a live smart playlist. Preview expiry is 10 minutes; server restart or eviction after 32 receipts requires previewing again. An explicit 100,000-song ceiling rejects oversized results, never truncates them. Empty types/selection are rejected. No client-supplied IDs are accepted at confirmation. Missing/replaced IDs abort the whole write; ongoing analysis/signal changes with the same IDs do not invalidate it. Snapshot titles/credits retain preview-time values. One atomic PlaylistStore save rolls back memory on failure, and retrying the same receipt/name returns the same node. Changed filters invalidate an open preview; lost network acknowledgement can be retried. The receipt and its idempotency are in memory for its remaining lifetime, not durable across server restart.

Next launch slices: LE03 nested pivots, an explicit tester setup/smoke pass on the deployed build, and stable-ID annotations under LE08. Reviewed release identity LE04 precedes tag cleanup/graph paths. Preserve all later Galaxy design ideas and their dependencies; no tester convenience task authorizes changes to the owner's active library analysis.

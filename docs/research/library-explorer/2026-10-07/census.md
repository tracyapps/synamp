# Private library census — 2026-10-07

This is a read-only snapshot for planning Library Explorer and Galaxy. It contains aggregates and 30 illustrative relationships, not a full track dump. The music share was not modified. Keep these files private when building the future public knowledge base.

Retrieved: 2026-10-07T15:16:56.355801+00:00. Source: `/Volumes/music/.synamp/library-signals.json`; 31,149,418 bytes; SHA-256 `6cf1349bef646f2b4dfb05bb404400db80cacc92e03b28c3504f3e627e713d4c`. Export timestamp: 2026-10-07T14:22:00.311521+00:00; exporter 0.2.0. The source file size and modification time stayed stable during the read.

## What is present

- **46,117 exported track records**, 5,597 distinct track-artist labels, 8,387 folder album groups, and 4,113 physical top-level directories. These counts describe files/labels; they do not prove unique recordings or artists.
- **10,254 tracks (22.235%) have Album Artist**; **131 (0.284%) have a MusicBrainz release ID**.
- 36,977 records have a year. 44,437 records use tags; 1,680 use path-derived metadata. Genre, play counts, and compilation flags are absent from this export. No listening events were read.
- 219 records have an explicit feat/ft/featuring separator across 161 raw artist labels. These are candidates for relationships; punctuation alone does not prove multiple identities.

## Why the 2Pac screenshot fragments

The repeated **Dirty Harry, Green Lantern, &** album is physically distributed across **19 album folders** under different artist folders, totaling **34 tracks**. All 34 lack Album Artist and a MusicBrainz release ID. The base `2Pac` folder holds 11 tracks; 14 records live under 13 feat-credit artist folders, and the other 9 records sit under Afeni Shakur, Dirty Harry/Vlad/Green Lantern, Fat Joe, Sway, and an Alicia Keys conflict folder. These mixed credits make a reviewed release identity more reliable than guessing one owner from a name prefix. The immediate directories on disk confirm these folders exist.

`apps/brain/src/library/albums.ts::groupAlbums` uses the physical folder as its album key. It folds only numbered `CD`, `Disc`, or `Disk` subfolders into a parent; independently named album discs such as `All Eyez On Me (Disc 2)` remain separate folders. The screenshot is therefore consistent with the physical organization, rather than merely a duplicated rendering of one release.

## Safe organization options

1. Preserve raw track Artist credits and establish a reviewed release-level Album Artist. An album should retain its featured performers while being grouped under its album identity. Soundtracks can use reviewed compilation/release metadata rather than pretending every track performer is an album owner.
2. Let Library Explorer show a reviewed virtual release grouping that references every physical source folder. Keep Library Care's folder keys and missing-track checks intact.
3. Preview candidates for the Dirty Harry fragments using explicit featured-credit base `2Pac` plus shared title/year. Mark these candidates until an owner or verified release match confirms them; do not merge every same-name album.
4. If physical cleanup is wanted later, use a dry-run metadata/organization proposal with original paths, proposed tags, collision checks, retained track credits, and rollback before any file move or tag rewrite. This census performs none of those writes.

## Galaxy data implications

Use stable artist identities plus aliases, release identities plus source folder keys, and edges carrying raw credit, evidence, confidence, and supporting track counts. Start from artist → album → track hierarchy; enable candidate collaboration edges only around a selected node. Exported file counts can determine initial planet size if clearly labeled. Most-played requires a separate listening-event aggregation.

Parse explicit `feat.`, `ft.`, or `featuring` conservatively as a base artist plus one unresolved featured credit. Never assert that commas, `&`, slash, `and`, or `x` identify different artists: band names, collaboration credits, and older tag damage make that unsafe. The JSON contains a proposed contract and all count provenance.

## Scope and limits

The full export was parsed for aggregates. Filesystem inspection was restricted to one top-level listing, immediate album folders under the 17 2Pac-prefixed folders, and existence checks for the illustrated album folders. No audio was opened, no live file tags were read, no network metadata lookups were made, and no live stores were written. The sample is private and should not enter a public site build without review or replacement.

# SynAmp research library

Open [index.html](index.html) for the table of contents, current work queue,
corrections and full source appendix. The editable catalog is [catalog.json](catalog.json);
rebuild with `pnpm research:build`, verify with `pnpm research:check`.

The research library owns original findings and provenance. Implementation plans
remain in `docs/synamp/plans/`, decisions in `docs/synamp/DECISIONS.md`, runtime
code in `apps/`/`services/`, and fresh verification in `results/`. Link these
surfaces instead of duplicating their current contracts.

## Fast brain, 2026-10-07

The [original HTML report](fast-brain/2026-10-07/archive/DELIVERY/SynAmp-Fast-Brain-Report.html)
and [PDF](fast-brain/2026-10-07/archive/DELIVERY/SynAmp-Fast-Brain-Report.pdf) are preserved
alongside the entire source cluster. [manifest.json](fast-brain/2026-10-07/manifest.json)
records 321 files with original paths, bytes, SHA-256, roles and source timestamps.
Only four macOS Finder `.DS_Store` files were excluded. The raw originals were
not edited or moved at their source location.

Read the [current follow-up](../synamp/plans/FAST-BRAIN-FOLLOW-UP.md) before using
archival commands or counts. Archive code is a historical snapshot; the merged
implementation is authoritative in the normal code directories. Source packs and
appendices preserve MP/CC/ML citation IDs, retrieval limits and disagreements.

## Rebuild the historical report

The archived DELIVERY/report-kit renderer expects a `report-sources` folder,
while the delivered folder is named `sources`. Preserve that original defect;
for a rebuild use a disposable copy and rename its source folder:

```sh
kit=$(mktemp -d /tmp/synamp-report-kit.XXXXXX)
cp -R docs/research/fast-brain/2026-10-07/archive/DELIVERY/report-kit/. "$kit/"
mv "$kit/sources" "$kit/report-sources"
cp -R "$kit/figures" "$kit/report-sources/figures"
python3 "$kit/render/build.py" --out "$kit/report.html" --exec "$kit/report-sources/W6-exec-summary.md"
```

Requires the original renderer's Python `markdown` package. The checked-in
self-contained HTML can be read without Python or any external assets. A rebuild
is a derived copy, never a replacement for the immutable original.

## Public knowledge base preparation

The index is a local static seed. FB14 describes topic articles, source quality,
rights/attribution review, public export allowlist, accessibility and hosting.
Operational evidence, local file paths, logs and screenshots remain in the
preservation archive and outside the proposed public export. No publication
has occurred.

## Library Explorer and Galaxy

[Findings, concepts and appendix](library-explorer/2026-10-07/index.html) connect
metadata organization to the library controls and approved Galaxy slice. The
[canonical handoff](../synamp/plans/LIBRARY-EXPLORER.md) preserves the remaining
brainstorm. The census and browser evidence are private; exclude them from a
future public export.

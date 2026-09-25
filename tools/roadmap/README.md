# tools/roadmap

Generates the **visual roadmap** from the markdown roadmap, so the two can never
drift apart.

```
pnpm roadmap:build
# → docs/roadmap/index.html
```

Dependency-free Node ESM (stdlib only). Sources and output are configurable:

```
node tools/roadmap/build.mjs --src docs/synamp/ROADMAP.md --out docs/roadmap/index.html --date 2026-09-23
```

## What it parses

`docs/synamp/ROADMAP.md` has a stable shape the generator relies on:

- the first `# ` heading is the document title
- text before the first `## ` is the intro (first paragraph becomes the lede; a
  `Legend:` line is replaced with a typographic legend)
- each `## Phase <N> — <Title>` is a phase
- inside a phase, blocks are introduced by 🎯 (goal), 📦 (deliverables),
  ✅ (exit criteria), ⚠️ (risks)
- a trailing non-phase `## ` section is rendered as a cross-cutting section

If fewer than 6 phases are found, the build **fails loudly** rather than emitting
a broken page — that means the markdown structure changed and the parser needs
updating.

## Notes

- The four source emoji are **never** rendered as emoji; they become inline SVG
  glyphs plus typographic labels.
- The hardware baseline line is generator config (`HARDWARE` in `build.mjs`), not
  part of the markdown.
- Output is deterministic: re-running on the same day produces a byte-identical
  file.

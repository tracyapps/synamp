# SynAmp — brand spec for the logo system

Source of truth: `apps/web/src/styles/tokens.css`. The logo system adds no colour
the product does not already own.

> SynAmp is a near-black, single-accent interface where *one* amber signal is the
> only thing that glows — the brand is restraint plus one warm LCD light.

## Tokens

| Token | Hex | OKLch (approx.) | Role |
|---|---|---|---|
| `--bg` | `#0e0e10` | `oklch(0.159 0.004 285)` | Page / dark ink surface |
| `--surface` | `#16161a` | `oklch(0.203 0.005 285)` | Raised panels |
| `--text` | `#ececec` | `oklch(0.938 0 0)` | Dark-theme ink |
| `--muted` | `#8a8a94` | `oklch(0.617 0.014 286)` | Labels, taglines |
| `--accent` | `#e0a33e` | `oklch(0.762 0.132 74)` | LCD amber — the one signal |
| `--hair` | `rgba(255,255,255,.08)` | `oklch(1 0 0 / 0.08)` | Hairline structure |

Light-theme ink (from the same system, inverted): `#111114`; light surfaces `#f5f5f6`.

## Type

| Role | Stack | Usage in the mark |
|---|---|---|
| Display | `'Space Grotesk', 'IBM Plex Sans', system-ui, sans-serif` | Wordmark, weight 600, tracking −0.02em |
| Body | `'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | App copy |
| Mono | `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace` | Taglines + mono wordmark, uppercase, tracking 0.2em+ |

The existing in-app wordmark (`.wordmark`) is mono, uppercase, `letter-spacing: .3em`,
in amber. Concepts 3, 7 and 10 honour that treatment; the rest explore a display
wordmark. That mono lockup is the safe continuity choice.

## Observed rules

1. **One accent only.** Amber is the single chroma; everything else is a near-black
   or near-white neutral. Hierarchy comes from type and space, not colour.
2. **Amber is the signal.** In every mark, amber marks the *live* element — the
   firing node, the lit route, the overlap, the origin. It is never background.
3. **Hairlines, not boxes.** Structure is 1px at 8% white. No heavy strokes, no
   filled panels in the mark.
4. **Monoline construction.** Marks are drawn on a 48×48 grid with 1.5–2.6px
   strokes and round joins, so they survive down to a 16px favicon.
5. **Never pure black or white.** `#0e0e10` and `#ececec`, never `#000` / `#fff`.

## Usage

- **Clear space:** `x` on all sides, where `x` = ¼ of the icon height.
- **Minimum size:** icon 16px; horizontal lockup 120px wide.
- **Contrast:** amber must sit on a surface dark enough to hold 3:1. On mid-tone
  photos, place the ink mark instead of the amber signal.
- **Fonts:** webfonts in the wordmark. Convert to outlines for production where
  Space Grotesk / JetBrains Mono cannot load.

## Concept index

| # | Name | Idea | Wordmark |
|---|---|---|---|
| 01 | Synapse Node | Two neurons joined by a travelling signal | Display |
| 02 | Amp Pulse | Play-head crossed by a waveform | Display |
| 03 | Neuron EQ | EQ bars as dendrites, tips linked | Mono |
| 04 | Connectome | Track constellation, one route lit | Display |
| 05 | Spark | Charge jumping a terminal gap | Display |
| 06 | Sine S | The initial is a sine wave | Display |
| 07 | Cortex Rings | Ripples from one origin point | Mono |
| 08 | Prompt Wave | Speech bubble full of audio | Display |
| 09 | Dendrite Play | Neural branching resolving into play | Display |
| 10 | Venn Synapse | Language ∩ music = the playlist | Mono |
| 11 | Brain Split | Two hemispheres, one amber seam (the fissure as overlap) | Display |
| 12 | Brain Wave | Brain with a spectrum in the seam | Mono |
| 13 | Brain Note | A single note held in the seam | Display |
| 14 | Brain Duet | Left speaks, right plays, seam is the handshake | Display |

Concepts 11–14 share one brain silhouette (top-down, two overlapping lobes on a
48×48 grid) so only the seam treatment changes between them: empty (11), spectrum
(12), note (13), speech + note (14). Amber fills the hemispheric overlap in every
version — the divide is the Venn.

## Files

```
design/
  index.html                     gallery (generated, self-contained)
  brand-spec.md                  this file
  build/concepts.mjs             mark source of truth
  build/build.mjs                generator (node build/build.mjs)
  svg/<NN>-<concept>/
    horizontal-light.svg  horizontal-dark.svg
    square-light.svg      square-dark.svg
    icon-light.svg        icon-dark.svg
```

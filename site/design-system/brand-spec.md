# SynAmp — brand spec (v2, "Spectrum")

> Supersedes `design/brand-spec.md` (v1, the near-black single-amber system).
> v1 was restraint plus one warm LCD light. v2 keeps the dark, signal-driven
> soul and opens it into a full spectrum: **the amp light is no longer one
> colour — it is the whole band.** Gold remains the single UI signal; the
> spectrum is the brand's one decorative asset.

Short version, one sentence:

> A deep-slate music system where one gold signal does the work and a
> rainbow amp light — the visualizer — proves the sound is alive.

## Source of truth

The logo export (`design/synamp-logo-alt.svg`, the *alt* version the owner
preferred) and `colors-alt.pdf` define the palette. Nothing here is invented:
every colour is sampled from those files, then extended with OKLch-derived
tints and states. The app token file is delivered as `assets/tokens.css`.

## Six core tokens

| Token | Hex | OKLch | Role |
|---|---|---|---|
| `--bg` | `#212637` | `oklch(0.272 0.033 271.5)` | Brand slate — the page ground |
| `--surface` | `#2a3145` | `oklch(0.316 0.037 269.3)` | Raised panels and cards |
| `--fg` | `#f1f1f1` | `oklch(0.958 0 89.9)` | Primary ink |
| `--muted` | `#a4abc1` | `oklch(0.743 0.033 271.6)` | Labels, secondary copy |
| `--border` | `rgba(255,255,255,.10)` | `oklch(1 0 0 / 0.10)` | Hairline structure |
| `--accent` | `#ffcd00` | `oklch(0.867 0.177 90.8)` | Gold signal — the one action colour |

Supporting tokens (full set in `assets/tokens.css`):

- **Ground steps:** `--ink #0e0e10` (deepest well) · `--bg-deep #191d29` · `--well #14161f` · `--surface-2 #343d54` · `--surface-3 #414b66`.
- **Ink steps:** `--faint #6e7690` (decorative only, 3.33:1) · `--on-gold #1a1503`.
- **Secondary hues:** `--coral #ff4a47`, `--lavender #ab51ff`, `--violet #5216b3` (fills only — 1.5:1, never text).
- **Semantic:** `--success #00e676`, `--warn #ffb020`, `--danger #ff5c57`, `--info #3b6bff`.
- **Spectrum:** `--sp-berry #aa006c`, `--sp-pink #f6004f`, `--sp-coral #ff4a47`, `--sp-orange #e86b14`, `--sp-gold #ffcd00`, `--sp-lime #defc1a`, `--sp-green #00e676`, `--sp-cyan #00e6e8`, `--sp-blue #3b6bff`, `--sp-violet #5216b3`.

## Type

The owner's chosen face is **Momo Trust Display** (Google Fonts, OFL). It is
rounded, friendly and geometric, with **a single 400 weight** — so hierarchy
must come from size and colour, never weight, and italics must never be faked.

| Role | Stack | Notes |
|---|---|---|
| Display | `"Momo Trust Display", "Space Grotesk", system-ui, sans-serif` | Headlines, big numbers, 3–10 words |
| Body / UI | `"Space Grotesk", "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Everything 10+ words; weights 300–700 |
| Mono | `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace` | Eyebrows, labels, values, ledger |

Space Grotesk shares Momo's rounded-geometric DNA and keeps the old brand's
retro-tech music character; JetBrains Mono is already the app's label voice.

### Pairing options (as requested — a good face to sit beside Momo)

| Need | First choice | Alternates | Why |
|---|---|---|---|
| Body / UI | **Space Grotesk** | Instrument Sans · Hanken Grotesk · Familjen Grotesk · Schibsted Grotesk | Geometric, slightly quirky, multi-weight workhorse |
| Mono / labels | **JetBrains Mono** | IBM Plex Mono · Martian Mono · Space Mono | Tall x-height, tabular figures, reads at 11px |
| A warmer body | — | Nunito Sans · Karla | If the app ever wants a softer, rounder body to echo Momo |

### Type rules (craft)

- Multiplicative scale (1.25), **6–8 sizes maximum** per screen.
- Display ≥32px: line-height 1.0–1.2 and tracking −0.01 to −0.03em (Latin only).
- **CJK:** line-height 1.3–1.4 for display/H1 (including the cover title) and
  1.7–1.8 for body; tracking `0` — never negative.
- **ALL CAPS always carries +0.06em to +0.1em tracking.** Monolabels use +0.18em.
- Body copy 15–18px, line-height 1.5–1.6, **50–75 characters** per line.
- Momo is single-weight: emphasis = gold colour, size, or Space Grotesk 600.

## Colours — how they are used

- **Neutrals 70–90% of pixels.** Slate ground, ink wells, slate surfaces.
- **One accent.** Gold is the only action colour, used at most **twice per screen** (typically one eyebrow + one primary button).
- **The spectrum is one asset.** It appears in exactly two places: the 4px *amp light* motif and the visualizer. Never a background wash, never body text, never a per-card gradient.
- **Never pure black or white.** Deepest is `#0e0e10`; lightest is `#f1f1f1`.
- **On dark, structure is semi-transparent white** (1px at 8–18%), not a solid dark hairline.
- **State changes move the background**, not the label: hover shifts OKLch L by ±0.06–0.12. A label never fades toward the background.

## Observed rules (the visual language)

1. **Gold is the signal; the spectrum is the proof.** Gold marks the live,
   actionable element. The spectrum only ever says "this is playing".
2. **The amp light.** A 4px multi-stop band (`--spectrum`) is the signature
   divider under eyebrows and inside meters. Animated only above the fold.
3. **Hairlines, not boxes.** Structure is borders and surface steps. No heavy
   strokes, no drop-shadowed floating tiles, no coloured left-border cards.
4. **Two-tone ×N.** Warm ink (`--on-gold`) sits on gold; slate ground carries
   off-white text. Every pair is contrast-checked (see below).
5. **Motion is a courtesy.** Everything collapses under `prefers-reduced-motion`;
   the visualizer never autoplays sound.

## Logo

The alt mark is a spectrum brain with a play node, joined to a coral→gold
wordmark with a hard offset shadow. Files live in `assets/img/`:
`synamp-logo-alt.svg` (horizontal), `synamp-mark.svg` (icon).

- Clear space: `x` on all sides, `x` = ¼ of the icon height.
- Minimum size: icon 16px; horizontal lockup 120px wide.
- On busy imagery, place the icon over a scrim; never set the wordmark directly on a mid-tone photo.
- Do not recolour the brain. The wordmark may run solid `--ink` for single-colour use.

## Accessibility (a gate, not a feature)

AA is enforced in the tokens:

| Pair | Ratio | Verdict |
|---|---|---|
| `--fg` on `--bg` | 13.3:1 | AAA |
| `--muted` on `--bg` | 5.84:1 | AA |
| `--gold` on `--ink` | 12.8:1 | AAA |
| `--on-gold` text on `--gold` | 12.8:1 | AAA |
| `--coral` on `--bg` | 4.53:1 | AA (large) |
| `--faint` on `--bg` | 3.33:1 | decorative only |

- 2px gold focus ring, 2px offset, on every focusable element.
- 44px minimum targets; body text ≥15px on mobile.
- Status never relies on colour alone — pair the dot with a word.

## Voice

Warm, plain, a little wry; never breathless. Say what is true and label what
is a preview. Buttons are specific ("Start tracking", "Copy bug template"),
not generic. Where a figure is a design placeholder, say so.

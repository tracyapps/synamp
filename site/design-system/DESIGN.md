# SynAmp Spectrum — design system (v2)

> Copied from the design export (design/SynAmp-rebrand-&-website, kept out of git).
> Paths below are relative to `site/src/`. This is the starting point for the
> app's component library.

The working reference for shipping the brand into the app and the marketing
site. Read `brand-spec.md` for the narrative; this file is the contract.

## 1. Files

| File | Purpose |
|---|---|
| `assets/synamp.css` | Layer 1 — tokens, reset, typography, layout, header/footer, utilities |
| `assets/synamp-ui.css` | Layer 2 — buttons, chips, forms, cards, meters, tabs, accordion, tables, toast, modal, timeline |
| `assets/synamp.js` | Shared behaviour — sticky glass header, mobile nav, reveal, tabs, dialogs, forms, knowledge search |
| `assets/visualizer.js` | The hero visualizer (4 modes × 4 themes, reduced-motion + Save-Data aware) |
| `assets/tokens.css` | **Drop-in for `apps/web/src/styles/tokens.css`** |
| `assets/img/synamp-mark.svg` · `synamp-wordmark.svg` · `synamp-logo.svg` | Mark, wordmark (separate files) and the two together |

All pages (in `site/src/`): `index.html` (home) · `roadmap.html` · `help.html` · `app-preview.html` ·
`components.html` · `contact.html` · `coming-soon.html`.

## 2. Migrating the app

Replace `apps/web/src/styles/tokens.css` with `assets/tokens.css`. Legacy names
are aliased, so nothing breaks on day one:

| v1 | v2 | Note |
|---|---|---|
| `--bg #0e0e10` | `--bg #212637` (slate) + `--ink #0e0e10` (well) | the ground gets lighter and more colourful; near-black becomes the deepest well |
| `--surface #16161a` | `--surface #2a3145` | raised slate |
| `--text #ececec` | `--fg #f1f1f1` (alias `--text` kept) | |
| `--muted #8a8a94` | `--muted #a4abc1` | 6.57:1 on slate, 4.72:1 on `--surface-2` (the first v2 value, #9aa1b8, was 4.2:1 there) |
| `--accent #e0a33e` | `--accent #ffcd00` (alias kept) | amber → the logo's gold |
| `--hair` | `--border` (alias kept) | |
| — | `--coral`, `--lavender`, `--violet`, `--spectrum`, `--sp-*` | new brand hues |
| `Space Grotesk` display | `Momo Trust Display` display; Space Grotesk moves to body | load Momo + Space Grotesk + JetBrains Mono |

Then swap brittle per-component greys for the shared tokens (`--surface-2`,
`--well`, `--border`, `--gold`) so the theme stays single-sourced.

**Fonts to load** (one request):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Momo+Trust+Display&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

## 3. Token reference

Names, values and OKLch live in `assets/tokens.css`. Summary of the six core
tokens: `--bg` slate · `--surface` raised · `--fg` ink · `--muted` secondary ·
`--border` hairline · `--accent` gold. Spectrum: `--spectrum` gradient plus
`--sp-berry … --sp-violet`.

Hard rules:
- One accent. Gold appears at most twice per screen.
- The spectrum lives only in the amp light and the visualizer.
- Never pure black/white; on dark, borders are semi-transparent white.
- Derived colours via `oklch()`; no new raw hex outside `:root`.
- Hover moves background L by ±0.06–0.12; never fade a label toward its background.

## 4. Component contract

Every component in `synamp-ui.css` is dark-first and self-contained:

- **Buttons** — `.btn` + `.btn--primary | --ghost | --quiet | --danger`, sizes `--sm/--lg/--block`. One primary per viewport.
- **Chips / tags / badges** — `.chip` (`.is-active`), `.tag`, `.badge--live|--soon|--next|--muted` with `.status-dot`.
- **Forms** — `.field` + `.input/.textarea/.select`, `.check`, `.switch`, `.range`, `.search`; error via `aria-invalid` + `.error`; hint via `.hint`.
- **Surfaces** — `.card` (`--ink/--well/--flush/--interactive`), `.panel`, `.callout` (`--gold/--info/--warn/--danger`), `.note`.
- **Data** — `.metric`, `.meter` (`--spectrum`, `--lg`), `progress.meter`, `.legend`, `.table` (`.num`, `--zebra`).
- **Navigation** — `.tabs/.tab/.tabpanel`, `.accordion` (`<details>`), `.breadcrumb`, `.timeline/.phase`.
- **Overlays** — `.toast-stack/.toast` (JS: `synampToast(title, body, tone)`), `dialog.modal`, `.tip[data-tip]`.
- **Misc** — `.empty`, `.skeleton`, `.swatch`, `.segmented`, `.rows/.row`, `kbd`, `code`, `pre`, `.amp` (the amp light), `.grad-text`.

Add `data-od-id="kebab-case"` to regions, headings, CTAs, controls and each
repeated card so comment mode can target them.

## 5. The amp light

The signature motif. Always the spectrum gradient, always a thin band:

```html
<span class="amp amp--live" aria-hidden="true"></span>   <!-- full width, animating -->
<span class="amp amp--short" aria-hidden="true"></span>  <!-- 56px, under an eyebrow -->
<div class="meter meter--spectrum">…</div>               <!-- in data meters -->
```

It is decorative. Always `aria-hidden`. Never use it as the only signal of state.

## 6. Visualizer

`assets/visualizer.js` exposes `window.SynAmpVisualizer` and auto-mounts any
`[data-visualizer]` element with a `<canvas>` child.

```html
<section data-visualizer data-mode="spectrum" data-theme="spectrum" data-loop="neurofunk">
  <canvas aria-hidden="true"></canvas>
  <button data-viz="play" aria-pressed="false">…</button>
  <button data-viz="mode" data-value="layers">Layers</button>
  <button data-viz="theme" data-value="aurora">Aurora</button>
  <select data-viz="loop"><option value="neurofunk">Neuro-Funk</option></select>
  <button data-viz="mute">…</button>
  <input class="range" data-viz="volume" type="range">
</section>
```

Modes: `spectrum`, `wave`, `radial`, `layers`. Themes: `spectrum`, `ember`,
`aurora`, `mono`. Loops: `neurofunk`, `partysynapse`, `brainfreeze`, `dendrite`
— small step-sequenced grooves generated live (kick, snare, hats, bass, arp,
pad), so the analyser gets real transients to react to and there is no audio
file to download.

It starts **muted** until a real gesture, pauses off-screen, and under
`prefers-reduced-motion`, Save-Data or a slow connection it renders a single
still frame with an explicit opt-in. When sound is stopped it falls back to a
calm simulated movement rather than freezing (except for reduced-motion users,
who return to the still frame). State syncs back to the controls (`aria-pressed`,
labels, mode name), and any `[data-viz-track]` / `[data-viz-track-sub]` element
inside the root is updated with the current loop's name and description.

## 7. Accessibility gates

Ship-blocking, verified in `components.html#accessibility`:

1. Body text ≥ 4.5:1; large text and UI ≥ 3:1 (measured against the actual surface).
2. `:focus-visible` ring on every focusable element (2px gold, 2px offset).
3. 44px minimum targets; ≥15px body on mobile; no horizontal scroll.
4. Status pairs a colour with a word; never colour alone.
5. Reduced-motion and Save-Data respected; sound never autoplays.
6. Semantic landmarks, one `h1` per page, labelled inputs, table captions.

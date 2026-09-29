/*
 * SynAmp logo build.
 *
 *   node build/build.mjs
 *
 * Emits:
 *   design/svg/<NN>-<concept>/<format>-<theme>.svg   (60 files: 10 x 3 x 2)
 *   design/index.html                                (self-contained gallery)
 */
import { CONCEPTS, TOKENS, colors } from "./concepts.mjs";
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const designDir = dirname(here);

const N = CONCEPTS.length;
const N_FILES = N * 6;
const WORD = { 10: "Ten", 11: "Eleven", 12: "Twelve", 13: "Thirteen", 14: "Fourteen", 15: "Fifteen" };
const numWord = (n) => WORD[n] || String(n);

const DISPLAY = "'Space Grotesk','IBM Plex Sans',system-ui,sans-serif";
const MONO = "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
const FONT_IMPORT = `<style>@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@400;500;600&amp;display=swap');</style>`;

const TAGLINE = "SMART AUDIO LIBRARY";
const folderName = (c) => `${String(c.n).padStart(2, "0")}-${c.id}`;

function svgWrap(w, h, inner, style, title, withImport) {
  const imp = withImport ? FONT_IMPORT : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}" style="${style}">` +
    `${imp}<title>${title}</title>${inner}</svg>`
  );
}

function horizontal(concept, theme, withImport = false) {
  const c = colors(theme);
  const uid = `${concept.id}-h-${theme}`;
  const mono = concept.wordmark === "mono";
  const wm = mono
    ? `<text x="66" y="41" font-family="${MONO}" font-size="21" font-weight="600" letter-spacing="0.2em" fill="${c.accent}">SYNAMP</text>`
    : `<text x="66" y="41" font-family="${DISPLAY}" font-size="29" font-weight="600" letter-spacing="-0.02em" fill="${c.ink}">SynAmp</text>`;
  const tag = `<text x="67" y="55" font-family="${MONO}" font-size="7.2" font-weight="500" letter-spacing="0.26em" fill="${c.muted}">${TAGLINE}</text>`;
  const inner = `<g transform="translate(4 8)">${concept.mark(c, uid)}</g>${wm}${tag}`;
  return svgWrap(250, 64, inner, `color:${c.ink}`, `SynAmp — ${concept.name}, horizontal, ${theme}`, withImport);
}

function square(concept, theme, withImport = false) {
  const c = colors(theme);
  const uid = `${concept.id}-s-${theme}`;
  const mono = concept.wordmark === "mono";
  const wm = mono
    ? `<text x="84" y="116" text-anchor="middle" font-family="${MONO}" font-size="18" font-weight="600" letter-spacing="0.18em" fill="${c.accent}">SYNAMP</text>`
    : `<text x="84" y="116" text-anchor="middle" font-family="${DISPLAY}" font-size="25" font-weight="600" letter-spacing="-0.02em" fill="${c.ink}">SynAmp</text>`;
  const tag = `<text x="84" y="134" text-anchor="middle" font-family="${MONO}" font-size="7.2" font-weight="500" letter-spacing="0.24em" fill="${c.muted}">${TAGLINE}</text>`;
  const inner = `<g transform="translate(60 22)">${concept.mark(c, uid)}</g>${wm}${tag}`;
  return svgWrap(168, 160, inner, `color:${c.ink}`, `SynAmp — ${concept.name}, square, ${theme}`, withImport);
}

function icon(concept, theme, withImport = false) {
  const c = colors(theme);
  const uid = `${concept.id}-i-${theme}`;
  const inner = concept.mark(c, uid);
  return svgWrap(48, 48, inner, `color:${c.ink}`, `SynAmp — ${concept.name}, icon, ${theme}`, withImport);
}

/* ---------- write SVG files ---------- */
rmSync(join(designDir, "svg"), { recursive: true, force: true });
const formats = [
  ["horizontal", horizontal],
  ["square", square],
  ["icon", icon],
];
let fileCount = 0;
for (const concept of CONCEPTS) {
  mkdirSync(join(designDir, "svg", folderName(concept)), { recursive: true });
  for (const [fmtName, fn] of formats) {
    for (const theme of ["light", "dark"]) {
      const out = fn(concept, theme, true) + "\n";
      writeFileSync(join(designDir, "svg", folderName(concept), `${fmtName}-${theme}.svg`), out);
      fileCount++;
    }
  }
}

/* ---------- gallery ---------- */
const swatches = [
  ["Background", "--bg", TOKENS.bg, "oklch(0.159 0.004 285)"],
  ["Surface", "--surface", TOKENS.surface, "oklch(0.203 0.005 285)"],
  ["Ink", "--text", TOKENS.text, "oklch(0.938 0 0)"],
  ["Muted", "--muted", TOKENS.muted, "oklch(0.617 0.014 286)"],
  ["Accent · LCD amber", "--accent", TOKENS.accent, "oklch(0.762 0.132 74)"],
  ["Hairline", "--hair", "#ffffff", "oklch(1 0 0 / 0.08)"],
];

const swatchHtml = swatches
  .map(
    ([label, token, hex, oklch]) =>
      `<div class="swatch"><div class="swatch__chip" style="background:${token === "--hair" ? "rgba(255,255,255,.08)" : hex}"></div>` +
      `<div class="swatch__meta"><span class="swatch__name">${label}</span><code>${hex}</code><code>${oklch}</code><code>${token}</code></div></div>`
  )
  .join("");

function tile(concept, fmtName, fmtFn, theme) {
  const svg = fmtFn(concept, theme, false).replace(/<title>.*?<\/title>/, "");
  const label = `Copy ${fmtName} ${theme} lockup — ${concept.name}`;
  return `<button type="button" class="tile tile--${fmtName[0]} tile--${theme}" data-copy aria-label="${label}">${svg}</button>`;
}

const board = CONCEPTS.map((concept) => {
  const rows = formats
    .map(([fmtName, fn]) => {
      const cap = fmtName[0].toUpperCase() + fmtName.slice(1);
      return (
        `<span class="matrix__row">${cap}</span>` +
        tile(concept, fmtName, fn, "light") +
        tile(concept, fmtName, fn, "dark")
      );
    })
    .join("");
  const wmNote = concept.wordmark === "mono" ? "Mono wordmark" : "Display wordmark";
  return (
    `<article class="concept" data-od-id="concept-${String(concept.n).padStart(2, "0")}-${concept.id}">` +
    `<div class="concept__head"><span class="concept__n">${String(concept.n).padStart(2, "0")}</span>` +
    `<h2 class="concept__name">${concept.name}</h2><span class="concept__tag">${wmNote}</span></div>` +
    `<p class="concept__blurb">${concept.blurb}</p>` +
    `<div class="matrix" role="group" aria-label="${concept.name} lockups — horizontal, square and icon, in light and dark">` +
    `<span class="matrix__corner" aria-hidden="true"></span><span class="matrix__col">Light</span><span class="matrix__col">Dark</span>${rows}</div>` +
    `<p class="concept__files">svg/${folderName(concept)}/{horizontal,square,icon}-{light,dark}.svg</p>` +
    `</article>`
  );
}).join("");

const clearspaceMark = CONCEPTS[0].mark(colors("dark"), "guide").replace(/<title>.*?<\/title>/, "");
const band = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${TOKENS.accent}" opacity="0.13"/>`;
const clearspace = svgWrap(
  180,
  150,
  band(42, 27, 16, 96) +
    band(138, 27, 16, 96) +
    band(58, 27, 64, 16) +
    band(58, 107, 64, 16) +
    `<g transform="translate(58 43) scale(1.3333)">${clearspaceMark}</g>` +
    `<rect x="42" y="27" width="96" height="96" rx="8" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1" stroke-dasharray="3 4"/>` +
    `<text x="50" y="79" text-anchor="middle" font-family="${MONO}" font-size="9" fill="${TOKENS.text}">x</text>`,
  `color:${TOKENS.text}`,
  "Clear space guide",
  false
).replace(/<title>.*?<\/title>/, "");

const html = `<!doctype html>
<html lang="en" data-od-id="synamp-logo-concepts">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SynAmp — Logo Concepts</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0e10;--surface:#16161a;--text:#ececec;--muted:#8a8a94;--accent:#e0a33e;
  --hair:rgba(255,255,255,.08);--hair2:rgba(255,255,255,.18);
  --font-display:'Space Grotesk','IBM Plex Sans',system-ui,sans-serif;
  --font-sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:1300px;margin:0 auto;padding:0 32px}
a{color:inherit}
a:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.eyebrow{font-family:var(--font-mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.mono{font-family:var(--font-mono)}

.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 0;border-bottom:1px solid var(--hair)}
.brand{font-family:var(--font-mono);font-size:12px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}
.topbar__meta{font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.topbar__meta b{color:var(--text);font-weight:500}

.hero{padding:64px 0 40px;border-bottom:1px solid var(--hair)}
h1{font-family:var(--font-display);font-weight:600;font-size:clamp(36px,5.2vw,64px);line-height:1.03;letter-spacing:-.03em;margin:0;max-width:19ch}
.lede{max-width:62ch;font-size:18px;line-height:1.55;color:#cfcfd5;margin:22px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;padding:0;list-style:none}
.chip{font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--hair);border-radius:999px;padding:6px 13px}

section{padding:52px 0;border-bottom:1px solid var(--hair)}
section:last-of-type{border-bottom:0}
h2.sec{font-family:var(--font-display);font-weight:600;font-size:26px;letter-spacing:-.02em;margin:0 0 6px}
.sec-lede{color:var(--muted);max-width:64ch;margin:0 0 30px;font-size:15px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:34px}
.col{padding-top:18px;border-top:1px solid var(--hair)}
.col p{margin:0;color:#cfcfd5;font-size:15px;line-height:1.6}
.col .eyebrow{margin-bottom:10px}

.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px}
.swatch__chip{height:66px;border-radius:10px;border:1px solid var(--hair)}
.swatch__meta{display:flex;flex-direction:column;gap:1px;margin-top:10px;font-family:var(--font-mono);font-size:11px;color:var(--muted)}
.swatch__name{color:var(--text);font-size:12px;margin-bottom:3px}
.type-spec{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:34px;margin-top:38px}
.type-spec .spec{padding-top:18px;border-top:1px solid var(--hair)}
.spec .sample-display{font-family:var(--font-display);font-weight:600;font-size:34px;letter-spacing:-.02em;line-height:1.1}
.spec .sample-sans{font-family:var(--font-sans);font-size:20px;line-height:1.4}
.spec .sample-mono{font-family:var(--font-mono);font-size:14px;letter-spacing:.06em}
.spec small{display:block;color:var(--muted);font-size:12px;margin-top:10px;line-height:1.5}

.board{display:grid;gap:18px}
.concept{background:var(--surface);border:1px solid var(--hair);border-radius:16px;padding:26px 28px 22px}
.concept__head{display:flex;align-items:baseline;gap:14px}
.concept__n{font-family:var(--font-mono);font-size:13px;color:var(--muted)}
.concept__name{font-family:var(--font-display);font-weight:600;font-size:22px;letter-spacing:-.015em;margin:0}
.concept__tag{margin-left:auto;font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.concept__blurb{color:#c6c6cc;font-size:14px;max-width:70ch;margin:12px 0 22px;line-height:1.55}
.matrix{display:grid;grid-template-columns:76px 1fr 1fr;gap:12px;align-items:center}
.matrix__col{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding-left:2px}
.matrix__row{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.matrix__corner{height:0}
.tile{position:relative;display:flex;align-items:center;justify-content:center;border:1px solid var(--hair);border-radius:10px;padding:6px 10px;cursor:pointer;background:transparent;transition:border-color .15s ease,transform .15s ease}
.tile svg{display:block;max-width:100%;height:auto}
.tile--h{min-height:86px}
.tile--h svg{width:min(100%,296px)}
.tile--s{min-height:150px}
.tile--s svg{width:auto;height:138px}
.tile--i{min-height:104px}
.tile--i svg{width:auto;height:72px}
.tile--light{background:#f5f5f6}
.tile--dark{background:#0e0e10}
.tile::after{content:'copy';position:absolute;right:9px;bottom:6px;font-family:var(--font-mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);opacity:0;transition:opacity .15s ease}
.tile--light::after{color:#55555d}
.tile:hover{border-color:var(--hair2);transform:translateY(-2px)}
.tile:hover::after,.tile:focus-visible::after{opacity:1}
.tile.is-copied{border-color:var(--accent)}
.tile--light.is-copied{border-color:#111114}
.tile--light:focus-visible{outline-color:#111114}
.concept__files{font-family:var(--font-mono);font-size:11px;color:var(--muted);margin:18px 0 0;word-break:break-word}

.guide{display:grid;grid-template-columns:280px 1fr;gap:40px;align-items:start}
.guide__fig{background:var(--surface);border:1px solid var(--hair);border-radius:14px;padding:14px}
.guide__fig svg{display:block;width:100%;height:auto}
.rules{list-style:none;margin:0;padding:0;display:grid;gap:0}
.rules li{padding:16px 0;border-bottom:1px solid var(--hair);display:grid;grid-template-columns:130px 1fr;gap:20px}
.rules li:first-child{border-top:1px solid var(--hair)}
.rules b{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);font-weight:500}
.rules span{color:#cfcfd5;font-size:14px}
.filemap{columns:2;column-gap:40px;font-family:var(--font-mono);font-size:12px;color:var(--muted);line-height:1.9;margin:0;padding:0;list-style:none}
.filemap li{break-inside:avoid}
.filemap em{color:var(--text);font-style:normal}

footer{padding:44px 0 70px}
footer p{color:var(--muted);font-size:13px;max-width:70ch;margin:0 0 8px}

.toast{position:fixed;left:50%;bottom:26px;transform:translate(-50%,20px);background:var(--surface);border:1px solid var(--hair2);color:var(--text);font-family:var(--font-mono);font-size:12px;letter-spacing:.04em;padding:11px 18px;border-radius:10px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:50;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.toast.is-on{opacity:1;transform:translate(-50%,0)}

@media (max-width:900px){
  .cols{grid-template-columns:1fr;gap:26px}
  .type-spec{grid-template-columns:1fr;gap:26px}
  .guide{grid-template-columns:1fr;gap:26px}
  .guide__fig{max-width:320px}
}
@media (max-width:620px){
  .wrap{padding:0 18px}
  .concept{padding:20px 16px}
  .matrix{grid-template-columns:1fr 1fr;gap:10px 10px}
  .matrix__corner{display:none}
  .matrix__row{grid-column:1/-1;margin-top:6px}
  .matrix__col:first-of-type{padding-left:0}
  .tile--s{min-height:118px}.tile--s svg{height:106px}
  .filemap{columns:1}
}
</style>
</head>
<body>
<div class="wrap">

  <header class="topbar" data-od-id="topbar">
    <span class="brand">SynAmp</span>
    <span class="topbar__meta"><b>${N}</b> concepts · <b>SVG</b></span>
  </header>

  <section class="hero" data-od-id="hero" style="border-bottom:1px solid var(--hair)">
    <p class="eyebrow">Logo concepts · v1</p>
    <h1>${numWord(N)} synapse-first marks for SynAmp.</h1>
    <p class="lede">SynAmp turns plain language into playlists that match mood, subject, goal and energy. The pitch is a metaphor worth drawing: the app is the <em>synapse</em> between what you say and what you hear. Each direction below commits to that idea differently — some as a neuron, some as a signal, some as the wiring itself. Every one is a real vector, not a picture of one.</p>
    <ul class="chips" data-od-id="deliverable-chips">
      <li class="chip">${N} concepts</li>
      <li class="chip">Horizontal · Square · Icon</li>
      <li class="chip">Light + Dark</li>
      <li class="chip">${N_FILES} SVG files</li>
    </ul>
  </section>

  <section data-od-id="brief">
    <div class="cols">
      <div class="col" data-od-id="brief-idea">
        <p class="eyebrow">The idea</p>
        <p>A brain is the sum of its connections, not its cells. SynAmp works the same way: single tracks are inert until the system wires them into a playlist you asked for. The marks all trade on connection — nodes, routes, sparks, ripples.</p>
      </div>
      <div class="col" data-od-id="brief-system">
        <p class="eyebrow">The system</p>
        <p>Everything is bound to the app's own tokens: one amber accent, near-black neutrals, hairline rules, and mono labels. Hierarchy comes from type and space — never a second colour. The amber is the signal; it is the only thing that glows.</p>
      </div>
      <div class="col" data-od-id="brief-delivery">
        <p class="eyebrow">What you get</p>
        <p>Each concept ships as a horizontal lockup, a stacked square lockup, and an icon-only mark — each in light and dark ink. Files live under <span class="mono">design/svg/</span> as flat, editable SVG. Click any tile to copy its markup.</p>
      </div>
    </div>
  </section>

  <section data-od-id="palette">
    <p class="eyebrow">Palette &amp; type</p>
    <h2 class="sec">Drawn from the product's own tokens</h2>
    <p class="sec-lede">These values come straight from <span class="mono">apps/web/src/styles/tokens.css</span>. The logo never introduces a colour the app does not already own.</p>
    <div class="swatches" data-od-id="swatches">${swatchHtml}</div>
    <div class="type-spec" data-od-id="type-spec">
      <div class="spec"><div class="sample-display">Space Grotesk</div><small>Display &amp; wordmark · weight 600 · tracking −0.02em</small></div>
      <div class="spec"><div class="sample-sans">IBM Plex Sans</div><small>Body copy · the app's reading voice</small></div>
      <div class="spec"><div class="sample-mono">JETBRAINS MONO</div><small>Labels, taglines, mono wordmark · uppercase with wide tracking</small></div>
    </div>
  </section>

  <section data-od-id="concept-board">
    <p class="eyebrow">The directions</p>
    <h2 class="sec">${numWord(N)} concepts, three lockups each</h2>
    <p class="sec-lede">Light tiles sit on a light surface, dark tiles on the brand near-black. The icon column is the same mark at app-icon scale. Click a tile to copy its SVG source.</p>
    <div class="board" data-od-id="board">${board}</div>
  </section>

  <section data-od-id="usage-guide">
    <p class="eyebrow">Using the mark</p>
    <h2 class="sec">Guardrails</h2>
    <p class="sec-lede">Rules that keep whichever direction you pick legible everywhere from a favicon to a NAS splash screen.</p>
    <div class="guide">
      <div class="guide__fig">${clearspace}</div>
      <ul class="rules">
        <li><b>Clear space</b><span>Keep a margin of <span class="mono">x</span> on every side, where <span class="mono">x</span> is one quarter of the icon's height. Nothing enters that band.</span></li>
        <li><b>Minimum size</b><span>Icon: 16&nbsp;px. Horizontal lockup: 120&nbsp;px wide. Below that, drop the tagline before you shrink the wordmark.</span></li>
        <li><b>Colour</b><span>Ink on neutral surfaces only. On brand dark, ink is <span class="mono">#ececec</span>; on light, <span class="mono">#111114</span>. Amber stays amber in both.</span></li>
        <li><b>Don't</b><span>Don't outline the wordmark, gradient the mark, rotate the lockup, or place the amber signal on a mid-tone where it drops below 3:1 contrast.</span></li>
      </ul>
    </div>
  </section>

  <section data-od-id="file-map">
    <p class="eyebrow">Files</p>
    <h2 class="sec">What's in <span class="mono">design/</span></h2>
    <ul class="filemap">
      <li><em>index.html</em> — this gallery</li>
      <li><em>brand-spec.md</em> — tokens &amp; rules</li>
      <li><em>build/concepts.mjs</em> — mark source</li>
      <li><em>build/build.mjs</em> — generator</li>
      ${CONCEPTS.map((c) => `<li><em>svg/${folderName(c)}/</em> — ${c.name}</li>`).join("\n      ")}
    </ul>
  </section>

  <footer>
    <p>Regenerate everything with <span class="mono">node design/build/build.mjs</span>. The wordmarks reference Space Grotesk and JetBrains Mono; convert them to outlines before final production if the target can't load webfonts.</p>
  </footer>

</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script>
(function () {
  var toast = document.getElementById('toast');
  var t;
  function flash(msg) {
    toast.textContent = msg + ' copied';
    toast.classList.add('is-on');
    clearTimeout(t);
    t = setTimeout(function () { toast.classList.remove('is-on'); }, 1600);
  }
  document.querySelectorAll('[data-copy]').forEach(function (el) {
    el.addEventListener('click', function () {
      var svg = el.querySelector('svg');
      if (!svg) return;
      var source = svg.outerHTML;
      function ok() {
        el.classList.add('is-copied');
        setTimeout(function () { el.classList.remove('is-copied'); }, 900);
        flash(el.getAttribute('aria-label').replace('Copy ', '').replace(' lockup', ''));
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source).then(ok).catch(function () {});
      }
    });
  });
})();
</script>
</body>
</html>
`;

writeFileSync(join(designDir, "index.html"), html);

const lines = html.split("\n").length;
console.log(`wrote ${fileCount} svg files + index.html (${lines} lines)`);

#!/usr/bin/env node
/**
 * SynAmp — visual roadmap generator.
 *
 * Reads docs/synamp/ROADMAP.md and emits a single self-contained HTML file.
 * Dependency-free (Node ESM, stdlib only). Regenerate with `pnpm roadmap:build`.
 *
 * Usage:
 *   node tools/roadmap/build.mjs [--src <md>] [--out <html>] [--date <YYYY-MM-DD>]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const SRC = resolve(REPO, arg("--src", "docs/synamp/ROADMAP.md"));
const OUT = resolve(REPO, arg("--out", "docs/roadmap/index.html"));
const STAMP = arg("--date", new Date().toISOString().slice(0, 10));

// The hardware line is generator config (it is not part of ROADMAP.md).
const HARDWARE = "DS1825+ · M4 Pro · 274 GB / 45,739 files";

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

const MARKS = [
  ["🎯", "goal"],
  ["📦", "deliverables"],
  ["✅", "exit"],
  ["⚠", "risk"],
];

const LBL = {
  goal: "Goal",
  deliverables: "Deliverables",
  exit: "Exit criteria",
  risk: "Risk",
};

/** Draw the four block glyphs as inline SVG — never render the source emoji. */
const GLYPH = {
  goal: '<svg class="gl" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.4"/><circle cx="8" cy="8" r="1.5" class="f"/></svg>',
  deliverables:
    '<svg class="gl" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.9 14 5 8 8.1 2 5 8 1.9Z"/><path d="M2 8 8 11.1 14 8"/><path d="M2 11 8 14.1 14 11"/></svg>',
  exit: '<svg class="gl" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.6 6.4 12 13 4.3"/></svg>',
  risk: '<svg class="gl" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.1 14.5 13H1.5L8 2.1Z"/><path d="M8 6.4v3.1"/><circle cx="8" cy="11.3" r=".6" class="f"/></svg>',
};

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s) {
  let x = esc(s);
  x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
  x = x.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  x = x.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return x;
}

// Strip the emoji variation selector (U+FE0F) up front: without this it survives
// the ⚠️ marker slice and lands invisibly in the rendered text.
const raw = readFileSync(SRC, "utf8").replace(/\uFE0F/g, "");
const lines = raw.split(/\r?\n/);

const titleLine = lines.find((l) => l.startsWith("# ")) || "# Roadmap";
const TITLE = titleLine.replace(/^#\s+/, "").trim();

// Split into intro + sections.
const sections = [];
const introLines = [];
let cur = null;
for (const line of lines) {
  if (line.startsWith("## ")) {
    cur = { heading: line.slice(3).trim(), lines: [] };
    sections.push(cur);
    continue;
  }
  if (line.startsWith("# ")) continue;
  if (cur) cur.lines.push(line);
  else introLines.push(line);
}

/** Parse a section body into labelled blocks of items / paragraphs. */
function parseBlocks(bodyLines) {
  const blocks = {};
  const ensure = (k) => (blocks[k] ||= { items: [], paras: [] });
  let key = "prose";
  let breakPending = false;

  const pushPara = (k, text) => {
    const b = ensure(k);
    if (breakPending || !b.paras.length) b.paras.push(text);
    else b.paras[b.paras.length - 1] += " " + text;
    breakPending = false;
  };

  for (const rawLine of bodyLines) {
    const t = rawLine.trim();
    if (t === "---") continue;
    if (!t) {
      breakPending = true;
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;

    const hit = MARKS.find(([m]) => t.startsWith(m));
    if (hit) {
      key = hit[1];
      ensure(key);
      const rest = t.slice(hit[0].length).trim();
      breakPending = false;
      if (rest) pushPara(key, rest);
      continue;
    }

    if (/^\*\*.+\*\*$/.test(t)) {
      pushPara("callouts", t);
      key = "prose";
      continue;
    }

    if (/^[-*]\s/.test(t)) {
      const b = ensure(key);
      const text = t.replace(/^[-*]\s+/, "");
      if (indent >= 2 && b.items.length) b.items[b.items.length - 1].subs.push(text);
      else b.items.push({ text, subs: [] });
      breakPending = false;
      continue;
    }

    if (/^\d+\.\s/.test(t)) {
      const b = ensure(key);
      b.items.push({ text: t.replace(/^\d+\.\s+/, ""), subs: [], ordered: true });
      breakPending = false;
      continue;
    }

    const b = ensure(key);
    const last = b.items[b.items.length - 1];
    if (last) {
      if (last.subs.length) last.subs[last.subs.length - 1] += " " + t;
      else last.text += " " + t;
    } else {
      pushPara(key, t);
    }
  }
  return blocks;
}

const PHASE_RE = /^Phase\s+(\d+)\s*[—–-]\s*(.+)$/;
const phases = [];
const others = [];
for (const s of sections) {
  const m = s.heading.match(PHASE_RE);
  const blocks = parseBlocks(s.lines);
  if (m) phases.push({ n: Number(m[1]), title: m[2].trim(), ...blocks });
  else others.push({ heading: s.heading, ...blocks });
}
phases.sort((a, b) => a.n - b.n);

if (phases.length < 6) {
  console.error(
    `roadmap: only ${phases.length} phases parsed from ${SRC} — expected >= 6. ` +
      `Did ROADMAP.md change structure?`
  );
  process.exit(1);
}

// Intro: paragraphs + the legend line.
const introParas = [];
let legend = null;
{
  let buf = [];
  const flush = () => {
    if (buf.length) introParas.push(buf.join(" ").trim());
    buf = [];
  };
  for (const l of introLines) {
    const t = l.trim();
    if (!t || t === "---") {
      flush();
      continue;
    }
    if (/^Legend:/i.test(t)) {
      legend = t;
      continue;
    }
    buf.push(t);
  }
  flush();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderList(items) {
  return `<ul>${items
    .map(
      (i) =>
        `<li>${inline(i.text)}${
          i.subs && i.subs.length
            ? `<ul>${i.subs.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>`
            : ""
        }</li>`
    )
    .join("")}</ul>`;
}

function renderBlock(key, b) {
  const blk = b || { items: [], paras: [] };
  let inner;
  if (blk.items.length) {
    inner = blk.items.some((i) => i.ordered)
      ? `<ol class="numlist">${blk.items
          .map(
            (i) =>
              `<li>${inline(i.text)}${
                i.subs && i.subs.length
                  ? `<ul>${i.subs.map((s) => `<li>${inline(s)}</li>`).join("")}</ul>`
                  : ""
              }</li>`
          )
          .join("")}</ol>`
      : renderList(blk.items);
  } else if (blk.paras.length) {
    inner = blk.paras.map((p) => `<p>${inline(p)}</p>`).join("");
  } else {
    inner = '<p class="empty">—</p>';
  }
  return `<div class="block block--${key}"><div class="block-label">${GLYPH[key]}<span>${LBL[key]}</span></div><div class="block-body">${inner}</div></div>`;
}

function renderPhase(p) {
  const blocks = ["goal", "deliverables", "exit", "risk"]
    .map((k) => renderBlock(k, p[k]))
    .join("");
  const callouts = (p.callouts?.paras || [])
    .map((c) => `<p class="callout">${inline(c)}</p>`)
    .join("");
  return `<section class="section" id="phase-${p.n}">
      <div class="phase-label">Phase ${p.n}</div>
      <h2>${inline(p.title)}</h2>
      ${blocks}
      ${callouts}
    </section>`;
}

function renderOther(sec, idx) {
  const paras = (sec.prose?.paras || []).map((p) => `<p>${inline(p)}</p>`).join("");
  const ordered = sec.ordered?.items?.length
    ? `<ol class="numlist">${sec.ordered.items
        .map((i) => `<li>${inline(i.text)}</li>`)
        .join("")}</ol>`
    : "";
  return `<section class="section" id="extra-${idx}">
      <div class="phase-label">Cross-cutting</div>
      <h2>${inline(sec.heading)}</h2>
      ${paras}
      ${ordered}
    </section>`;
}

const pad = (n) => String(n).padStart(2, "0");

const timeline = phases
  .map(
    (p, i) =>
      `<li class="seg${i === 0 ? " is-current" : ""}"><span class="n">${pad(p.n)}</span><span class="t">${inline(
        p.title
      )}</span></li>`
  )
  .join("");

const toc = [
  ...phases.map(
    (p, i) =>
      `<li><a href="#phase-${p.n}"${i === 0 ? ' class="is-current"' : ""}><span class="num">${pad(
        p.n
      )}</span><span>${inline(p.title)}</span></a></li>`
  ),
  ...(others.length
    ? '<li><a href="#extra-0"><span class="num">—</span><span>Cross-cutting</span></a></li>'
    : []),
].join("");

const legendHtml = legend
  ? `<div class="legend">${["goal", "deliverables", "exit", "risk"]
      .map((k) => `<span>${GLYPH[k]}${LBL[k]}</span>`)
      .join("")}</div>`
  : "";

const lede = introParas[0] ? `<p class="lede">${inline(introParas[0])}</p>` : "";
const introRest = introParas
  .slice(1)
  .map((p) => `<p class="intro-p">${inline(p)}</p>`)
  .join("");

const bodySections =
  phases.map(renderPhase).join("") + others.map(renderOther).join("");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${inline(TITLE)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0e10; --surface:#16161a; --text:#ececec; --muted:#8a8a94;
  --accent:#e0a33e; --hair:rgba(255,255,255,.08);
  --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --disp:"Space Grotesk","IBM Plex Sans",system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
html{background:var(--bg);-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);
  font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
a{color:var(--accent);text-decoration:none;border-bottom:1px solid rgba(224,163,62,.38)}
a:hover{border-bottom-color:var(--accent)}
code{font-family:var(--mono);font-size:.87em;color:#d8cbb2;
  background:rgba(255,255,255,.045);padding:1px 5px;border-radius:3px}
strong{font-weight:500;color:#f5f5f7}
.page{max-width:1300px;margin:0 auto;padding:0 44px}

/* ---- cover ---- */
.cover{padding:104px 0 0;border-bottom:1px solid var(--hair)}
.wordmark{font-family:var(--mono);font-size:12px;letter-spacing:.3em;
  text-transform:uppercase;color:var(--muted)}
h1{font-family:var(--disp);font-weight:600;font-size:clamp(38px,5.1vw,62px);
  line-height:1.02;letter-spacing:-.028em;margin:22px 0 0;max-width:20ch}
.lede{max-width:64ch;font-size:19px;line-height:1.55;color:#dcdce1;margin:28px 0 0}
.intro-p{max-width:64ch;font-size:15.5px;line-height:1.62;color:#b6b6bd;margin:16px 0 0}
.meta{display:flex;flex-wrap:wrap;gap:0 34px;margin:36px 0 0;
  font-family:var(--mono);font-size:12px;color:var(--muted)}
.meta div{display:flex;gap:9px;padding:5px 0}
.meta dt{color:#63636d}
.legend{display:flex;flex-wrap:wrap;gap:20px;margin:24px 0 0;
  font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;
  text-transform:uppercase;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:8px}

/* ---- timeline ---- */
.timeline{list-style:none;display:grid;grid-template-columns:repeat(${phases.length},1fr);
  margin:46px 0 0;padding:0;border-top:1px solid var(--hair)}
.seg{padding:15px 14px 18px;border-right:1px solid var(--hair);position:relative}
.seg:last-child{border-right:0}
.seg .n{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.16em;color:var(--muted)}
.seg .t{display:block;margin-top:8px;font-size:12.5px;line-height:1.34;color:#a4a4ad}
.seg.is-current .n{color:var(--accent)}
.seg.is-current .t{color:var(--text)}
.seg.is-current::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:var(--accent)}

/* ---- layout ---- */
.layout{display:grid;grid-template-columns:198px 1fr;gap:66px;padding:58px 0 0}
.toc{position:sticky;top:34px;align-self:start}
.toc h2{font-family:var(--mono);font-size:10.5px;font-weight:500;letter-spacing:.22em;
  text-transform:uppercase;color:var(--muted);margin:0 0 18px}
.toc ol{list-style:none;margin:0;padding:0}
.toc li{margin:0}
.toc a{display:flex;gap:11px;padding:7px 0;font-size:13.5px;line-height:1.35;
  color:#a4a4ad;border-bottom:0}
.toc a:hover{color:var(--text)}
.toc .num{font-family:var(--mono);font-size:11px;color:#63636d;flex:none;padding-top:2px}
.toc a.is-current,.toc a.is-current .num{color:var(--accent)}

/* ---- sections ---- */
.section{padding-bottom:70px;border-bottom:1px solid var(--hair)}
.section + .section{padding-top:58px}
.section:last-child{border-bottom:0}
.phase-label{font-family:var(--mono);font-size:11px;letter-spacing:.24em;
  text-transform:uppercase;color:var(--accent)}
h2{font-family:var(--disp);font-weight:600;font-size:clamp(25px,2.7vw,34px);
  line-height:1.1;letter-spacing:-.02em;margin:15px 0 0;max-width:26ch}
.block{display:grid;grid-template-columns:158px 1fr;gap:30px;padding:26px 0;
  border-top:1px solid var(--hair);margin-top:28px}
.block:first-of-type{margin-top:30px}
.block-label{display:flex;align-items:baseline;gap:9px;font-family:var(--mono);
  font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);
  padding-top:3px}
.block-label span{padding-top:1px}
.gl{width:15px;height:15px;flex:none;position:relative;top:2px;
  fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}
.gl .f{fill:currentColor;stroke:none}
.block--goal .block-label,.block--goal .block-body{color:#dcdce1}
.block--goal .block-body p{font-size:17.5px;line-height:1.55;max-width:60ch;margin:0}
.block--risk .block-label,.block--risk .block-body{color:var(--muted)}
.block--risk .block-body p{font-size:14.5px;max-width:64ch;margin:0}
.block-body p{max-width:66ch;margin:0 0 12px}
.block-body p:last-child{margin-bottom:0}
.block-body ul{margin:0;padding:0;list-style:none}
.block-body ul ul{margin:8px 0 10px}
.block-body li{position:relative;padding-left:19px;margin:0 0 9px;max-width:66ch}
.block-body li:last-child{margin-bottom:0}
.block-body li::before{content:"";position:absolute;left:2px;top:.72em;
  width:6px;height:1px;background:#56565f}
.block-body ul ul li::before{background:#3d3d45}
.block-body .numlist{margin:0;padding:0;list-style:none;counter-reset:n}
.block-body .numlist li{counter-increment:n;padding-left:28px}
.block-body .numlist li::before{content:counter(n);
  font-family:var(--mono);font-size:11px;color:var(--accent);
  left:0;top:.28em;width:auto;height:auto;background:none}
.empty{color:#4a4a52}
.callout{max-width:58ch;font-family:var(--disp);font-weight:500;font-size:20px;
  line-height:1.42;letter-spacing:-.01em;color:#f5f5f7;margin:32px 0 0}

/* ---- colophon ---- */
.colophon{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;
  padding:40px 0 92px;border-top:1px solid var(--hair);margin-top:0;
  font-family:var(--mono);font-size:11.5px;color:var(--muted)}
.colophon b{font-weight:400;color:#a4a4ad}

@media (max-width:900px){
  .page{padding:0 22px}
  .cover{padding-top:64px}
  .layout{grid-template-columns:1fr;gap:0;padding-top:40px}
  .toc{position:static;padding-bottom:34px;border-bottom:1px solid var(--hair);margin-bottom:36px}
  .toc ol{display:flex;flex-wrap:wrap;gap:6px 22px}
  .timeline{grid-template-columns:repeat(2,1fr)}
  .seg:nth-child(2n){border-right:0}
  .block{grid-template-columns:1fr;gap:10px}
}
</style>
</head>
<body>
<div class="page">
  <header class="cover">
    <div class="wordmark">SynAmp</div>
    <h1>${inline(TITLE)}</h1>
    ${lede}
    ${introRest}
    ${legendHtml}
    <dl class="meta">
      <div><dt>source</dt><dd>docs/synamp/ROADMAP.md</dd></div>
      <div><dt>generated</dt><dd>${STAMP}</dd></div>
      <div><dt>baseline</dt><dd>${HARDWARE}</dd></div>
    </dl>
    <ol class="timeline">${timeline}</ol>
  </header>
  <div class="layout">
    <aside class="toc">
      <h2>Phases</h2>
      <ol>${toc}</ol>
    </aside>
    <main>${bodySections}</main>
  </div>
  <footer class="colophon">
    <span>Generated from <b>docs/synamp/ROADMAP.md</b> · ${STAMP}</span>
    <span>SynAmp · self-hosted music system</span>
  </footer>
</div>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");

console.log(
  `roadmap: ${phases.length} phases, ${others.length} extra section(s) → ${OUT} (${Buffer.byteLength(
    html
  )} bytes)`
);

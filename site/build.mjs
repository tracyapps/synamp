#!/usr/bin/env node
/*
 * Builds synamp.app into dist/. No dependencies — plain Node.
 *
 *   node build.mjs           build once
 *   node build.mjs --serve   build, then serve on http://localhost:4321 and
 *                            rebuild when anything in src/ or content/ changes
 *
 * What it does:
 *   1. Pages are plain HTML in src/. Shared pieces live in src/partials/ and
 *      are pulled in with a comment:   <!-- include:header active="roadmap" -->
 *      Inside a partial, {{name}} is replaced with the value given there.
 *   2. The roadmap comes from content/roadmap.md. Pages mark where it goes:
 *      <!-- roadmap:phases -->, <!-- roadmap:jump -->, <!-- roadmap:teaser -->,
 *      <!-- roadmap:shipped -->, <!-- roadmap:summary -->, <!-- roadmap:status -->
 *      and {{roadmap.updated}}.
 *   3. Everything in src/assets/ is copied as-is.
 *   4. sitemap.xml and robots.txt are written for SITE_URL.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { execSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");
const SITE_URL = (process.env.SITE_URL || "https://synamp.app").replace(/\/$/, "");

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- the roadmap ----------------------------------------------------------------

/** content/roadmap.md → { phases: [...], shipped: [...] } */
export function parseRoadmap(text) {
  const body = text.replace(/<!--[\s\S]*?-->/g, "");
  const phases = [];
  const shipped = [];
  let current = null;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      current = heading[1].toLowerCase() === "recently shipped" ? "shipped" : { title: heading[1], items: [], meta: {} };
      if (current !== "shipped") phases.push(current);
      continue;
    }
    if (current === "shipped") {
      const entry = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(.+)$/);
      if (entry) shipped.push({ date: entry[1], text: entry[2] });
      continue;
    }
    if (!current) continue;
    const item = line.match(/^-\s+\[( |x|X|~)\]\s+(.+)$/);
    if (item) {
      current.items.push({ state: item[1] === " " ? "todo" : item[1] === "~" ? "doing" : "done", text: item[2] });
      continue;
    }
    const meta = line.match(/^([a-z_]+):\s*(.+)$/);
    if (meta) current.meta[meta[1]] = meta[2];
  }
  for (const phase of phases) {
    const done = phase.items.filter((i) => i.state === "done").length;
    const doing = phase.items.filter((i) => i.state === "doing").length;
    phase.done = done;
    phase.total = phase.items.length;
    phase.status = phase.total && done === phase.total ? "done"
      : done || doing ? "active"
      : phase.meta.next === "yes" ? "next" : "planned";
    phase.id = phase.meta.id || phase.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }
  shipped.sort((a, b) => b.date.localeCompare(a.date));
  return { phases, shipped };
}

const STATUS = {
  done: { label: "Done", badge: "badge--live", dot: "status-dot--live" },
  active: { label: "In progress", badge: "badge--soon", dot: "status-dot--soon" },
  next: { label: "Next", badge: "badge--next", dot: "status-dot--next" },
  planned: { label: "Planned", badge: "badge--muted", dot: "" },
};
const ITEM = { done: "Done", doing: "Being built now", todo: "Not started yet" };

const badge = (status) => {
  const s = STATUS[status];
  return `<span class="badge ${s.badge}">${s.dot ? `<span class="status-dot ${s.dot}"></span>` : ""}${s.label}</span>`;
};
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** When the site was last built from a push: Vercel tells us the commit; locally, ask git. */
function lastUpdated(roadmap) {
  let iso = roadmap.shipped[0]?.date;
  try {
    const committed = execSync("git log -1 --format=%cs -- content/roadmap.md", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (committed && (!iso || committed > iso)) iso = committed;
  } catch { /* not a git checkout (or a shallow one without this file's history) */ }
  return iso;
}

function renderRoadmap(roadmap) {
  const { phases, shipped } = roadmap;
  const updated = lastUpdated(roadmap);
  const phaseHtml = phases.map((p) => `
        <article class="phase reveal" id="${esc(p.id)}" data-state="${p.status}">
          <span class="phase__node" aria-hidden="true">${esc(p.meta.number ?? "")}</span>
          <div class="phase__head"><h2 class="h3">${esc(p.title)}</h2>${badge(p.status)}</div>
          <p class="phase__goal">${esc(p.meta.goal ?? "")}</p>
          ${p.total ? `<p class="phase__count">${p.done} of ${p.total} done</p>` : ""}
          <ul class="phase__list">
            ${p.items.map((i) => `<li data-kind="${i.state}"><span class="visually-hidden">${ITEM[i.state]}: </span>${esc(i.text)}</li>`).join("\n            ")}
          </ul>
        </article>`).join("\n");
  const jump = phases.map((p) => `<a href="#${esc(p.id)}">${esc(String(p.meta.number ?? "").replace("✦", "+"))} · ${esc(p.meta.short ?? p.title)}</a>`).join("\n      ");
  const teaser = phases.map((p) => `
        <a class="pcard reveal" href="/roadmap#${esc(p.id)}" data-state="${p.status}">
          <span class="pcard__n">${p.meta.number === "✦" ? "Alongside" : `Phase ${esc(p.meta.number ?? "")}`}</span>
          <span class="pcard__t">${esc(p.meta.short ?? p.title)}</span>
          <span class="pcard__s">${STATUS[p.status].label}${p.total ? ` · ${p.done}/${p.total}` : ""}</span>
        </a>`).join("");
  const shippedHtml = shipped.length ? `<ol class="shipped">
${shipped.slice(0, 10).map((s) => `          <li><time datetime="${s.date}">${shortDate(s.date)}</time><span>${esc(s.text)}</span></li>`).join("\n")}
        </ol>` : "";
  const done = phases.reduce((n, p) => n + p.done, 0);
  const total = phases.reduce((n, p) => n + p.total, 0);
  const summary = `<div class="legend-bar">
        <div class="metric"><span class="metric__label">Phases</span><span class="metric__value">${phases.length}</span></div>
        <div class="metric"><span class="metric__label">Pieces done</span><span class="metric__value">${done}<span class="metric__of"> / ${total}</span></span></div>
        <div class="metric"><span class="metric__label">Being built</span><span class="metric__value">${phases.filter((p) => p.status === "active").length}</span><span class="muted metric__note">phases in progress</span></div>
        <div class="metric"><span class="metric__label">Last update</span><span class="metric__value metric__value--sm">${updated ? shortDate(updated) : "—"}</span></div>
      </div>`;
  const statusHtml = `<ul class="stripe">
${phases.map((p) => `            <li class="item"><span class="status-dot ${STATUS[p.status].dot}" aria-hidden="true"></span><span>${esc(p.meta.short ?? p.title)}</span><span class="mono muted">${STATUS[p.status].label.toLowerCase()}${p.total ? ` · ${p.done}/${p.total}` : ""}</span></li>`).join("\n")}
          </ul>`;
  return {
    "roadmap:status": statusHtml,
    "roadmap:phases": phaseHtml,
    "roadmap:jump": jump,
    "roadmap:teaser": teaser,
    "roadmap:shipped": shippedHtml,
    "roadmap:summary": summary,
    "{{roadmap.updated}}": updated ? longDate(updated) : "recently",
  };
}

// --- pages ---------------------------------------------------------------------------

function attrs(text = "") {
  const out = {};
  for (const m of text.matchAll(/([a-z_-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const GLOBALS = ["site_url", "year"];

function include(html, depth = 0) {
  if (depth > 5) throw new Error("includes nested too deeply");
  return html.replace(/<!--\s*include:([a-z0-9_-]+)([^>]*?)-->/g, (_, name, rest) => {
    const file = join(SRC, "partials", `${name}.html`);
    if (!existsSync(file)) throw new Error(`missing partial: ${name}`);
    const vars = attrs(rest);
    // {{name}} takes the value given in the include; site-wide ones ({{site_url}}, {{year}}) are filled in later.
    let part = readFileSync(file, "utf8").replace(/\{\{([a-z_]+)\}\}/g, (m, key) => (key in vars ? vars[key] : GLOBALS.includes(key) ? m : ""));
    if (vars.active) part = part.replace(new RegExp(`(data-nav="${vars.active}")`, "g"), '$1 aria-current="page"');
    return include(part, depth + 1);
  });
}

export function build() {
  const started = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const roadmap = parseRoadmap(readFileSync(join(ROOT, "content", "roadmap.md"), "utf8"));
  const blocks = renderRoadmap(roadmap);
  const pages = readdirSync(SRC).filter((f) => f.endsWith(".html"));
  for (const page of pages) {
    let html = include(readFileSync(join(SRC, page), "utf8"));
    for (const [marker, value] of Object.entries(blocks)) {
      html = marker.startsWith("{{") ? html.split(marker).join(value) : html.replace(new RegExp(`<!--\\s*${marker}\\s*-->`, "g"), value);
    }
    html = html.replace(/\{\{site_url\}\}/g, SITE_URL).replace(/\{\{year\}\}/g, String(new Date().getFullYear()));
    const left = html.match(/<!--\s*(include|roadmap):[^>]*-->/);
    if (left) throw new Error(`${page}: unhandled marker ${left[0]}`);
    writeFileSync(join(OUT, page), html);
  }
  cpSync(join(SRC, "assets"), join(OUT, "assets"), { recursive: true });
  for (const file of ["favicon.ico", "favicon.svg", "apple-touch-icon.png", "site.webmanifest", "og.png"]) {
    if (existsSync(join(SRC, file))) cpSync(join(SRC, file), join(OUT, file));
  }
  const listed = pages.filter((p) => !["404.html", "thanks.html", "oops.html"].includes(p));
  writeFileSync(join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((p) => `  <url><loc>${SITE_URL}/${p === "index.html" ? "" : p.replace(/\.html$/, "")}</loc></url>`).join("\n")}
</urlset>
`);
  writeFileSync(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  const phases = roadmap.phases.map((p) => `${p.meta.short ?? p.title} ${p.done}/${p.total}`).join(", ");
  console.log(`built ${pages.length} pages in ${Date.now() - started} ms · roadmap: ${phases}`);
}

// --- local preview ---------------------------------------------------------------------

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain", ".json": "application/json", ".webmanifest": "application/manifest+json" };

function serve(port = Number(process.env.PORT) || 4321) {
  createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    // The forms post to /api/*; locally there's no email to send, so say what would have gone out.
    if (url.pathname.startsWith("/api/")) {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        console.log(`[preview] ${req.method} ${url.pathname}: ${body.slice(0, 500)}`);
        const wantsJson = (req.headers.accept || "").includes("application/json");
        if (wantsJson) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, preview: true })); }
        else { res.writeHead(303, { location: "/thanks" }); res.end(); }
      });
      return;
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index";
    let file = join(OUT, path);
    if (!extname(file)) file += ".html"; // clean URLs, like Vercel
    if (!file.startsWith(OUT) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": TYPES[".html"] });
      res.end(existsSync(join(OUT, "404.html")) ? readFileSync(join(OUT, "404.html")) : "Not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  }).listen(port, () => console.log(`preview: http://localhost:${port}  (Ctrl-C to stop)`));

  let timer;
  for (const dir of [SRC, join(ROOT, "content")]) {
    watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => { try { build(); } catch (error) { console.error(error.message); } }, 120);
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
  if (process.argv.includes("--serve")) serve();
}

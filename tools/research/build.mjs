import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = resolve(root, 'docs/research');
const catalog = JSON.parse(readFileSync(resolve(base, 'catalog.json'), 'utf8'));
const manifestPath = resolve(base, catalog.archive_manifest);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function local(path) {
  const target = resolve(base, path.split('#')[0]);
  if (!target.startsWith(root + '/') || !existsSync(target)) throw new Error(`Missing/unsafe catalog link: ${path}`);
  return escape(path);
}
function link(item) { return `<a href="${local(item.path)}">${escape(item.label)}</a>`; }
for (const f of manifest.files) {
  const path = resolve(dirname(manifestPath), f.path);
  if (!path.startsWith(dirname(manifestPath) + '/')) throw new Error('Archive path escapes its edition');
  const bytes = readFileSync(path);
  if (bytes.length !== f.bytes || createHash('sha256').update(bytes).digest('hex') !== f.sha256) throw new Error(`Archive changed: ${f.path}`);
}
const sections = catalog.sections.map((s) => `<section id="${escape(s.id)}"><h2>${escape(s.title)}</h2><p>${escape(s.description)}</p><ul>${s.links.map((l) => `<li>${link(l)}</li>`).join('')}</ul></section>`).join('\n');
const tasks = catalog.tasks.map((t) => `<tr id="${escape(t.id)}"><th scope="row">${escape(t.id)}</th><td><strong>${escape(t.title)}</strong><p>${escape(t.acceptance)}</p></td><td>${escape(t.state)}</td><td>${escape(t.depends)}</td><td>${escape(t.sources)}</td></tr>`).join('\n');
const errata = catalog.errata.map((e) => `<li><strong>${escape(e.title)}.</strong> ${escape(e.detail)}${e.link ? ` ${link(e.link)}` : ''}</li>`).join('\n');
const sourceRows = manifest.files.map((f) => `<tr><td>${link({path: `${dirname(catalog.archive_manifest)}/${f.path}`, label:f.original_path})}</td><td>${escape(f.role)}</td><td>${f.bytes.toLocaleString('en-US')}</td><td><code>${escape(f.sha256)}</code></td></tr>`).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SynAmp research library</title>
<style>
:root{color-scheme:dark;--ink:#e9edf4;--muted:#aab5c7;--line:#334057;--gold:#ffd275}*{box-sizing:border-box}body{margin:0;background:#101722;color:var(--ink);font:17px/1.65 system-ui,sans-serif}a{color:var(--gold);text-underline-offset:4px}a:focus-visible,summary:focus-visible{outline:3px solid var(--gold);outline-offset:4px}.skip{position:absolute;left:1rem;top:-100px}.skip:focus{top:1rem}main{max-width:1100px;margin:auto;padding:clamp(20px,5vw,64px)}.eyebrow{letter-spacing:.16em;font-size:12px;color:var(--gold);text-transform:uppercase}h1{font-size:clamp(35px,6vw,66px);line-height:1.1;margin:.3em 0}h2{line-height:1.25}header>p{max-width:790px;color:var(--muted)}nav{padding:22px;border:1px solid var(--line);border-radius:12px;margin:36px 0}nav ul{display:flex;flex-wrap:wrap;gap:10px 28px;list-style:none;padding:0;margin:0}section{margin:45px 0;padding-top:12px;border-top:1px solid var(--line);scroll-margin-top:15px}section>p{color:var(--muted)}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:12px 10px}th{color:var(--gold)}td p{margin:6px 0;color:var(--muted);min-width:235px}.table{overflow:auto}code{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}details{border:1px solid var(--line);padding:16px;border-radius:8px}summary{cursor:pointer;font-weight:650}li{margin:9px 0}footer{font-size:14px;color:var(--muted)}@media print{:root{color-scheme:light;--ink:#111;--muted:#333;--line:#bbb;--gold:#543900}body{background:white}main{padding:15px}nav{break-inside:avoid}section{break-before:auto}details table{font-size:10px}}
</style></head><body><a class="skip" href="#library">Skip to research</a><main id="library"><header><p class="eyebrow">SynAmp • research library • ${escape(catalog.updated)}</p><h1>Music, learning<br>and the listening moment.</h1><p>${escape(catalog.description)}</p><p>${link(catalog.featured)} · ${link(catalog.handoff)}</p></header>
<nav aria-label="Table of contents"><ul>${catalog.sections.map((s)=>`<li><a href="#${escape(s.id)}">${escape(s.title)}</a></li>`).join('')}<li><a href="#tasks">Work queue</a></li><li><a href="#errata">Corrections</a></li><li><a href="#appendix">Source appendix</a></li></ul></nav>
${sections}
<section id="tasks"><h2>Work queue</h2><p>Status belongs to this catalog. The linked handoff records exact files, dependencies, owners and checks. Completed software checks establish behavior; real listening usefulness still needs owner evidence.</p><div class="table"><table><thead><tr><th>ID</th><th>Outcome and acceptance</th><th>Status</th><th>Depends on</th><th>Source</th></tr></thead><tbody>${tasks}</tbody></table></div></section>
<section id="errata"><h2>Corrections and disagreements</h2><p>The original report is a historical edition. Read these alongside it; archived claims and past test counts are not silently upgraded.</p><ul>${errata}</ul></section>
<section id="appendix"><h2>Source appendix</h2><p>${manifest.files.length} original files preserved with SHA-256 and byte counts. ${manifest.excluded.length} Finder metadata files excluded. ${link({path:catalog.archive_manifest,label:'Machine-readable provenance manifest'})}. Retrieval modes and MP/CC/ML citation IDs remain in the original packs and report appendix.</p><details><summary>Browse every preserved source and evidence file</summary><div class="table"><table><thead><tr><th>Original path</th><th>Role</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>${sourceRows}</tbody></table></div></details><p>${escape(catalog.publication_boundary)}</p></section>
<footer>Generated from catalog.json by tools/research/build.mjs. Original report and evidence are immutable; current implementation lives in apps/ and tools/brain-lab.</footer></main></body></html>`;
if (process.argv.includes('--check')) {
  if (readFileSync(resolve(base,'index.html'),'utf8') !== html) throw new Error('Research library is stale: run pnpm research:build');
  console.log(`Research library current; ${manifest.files.length} archive hashes and all catalog links verified.`);
} else {
  writeFileSync(resolve(base,'index.html'), html);
  console.log(`Built ${relative(root,resolve(base,'index.html'))}; verified ${manifest.files.length} archive hashes.`);
}

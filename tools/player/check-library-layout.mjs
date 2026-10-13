// The Library's layout in the real App with the real styles: opening a group
// leaves the header you clicked where it was. A temporary library of 300
// artists; nothing touches the owner's music.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(repo, 'package.json'));
const puppeteer = require('puppeteer');
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'synamp-library-layout-')));
const output = path.resolve(process.argv[2] || '/tmp/synamp-library-layout-evidence');
await mkdir(output, { recursive: true });
const freePort = async () => { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; };

const tracks = [];
for (let a = 1; a <= 300; a++) for (let s = 1; s <= 4; s++) {
  const artist = `Artist ${String(a).padStart(3, '0')}`;
  tracks.push({ id: `t${a}-${s}`, title: `Song ${s} by ${artist}`, artist, album: `${artist} album`, path: `${artist}/Album/${s}.flac`, duration_s: 200, signals: {} });
}
await writeFile(path.join(scratch, 'library.json'), JSON.stringify({ tracks }));
const port = await freePort();
const api = `http://127.0.0.1:${port}`;
const brain = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: path.join(repo, 'apps/brain'), env: { ...process.env, BRAIN_PORT: String(port), BRAIN_HOST: '127.0.0.1', LIBRARY_PATH: scratch, LIBRARY_SIGNALS_PATH: path.join(scratch, 'library.json'), PLAYLIST_DATA_PATH: path.join(scratch, 'data/playlists.json'), EVENTS_PATH: path.join(scratch, 'data/events.jsonl'), SESSION_PATH: path.join(scratch, 'data/session.json'), PLAYLIST_API_TOKEN: '', CORE_URL: 'http://127.0.0.1:1', SOURCE_PATH: '', INCOMING_PATH: '', UPDATE_CHECKS: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
let brainLog = ''; brain.stdout.on('data', c => brainLog += c); brain.stderr.on('data', c => brainLog += c);
let server, browser;
const passed = [];
const pass = (name) => { passed.push(name); console.log(`PASS ${name}`); };

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${api}/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  await symlink(path.join(repo, 'apps/web/node_modules'), path.join(scratch, 'node_modules'));
  // The real entry point, so the real styles decide row heights.
  await writeFile(path.join(scratch, 'index.html'), `<html><body><div id="root"></div><script type="module" src="/@fs${path.join(repo, 'apps/web/src/main.tsx')}"></script></body></html>`);
  await writeFile(path.join(scratch, 'vite.config.mjs'), `import{defineConfig}from ${JSON.stringify(path.join(repo, 'apps/web/node_modules/vite/dist/node/index.js'))};import react from'@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch, repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
  server = spawn(process.execPath, [path.join(repo, 'apps/web/node_modules/vite/bin/vite.js'), '--config', path.join(scratch, 'vite.config.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let log = ''; const timer = setTimeout(() => reject(Error(log)), 15000); const read = c => { log += c.toString().replace(/\x1b\[[0-9;]*m/g, ''); const found = log.match(/http:\/\/127\.0\.0\.1:\d+\//); if (found) { clearTimeout(timer); resolve(found[0]); } }; server.stdout.on('data', read); server.stderr.on('data', read); });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url + '#/library', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.browse')?.textContent.includes('Artist 001'));
  // Group by artist: every group starts closed.
  await page.evaluate(() => { const select = [...document.querySelectorAll('.browse__pivot select')][0]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(select, 'artist'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('.group-head__toggle').length > 10);

  const headerTop = (label) => page.evaluate(l => { const b = [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === l); return b ? b.getBoundingClientRect().top : null; }, label);
  /** Scroll until a header is drawn mid-screen, then open it and watch where it goes for 2 seconds. */
  async function openAndWatch(label) {
    for (let i = 0; i < 80; i++) {
      const top = await headerTop(label);
      if (top !== null && top > 250 && top < 650) break;
      await page.evaluate((l) => {
        const main = document.getElementById('main'); const scroller = main && main.scrollHeight > main.clientHeight ? main : document.scrollingElement;
        const b = [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === l);
        if (b) scroller.scrollTop += b.getBoundingClientRect().top - 450;
        else { const labels = [...document.querySelectorAll('.group-head__label')].map(x => x.textContent); scroller.scrollTop += (labels.length && labels.at(-1) < l ? 1 : -1) * 600; }
      }, label);
      await new Promise(r => setTimeout(r, 120));
    }
    await new Promise(r => setTimeout(r, 400));
    const before = await headerTop(label);
    assert.ok(before !== null && before > 200 && before < 700, `${label} is on screen (${before})`);
    await page.evaluate(l => [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === l).click(), label);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 50));
      const now = await headerTop(label);
      worst = Math.max(worst, now === null ? Infinity : Math.abs(now - before));
    }
    const opened = await page.evaluate(l => [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === l)?.getAttribute('aria-expanded'), label);
    return { before, worst, opened };
  }

  const near = await openAndWatch('Artist 040');
  assert.equal(near.opened, 'true');
  assert.ok(near.worst <= 2, `Artist 040 header moved ${near.worst}px after opening`);
  const far = await openAndWatch('Artist 220');
  assert.equal(far.opened, 'true');
  await page.screenshot({ path: path.join(output, 'group-opened.png') });
  assert.ok(far.worst <= 2, `Artist 220 header moved ${far.worst}px after opening`);
  pass('Opening a group keeps its header where it was clicked (first page and far down)');
  const closed = await openAndWatch('Artist 220');
  assert.equal(closed.opened, 'false');
  assert.ok(closed.worst <= 2, `Artist 220 header moved ${closed.worst}px after closing`);
  pass('Closing it again keeps it in place too');

  // Indentation: what's inside a group steps in one level (as a second-level header does).
  await openAndWatch('Artist 230');
  const steps = await page.evaluate(() => {
    const head = [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === 'Artist 230').closest('.group-head');
    const item = head.closest('li').nextElementSibling;
    return { group: head.querySelector('.pick').getBoundingClientRect().left, item: item.querySelector('.pick').getBoundingClientRect().left };
  });
  assert.equal(Math.round(steps.item - steps.group), 28, `item steps in 28px from its group (${JSON.stringify(steps)})`);
  // Row actions stay on one line.
  const tallest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.album__actions--compact')].map(a => a.getBoundingClientRect().height)));
  assert.ok(tallest <= 40, `actions fit on one line (${tallest}px)`);
  // The list's title bar stays at the top of the scrolling area.
  const stuck = await page.evaluate(() => ({ head: document.querySelector('.browse__listhead').getBoundingClientRect().top, main: document.getElementById('main').getBoundingClientRect().top }));
  assert.ok(Math.abs(stuck.head - stuck.main) <= 1, `list title bar at the top (${JSON.stringify(stuck)})`);
  pass('Items step in under their group, actions fit on one line, and the list title bar stays at the top');

  // Table: same indentation, and the column headings stay at the top.
  await page.evaluate(() => [...document.querySelectorAll('.browse__views button')].find(b => b.textContent.trim() === 'Table').click());
  await page.waitForSelector('.browse__table thead');
  await openAndWatch('Artist 240');
  await page.evaluate(() => { document.getElementById('main').scrollTop += 300; });
  await new Promise(r => setTimeout(r, 300));
  const table = await page.evaluate(() => {
    const head = [...document.querySelectorAll('.group-head__toggle')].find(x => x.querySelector('.group-head__label')?.textContent === 'Artist 240').closest('.group-head');
    const item = head.closest('tbody').nextElementSibling;
    return { group: head.querySelector('.pick').getBoundingClientRect().left, item: item.querySelector('.pick').getBoundingClientRect().left,
      thead: document.querySelector('.browse__table thead').getBoundingClientRect().top, main: document.getElementById('main').getBoundingClientRect().top };
  });
  assert.equal(Math.round(table.item - table.group), 28, `table item steps in 28px (${JSON.stringify(table)})`);
  assert.ok(Math.abs(table.thead - table.main) <= 1, `column headings at the top (${JSON.stringify(table)})`);
  await page.screenshot({ path: path.join(output, 'table-sticky.png') });
  pass('Table: items step in under their group, and the column headings stay at the top');

  // Full screen: no side menu or page heading on screen, the table across the window; Escape comes back.
  const clickText = (text) => page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t).click(), text);
  await clickText('Full screen');
  await page.waitForFunction(() => document.querySelector('.app--library-full') && !document.querySelector('.app__side'));
  const wide = await page.evaluate(() => {
    const main = document.getElementById('main').getBoundingClientRect(), table = document.querySelector('.browse__table').getBoundingClientRect(), card = document.querySelector('.browse').getBoundingClientRect();
    const h1 = document.querySelector('.screen__head h1');
    return { mainLeft: main.left, mainWidth: main.width, table: table.width, cardRightGap: main.right - card.right, h1: !!h1 && h1.textContent, h1Visible: !!h1 && h1.getBoundingClientRect().width > 2, focus: document.activeElement?.textContent.trim() };
  });
  assert.equal(wide.mainLeft, 0, 'the Library starts at the window edge');
  assert.ok(wide.table >= wide.mainWidth - 60, `the table spans the window (${JSON.stringify(wide)})`);
  assert.ok(wide.cardRightGap <= 30, `the Library reaches the right edge too (${JSON.stringify(wide)})`);
  assert.equal(wide.h1, 'Library', 'the page heading is still there for screen readers');
  assert.equal(wide.h1Visible, false);
  assert.equal(wide.focus, 'Exit full screen', 'focus stays on the button, now saying how to leave');
  await page.screenshot({ path: path.join(output, 'full-screen.png') });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.app--library-full'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.app--library-full') && document.querySelector('.app__side'));
  await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Full screen');
  pass('Full screen shows the Library across the window, is remembered, and Escape comes back');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, near, far, closed }, null, 2));
} catch (error) { console.error(brainLog.slice(-1500)); throw error; }
finally { await browser?.close(); server?.kill('SIGTERM'); brain.kill('SIGTERM'); await rm(scratch, { recursive: true, force: true }); }

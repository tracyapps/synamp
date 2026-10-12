// "A new SynAmp is available", in the real App with a real Brain, against a
// stand-in for GitHub's release list that counts every request it gets.
// All stores live under a temporary directory; nothing is sent anywhere real.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createHttp } from 'node:http';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(repo, 'package.json'));
const puppeteer = require('puppeteer');
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'synamp-updates-')));
const output = path.resolve(process.argv[2] || '/tmp/synamp-updates-evidence');
await mkdir(output, { recursive: true });
const freePort = async () => { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; };

// The stand-in release list: one finished release, one beta, a draft, and notes
// that try to sneak HTML in (it must show as text).
const releases = [
  { tag_name: 'v0.2.0', name: 'SynAmp 0.2.0', body: 'Old', html_url: 'https://github.com/tracyapps/synamp/releases/tag/v0.2.0', published_at: '2026-10-01T00:00:00Z', draft: false, prerelease: false },
  { tag_name: 'v0.3.0', name: 'SynAmp 0.3.0', body: '## Playlists\n- Folders remember where you were\n- [Smarter](https://example.com) mixes\n\n<img src=x onerror="window.__pwned=1">', html_url: 'https://github.com/tracyapps/synamp/releases/tag/v0.3.0', published_at: '2026-10-20T00:00:00Z', draft: false, prerelease: false },
  { tag_name: 'v0.4.0-beta.1', name: 'SynAmp 0.4.0 beta 1', body: '- Try the new visuals', html_url: 'https://github.com/tracyapps/synamp/releases/tag/v0.4.0-beta.1', published_at: '2026-10-25T00:00:00Z', draft: false, prerelease: true },
  { tag_name: 'v9.0.0', name: 'Draft', body: '', html_url: 'https://github.com/x', published_at: '', draft: true, prerelease: false },
];
let feedRequests = 0;
const feed = createHttp((req, res) => { feedRequests++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(releases)); });
const feedPort = await freePort();
await new Promise(r => feed.listen(feedPort, '127.0.0.1', r));

// A release install of 0.2.0: build.json carries the version, as a GitHub-built image does.
await writeFile(path.join(scratch, 'build.json'), JSON.stringify({ fingerprint: 'f'.repeat(64), built_at: Date.now(), version: '0.2.0' }));
await writeFile(path.join(scratch, 'library.json'), JSON.stringify({ tracks: [] }));
const port = await freePort();
const api = `http://127.0.0.1:${port}`;
const brain = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: path.join(repo, 'apps/brain'), env: { ...process.env, BRAIN_PORT: String(port), BRAIN_HOST: '127.0.0.1', LIBRARY_PATH: scratch, LIBRARY_SIGNALS_PATH: path.join(scratch, 'library.json'), PLAYLIST_DATA_PATH: path.join(scratch, 'data/playlists.json'), EVENTS_PATH: path.join(scratch, 'data/events.jsonl'), SESSION_PATH: path.join(scratch, 'data/session.json'), PLAYLIST_API_TOKEN: '', CORE_URL: 'http://127.0.0.1:1', SOURCE_PATH: '', INCOMING_PATH: '', BUILD_INFO_PATH: path.join(scratch, 'build.json'), UPDATE_FEED_URL: `http://127.0.0.1:${feedPort}/releases` }, stdio: ['ignore', 'pipe', 'pipe'] });
let brainLog = ''; brain.stdout.on('data', c => brainLog += c); brain.stderr.on('data', c => brainLog += c);
let server, browser;
const call = async (p, body) => { const r = await fetch(`${api}/api/v1${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; };
const passed = [];
const pass = (name) => { passed.push(name); console.log(`PASS ${name}`); };

try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${api}/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  await symlink(path.join(repo, 'apps/web/node_modules'), path.join(scratch, 'node_modules'));
  await writeFile(path.join(scratch, 'index.html'), '<html><body><div id="root"></div><script type="module" src="/check.tsx"></script></body></html>');
  await writeFile(path.join(scratch, 'check.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import App from ${JSON.stringify(`/@fs${path.join(repo, 'apps/web/src/App.tsx')}`)};createRoot(document.getElementById('root')).render(<App/>);`);
  await writeFile(path.join(scratch, 'vite.config.mjs'), `import{defineConfig}from ${JSON.stringify(path.join(repo, 'apps/web/node_modules/vite/dist/node/index.js'))};import react from'@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch, repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
  server = spawn(process.execPath, [path.join(repo, 'apps/web/node_modules/vite/bin/vite.js'), '--config', path.join(scratch, 'vite.config.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((resolve, reject) => { let log = ''; const timer = setTimeout(() => reject(Error(log)), 15000); const read = c => { log += c.toString().replace(/\x1b\[[0-9;]*m/g, ''); const found = log.match(/http:\/\/127\.0\.0\.1:\d+\//); if (found) { clearTimeout(timer); resolve(found[0]); } }; server.stdout.on('data', read); server.stderr.on('data', read); });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const text = (selector) => page.$eval(selector, el => el.textContent);
  const clickButton = async (label) => { const b = await page.evaluateHandle(l => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === l), label); assert.ok(b.asElement(), `button "${label}"`); await b.asElement().click(); };

  // 1. First visit: before any check, a one-time note says what the check does.
  await page.goto(url + '#/library', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.update--quiet')?.textContent.includes('sends nothing about you or your music'));
  assert.equal(feedRequests, 0, 'nothing is asked of GitHub before the first scheduled check');
  await clickButton('Got it');
  await page.waitForFunction(() => !document.querySelector('.update--quiet'));
  pass('First visit explains the update check in plain words, once');

  // 2. The scheduled check (run now) finds 0.3.0, not the beta and not the draft.
  await call('/system/updates', { action: 'check' });
  assert.equal(feedRequests, 1);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.update h2')?.textContent === 'SynAmp 0.3.0 is available');
  assert.match(await text('.update'), /You have 0\.2\.0\./);
  await page.click('.update__whats-new summary');
  const notes = await text('.update__notes');
  assert.match(notes, /Folders remember where you were/);
  assert.match(notes, /Smarter mixes/, 'link words kept, link dropped');
  assert.match(notes, /<img src=x/, 'HTML in the notes shows as text');
  assert.equal(await page.$('.update__notes img'), null);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  assert.match(await text('.app__bar-right'), /0\.3\.0 available/);
  await page.screenshot({ path: path.join(output, 'update-available.png'), fullPage: true });
  pass('A newer release shows with its notes, safely, and in the top bar');

  // 3. Skip this version: gone, and remembered by the brain.
  await clickButton('Skip this version');
  await page.waitForFunction(() => [...document.querySelectorAll('[role="status"]')].some(s => s.textContent.includes('Skipped 0.3.0')));
  assert.equal(await page.$('.update h2'), null);
  assert.equal((await call('/system/updates')).updates.skipped, '0.3.0');
  pass('Skip this version hides it and remembers');

  // 4. Settings: status, beta switch offers the beta (skipping one version doesn't hide the next).
  await page.goto(url + '#/settings', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.update-settings')?.textContent.includes('you chose to skip it'));
  const beta = await page.evaluateHandle(() => [...document.querySelectorAll('.update-settings label')].find(l => l.textContent.includes('Include beta versions')).querySelector('input'));
  await beta.asElement().click();
  await page.waitForFunction(() => document.querySelector('.update-settings')?.textContent.includes('SynAmp 0.4.0-beta.1 is available'));
  assert.equal(feedRequests, 2, 'turning beta on checks straight away');
  pass('About this install shows the state, and the beta switch offers the beta');

  // 5. Remind me later on the beta.
  await page.goto(url + '#/library', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.update h2')?.textContent === 'SynAmp 0.4.0-beta.1 is available (beta)');
  await clickButton('Remind me in 3 days');
  await page.waitForFunction(() => !document.querySelector('.update h2'));
  assert.ok((await call('/system/updates')).updates.remind_after > Date.now() + 2 * 86_400_000);
  pass('Remind me in 3 days puts it off');

  // 6. Turning checks off: no more requests, even when asked to check.
  await page.goto(url + '#/settings', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => [...document.querySelectorAll('.update-settings label')].some(l => l.textContent.includes('Check for new versions')));
  const checks = await page.evaluateHandle(() => [...document.querySelectorAll('.update-settings label')].find(l => l.textContent.includes('Check for new versions')).querySelector('input'));
  await checks.asElement().click();
  await page.waitForFunction(() => document.querySelector('.update-settings')?.textContent.includes('Update checks are off'));
  const before = feedRequests;
  await call('/system/updates', { action: 'check' });
  assert.equal(feedRequests, before, 'off means no request at all');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Check now')), false);
  assert.equal((await call('/settings')).update_checks ?? (await call('/settings')).settings?.update_checks, false);
  pass('Turning checks off stops every request to GitHub');

  // Every switch has a visible, programmatic label.
  const unlabelled = await page.evaluate(() => [...document.querySelectorAll('.update-settings input')].filter(i => !(i.labels?.[0]?.textContent.trim())).length);
  assert.equal(unlabelled, 0);
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ passed, feedRequests, limitations: 'Stand-in release list; no GitHub or NAS. Notes rendering is checked for safety, not appearance.' }, null, 2));
} catch (error) { console.error(brainLog.slice(-2000)); throw error; }
finally { await browser?.close(); server?.kill('SIGTERM'); brain.kill('SIGTERM'); feed.close(); await rm(scratch, { recursive: true, force: true }); }

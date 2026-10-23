// A song that stops arriving partway through: the player must say so and move on, not sit on "Playing" in silence.
// Real App Library -> Brain queue -> Player, with generated WAV audio.
// All stores/files live under a temporary directory; never touches the owner's library.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(repo, 'package.json'));
const puppeteer = require('puppeteer');
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'synamp-stuck-song-')));
const output = path.resolve(process.argv[2] || '/tmp/synamp-stuck-song-evidence');
await mkdir(output, { recursive: true });
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const api = `http://127.0.0.1:${port}`;
const rate = 8000, samples = rate * 120;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 220 * i / rate)), 44 + i * 2);
// Two songs by one artist on different albums, so one cuts to the next (streamed, not decoded whole).
const tracks = ['a', 'b'].map((id, i) => ({ id, title: `Song ${id.toUpperCase()}`, artist: 'Fixture Artist', path: `First/Album ${i + 1}/${id}.wav`, embedding: [1, i / 10], signals: {} }));
for (const track of tracks) { await mkdir(path.dirname(path.join(scratch, track.path)), { recursive: true }); await writeFile(path.join(scratch, track.path), wav); }
await writeFile(path.join(scratch, 'library.json'), JSON.stringify({ tracks }));
const brain = spawn(process.execPath, ['--experimental-strip-types', 'src/index.ts'], { cwd: path.join(repo, 'apps/brain'), env: { ...process.env, BRAIN_PORT: String(port), BRAIN_HOST: '127.0.0.1', LIBRARY_PATH: scratch, LIBRARY_SIGNALS_PATH: path.join(scratch, 'library.json'), PLAYLIST_DATA_PATH: path.join(scratch, 'data/playlists.json'), EVENTS_PATH: path.join(scratch, 'data/events.jsonl'), SESSION_PATH: path.join(scratch, 'data/session.json'), PLAYLIST_API_TOKEN: '', CORE_URL: 'http://127.0.0.1:1', SOURCE_PATH: '', INCOMING_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let brainLog = ''; brain.stdout.on('data', chunk => brainLog += chunk); brain.stderr.on('data', chunk => brainLog += chunk);
let server, browser;
const urlOf = file => `/@fs${path.join(repo, file)}`;

try {
 for(let i=0;i<100;i++){try{if((await fetch(`${api}/health`)).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
 await symlink(path.join(repo,'apps/web/node_modules'),path.join(scratch,'node_modules'));
 await writeFile(path.join(scratch,'index.html'),'<html><body><div id="root"></div><script type="module" src="/check.tsx"></script></body></html>');
 await writeFile(path.join(scratch,'check.tsx'),`import React from 'react';import{createRoot}from'react-dom/client';import App from ${JSON.stringify(urlOf('apps/web/src/App.tsx'))};createRoot(document.getElementById('root')).render(<App/>);`);
 await writeFile(path.join(scratch,'vite.config.mjs'),`import{defineConfig}from ${JSON.stringify(path.join(repo,'apps/web/node_modules/vite/dist/node/index.js'))};import react from'@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch,repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
 server=spawn(process.execPath,[path.join(repo,'apps/web/node_modules/vite/bin/vite.js'),'--config',path.join(scratch,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(Error(log)),15000);const read=c=>{log+=c.toString().replace(/\x1b\[[0-9;]*m/g,'');const found=log.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}};server.stdout.on('data',read);server.stderr.on('data',read);});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));

 // Song A's file stops arriving twenty seconds in, and never comes back (even when SynAmp asks again):
 // exactly the "it says Playing but nothing plays" case.
 await page.setRequestInterception(true);
 let firstA = true;
 page.on('request', async req => {
  if (!req.url().includes('/tracks/a/stream')) { req.continue().catch(() => {}); return; }
  if (!firstA) return; // hang
  firstA = false;
  const upstream = await fetch(req.url().replace(url.replace(/\/$/, ''), api), { headers: { range: `bytes=0-${44 + rate * 2 * 20 - 1}` } });
  const bytes = Buffer.from(await upstream.arrayBuffer());
  req.respond({ status: 206, headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes 0-${bytes.length - 1}/${wav.length}` }, body: bytes }).catch(() => {});
 });
 await page.goto(url + '#/library/artist/Fixture%20Artist', { waitUntil: 'domcontentloaded' });
 await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('All songs (')), { timeout: 15000 });
 await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('All songs (')).click());
 await page.waitForFunction(() => document.querySelector('#artist-songs')?.textContent.includes('Song A'), { timeout: 15000 });
 await page.evaluate(() => [...document.querySelectorAll('#artist-songs .tracklist__play')].find(b => b.textContent.includes('Song A')).click());
 await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Song A' && window.__synampEngine?.isPlaying() && window.__synampEngine.position() > 1, { timeout: 15000 });
 const stuckAt = Date.now();
 // Within about half a minute: SynAmp says Song A wouldn't play and moves on to Song B, which plays.
 await page.waitForFunction(() => document.querySelector('.player__title')?.textContent === 'Song B' && window.__synampEngine?.isPlaying() && window.__synampEngine.position() > 1, { timeout: 60000 });
 const waited = Math.round((Date.now() - stuckAt) / 1000);
 const status = await page.evaluate(() => document.querySelector('.song-controls__status')?.textContent ?? '');
 assert.match(status, /“Song A” wouldn’t play: .*Skipped to the next song\./, status);
 const role = await page.evaluate(() => document.querySelector('.song-controls__status')?.getAttribute('role'));
 assert.equal(role, 'status', 'the message is announced to screen readers');
 const log = await readFile(path.join(scratch, 'data/events.jsonl'), 'utf8');
 assert.ok(log.split('\n').some(line => line.includes('"playback_error"') && line.includes('"track_id":"a"')), 'the brain logged the error');
 assert.deepEqual(errors, []);
 console.log(JSON.stringify({ passed: ['stuck song is reported and skipped', 'next song plays', 'message is a status', 'brain logged playback_error'], waited, status }, null, 2));
} catch (error) { console.error(brainLog.slice(-1500)); try { console.error(await (await browser?.pages())?.[1]?.evaluate(() => JSON.stringify({ title: document.querySelector('.player__title')?.textContent, status: document.querySelector('.song-controls__status')?.textContent, playing: window.__synampEngine?.isPlaying(), id: window.__synampEngine?.currentId(), pos: window.__synampEngine?.position(), songs: document.querySelector('#artist-songs')?.textContent?.slice(0, 200) }))); } catch {} throw error;
} finally {
 await browser?.close(); server?.kill(); brain.kill(); await rm(scratch, { recursive: true, force: true });
}

// Real App Library -> Brain queue -> Player, with generated WAV audio.
// All stores/files live under a temporary directory; never touches the owner's library.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(repo, 'package.json'));
const puppeteer = require('puppeteer');
const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'synamp-library-playback-')));
const output = path.resolve(process.argv[2] || '/tmp/synamp-library-playback-evidence');
await mkdir(output, { recursive: true });
const portServer = createServer();
await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
const port = portServer.address().port;
await new Promise(resolve => portServer.close(resolve));
const api = `http://127.0.0.1:${port}`;
const samples = 44100 * 30;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(2000 * Math.sin(2 * Math.PI * 220 * i / 44100)), 44 + i * 2);
const tracks = ['a', 'b', 'c', 'd', 'piano'].map((id, i) => ({ id, title: `Song ${id.toUpperCase()}`, artist: i < 2 ? 'Fixture Artist' : 'Other Artist', path: `${i < 2 ? "First" : "Other"}/Album/${id}.wav`, embedding: id === 'a' ? [1, 0] : id === 'c' ? [1, .05] : id === 'piano' ? [1, .001] : [.5, .8 + i / 10], signals: { 'instruments.piano': id === 'piano' ? .9 : 0 } }));
for (const track of tracks) {await mkdir(path.dirname(path.join(scratch,track.path)),{recursive:true});await writeFile(path.join(scratch, track.path), wav);}
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
 await page.goto(url+'#/library/artist/Fixture%20Artist',{waitUntil:'networkidle0'});
 
 const all=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('All songs (')));assert.ok(all.asElement(),'artist songs button');await all.asElement().click();
 await page.evaluate(()=>{location.hash='#/library/artist/Other%20Artist';});
 await page.waitForFunction(()=>document.querySelector('#artist-songs')?.textContent.includes('Song C'));
 await page.click('#artist-songs .tracklist__play');
 await page.waitForFunction(()=>document.querySelector('.player__title')?.textContent==='Song C');
 await page.waitForFunction(()=>window.__synampEngine?.isPlaying() && window.__synampEngine?.position() > .5);
 const result=await page.evaluate(()=>({engineCreated:!!window.__synampEngine,playing:window.__synampEngine?.isPlaying()??false,position:window.__synampEngine?.position()??0,status:document.querySelector('.browse__status')?.textContent,player:document.querySelector('.player')?.textContent}));
 
 // Queue responses are deliberately delayed: audio must unlock during the click.
 await page.setRequestInterception(true);
 page.on('request',req=>{if(req.url().includes('/session/queue'))setTimeout(()=>req.continue().catch(()=>{}),500);else req.continue();});
 // Pause, then choose a song under the other artist. A Play action must resume.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('synamp:player-command',{detail:'toggle'})));
 await page.waitForFunction(()=>!window.__synampEngine.isPlaying());
 await page.evaluate(()=>{location.hash='#/library/artist/Fixture%20Artist';});
 await page.waitForFunction(()=>document.querySelector('#artist-songs')?.textContent.includes('Song A'));
 await page.click('#artist-songs .tracklist__play');
 await page.waitForFunction(()=>document.querySelector('.player__title')?.textContent==='Song A' && window.__synampEngine?.isPlaying() && window.__synampEngine.position()>.5);
 // Verify the engine outputs the generated waveform, beyond queue/playing flags.
 const rms=await page.evaluate(async()=>{const output=window.__synampEngine.output();const analyser=output.context.createAnalyser();output.connect(analyser);await new Promise(r=>setTimeout(r,100));const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);output.disconnect(analyser);return Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length);});
 assert.ok(rms>.001,`audio output RMS ${rms}`);
 // An active player also switches to the clicked song without a second Play.
 await page.evaluate(()=>{location.hash='#/library/artist/Other%20Artist';});
 await page.waitForFunction(()=>document.querySelector('#artist-songs')?.textContent.includes('Song C'));
 await page.click('#artist-songs .tracklist__play');
 await page.waitForFunction(()=>document.querySelector('.player__title')?.textContent==='Song C' && window.__synampEngine?.isPlaying() && window.__synampEngine.position()>.5);
 // Pause remains paused across unrelated renders/navigation.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('synamp:player-command',{detail:'toggle'})));
 await page.waitForFunction(()=>!window.__synampEngine.isPlaying());
 await page.evaluate(()=>{location.hash='#/library/artist/Fixture%20Artist';});
 await page.waitForFunction(()=>document.querySelector('#artist-songs')?.textContent.includes('Song A'));
 assert.equal(await page.evaluate(()=>window.__synampEngine.isPlaying()),false);
 // Restoring an existing queue on load doesn't count as an explicit Play click.
 await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.evaluate(()=>!!window.__synampEngine),false);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:['first Library song click starts audio after switching artists','Library click resumes paused playback','actual generated waveform output','switch artist while playing','navigation preserves pause','reload restores queue without autoplay'],rms,errors},null,2));

 await writeFile(path.join(output,'results.json'),JSON.stringify({result,rms,errors,limitations:'Isolated App/Brain with generated WAV audio. No NAS deployment or owner audio playback.'},null,2));
 assert.equal(result.playing,true,'Library song click starts sound');assert.equal(result.engineCreated,true,'Library play creates the audio engine');
}catch(error){console.error(brainLog.slice(-2000));throw error;}finally{await browser?.close();server?.kill('SIGTERM');brain.kill('SIGTERM');await rm(scratch,{recursive:true,force:true});}

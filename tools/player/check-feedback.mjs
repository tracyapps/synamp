// "Send feedback": the real Feedback screen against the Brain API.
// Checks that names stay out until asked for, that the copied report is exactly the
// one shown, that it still works with the server stopped, and that it fits a phone.
// Scratch metadata only; no audio or owner files.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, realpath, symlink, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(repo,'package.json'));
const puppeteer=require('puppeteer');
const scratch=await realpath(await mkdtemp(path.join(tmpdir(),'synamp-feedback-')));
const output=path.resolve(process.argv[2]||'/tmp/synamp-feedback-evidence');
await mkdir(output,{recursive:true});
const free=async()=>{const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));return port;};
const port=await free();
const api=`http://127.0.0.1:${port}`;
const music=path.join(scratch,'music');
await mkdir(music,{recursive:true});
const song=(id,artist)=>({id,title:`Song ${id}`,artist,album:`${artist} album`,path:`${artist}/${artist} album/${id}.flac`,stages_done:['identity','dsp_core'],signals:{}});
await writeFile(path.join(scratch,'library.json'),JSON.stringify({format:'synamp.library-signals/1',tracks:[song('a1','Secret Band'),song('a2','Secret Band'),song('b1','Other Act')]}));
const startBrain=()=>{
 const child=spawn(process.execPath,['--experimental-strip-types','src/index.ts'],{cwd:path.join(repo,'apps/brain'),env:{...process.env,BRAIN_PORT:String(port),BRAIN_HOST:'127.0.0.1',LIBRARY_PATH:music,LIBRARY_SIGNALS_PATH:path.join(scratch,'library.json'),PLAYLIST_DATA_PATH:path.join(scratch,'data/playlists.json'),EVENTS_PATH:path.join(scratch,'data/events.jsonl'),SESSION_PATH:path.join(scratch,'data/session.json'),PLAYLIST_API_TOKEN:'',CORE_URL:'http://127.0.0.1:1',SOURCE_PATH:'',INCOMING_PATH:'',SUPPORT_EMAIL:'feedback@example.org',UPDATE_CHECKS:'off'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',c=>log+=c);child.stderr.on('data',c=>log+=c);
 return child;
};
let log='',server,browser;
let brain=startBrain();
const call=async(route,body)=>{const r=await fetch(`${api}/api/v1${route}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
try{
 for(let i=0;i<100;i++){try{if((await fetch(`${api}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 // The Mac reports one song it couldn't read, by name, from a machine with a personal name.
 const reported=await call('/analysis/progress',{format:'synamp.analysis-progress/1',state:'analyzing',host:'Tapps-MacBook-Pro',analyzer_version:'t',catalog:{tracks:3,present:3,missing:0},queue:{pending:1,running:0,done:2,failed:1},stage_order:['identity','dsp_core'],stages:{identity:3,dsp_core:2},fully_analysed:2,analysed_once:2,
  recent_failures:[{path:'/Volumes/music/library/Secret Band/Secret Band album/a2.flac',error:"can't decode 'a2.flac'",attempts:3}],run:{completed:2,failed:1,reused:0,remaining:1,current:'',rate_per_minute:null,eta_seconds:null}});
 assert.ok(reported.status<300);
 await symlink(path.join(repo,'apps/web/node_modules'),path.join(scratch,'node_modules'));
 const moduleUrl=file=>`/@fs${path.join(repo,file)}`;
 await writeFile(path.join(scratch,'index.html'),'<html lang="en"><head><title>check</title></head><body><main><h1>Send feedback</h1><div id="root"></div></main><script type="module" src="/check.tsx"></script></body></html>');
 await writeFile(path.join(scratch,'check.tsx'),`
import React from 'react'; import {createRoot} from 'react-dom/client';
import Feedback from ${JSON.stringify(moduleUrl('apps/web/src/Feedback.tsx'))};
import {makeApi} from ${JSON.stringify(moduleUrl('apps/web/src/api.ts'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/tokens.css'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/ui.css'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/app.css'))};
createRoot(document.getElementById('root')).render(<Feedback request={makeApi('').call} cameFrom="Library"/>);`);
 await writeFile(path.join(scratch,'vite.config.mjs'),`import {defineConfig} from ${JSON.stringify(path.join(repo,'apps/web/node_modules/vite/dist/node/index.js'))};import react from '@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch,repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
 server=spawn(process.execPath,[path.join(repo,'apps/web/node_modules/vite/bin/vite.js'),'--config',path.join(scratch,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let lines='';const timer=setTimeout(()=>reject(Error(lines)),15000);const read=c=>{lines+=c.toString().replace(/\x1b\[[0-9;]*m/g,'');const found=lines.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}};server.stdout.on('data',read);server.stderr.on('data',read);});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox'],...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 await browser.defaultBrowserContext().overridePermissions(new URL(url).origin,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1250,height:900});await page.goto(url,{waitUntil:'networkidle0'});
 const preview=()=>page.$eval('.feedback__text',el=>el.textContent);
 const clickText=async(selector,text)=>{const h=await page.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(b=>b.textContent.trim().startsWith(t)),selector,text);assert.ok(h.asElement(),text);await h.asElement().click();};
 await page.waitForFunction(()=>document.querySelector('.feedback__send a')?.textContent.includes('feedback@example.org'));

 // Write a note by keyboard: label → textarea.
 await page.focus('textarea');await page.keyboard.type('No sound after pressing play');
 await clickText('summary','Read exactly');
 let text=await preview();
 assert.match(text,/^SynAmp feedback: Something went wrong\n\nNo sound after pressing play\n/);
 assert.match(text,/3 songs, 2 artists, 2 albums/);
 assert.match(text,/Songs that couldn't be read lately: 1\n {2}- can't decode '…'/);
 assert.match(text,/Came from: the Library screen/);
 assert.match(text,/song and folder names left out/);
 assert.doesNotMatch(text,/Secret Band|Tapps|a2\.flac/,'names stay out until asked for');
 const href=await page.$eval('.feedback__send a',a=>a.getAttribute('href'));
 assert.match(href,/^mailto:feedback@example\.org\?subject=SynAmp%3A%20Something%20went%20wrong%20%E2%80%94%20No%20sound/);
 await page.screenshot({path:path.join(output,'names-out.png'),fullPage:true});

 // Ask for names: the failing song and the Mac's name appear.
 await clickText('label','Include song and folder names');
 await page.waitForFunction(()=>document.querySelector('.feedback__text').textContent.includes('Secret Band'));
 text=await preview();
 assert.match(text,/on Tapps-MacBook-Pro/);
 assert.match(text,/song and folder names included/);

 // Untick the install details: they go, the note stays.
 await clickText('label','About this install');
 text=await preview();
 assert.doesNotMatch(text,/Secret Band|This install/);
 assert.match(text,/No sound after pressing play/);
 await clickText('label','About this install');

 // Copy: the clipboard holds exactly what's shown.
 await clickText('button','Copy the report');
 await page.waitForFunction(()=>document.body.textContent.includes('Copied.'));
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await preview());

 // Other kinds: problem-only questions come and go; arrow keys move between kinds.
 assert.equal(await page.$$eval('textarea',a=>a.length),3);
 await page.focus('input[type=radio][value=problem]');await page.keyboard.press('ArrowDown');
 assert.equal(await page.$eval('input[type=radio]:checked',r=>r.value),'confusing');
 assert.equal(await page.$$eval('textarea',a=>a.length),1);

 // The server stops: the note is still there, and copying, saving and the address still work.
 brain.kill();await new Promise(r=>brain.once('exit',r));
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('didn’t answer'));
 assert.equal(await page.$eval('textarea',t=>t.value),'No sound after pressing play','the draft survives a reload');
 await clickText('summary','Read exactly');
 assert.match(await preview(),/The SynAmp server couldn’t be asked/);
 assert.match(await page.$eval('.feedback__send a',a=>a.getAttribute('href')),/^mailto:feedback@example\.org/,'remembered address');
 await page.screenshot({path:path.join(output,'server-down.png'),fullPage:true});

 // Start a new note clears it and puts the cursor back in the note.
 await clickText('button','Start a new note');
 assert.equal(await page.$eval('textarea',t=>t.value),'');
 assert.equal(await page.evaluate(()=>document.activeElement?.tagName),'TEXTAREA');

 // Phone width: nothing scrolls sideways, buttons are at least 44px tall (or 36 for small).
 await page.setViewport({width:360,height:780});await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'no sideways scroll at phone width');
 const small=await page.$$eval('.feedback .btn',b=>b.map(x=>x.getBoundingClientRect().height).filter(h=>h<36));
 assert.deepEqual(small,[]);
 await page.screenshot({path:path.join(output,'phone.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log(`ok - send feedback: names out until asked, exact copy, server down, phone width (evidence in ${output})`);
}catch(error){console.error(log.slice(-3000));throw error;}
finally{await browser?.close();server?.kill();brain.kill();}

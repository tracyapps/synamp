// "Listen to these first": real Library + Library health components against the Brain API.
// Scratch metadata only; the Mac worker is played by fetch calls, no audio or owner files.
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
const scratch=await realpath(await mkdtemp(path.join(tmpdir(),'synamp-first-')));
const output=path.resolve(process.argv[2]||'/tmp/synamp-first-picks-evidence');
await mkdir(output,{recursive:true});
const net=createServer(); await new Promise(r=>net.listen(0,'127.0.0.1',r));
const port=net.address().port; await new Promise(r=>net.close(r));
const api=`http://127.0.0.1:${port}`;
const song=(id,artist,stages=[])=>({id,title:`Song ${id}`,artist,album:`${artist} album`,path:`${artist}/${artist} album/${id}.flac`,stages_done:stages,signals:{}});
const tracks=[song('a1','Aster'),song('a2','Aster'),song('b1','Birch',['identity','dsp_core','voice']),song('c1','Cedar'),song('c2','Cedar')];
const write=list=>writeFile(path.join(scratch,'library.json'),JSON.stringify({format:'synamp.library-signals/1',tracks:list}));
await write(tracks);
const brain=spawn(process.execPath,['--experimental-strip-types','src/index.ts'],{cwd:path.join(repo,'apps/brain'),env:{...process.env,BRAIN_PORT:String(port),BRAIN_HOST:'127.0.0.1',LIBRARY_PATH:scratch,LIBRARY_SIGNALS_PATH:path.join(scratch,'library.json'),PLAYLIST_DATA_PATH:path.join(scratch,'data/playlists.json'),EVENTS_PATH:path.join(scratch,'data/events.jsonl'),SESSION_PATH:path.join(scratch,'data/session.json'),PLAYLIST_API_TOKEN:'',CORE_URL:'http://127.0.0.1:1',SOURCE_PATH:'',INCOMING_PATH:''},stdio:['ignore','pipe','pipe']});
let log='';brain.stdout.on('data',c=>log+=c);brain.stderr.on('data',c=>log+=c);
let server,browser;
const call=async(route,body)=>{const r=await fetch(`${api}/api/v1${route}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
const report=(done)=>call('/analysis/progress',{format:'synamp.analysis-progress/1',state:'analyzing',host:'Fixture-Mac',analyzer_version:'t',catalog:{tracks:5,present:5,missing:0},queue:{pending:5-done,running:0,done,failed:0},stage_order:['identity','dsp_core','voice'],stages:{identity:done,dsp_core:done,voice:done},fully_analysed:done,analysed_once:done,run:{completed:done,failed:0,reused:0,remaining:5-done,current:'',rate_per_minute:null,eta_seconds:null}});
try{
 for(let i=0;i<100;i++){try{if((await fetch(`${api}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await report(1)).status<300,true);
 const hello=await call('/analyzer/claim',{worker:{host:'Fixture-Mac.local',library_path:'/Volumes/music/library'}});
 assert.equal(hello.data.first,undefined,'no picks yet');
 await symlink(path.join(repo,'apps/web/node_modules'),path.join(scratch,'node_modules'));
 const moduleUrl=file=>`/@fs${path.join(repo,file)}`;
 await writeFile(path.join(scratch,'index.html'),'<html lang="en"><head><title>check</title></head><body><main><div id="root"></div></main><script type="module" src="/check.tsx"></script></body></html>');
 await writeFile(path.join(scratch,'check.tsx'),`
import React from 'react'; import {createRoot} from 'react-dom/client';
import Explorer from ${JSON.stringify(moduleUrl('apps/web/src/LibraryExplorer.tsx'))};
import LibraryHealth from ${JSON.stringify(moduleUrl('apps/web/src/LibraryHealth.tsx'))};
import {makeApi} from ${JSON.stringify(moduleUrl('apps/web/src/api.ts'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/tokens.css'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/ui.css'))};
const request=makeApi('').call,play=async()=>{};
createRoot(document.getElementById('root')).render(<><LibraryHealth request={request}/><Explorer request={request} play={play} playlists={[]}/></>);`);
 await writeFile(path.join(scratch,'vite.config.mjs'),`import {defineConfig} from ${JSON.stringify(path.join(repo,'apps/web/node_modules/vite/dist/node/index.js'))};import react from '@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch,repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
 server=spawn(process.execPath,[path.join(repo,'apps/web/node_modules/vite/bin/vite.js'),'--config',path.join(scratch,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let lines='';const timer=setTimeout(()=>reject(Error(lines)),15000);const read=c=>{lines+=c.toString().replace(/\x1b\[[0-9;]*m/g,'');const found=lines.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}};server.stdout.on('data',read);server.stderr.on('data',read);});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1250,height:900});await page.goto(url,{waitUntil:'networkidle0'});
 const click=async(text)=>{const h=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t),text);assert.ok(h.asElement(),text);await h.asElement().click();};
 await page.waitForFunction(()=>document.body.textContent.includes('Want a first playlist sooner?'));
 await click('Songs');
 await page.waitForFunction(()=>[...document.querySelectorAll('input[type=checkbox]')].some(b=>b.getAttribute('aria-label')==='Select Song a1'));
 for(const id of ['a1','c2']) await page.click(`input[aria-label="Select Song ${id}"]`);
 await page.waitForFunction(()=>document.querySelector('.selection-bar__count')?.textContent.includes('2 songs'));
 await click('More');
 await click('Listen to these first');
 await page.waitForFunction(()=>document.body.textContent.includes('2 songs will be listened to first; analysis is starting.'));
 const view=(await call('/analyzer')).data;
 assert.deepEqual({count:view.first.count,listened:view.first.listened,gone:view.first.gone},{count:2,listened:0,gone:0});
 assert.equal(view.queued[0]?.action,'analyze','analysis was asked for');
 const claim=await call('/analyzer/claim',{worker:{host:'Fixture-Mac.local',library_path:'/Volumes/music/library',first_rev:0}});
 assert.deepEqual(claim.data.first.paths,['Aster/Aster album/a1.flac','Cedar/Cedar album/c2.flac'],'the worker gets the picks');
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('Your picked songs: 0 of 2 listened to'));
 await page.screenshot({path:path.join(output,'picks-waiting.png'),fullPage:true});
 // The Mac finishes one, then both, and sends a new library list.
 await write(tracks.map(t=>t.id==='a1'?{...t,stages_done:['identity','dsp_core','voice']}:t));
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('Your picked songs: 1 of 2 listened to'));
 const bar=await page.$eval('.health__first-bar',el=>({value:el.value,max:el.max,label:el.getAttribute('aria-label')}));
 assert.deepEqual(bar,{value:1,max:2,label:'Your picked songs: 1 of 2 listened to'});
 await write(tracks.map(t=>['a1','c2'].includes(t.id)?{...t,stages_done:['identity','dsp_core','voice']}:t));
 await page.reload({waitUntil:'networkidle0'});
 await page.waitForFunction(()=>document.body.textContent.includes('All 2 of your picked songs are listened to.'));
 assert.equal(await page.$eval('.health__first a',a=>a.getAttribute('href')),'#/playlists');
 await page.screenshot({path:path.join(output,'picks-ready.png'),fullPage:true});
 // Keyboard: the Forget button is reachable and works.
 await page.focus('.health__first button');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.body.textContent.includes('Forgot your picks.'));
 assert.equal((await call('/analyzer')).data.first,null);
 // Narrow screen: nothing scrolls sideways.
 await page.setViewport({width:390,height:844});await page.reload({waitUntil:'networkidle0'});
 const sideways=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 assert.equal(sideways,false,'no sideways scroll at phone width');
 assert.deepEqual(errors,[]);
 console.log(`ok - listen to these first: pick, worker hand-off, progress, ready, forget (evidence in ${output})`);
}catch(error){console.error(log.slice(-3000));throw error;}
finally{await browser?.close();server?.kill();brain.kill();}

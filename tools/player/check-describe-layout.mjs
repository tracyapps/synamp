// Describe → Preview: the playlist preview always sits in the wide column, beside "What I understood".
// Real Describe component + Brain API on scratch metadata.
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
const scratch=await realpath(await mkdtemp(path.join(tmpdir(),'synamp-describe-')));
const output=path.resolve(process.argv[2]||'/tmp/synamp-describe-layout-evidence');
await mkdir(output,{recursive:true});
const net=createServer(); await new Promise(r=>net.listen(0,'127.0.0.1',r));
const port=net.address().port; await new Promise(r=>net.close(r));
const api=`http://127.0.0.1:${port}`;
const tracks=Array.from({length:12},(_,i)=>({id:`t${i}`,title:`Quiet ${i}`,artist:`Artist ${i%3}`,album:'Album',path:`A${i%3}/Album/${i}.flac`,stages_done:['identity','dsp_core','voice'],
  signals:{vocal_fraction:i<8?0.02:0.6,instrumental:i<8?0.95:0.1,bpm:90+i,pulse_clarity:0.6,pulse_steadiness:0.7,loudness_lufs:-14,'instruments.piano':0.05}}));
await writeFile(path.join(scratch,'library.json'),JSON.stringify({format:'synamp.library-signals/1',tracks}));
const brain=spawn(process.execPath,['--experimental-strip-types','src/index.ts'],{cwd:path.join(repo,'apps/brain'),env:{...process.env,BRAIN_PORT:String(port),BRAIN_HOST:'127.0.0.1',LIBRARY_PATH:scratch,LIBRARY_SIGNALS_PATH:path.join(scratch,'library.json'),PLAYLIST_DATA_PATH:path.join(scratch,'data/playlists.json'),EVENTS_PATH:path.join(scratch,'data/events.jsonl'),SESSION_PATH:path.join(scratch,'data/session.json'),PLAYLIST_API_TOKEN:'',CORE_URL:'http://127.0.0.1:1',SOURCE_PATH:'',INCOMING_PATH:''},stdio:['ignore','pipe','pipe']});
let log='';brain.stdout.on('data',c=>log+=c);brain.stderr.on('data',c=>log+=c);
let server,browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`${api}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await symlink(path.join(repo,'apps/web/node_modules'),path.join(scratch,'node_modules'));
 const moduleUrl=file=>`/@fs${path.join(repo,file)}`;
 await writeFile(path.join(scratch,'index.html'),'<html lang="en"><head><title>check</title></head><body><main><div id="root"></div></main><script type="module" src="/check.tsx"></script></body></html>');
 await writeFile(path.join(scratch,'check.tsx'),`
import React from 'react'; import {createRoot} from 'react-dom/client';
import Describe from ${JSON.stringify(moduleUrl('apps/web/src/Describe.tsx'))};
import {makeApi} from ${JSON.stringify(moduleUrl('apps/web/src/api.ts'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/tokens.css'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/ui.css'))};
createRoot(document.getElementById('root')).render(<Describe request={makeApi('').call} onSaved={()=>{}}/>);`);
 await writeFile(path.join(scratch,'vite.config.mjs'),`import {defineConfig} from ${JSON.stringify(path.join(repo,'apps/web/node_modules/vite/dist/node/index.js'))};import react from '@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch,repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
 server=spawn(process.execPath,[path.join(repo,'apps/web/node_modules/vite/bin/vite.js'),'--config',path.join(scratch,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let lines='';const timer=setTimeout(()=>reject(Error(lines)),15000);const read=c=>{lines+=c.toString().replace(/\x1b\[[0-9;]*m/g,'');const found=lines.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}};server.stdout.on('data',read);server.stderr.on('data',read);});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1400,height:1000});await page.goto(url,{waitUntil:'networkidle0'});
 await page.type('textarea','I need to focus. no words');
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Preview').click());
 await page.waitForSelector('.smart-result');
 await page.waitForSelector('.describe__review-hint');
 const box=await page.evaluate(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {understood:r('.describe__understood'),result:r('.smart-result'),hint:r('.describe__review-hint')};});
 await page.screenshot({path:path.join(output,'describe-wide.png'),fullPage:true});
 assert.ok(box.result.left>=box.understood.right,`the preview sits in the wide column (result left ${box.result.left}, understood right ${box.understood.right})`);
 assert.ok(box.result.top<box.understood.bottom,'side by side, not below');
 assert.ok(Math.abs(box.hint.left-box.result.left)<2,'the hint sits above the preview in the same column');
 // Narrow: one column, preview after what was understood.
 await page.setViewport({width:390,height:900});
 const narrow=await page.evaluate(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,bottom:b.bottom};};return {understood:r('.describe__understood'),result:r('.smart-result'),wide:document.documentElement.scrollWidth>innerWidth+1};});
 assert.ok(narrow.result.top>=narrow.understood.bottom,'stacked on a phone');
 assert.equal(narrow.wide,false,'no sideways scroll on a phone');
 assert.deepEqual(errors,[]);
 console.log(`ok - describe preview stays in the wide column (evidence in ${output})`);
}catch(error){console.error(log.slice(-3000));throw error;}
finally{await browser?.close();server?.kill();brain.kill();}

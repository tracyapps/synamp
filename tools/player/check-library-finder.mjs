// Real Library components + Brain API; scratch metadata only, no owner files or Finder windows.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(repo,'package.json'));
const puppeteer=require('puppeteer');
const scratch=await realpath(await mkdtemp(path.join(tmpdir(),'synamp-finder-')));
const output=path.resolve(process.argv[2]||'/tmp/synamp-library-finder-evidence');
await mkdir(output,{recursive:true});
const net=createServer(); await new Promise(r=>net.listen(0,'127.0.0.1',r));
const port=net.address().port; await new Promise(r=>net.close(r));
const api=`http://127.0.0.1:${port}`;
const relative="Artist/Album/01 - words ' & $(nothing).flac";
const track={id:'fixture-song',title:'Finder song',artist:'Artist',album:'Album',path:relative,signals:{}};
await writeFile(path.join(scratch,'library.json'),JSON.stringify({tracks:[track]}));
const brain=spawn(process.execPath,['--experimental-strip-types','src/index.ts'],{cwd:path.join(repo,'apps/brain'),env:{...process.env,BRAIN_PORT:String(port),BRAIN_HOST:'127.0.0.1',LIBRARY_PATH:scratch,LIBRARY_SIGNALS_PATH:path.join(scratch,'library.json'),PLAYLIST_DATA_PATH:path.join(scratch,'data/playlists.json'),EVENTS_PATH:path.join(scratch,'data/events.jsonl'),SESSION_PATH:path.join(scratch,'data/session.json'),PLAYLIST_API_TOKEN:'',CORE_URL:'http://127.0.0.1:1',SOURCE_PATH:'',INCOMING_PATH:''},stdio:['ignore','pipe','pipe']});
let log='';brain.stdout.on('data',c=>log+=c);brain.stderr.on('data',c=>log+=c);
let server,browser;
async function call(route,body){const r=await fetch(`${api}/api/v1${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 for(let i=0;i<100;i++){try{if((await fetch(`${api}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await call('/analyzer/reveal',{track_id:track.id})).status,409);
 assert.equal((await call('/analyzer/reveal',{track_id:'absent',path:'/etc'})).status,404);
 await call('/analyzer/claim',{worker:{host:'Fixture-Mac.local',library_path:'/Volumes/music/library'}});
 await symlink(path.join(repo,'apps/web/node_modules'),path.join(scratch,'node_modules'));
 const moduleUrl=file=>`/@fs${path.join(repo,file)}`;
 await writeFile(path.join(scratch,'index.html'),'<html><body><div id="root"></div><script type="module" src="/check.tsx"></script></body></html>');
 await writeFile(path.join(scratch,'check.tsx'),`
import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
import Explorer from ${JSON.stringify(moduleUrl('apps/web/src/LibraryExplorer.tsx'))};
import {AlbumSongs} from ${JSON.stringify(moduleUrl('apps/web/src/LibraryParts.tsx'))};
import {ArtistPage} from ${JSON.stringify(moduleUrl('apps/web/src/LibraryPages.tsx'))};
import {makeApi} from ${JSON.stringify(moduleUrl('apps/web/src/api.ts'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/tokens.css'))};
import ${JSON.stringify(moduleUrl('apps/web/src/styles/ui.css'))};
const request=makeApi('').call,play=async()=>{};
function Check(){const [view,setView]=useState('explorer'),[note,say]=useState(''); return <><button onClick={()=>setView('album')}>Album test</button><button onClick={()=>setView('artist')}>Artist test</button>{view==='explorer'?<Explorer request={request} play={play} playlists={[]}/>:view==='album'?<><AlbumSongs album={{key:'Artist/Album',title:'Album',artist:'Artist',tracks:1}} request={request} play={play} playlists={[]} say={say}/><p role="status">{note}</p></>:<ArtistPage name="Artist" request={request} play={play} playlists={[]}/>}</>};createRoot(document.getElementById('root')).render(<Check/>);`);
 await writeFile(path.join(scratch,'vite.config.mjs'),`import {defineConfig} from ${JSON.stringify(path.join(repo,'apps/web/node_modules/vite/dist/node/index.js'))};import react from '@vitejs/plugin-react';export default defineConfig({root:${JSON.stringify(scratch)},plugins:[react()],server:{host:'127.0.0.1',port:0,fs:{allow:${JSON.stringify([scratch,repo])}},proxy:{'/api':${JSON.stringify(api)}}}});`);
 server=spawn(process.execPath,[path.join(repo,'apps/web/node_modules/vite/bin/vite.js'),'--config',path.join(scratch,'vite.config.mjs')],{stdio:['ignore','pipe','pipe']});
 const url=await new Promise((resolve,reject)=>{let lines='';const timer=setTimeout(()=>reject(Error(lines)),15000);const read=c=>{lines+=c.toString().replace(/\x1b\[[0-9;]*m/g,'');const found=lines.match(/http:\/\/127\.0\.0\.1:\d+\//);if(found){clearTimeout(timer);resolve(found[0]);}};server.stdout.on('data',read);server.stderr.on('data',read);});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1250,height:850});await page.goto(url,{waitUntil:'networkidle0'});
 const click=async(text)=>{const h=await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t),text);assert.ok(h.asElement(),text);await h.asElement().click();};
 await click('Songs');
 await page.waitForFunction(()=>[...document.querySelectorAll('.browse__results li')].some(r=>r.textContent.includes('Finder song')));
 const row=await page.evaluateHandle(()=>[...document.querySelectorAll('.browse__results li')].find(r=>r.textContent.includes('Finder song')));
 await row.asElement().click({button:'right'});await page.waitForSelector('[role="menu"]');
 await page.screenshot({path:path.join(output,'song-menu.png')});
 await click('Reveal in Finder');
 await page.waitForFunction(()=>document.body.textContent.includes('Finder request sent to Fixture-Mac'));
 assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,[`/Volumes/music/library/${relative}`]);
 assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,[]);
 for(const layout of ['Grid','Table']){
  await click(layout);
  const selector=layout==='Table'?'.browse__table tbody tr':'.album--song';
  await page.waitForSelector(selector);
  const song=await page.evaluateHandle(sel=>[...document.querySelectorAll(sel)].find(el=>el.textContent.includes('Finder song')),selector);
  assert.ok(song.asElement(),`${layout} song row`);
  await song.asElement().click({button:'right'});await click('Reveal in Finder');
  await page.waitForFunction(()=>document.body.textContent.includes('Finder request sent'));
  assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,[`/Volumes/music/library/${relative}`]);
 }
 await click('Album test');await page.waitForSelector('.tracklist li');await page.click('.tracklist li',{button:'right'});await click('Reveal in Finder');
 await page.waitForFunction(()=>document.body.textContent.includes('Finder request sent'));
 assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,[`/Volumes/music/library/${relative}`]);
 await click('Artist test');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('All songs (1)')));
 const all=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('All songs (1)')));await all.asElement().click();
 await page.waitForSelector('#artist-songs li');await page.click('#artist-songs li',{button:'right'});await click('Reveal in Finder');
 await page.waitForFunction(()=>document.body.textContent.includes('Finder request sent'));
 assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,[`/Volumes/music/library/${relative}`]);
 // Updated exports resolve by identity at action time, without a stale client path.
 await writeFile(path.join(scratch,'library.json'),JSON.stringify({tracks:[{...track,path:'Artist/Renamed/01.flac'}]}));
 assert.equal((await call('/analyzer/reveal',{track_id:track.id,path:'/etc'})).status,202);
 assert.deepEqual((await call('/analyzer/reveals',{})).data.paths,['/Volumes/music/library/Artist/Renamed/01.flac']);
 assert.deepEqual(errors,[]);
 await writeFile(path.join(output,'results.json'),JSON.stringify({passed:['offline and missing-song errors','Explorer list/grid/table song right-click','expanded album song right-click','artist song right-click','exact file queue and one-shot delivery','current path after export change'],errors,browser:await browser.version(),limitations:'Scratch metadata and queued worker requests only. No owner server deployment or physical Finder selection.'},null,2));
 console.log(`PASS Library Finder UI/API checks. Evidence: ${output}`);
}catch(error){console.error(log.slice(-2000));throw error;}
finally{await browser?.close();server?.kill('SIGTERM');brain.kill('SIGTERM');await rm(scratch,{recursive:true,force:true});}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = '/Users/tapps/_dev/web-apps/SynAmp';
const data = mkdtempSync(join(tmpdir(),'synamp-fast-brain-ui-'));
const brain = spawn(process.execPath,['--experimental-strip-types',join(root,'apps/brain/src/index.ts')],{env:{...process.env,BRAIN_PORT:'39821',BRAIN_HOST:'127.0.0.1',PLAYLIST_DATA_PATH:join(data,'playlists.json'),EVENTS_PATH:join(data,'events.jsonl'),SESSION_PATH:join(data,'session.json'),LIBRARY_SIGNALS_PATH:'/tmp/synamp-explorer-fixture.json',LIBRARY_PATH:join(data,'music'),INCOMING_PATH:'',SOURCE_PATH:'',CORE_URL:'http://127.0.0.1:1',LASTFM_API_KEY:'',LASTFM_API_SECRET:'',MUSICBRAINZ_CONTACT:'',PLAYLIST_API_TOKEN:''},stdio:['ignore','pipe','pipe']});
brain.stdout.pipe(process.stdout);brain.stderr.pipe(process.stderr);
brain.on('exit',(code)=>{if(code)process.exit(code)});
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/')||path==='/health'){
  const chunks=[];for await (const chunk of req)chunks.push(chunk);
  const response=await fetch('http://127.0.0.1:39821'+req.url,{method:req.method,headers:{'content-type':'application/json'},...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const base=path.startsWith('/docs/')?root:join(root,'apps/web/dist');
 const relative=path==='/'?'index.html':decodeURIComponent(path).replace(/^\//,'');
 let file=resolve(base,relative);if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return}
 let body;try{body=await readFile(file)}catch{if(base===root)throw new Error('missing');file=join(base,'index.html');body=await readFile(file)}
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.md':'text/plain','.pdf':'application/pdf'}[extname(file)]||'application/octet-stream';
 res.writeHead(200,{'content-type':type});res.end(body);
 }catch(e){res.writeHead(404);res.end(String(e))}});
server.listen(39822,'127.0.0.1',()=>console.log('scratch UI http://127.0.0.1:39822 data '+data));
function stop(){brain.kill('SIGTERM');server.close();server.closeAllConnections();setTimeout(()=>process.exit(0),1700).unref()}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

import subprocess
code='''async page => {
 const assert = (value, label) => { if (!value) throw new Error(label); };
 const checks = [];
 await page.goto('http://127.0.0.1:39822/#/library');
 await page.evaluate(() => localStorage.clear()); await page.reload();
 await page.getByRole('searchbox').fill('Bulk');
 await page.locator('.album__title').filter({hasText:/^Bulk album$/}).waitFor();
 const views = page.getByRole('dialog', {name:'Saved Library views'});
 await page.getByRole('button', {name:'Views',exact:true}).click();
 await views.getByRole('textbox', {name:'View name'}).fill('Bulk collection');
 await views.getByRole('button', {name:'Save current view'}).click();
 await views.getByText('View saved.', {exact:true}).waitFor();
 const link = await views.getByRole('textbox', {name:'Link to current view'}).inputValue();
 assert(link.includes('library_view=') && !link.includes('token='), 'safe view link');
 checks.push('Named view saved; link excludes tokens');
 await views.getByRole('button', {name:'Close saved views'}).click();
 await page.getByRole('searchbox').fill('Björk');
 await page.locator('.album__title').filter({hasText:/^Debut$/}).waitFor();
 await page.getByRole('button', {name:'Views',exact:true}).click();
 await views.getByRole('button', {name:'Open',exact:true}).click();
 await page.locator('.album__title').filter({hasText:/^Bulk album$/}).waitFor();
 assert(await page.getByRole('searchbox').inputValue() === 'Bulk', 'named view restores filters');
 await page.goBack();
 await page.locator('.album__title').filter({hasText:/^Debut$/}).waitFor();
 assert(await page.getByRole('searchbox').inputValue() === 'Björk', 'Back restores previous view');
 await page.goForward();
 await page.locator('.album__title').filter({hasText:/^Bulk album$/}).waitFor();
 checks.push('Named view open, Back and Forward restore state');
 await page.goto(link); await page.reload();
 await page.locator('.album__title').filter({hasText:/^Bulk album$/}).waitFor();
 checks.push('Shared link survives reload');
 await page.getByText('Advanced filters', {exact:true}).click();
 await page.getByRole('checkbox', {name:'Albums',exact:true}).uncheck();
 await page.getByRole('checkbox', {name:'Songs',exact:true}).check();
 await page.getByRole('button', {name:'Table',exact:true}).click();
 await page.getByRole('rowheader', {name:'Bulk song 000',exact:true}).waitFor();
 assert(await page.locator('tbody tr').count()===60, '60 rows loaded');
 const previewResponse = page.waitForResponse(r => r.url().includes('/explore/selection') && r.status()===200);
 await page.getByRole('button', {name:'Create playlist',exact:true}).click();
 const preview = await (await previewResponse).json();
 assert(preview.track_count===205 && preview.sample.length===8, 'whole catalog selection');
 const playlist = page.getByRole('dialog', {name:'Playlist from these filters'});
 await playlist.getByText('205 matching songs', {exact:true}).waitFor();
 const playlistName='Filtered 205 browser '+Date.now();
 await playlist.getByRole('textbox', {name:'Playlist name'}).fill(playlistName);
 await page.screenshot({path:'output/playwright/saved-view-preview.png',fullPage:true});
 const createdResponse = page.waitForResponse(r => r.url().endsWith('/explore/playlist') && r.status()===201);
 await playlist.getByRole('button', {name:'Create playlist',exact:true}).click();
 const created = await (await createdResponse).json();
 assert(created.playlist.tracks.length===205 && created.playlist.tracks.at(-1).id==='bulk-204', 'complete snapshot order');
 await page.getByText('Created '+playlistName+' with 205 songs.', {exact:true}).waitFor();
 const retry = await page.request.post('http://127.0.0.1:39822/api/v1/library/explore/playlist',{data:{selection_id:preview.selection_id,name:playlistName}});
 const repeated=await retry.json(); assert(retry.status()===200 && repeated.duplicate && repeated.playlist.id===created.playlist.id,'idempotent confirmation');
 checks.push('60 loaded rows produce exact 205-song manual playlist; retry does not duplicate');
 await page.getByRole('link', {name:'Playlists',exact:true}).click();
 await page.getByRole('button', {name:new RegExp('^'+playlistName)}).waitFor();
 checks.push('Created playlist immediately appears in Playlists');
 return {checks,playlist_id:created.playlist.id,track_count:created.track_count};
}'''
r=subprocess.run(['/Users/tapps/.codex/skills/playwright/scripts/playwright_cli.sh','-s=synamp-views','run-code',code],capture_output=True,text=True)
open('/tmp/synamp-views-browser.log','w').write(r.stdout+r.stderr)
print((r.stdout+r.stderr)[:2500]);raise SystemExit(r.returncode)

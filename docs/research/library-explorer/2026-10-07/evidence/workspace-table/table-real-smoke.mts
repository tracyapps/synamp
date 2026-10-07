import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { explore } from '/Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/library/explore.ts';
const path = '/Volumes/music/.synamp/library-signals.json';
const before = statSync(path), raw = readFileSync(path), after = statSync(path);
assert.equal(before.size, after.size); assert.equal(before.mtimeMs, after.mtimeMs);
const source = JSON.parse(raw.toString());
assert(Array.isArray(source.tracks));
const hash = createHash('sha256').update(raw).digest('hex');
const library = { version: hash, tracks: source.tracks };
const checks = [];
for (const sort of ['title', 'type', 'artist', 'album_artist', 'album', 'year', 'count', 'duration', 'genre']) for (const direction of ['asc','desc']) {
  const options = { types: 'song,album,artist', sort, direction };
  const start = performance.now();
  const first = explore(library, { ...options, limit: '120' });
  const next = explore(library, { ...options, offset: '60', limit: '60' });
  assert.deepEqual(next.rows, first.rows.slice(60,120));
  checks.push({ sort, direction, total: first.total, returned: next.rows.length, twoCallsMs: Math.round(performance.now()-start), pagingConsistent: true });
}
const receipt = { private: true, readOnly: true, retrievedAt: new Date().toISOString(), path, bytes: raw.length, sha256: hash, stableDuringRead: true, tracks: library.tracks.length, checks, limits: 'Single Mac process read-only checks. Timings include two explore calls and assertion; first check includes entity indexing. Excludes browser rendering, network, audio delivery and NAS/device benchmarking.' };
writeFileSync('/Users/tapps/_dev/web-apps/SynAmp/output/playwright/workspace-table/real-library-sort.json', JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({ tracks: receipt.tracks, entities: checks[0].total, sortDirectionChecks: checks.length, pagingConsistent: true }));

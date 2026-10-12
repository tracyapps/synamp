import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { releaseCompose } from './compose.mjs';

const source = readFileSync(new URL('../../deploy/docker-compose.yml', import.meta.url), 'utf8');
const digest = (c) => `sha256:${c.repeat(64)}`;
const images = { brain: `ghcr.io/tracyapps/synamp-brain:0.1.0@${digest('a')}`, web: `ghcr.io/tracyapps/synamp-web:0.1.0@${digest('b')}` };

test('the release compose uses the published images and builds nothing', () => {
  const text = releaseCompose(source, { version: '0.1.0', images });
  const imagesUsed = [...text.matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  assert.equal(imagesUsed.filter((i) => i === images.brain).length, 2, 'brain and librarian share the brain image');
  assert.equal(imagesUsed.filter((i) => i === images.web).length, 1);
  assert.equal(imagesUsed.length, 6, 'db, core and edge keep their pinned images');
  const settings = text.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.doesNotMatch(settings, /build:|pull_policy|\.\.\/apps|SOURCE_PATH/);
  assert.doesNotMatch(text, /synamp-sync|copy the new code/i, 'no NAS-build instructions left in comments');
  assert.match(text, /^# SynAmp 0\.1\.0/);
  // Everything else is unchanged: same settings, mounts and services.
  for (const kept of ['LIBRARIAN_MUSIC_PATH: /share/library', '/data/playlists.json', 'stop_grace_period: 2m', './Caddyfile:/etc/caddy/Caddyfile:ro', 'command: ["node", "--experimental-strip-types", "src/librarian/main.ts"]'])
    assert.ok(text.includes(kept), kept);
});

test('unpinned images or an unfamiliar compose file stop the release', () => {
  assert.throws(() => releaseCompose(source, { version: '0.1.0', images: { ...images, web: 'ghcr.io/tracyapps/synamp-web:latest' } }), /web image/);
  assert.throws(() => releaseCompose(source.replace(/  web:\n    build:/, '  web:\n    image: x'), { version: '0.1.0', images }), /no build block found for web/);
});

test('the release download has what an install needs, and no settings or data', async () => {
  const { mkdtempSync, rmSync, statSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { makeBundle, BUNDLED } = await import('./bundle.mjs');
  const out = mkdtempSync(join(tmpdir(), 'synamp-release-'));
  try {
    const { zip, sha256 } = makeBundle({ version: '0.1.0', images, out });
    const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((n) => n && !n.endsWith('/')).sort();
    assert.deepEqual(listing, [...BUNDLED, 'README.txt', 'deploy/VERSION', 'deploy/docker-compose.yml'].sort());
    assert.ok(!listing.some((n) => /(^|\/)\.env$|data\//.test(n)));
    const unpacked = join(out, 'unpacked');
    execFileSync('unzip', ['-q', zip, '-d', unpacked]);
    assert.equal(statSync(join(unpacked, 'deploy/setup.sh')).mode & 0o111, 0o111, 'setup.sh stays runnable');
    assert.match(readFileSync(join(unpacked, 'deploy/docker-compose.yml'), 'utf8'), /synamp-brain:0\.1\.0@sha256/);
    assert.equal(readFileSync(`${zip}.sha256`, 'utf8'), `${sha256}  synamp-0.1.0.zip\n`);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

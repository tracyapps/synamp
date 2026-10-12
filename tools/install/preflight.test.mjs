import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { parseEnv, preflight } from './preflight.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synamp-preflight-'));
  const share = join(root, 'music'), data = join(root, 'data'), deploy = join(root, 'deploy');
  for (const dir of [deploy, ...['library', 'incoming', '.synamp'].map(p => join(share, p)), ...['postgres', 'navidrome', 'brain', 'librarian', 'caddy', 'caddy-config'].map(p => join(data, p)), join(root, 'apps/brain'), join(root, 'apps/web')]) mkdirSync(dir, { recursive: true });
  for (const p of ['deploy/docker-compose.yml', 'deploy/Caddyfile', 'apps/brain/Dockerfile', 'apps/web/Dockerfile']) writeFileSync(join(root, p), '# fixture\n');
  const envPath = join(deploy, '.env');
  const values = { MUSIC_PATH: join(share, 'library'), MUSIC_SHARE: share, INCOMING_PATH: join(share, 'incoming'), DATA_DIR: data, POSTGRES_PASSWORD: 'private-db-secret-123456789', PLAYLIST_API_TOKEN: 'private-token-123456789012345678901', PUID: '1026', PGID: '100' };
  const save = () => writeFileSync(envPath, Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n'));
  save();
  const calls = [];
  const run = (command, args) => { calls.push([command, ...args]); return { status: 0, stdout: args[0] === 'info' ? 'x86_64\n' : 'ok' }; };
  const report = () => preflight({ envPath, platform: 'linux', arch: 'x64', run });
  return { root, share, data, values, envPath, save, calls, run, report, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('env parser supports literal quoted values and comments, refuses shell and expansion', () => {
  assert.deepEqual(parseEnv('A="hello world" # comment\nB=literal#hash\nC=word # note'), { A: 'hello world', B: 'literal#hash', C: 'word' });
  for (const text of ['export A=x', 'A=x\nA=y', 'A=$(touch /tmp/unsafe)', 'A=${HOME}', 'A=`id`', 'A="unterminated', 'A="value" junk', 'A=one\\two']) assert.throws(() => parseEnv(text));
});

test('valid prerequisites stay read-only, redact values, and run only Docker reads', () => {
  const f = fixture();
  try {
    const before = readFileSync(f.envPath, 'utf8');
    const report = f.report();
    assert.equal(report.ready, true);
    assert.ok(report.pending.includes('backup/restore'));
    assert.equal(readFileSync(f.envPath, 'utf8'), before);
    assert.deepEqual(readdirSync(f.share).sort(), ['.synamp', 'incoming', 'library']);
    for (const value of [f.values.POSTGRES_PASSWORD, f.values.PLAYLIST_API_TOKEN, f.share]) assert.ok(!JSON.stringify(report).includes(value));
    assert.deepEqual(f.calls.map(c => c[1]), ['info', 'compose', 'compose']);
    assert.ok(f.calls.at(-1).includes('--quiet'));
  } finally { f.cleanup(); }
});

test('unsafe layout, example secrets, root UID, overlapping ports and missing state block readiness', () => {
  const f = fixture();
  try {
    f.values.MUSIC_PATH = f.values.INCOMING_PATH;
    f.values.PLAYLIST_API_TOKEN = 'replace-with-a-long-random-token';
    f.values.PUID = '0'; f.values.HTTP_PORT = '4533';
    rmSync(join(f.data, 'brain'), { recursive: true });
    f.save();
    const failures = f.report().checks.filter(c => c.status === 'fail').map(c => c.id);
    for (const id of ['librarian-layout', 'playlist_api_token', 'puid', 'separate-ports', 'state-brain']) assert.ok(failures.includes(id), id);
  } finally { f.cleanup(); }
});

test('resolved symlinks cannot put state or settings inside the music share', () => {
  const f = fixture();
  try {
    symlinkSync(f.share, join(f.root, 'alias'));
    f.values.DATA_DIR = join(f.root, 'alias'); f.save();
    assert.equal(f.report().checks.find(c => c.id === 'state-isolation').status, 'fail');
    writeFileSync(join(f.share, '.env'), readFileSync(f.envPath));
    const report = preflight({ envPath: join(f.share, '.env'), platform: 'linux', arch: 'x64', run: f.run });
    assert.equal(report.checks.find(c => c.id === 'settings-isolation').status, 'fail');
  } finally { f.cleanup(); }
});

test('missing settings, wrong host and Docker failure cannot report ready or leak raw errors', () => {
  const f = fixture();
  try {
    assert.equal(preflight({ envPath: join(f.root, 'absent'), run: f.run }).ready, false);
    const report = preflight({ envPath: f.envPath, platform: 'darwin', arch: 'arm64', run: () => ({ status: 1, stderr: f.values.POSTGRES_PASSWORD }) });
    assert.equal(report.ready, false);
    assert.equal(report.checks.find(c => c.id === 'nas-host').status, 'fail');
    assert.ok(!JSON.stringify(report).includes(f.values.POSTGRES_PASSWORD));
    const remote = preflight({ envPath: f.envPath, platform: 'linux', arch: 'x64', run: () => ({ status: 0, stdout: 'aarch64' }) });
    assert.equal(remote.checks.find(c => c.id === 'docker-daemon').status, 'fail');
  } finally { f.cleanup(); }
});

test('CLI refuses ambiguous paths and missing files with nonzero status', () => {
  for (const args of [[], ['--env', 'relative'], ['--env', '/nonexistent/synamp/.env']]) {
    const result = spawnSync(process.execPath, ['tools/install/preflight.mjs', ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.ok(!(result.stdout + result.stderr).includes('ENOENT'));
  }
});

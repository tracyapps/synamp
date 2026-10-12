import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { backupBrainState, restoreBrainState, verifyBrainState } from './brain-state.mjs';

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'synamp-state-')), source = join(root, 'brain'), out = join(root, 'backup');
  mkdirSync(source); mkdirSync(join(source, 'lyrics'));
  writeFileSync(join(source, 'playlists.json'), '[{"id":"keep","type":"playlist","name":"Keep me","parentId":null,"tracks":[]}]\n');
  writeFileSync(join(source, 'events.jsonl'), '{"event_id":"saved"}\n');
  writeFileSync(join(source, 'lyrics', 'private.txt'), 'private user data\n');
  try { return fn({ root, source, out }); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('offline backup verifies exact bytes and restores only into fresh private state', () => fixture(({ root, source, out }) => {
  const report = backupBrainState({ source, out, stopped: true });
  assert.equal(report.files, 3); assert.equal(report.verified, true);
  assert.equal(statSync(out).mode & 0o777, 0o700);
  assert.equal(statSync(join(out, 'files', 'playlists.json')).mode & 0o777, 0o600);
  const trial = join(root, 'restored');
  assert.equal(restoreBrainState({ backup: out, out: trial }).restored, true);
  for (const name of ['playlists.json', 'events.jsonl', 'lyrics/private.txt']) assert.deepEqual(readFileSync(join(trial, name)), readFileSync(join(source, name)));
  assert.throws(() => restoreBrainState({ backup: out, out: source }), /EEXIST/);
  assert.throws(() => backupBrainState({ source, out, stopped: true }), /EEXIST/);
  assert.equal(JSON.parse(readFileSync(join(source, 'playlists.json')))[0].name, 'Keep me');
}));

test('explicit stop attestation, dedicated source and separate trees are mandatory', () => fixture(({ root, source, out }) => {
  assert.throws(() => backupBrainState({ source, out }), /Stop all/);
  assert.throws(() => backupBrainState({ source, out: join(source, 'backup'), stopped: true }), /separate/);
  assert.throws(() => backupBrainState({ source: '/', out, stopped: true }), /root/);
  const empty = join(root, 'empty'); mkdirSync(empty);
  assert.throws(() => backupBrainState({ source: empty, out, stopped: true }), /recognizable/);
}));

test('tampering, omitted files and extra payload files fail verification before restore', () => fixture(({ root, source, out }) => {
  backupBrainState({ source, out, stopped: true });
  const payload = join(out, 'files', 'playlists.json'), original = readFileSync(payload);
  writeFileSync(payload, 'changed');
  assert.throws(() => restoreBrainState({ backup: out, out: join(root, 'never-created') }), /match/);
  writeFileSync(payload, original);
  writeFileSync(join(out, 'files', 'extra'), 'extra'); assert.throws(() => verifyBrainState(out), /match/);
  rmSync(join(out, 'files', 'extra')); rmSync(payload); assert.throws(() => verifyBrainState(out), /match/);
}));

test('manifest traversal, duplicate entries and aliased roots are refused', () => fixture(({ root, source, out }) => {
  backupBrainState({ source, out, stopped: true });
  const path = join(out, 'manifest.json'), manifest = JSON.parse(readFileSync(path));
  for (const bad of ['../escape', '/escape', 'lyrics/../../escape', 'lyrics\\escape', 'lyrics//escape']) {
    writeFileSync(path, JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], path: bad }] }));
    assert.throws(() => verifyBrainState(out), /Unsafe/);
  }
  writeFileSync(path, JSON.stringify({ ...manifest, files: [manifest.files[0], manifest.files[0]] }));
  assert.throws(() => verifyBrainState(out), /duplicate/);
  const alias = join(root, 'alias'); symlinkSync(source, alias);
  assert.throws(() => backupBrainState({ source, out: join(alias, 'backup'), stopped: true }), /separate/);
}));

test('symlinks and oversized state fail safely without modifying their source', () => fixture(({ root, source, out }) => {
  symlinkSync(join(source, 'playlists.json'), join(source, 'alias'));
  assert.throws(() => backupBrainState({ source, out, stopped: true }), /Symlinks/); rmSync(join(source, 'alias'));
  writeFileSync(join(source, 'huge'), ''); truncateSync(join(source, 'huge'), 64 * 1024 * 1024 + 1);
  assert.throws(() => backupBrainState({ source, out, stopped: true }), /64 MiB/);
  assert.equal(statSync(join(source, 'huge')).size, 64 * 1024 * 1024 + 1);
}));

test('CLI refuses invalid operations and does not echo corrupt/private content', () => fixture(({ root }) => {
  const out = join(root, 'broken'); mkdirSync(out); writeFileSync(join(out, 'manifest.json'), 'PRIVATE SECRET corrupt');
  const cli = new URL('./brain-state.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [cli, 'verify', '--backup', out], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE SECRET/);
}));

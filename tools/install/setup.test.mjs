import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseEnv } from './preflight.mjs';
import { applySetup, fillTemplate, main, makeReceipt, planSetup, readUsers, resolveOwner } from './setup.mjs';

const example = readFileSync(new URL('../../deploy/.env.example', import.meta.url), 'utf8');
const me = { uid: process.getuid(), gid: process.getgid() };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synamp-setup-'));
  const share = join(root, 'music'), deploy = join(root, 'synamp/deploy'), data = join(root, 'synamp/data');
  mkdirSync(join(share, 'library/Artist/Album'), { recursive: true });
  writeFileSync(join(share, 'library/Artist/Album/01.flac'), 'not really audio');
  mkdirSync(deploy, { recursive: true });
  writeFileSync(join(deploy, '.env.example'), example);
  for (const file of ['docker-compose.yml', 'Caddyfile']) writeFileSync(join(deploy, file), '# fixture\n');
  for (const app of ['brain', 'web']) { mkdirSync(join(root, 'synamp/apps', app), { recursive: true }); writeFileSync(join(root, 'synamp/apps', app, 'Dockerfile'), '# fixture\n'); }
  writeFileSync(join(root, 'passwd'), `root:x:0:0::/root:/bin/sh\nmusic:x:${me.uid || 1026}:${me.gid || 100}::/home/music:/bin/sh\n`);
  return { root, share, deploy, data, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
const fakeChown = () => {};
const answersFor = (f) => ({ musicShare: f.share, dataDir: f.data, httpPort: 8080 });

test('owner can be a user name, a number, or number:group', () => {
  const users = readUsers('root:x:0:0::/:/bin/sh\ntapps:x:1026:100::/:/bin/sh\nbroken line\n');
  assert.deepEqual(resolveOwner('tapps', users), { uid: 1026, gid: 100, name: 'tapps' });
  assert.deepEqual(resolveOwner('1026', users), { uid: 1026, gid: 100, name: 'tapps' });
  assert.deepEqual(resolveOwner('2000:101', users), { uid: 2000, gid: 101 });
  assert.equal(resolveOwner('2000', users), undefined, 'an unknown number needs its group');
  assert.equal(resolveOwner('nobody-here', users), undefined);
});

test('settings keep the example file\'s comments and add anything it lacks', () => {
  const text = fillTemplate(example, { MUSIC_SHARE: '/volume1/music', HTTP_PORT: '8090', NEW_KEY: 'x' });
  assert.match(text, /^MUSIC_SHARE=\/volume1\/music$/m);
  assert.match(text, /^HTTP_PORT=8090$/m);
  assert.match(text, /^# Added by setup\nNEW_KEY=x$/m);
  assert.ok(text.includes('# The librarian is the only SynAmp service'));
});

test('a fresh setup creates the folders and a private settings file with new secrets', () => {
  const f = fixture();
  try {
    const plan = planSetup({ deployDir: f.deploy, answers: answersFor(f), owner: me.uid ? me : { uid: 1026, gid: 100 } });
    assert.deepEqual(plan.problems, []);
    const applied = applySetup(plan, { deployDir: f.deploy, chown: fakeChown });
    assert.ok(applied.every((s) => s.status === 'done'));
    const env = parseEnv(readFileSync(join(f.deploy, '.env'), 'utf8'));
    assert.equal(env.MUSIC_PATH, join(f.share, 'library'));
    assert.equal(env.INCOMING_PATH, join(f.share, 'incoming'));
    assert.equal(env.DATA_DIR, f.data);
    assert.match(env.PLAYLIST_API_TOKEN, /^[0-9a-f]{64}$/);
    assert.match(env.POSTGRES_PASSWORD, /^[0-9a-f]{48}$/);
    assert.equal(statSync(join(f.deploy, '.env')).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(f.data).sort(), ['brain', 'caddy', 'caddy-config', 'librarian', 'navidrome', 'postgres']);
    assert.deepEqual(readdirSync(f.share).sort(), ['.synamp', 'incoming', 'library']);
    assert.deepEqual(readdirSync(join(f.share, 'library/Artist/Album')), ['01.flac'], 'music untouched');
    assert.ok(!readdirSync(f.deploy).some((n) => n.endsWith('.tmp')));
  } finally { f.cleanup(); }
});

test('running again keeps the settings file and secrets, and only fills gaps', () => {
  const f = fixture();
  try {
    const owner = me.uid ? me : { uid: 1026, gid: 100 };
    applySetup(planSetup({ deployDir: f.deploy, answers: answersFor(f), owner }), { deployDir: f.deploy, chown: fakeChown });
    const before = readFileSync(join(f.deploy, '.env'), 'utf8');
    rmSync(join(f.data, 'caddy'), { recursive: true });
    const again = planSetup({ deployDir: f.deploy, answers: { musicShare: '/elsewhere' }, existing: parseEnv(before), owner: undefined });
    assert.equal(again.resumed, true);
    assert.deepEqual(again.steps.map((s) => s.path), [join(f.data, 'caddy')], 'only the missing folder; settings file kept');
    applySetup(again, { deployDir: f.deploy, chown: fakeChown });
    assert.equal(readFileSync(join(f.deploy, '.env'), 'utf8'), before);
    assert.deepEqual(planSetup({ deployDir: f.deploy, answers: {}, existing: parseEnv(before) }).steps, []);
  } finally { f.cleanup(); }
});

test('the Brain and librarian folders, incoming/ and .synamp/ are given to the music owner', () => {
  const f = fixture();
  try {
    const owner = { uid: 1026, gid: 100 };
    const calls = [];
    applySetup(planSetup({ deployDir: f.deploy, answers: answersFor(f), owner }), { deployDir: f.deploy, chown: (path, uid, gid) => calls.push([path.slice(f.root.length), uid, gid]) });
    assert.deepEqual(calls.map((c) => c[0]).sort(), ['/music/.synamp', '/music/incoming', '/synamp/data/brain', '/synamp/data/librarian']);
    assert.ok(calls.every((c) => c[1] === 1026 && c[2] === 100));
  } finally { f.cleanup(); }
});

test('unsafe or unworkable layouts are refused before anything changes', () => {
  const f = fixture();
  try {
    const owner = { uid: 1026, gid: 100 };
    const problems = (answers, who = owner) => planSetup({ deployDir: f.deploy, answers, owner: who }).problems.join(' ');
    assert.match(problems({ ...answersFor(f), dataDir: join(f.share, 'synamp-data') }), /outside the music folder/);
    assert.match(problems(answersFor(f), { uid: 0, gid: 0 }), /not root/);
    assert.match(problems(answersFor(f), null), /owns your music/);
    assert.match(problems({ ...answersFor(f), musicShare: join(f.root, 'nope') }), /no folder at/);
    assert.match(problems({ ...answersFor(f), musicShare: join(f.share, 'library') }), /folder called "library"/);
    assert.match(problems({ ...answersFor(f), httpPort: 99999 }), /1 to 65535/);
    assert.match(problems({ ...answersFor(f), musicShare: 'music' }), /full path/);
    const bad = planSetup({ deployDir: f.deploy, answers: { ...answersFor(f), dataDir: join(f.share, 'x') }, owner });
    assert.deepEqual(bad.steps, []);
    assert.equal(readdirSync(f.deploy).includes('.env'), false);
  } finally { f.cleanup(); }
});

test('a failed step stops the rest and says why in plain words', () => {
  const f = fixture();
  try {
    const plan = planSetup({ deployDir: f.deploy, answers: answersFor(f), owner: { uid: 1026, gid: 100 } });
    const denied = () => { const e = new Error('nope'); e.code = 'EPERM'; throw e; };
    const applied = applySetup(plan, { deployDir: f.deploy, chown: denied });
    assert.equal(applied.at(-1).status, 'failed');
    assert.match(applied.at(-1).reason, /administrator/);
    assert.ok(applied.length < plan.steps.length);
    assert.equal(readdirSync(f.deploy).includes('.env'), false);
  } finally { f.cleanup(); }
});

test('the receipt records steps and timing without paths or secrets', () => {
  const secret = 'f'.repeat(64);
  const receipt = makeReceipt({ started: 0, finished: 61_000, resumed: false, build: 'abc123',
    applied: [{ kind: 'folder', path: '/volume1/music/incoming', status: 'done', ms: 3 }, { kind: 'settings', path: '/x/.env', status: 'done', ms: 1, token: secret }],
    check: { ready: false, checks: [{ id: 'puid', status: 'fail', remedy: 'r' }, { id: 'settings', status: 'pass' }] }, host: { arch: 'x64', node: '22' } });
  assert.equal(receipt.active_seconds, 61);
  assert.deepEqual(receipt.preflight, { ready: false, failed: ['puid'] });
  assert.equal(receipt.result, 'prerequisites-missing');
  const text = JSON.stringify(receipt);
  assert.ok(!text.includes('/volume1') && !text.includes(secret));
});

test('the guided flow asks, shows the plan, waits for yes, then prepares everything', async () => {
  const f = fixture();
  try {
    const input = new PassThrough(), output = new PassThrough();
    let shown = ''; output.on('data', (c) => { shown += c; });
    const answers = [f.share, f.data, '8080', 'music', 'yes'];
    const run = main(['--deploy', f.deploy, '--passwd', join(f.root, 'passwd'), '--no-docker-checks'], { input, output });
    for (const answer of answers) { await new Promise((r) => setTimeout(r, 30)); input.write(`${answer}\n`); }
    const code = await run;
    assert.match(shown, /Here is what setup will do/);
    assert.match(shown, /Your music files are not touched/);
    assert.ok(existsSync(join(f.deploy, '.env')));
    const receipts = readdirSync(join(f.data, 'receipts'));
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(readFileSync(join(f.data, 'receipts', receipts[0]), 'utf8'));
    assert.equal(receipt.resumed, false);
    const env = parseEnv(readFileSync(join(f.deploy, '.env'), 'utf8'));
    assert.ok(!shown.includes(env.PLAYLIST_API_TOKEN), 'the token is shown only on request');
    // The checks pass on a Linux x86-64 host (the supported server); elsewhere the host check fails.
    assert.equal(code, process.platform === 'linux' && process.arch === 'x64' ? 0 : 1);
  } finally { f.cleanup(); }
});

test('saying no changes nothing', async () => {
  const f = fixture();
  try {
    const input = new PassThrough(), output = new PassThrough();
    output.resume();
    const run = main(['--deploy', f.deploy, '--passwd', join(f.root, 'passwd'), '--no-docker-checks'], { input, output });
    for (const answer of [f.share, f.data, '8080', 'music', 'no']) { await new Promise((r) => setTimeout(r, 30)); input.write(`${answer}\n`); }
    assert.equal(await run, 2);
    assert.deepEqual(readdirSync(f.deploy).sort(), ['.env.example', 'Caddyfile', 'docker-compose.yml']);
    assert.equal(existsSync(f.data), false);
  } finally { f.cleanup(); }
});

test('answers typed ahead all arrive, and running out of answers means no', async () => {
  const f = fixture();
  try {
    const output = new PassThrough(); output.resume();
    const ahead = new PassThrough(); ahead.end(`${f.share}\n${f.data}\n8080\nmusic\nyes\n`);
    assert.equal(await main(['--deploy', f.deploy, '--passwd', join(f.root, 'passwd'), '--no-docker-checks'], { input: ahead, output }), process.platform === 'linux' && process.arch === 'x64' ? 0 : 1);
    assert.ok(existsSync(join(f.deploy, '.env')));
    const g = fixture();
    try {
      const short = new PassThrough(); short.end(`${g.share}\n\n\nmusic\n`);
      assert.equal(await main(['--deploy', g.deploy, '--passwd', join(g.root, 'passwd'), '--no-docker-checks'], { input: short, output }), 2);
      assert.equal(existsSync(join(g.deploy, '.env')), false);
    } finally { g.cleanup(); }
  } finally { f.cleanup(); }
});

test('setup that stops without finishing exits as not done', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./setup.mjs', import.meta.url)), '--deploy', '/nonexistent-synamp/deploy'], { input: '', encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

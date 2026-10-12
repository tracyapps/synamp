/**
 * Guided SynAmp server setup. Shows a plan, changes nothing until you say yes,
 * and is safe to run again: an existing settings file is kept as it is, and
 * folders that already exist are left alone. It never touches music files.
 *
 * On a Synology, run deploy/setup.sh instead: it runs this file in the pinned
 * Node image (DSM has no Node of its own) and then starts SynAmp.
 *
 * Built from small parts (planSetup, applySetup, makeReceipt) so a browser
 * setup screen can use the same steps later.
 */
import { randomBytes } from 'node:crypto';
import { chownSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv, preflight } from './preflight.mjs';

export const STATE_FOLDERS = ['postgres', 'navidrome', 'brain', 'librarian', 'caddy', 'caddy-config'];
// The Brain and the librarian run as the music owner, so their folders must be theirs.
const OWNED_STATE = new Set(['brain', 'librarian']);

const within = (parent, child) => {
  const part = relative(parent, child);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
};

/** Users from an /etc/passwd file: name -> { uid, gid }. */
export function readUsers(text) {
  const users = new Map();
  for (const line of text.split(/\r?\n/)) {
    const [name, , uid, gid] = line.split(':');
    if (name && /^\d+$/.test(uid ?? '') && /^\d+$/.test(gid ?? '')) users.set(name, { uid: Number(uid), gid: Number(gid) });
  }
  return users;
}

/** "tapps", "1026" or "1026:100" -> { uid, gid, name? }, or undefined. */
export function resolveOwner(answer, users) {
  const text = String(answer ?? '').trim();
  if (users.has(text)) return { ...users.get(text), name: text };
  const ids = /^(\d+)(?::(\d+))?$/.exec(text);
  if (!ids) return undefined;
  const uid = Number(ids[1]);
  const known = [...users].find(([, u]) => u.uid === uid);
  const gid = ids[2] !== undefined ? Number(ids[2]) : known?.[1].gid;
  return gid === undefined ? undefined : { uid, gid, ...(known ? { name: known[0] } : {}) };
}

/** Fill KEY=value lines of the example settings file, keeping its comments. */
export function fillTemplate(template, values) {
  const left = new Set(Object.keys(values));
  const out = template.replace(/^([A-Z][A-Z0-9_]*)=.*$/gm, (line, key) => {
    if (!left.has(key)) return line;
    left.delete(key);
    return `${key}=${values[key]}`;
  });
  return left.size ? `${out.trimEnd()}\n\n# Added by setup\n${[...left].map((k) => `${k}=${values[k]}`).join('\n')}\n` : out;
}

/**
 * What setup would do, without doing it. `existing` is the parsed current
 * settings file, if there is one: it wins over the answers.
 */
export function planSetup({ deployDir, answers, existing, owner }) {
  const problems = [];
  const settings = existing ?? {
    MUSIC_SHARE: answers.musicShare,
    MUSIC_PATH: answers.musicShare && join(answers.musicShare, 'library'),
    INCOMING_PATH: answers.musicShare && join(answers.musicShare, 'incoming'),
    DATA_DIR: answers.dataDir,
    HTTP_PORT: String(answers.httpPort ?? 8080),
    PUID: owner ? String(owner.uid) : '',
    PGID: owner ? String(owner.gid) : '',
  };
  const share = settings.MUSIC_SHARE, data = settings.DATA_DIR;
  const uid = Number(settings.PUID), gid = Number(settings.PGID);
  const from = existing ? 'Your settings file needs ' : '';
  if (!share || !isAbsolute(share)) problems.push(`${from}The music folder as a full path (MUSIC_SHARE), like /volume1/music.`);
  if (!data || !isAbsolute(data)) problems.push(`${from}The app data folder as a full path (DATA_DIR), like /volume1/docker/synamp/data.`);
  if (!(uid > 0) || !(gid >= 0)) problems.push(`${from}The NAS user who owns your music, not root (PUID and PGID). SynAmp files new music as that user.`);
  const port = Number(settings.HTTP_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) problems.push('The port must be a whole number from 1 to 65535, like 8080.');
  if (share && data && isAbsolute(share) && isAbsolute(data) && (within(share, data) || within(data, share)))
    problems.push('Keep the app data folder outside the music folder, so a music backup or rescan never mixes the two.');
  if (share && isAbsolute(share) && within(share, resolve(deployDir))) problems.push('Keep the SynAmp folder (with its settings file) outside the music folder.');
  if (share && isAbsolute(share)) {
    if (!isDir(share)) problems.push(`There's no folder at ${share}. Check the music folder's path.`);
    else if (!isDir(join(share, 'library'))) problems.push(`SynAmp expects your music in a folder called "library" inside ${share}. Move your music into ${join(share, 'library')} first (setup never moves music for you).`);
  }
  const steps = [];
  if (!problems.length) {
    const folder = (path, owned, why) => { if (!existsSync(path)) steps.push({ kind: 'folder', path, owner: owned ? { uid, gid } : undefined, why }); };
    folder(data, false, 'app data (this is what you back up)');
    for (const name of STATE_FOLDERS) folder(join(data, name), OWNED_STATE.has(name), `app data: ${name}`);
    folder(join(share, 'incoming'), true, 'new music waiting to be filed');
    folder(join(share, '.synamp'), true, "SynAmp's notes beside your music (undo records, analysis results)");
    if (!existing) steps.push({ kind: 'settings', path: join(deployDir, '.env'), why: 'settings, with new random passwords' });
  }
  return { settings, steps, problems, resumed: !!existing };
}

/** Do the plan. Each step is reported; a failed step stops the rest. */
export function applySetup(plan, { deployDir, secrets = newSecrets(), chown = chownSync } = {}) {
  const done = [];
  for (const step of plan.steps) {
    const started = Date.now();
    try {
      if (step.kind === 'folder') {
        mkdirSync(step.path, { recursive: true, mode: 0o755 });
        if (step.owner) chown(step.path, step.owner.uid, step.owner.gid);
      } else if (step.kind === 'settings') {
        const template = readFileSync(join(deployDir, '.env.example'), 'utf8');
        const text = fillTemplate(template, { ...plan.settings, ...secrets });
        // Written beside, then renamed, so a half-written settings file never exists.
        const temp = `${step.path}.${process.pid}.tmp`;
        writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
        renameSync(temp, step.path);
      }
      done.push({ ...step, status: 'done', ms: Date.now() - started });
    } catch (error) {
      done.push({ ...step, status: 'failed', ms: Date.now() - started, reason: plainError(error) });
      break;
    }
  }
  return done;
}

export function newSecrets() {
  return { POSTGRES_PASSWORD: randomBytes(24).toString('hex'), PLAYLIST_API_TOKEN: randomBytes(32).toString('hex') };
}

/** The attempt record: what happened and how long it took. No paths, names or secrets. */
export function makeReceipt({ started, finished, resumed, applied, check, build, host }) {
  return {
    format: 'synamp.install-receipt/1', started: new Date(started).toISOString(), finished: new Date(finished).toISOString(),
    active_seconds: Math.round((finished - started) / 1000), resumed, build: build ?? 'unknown', host,
    steps: applied.map((s) => ({ kind: s.kind, status: s.status, ms: s.ms, ...(s.reason ? { reason: s.reason } : {}) })),
    preflight: check ? { ready: check.ready, failed: check.checks.filter((c) => c.status !== 'pass').map((c) => c.id) } : null,
    result: applied.some((s) => s.status === 'failed') ? 'setup-step-failed' : check?.ready ? 'ready-to-start' : 'prerequisites-missing',
  };
}

/** Answers one line at a time, including lines typed or pasted ahead of the question. */
function lineReader(input) {
  const rl = createInterface({ input, terminal: false });
  const lines = [], waiting = [];
  let ended = false;
  rl.on('line', (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
  rl.on('close', () => { ended = true; while (waiting.length) waiting.shift()(undefined); });
  return {
    next: () => (lines.length ? Promise.resolve(lines.shift()) : ended ? Promise.resolve(undefined) : new Promise((resolve) => waiting.push(resolve))),
    close: () => rl.close(),
  };
}

function isDir(path) { try { return statSync(path).isDirectory(); } catch { return false; } }
function plainError(error) {
  const code = error?.code;
  if (code === 'EACCES' || code === 'EPERM') return 'not allowed: run setup as an administrator (deploy/setup.sh uses sudo)';
  if (code === 'EEXIST') return 'something else created it at the same moment; run setup again';
  if (code === 'ENOSPC') return 'the disk is full';
  return code ? `failed (${code})` : 'failed';
}
function buildId(root) {
  try {
    const head = readFileSync(join(root, '.git/HEAD'), 'utf8').trim();
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    return (ref ? readFileSync(join(root, '.git', ref), 'utf8').trim() : head).slice(0, 12);
  } catch { return undefined; }
}

// --- the guided, interactive part -----------------------------------------------

const HELP = `SynAmp setup: prepares folders and settings for SynAmp on your server.
It shows you the plan first and changes nothing until you say yes.

  --music-share PATH   the shared folder holding library/ (default /volume1/music)
  --data-dir PATH      where SynAmp keeps its own data (default: data/ beside deploy/)
  --http-port N        the port you'll open SynAmp on (default 8080)
  --owner USER         the NAS user who owns your music (name or number)
  --yes                don't ask; use the answers given
  --show-token         print the access token you'll need to sign in to the app
  --no-docker-checks   skip Docker checks (deploy/setup.sh does them itself)`;

function parseArgs(argv) {
  const opts = {};
  const flags = { '--yes': 'yes', '--show-token': 'showToken', '--no-docker-checks': 'noDocker', '--help': 'help' };
  const values = { '--music-share': 'musicShare', '--data-dir': 'dataDir', '--http-port': 'httpPort', '--owner': 'owner', '--deploy': 'deploy', '--passwd': 'passwd', '--receipts': 'receipts' };
  for (let i = 0; i < argv.length; i++) {
    if (flags[argv[i]]) opts[flags[argv[i]]] = true;
    else if (values[argv[i]] && argv[i + 1] !== undefined) opts[values[argv[i]]] = argv[++i];
    else throw new Error(`I don't know the option "${argv[i]}". Run with --help to see the options.`);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2), io = { input: process.stdin, output: process.stdout }) {
  const say = (line = '') => io.output.write(`${line}\n`);
  let opts;
  try { opts = parseArgs(argv); } catch (error) { say(error.message); return 2; }
  if (opts.help) { say(HELP); return 0; }
  const started = Date.now();
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const deployDir = resolve(opts.deploy ?? join(root, 'deploy'));
  const envPath = join(deployDir, '.env');
  const rl = opts.yes ? null : lineReader(io.input);
  // An empty answer, or no more input, takes the suggestion in brackets (for "Go ahead?" that is no).
  const ask = async (question, fallback) => {
    if (!rl) return fallback;
    io.output.write(`${question}${fallback ? ` [${fallback}]` : ''}: `);
    const answer = (await rl.next())?.trim();
    if (answer === undefined) io.output.write('\n');
    return answer || fallback;
  };
  try {
    say('SynAmp setup');
    say('This prepares folders and a settings file. Nothing changes until you say yes.');
    say();
    let existing;
    if (existsSync(envPath)) {
      try { existing = parseEnv(readFileSync(envPath, 'utf8')); }
      catch { say(`Your settings file (${envPath}) has a line setup can't read. Fix it, or move it aside to start over.`); return 1; }
      say('Found your settings file from an earlier run. Setup will keep it exactly as it is and finish anything left to do.');
    }
    const answers = {};
    let owner;
    if (!existing) {
      const share = await ask('Music folder (the shared folder with your "library" folder inside)', opts.musicShare ?? '/volume1/music');
      answers.musicShare = share && resolve(share);
      answers.dataDir = resolve(await ask('Folder for SynAmp\'s own data (back this one up)', opts.dataDir ?? join(dirname(deployDir), 'data')));
      answers.httpPort = Number(await ask('Port to open SynAmp on', opts.httpPort ?? '8080'));
      let users = new Map();
      try { users = readUsers(readFileSync(opts.passwd ?? '/etc/passwd', 'utf8')); } catch { /* names unavailable; numbers still work */ }
      let guess = opts.owner;
      if (!guess) {
        try {
          const uid = statSync(join(answers.musicShare, 'library')).uid;
          if (uid > 0) guess = [...users].find(([, u]) => u.uid === uid)?.[0] ?? String(uid);
        } catch { /* reported by the plan */ }
      }
      owner = resolveOwner(await ask('NAS user who owns your music', guess), users);
      if (!owner && rl) say('I couldn\'t find that user. Use the name you sign in to DSM with, or its number (from "id <name>").');
    }
    const plan = planSetup({ deployDir, answers, existing, owner });
    say();
    if (plan.problems.length) {
      say('Before setup can continue:');
      for (const problem of plan.problems) say(`  - ${problem}`);
      return 1;
    }
    if (plan.steps.length) {
      say('Here is what setup will do:');
      plan.steps.forEach((step, i) => say(`  ${i + 1}. ${step.kind === 'folder' ? 'Create' : 'Write'} ${step.path}\n      ${step.why}${step.owner ? `; owned by user ${step.owner.uid}` : ''}`));
      say('  Your music files are not touched.');
      if (rl && !/^y(es)?$/i.test(await ask('Go ahead? Type yes to continue', 'no'))) { say('Nothing was changed.'); return 2; }
    } else say('Folders and settings are already in place.');
    const applied = applySetup(plan, { deployDir });
    for (const step of applied) say(`  ${step.status === 'done' ? 'Done' : 'Problem'}: ${step.path}${step.reason ? ` — ${step.reason}` : ''}`);
    const failed = applied.some((s) => s.status === 'failed');
    const check = failed ? undefined : preflight({ envPath, docker: !opts.noDocker });
    if (check) {
      say();
      const misses = check.checks.filter((c) => c.status !== 'pass');
      if (misses.length) { say('Checks that still need attention:'); for (const miss of misses) say(`  - ${miss.remedy}`); }
      else say(`All setup checks passed${opts.noDocker ? ' (Docker is checked next)' : ''}.`);
    }
    const settings = parseEnv(readFileSync(envPath, 'utf8'));
    const receipt = makeReceipt({ started, finished: Date.now(), resumed: plan.resumed, applied, check, build: buildId(root), host: { arch: process.arch, node: process.versions.node } });
    const receipts = opts.receipts ?? join(settings.DATA_DIR ?? plan.settings.DATA_DIR, 'receipts');
    try {
      mkdirSync(receipts, { recursive: true });
      writeFileSync(join(receipts, `setup-${receipt.started.replace(/[:.]/g, '-')}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      say(`A record of this attempt (no passwords) is in ${receipts}.`);
    } catch { say('(Couldn\'t save the record of this attempt; setup itself is unaffected.)'); }
    if (opts.showToken) {
      say();
      say('Your access token (SynAmp asks for it the first time you open it):');
      say(`  ${settings.PLAYLIST_API_TOKEN}`);
    }
    return failed || !check?.ready ? 1 : 0;
  } finally { rl?.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Anything that ends setup early without an answer counts as not done.
  process.exitCode = 2;
  main().then((code) => { process.exitCode = code; }, () => { console.error('Setup stopped unexpectedly. Nothing after the last "Done" line was changed.'); process.exitCode = 2; });
}

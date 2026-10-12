/** Offline Brain-state copy and restore rehearsal; no live-service operations. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMAT = 'synamp.brain-state-backup/1';
const MAX_FILES = 100_000, MAX_FILE = 64 * 1024 * 1024, MAX_TOTAL = 8 * 1024 ** 3;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inside = (root, path) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)); };
function rootOf(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('Use absolute directory paths.');
  const root = realpathSync(path);
  if (root === dirname(root) || !lstatSync(root).isDirectory()) throw Error('Use a dedicated Brain-state directory, never a filesystem root.');
  return root;
}
function destination(path, source) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw Error('Use an absolute output path.');
  const full = resolve(path), parent = realpathSync(dirname(full));
  const target = join(parent, basename(full));
  if (inside(source, target) || inside(target, source)) throw Error('Source and output must be separate directory trees.');
  // mkdir is exclusive: existing files, directories and symlinks are never replaced.
  mkdirSync(target, { mode: 0o700 });
  return target;
}
function walk(root, sub = '') {
  const out = [];
  for (const entry of readdirSync(join(root, sub), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = sub ? `${sub}/${entry.name}` : entry.name;
    safeName(name);
    if (entry.isDirectory()) out.push(...walk(root, name));
    else if (entry.isFile()) out.push(name);
    else throw Error('Symlinks and special files are not supported in Brain-state backups.');
    if (out.length > MAX_FILES) throw Error('State exceeds the backup file-count limit.');
  }
  return out;
}
function safeName(name) {
  if (typeof name !== 'string' || !name || name.length > 4096 || /[\\\x00-\x1f\x7f]/.test(name)
    || isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Unsafe path in state or backup manifest.');
}
function bytesOf(root, name) {
  safeName(name);
  const path = join(root, name);
  if (!inside(root, realpathSync(dirname(path)))) throw Error('State path leaves its root.');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > MAX_FILE) throw Error('State file is unsupported or exceeds the 64 MiB limit.');
    const bytes = readFileSync(fd), after = fstatSync(fd);
    if (bytes.length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw Error('State changed during capture; stop all writers and use a fresh output directory.');
    return bytes;
  } finally { closeSync(fd); }
}
function records(root) {
  let total = 0;
  return walk(root).map(path => {
    const bytes = bytesOf(root, path);
    total += bytes.length;
    if (total > MAX_TOTAL) throw Error('State exceeds the 8 GiB backup limit.');
    return { path, bytes: bytes.length, sha256: hash(bytes) };
  });
}
const sameRecords = (a, b) => a.length === b.length && a.every((r, i) => r.path === b[i].path && r.bytes === b[i].bytes && r.sha256 === b[i].sha256);

export function backupBrainState({ source, out, stopped = false }) {
  if (stopped !== true) throw Error('Stop all Brain writers first and explicitly supply --stopped.');
  const root = rootOf(source), original = records(root);
  if (!original.length || !original.some(r => r.path === 'playlists.json' || r.path === 'session.json' || r.path === 'events.jsonl')) throw Error('No recognizable Brain state found.');
  const target = destination(out, root), files = join(target, 'files');
  mkdirSync(files, { mode: 0o700 });
  for (const item of original) {
    const path = join(files, item.path);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytesOf(root, item.path), { flag: 'wx', mode: 0o600 });
  }
  if (!sameRecords(original, records(root)) || !sameRecords(original, records(files))) throw Error('State changed or copy verification failed; incomplete output was retained.');
  const manifest = { format: FORMAT, id: randomUUID(), captured_at: new Date().toISOString(), scope: 'offline-brain-state-only',
    writer_stop: 'owner-attested', files: original, limits: 'No service-stop detection, semantic repair, authentication or power-loss guarantee. Excludes music, shared journals/tag backups, Mac SQLite, Navidrome and Postgres.' };
  writeFileSync(join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return verifyBrainState(target);
}

export function verifyBrainState(backup) {
  const root = rootOf(backup), manifestBytes = bytesOf(root, 'manifest.json');
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { throw Error('Backup manifest is unreadable.'); }
  if (manifest?.format !== FORMAT || manifest.scope !== 'offline-brain-state-only' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) throw Error('Unsupported backup manifest.');
  const seen = new Set();
  for (const entry of manifest.files) {
    safeName(entry.path);
    if (seen.has(entry.path) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_FILE || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid or duplicate backup entry.');
    seen.add(entry.path);
  }
  const fileStat = lstatSync(join(root, 'files'));
  if (!fileStat.isDirectory() || fileStat.isSymbolicLink()) throw Error('Backup payload must be a real directory.');
  const actual = records(join(root, 'files'));
  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
  actual.sort((a, b) => a.path.localeCompare(b.path));
  if (!sameRecords(expected, actual)) throw Error('Backup file set, size or SHA-256 did not match.');
  return { format: FORMAT, verified: true, files: actual.length, bytes: actual.reduce((sum, file) => sum + file.bytes, 0), manifest_sha256: hash(manifestBytes), scope: manifest.scope };
}

export function restoreBrainState({ backup, out }) {
  const root = rootOf(backup), verified = verifyBrainState(root);
  const manifestBytes = bytesOf(root, 'manifest.json');
  if (hash(manifestBytes) !== verified.manifest_sha256) throw Error('Backup manifest changed before restore.');
  const manifest = JSON.parse(manifestBytes);
  const target = destination(out, root);
  for (const entry of manifest.files) {
    safeName(entry.path);
    const path = join(target, entry.path), bytes = bytesOf(join(root, 'files'), entry.path);
    if (hash(bytes) !== entry.sha256) throw Error('Backup changed during restore; incomplete output was retained.');
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  }
  const expected = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
  const actual = records(target).sort((a, b) => a.path.localeCompare(b.path));
  if (!sameRecords(expected, actual) || verifyBrainState(root).manifest_sha256 !== verified.manifest_sha256) throw Error('Restore verification failed; incomplete output was retained.');
  return { ...verified, restored: true, existing_state_changed: false, evidence: 'byte-verified-offline-copy; test application behavior before use' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2), options = {};
  try {
    if (command === '--help') console.log('Offline Brain state only. Stop all writers yourself.\nbackup --source /absolute/brain --out /absolute/new-backup --stopped\nverify --backup /absolute/backup\nrestore --backup /absolute/backup --out /absolute/new-trial-state\nNever restores over existing state; failed outputs are retained. Keep backups private.');
    else {
      for (let i = 0; i < args.length; i++) {
        const key = args[i].slice(2);
        if (!args[i].startsWith('--') || key in options || !['source', 'out', 'backup', 'stopped'].includes(key)) throw Error('Invalid option.');
        options[key] = key === 'stopped' ? true : args[++i];
      }
      const keys = Object.keys(options).sort().join(',');
      let result;
      if (command === 'backup' && keys === 'out,source,stopped') result = backupBrainState(options);
      else if (command === 'verify' && keys === 'backup') result = verifyBrainState(options.backup);
      else if (command === 'restore' && keys === 'backup,out') result = restoreBrainState(options);
      else throw Error('Use --help for the supported commands.');
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    // Filesystem/parser errors may include private names or file contents.
    const message = error?.code || error instanceof SyntaxError ? 'Check directory access and backup integrity. No existing state was overwritten.' : error.message;
    console.error(message); process.exitCode = 1;
  }
}

/** Read-only NAS setup spike. Never sources .env or prints its values. */
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || Object.hasOwn(values, match[1])) throw new Error('Use unique KEY=value entries; shell commands are not supported.');
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const end = value.indexOf(quote, 1);
      if (end < 0 || !/^(\s*#.*)?$/.test(value.slice(end + 1))) throw new Error('Unsupported quoting in settings.');
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, '').trim();
    // Keep the spike's literal interpretation consistent with Compose. No expansion.
    if (/[$`\\\x00-\x1f]/.test(value)) throw new Error('Use literal values without interpolation, escapes, or control characters.');
    values[match[1]] = value;
  }
  return values;
}

const within = (parent, child) => {
  const part = relative(parent, child);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
};

export function preflight({ envPath, platform = process.platform, arch = process.arch, run = spawnSync, docker = true }) {
  const checks = [];
  const add = (id, pass, remedy) => checks.push({ id, status: pass ? 'pass' : 'fail', ...(pass ? {} : { remedy }) });
  add('nas-host', platform === 'linux' && arch === 'x64', 'Run this NAS preflight on the intended Linux x86-64 server. A Mac run cannot verify NAS mounts.');
  let env;
  try { env = parseEnv(readFileSync(envPath, 'utf8')); }
  catch { add('settings', false, 'Provide a readable .env with unique literal KEY=value entries. No settings values are included in this report.'); return finish(checks); }
  add('settings', true);
  for (const key of ['POSTGRES_PASSWORD', 'PLAYLIST_API_TOKEN']) {
    const value = env[key] ?? '';
    add(key.toLowerCase(), value.length >= (key === 'PLAYLIST_API_TOKEN' ? 32 : 20) && !/change.me|replace.with|paste.your/i.test(value), `Set ${key} to a unique random secret (${key === 'PLAYLIST_API_TOKEN' ? 32 : 20}+ characters). Length is not an entropy test.`);
  }
  for (const key of ['PUID', 'PGID']) add(key.toLowerCase(), /^\d+$/.test(env[key] ?? '') && Number.isSafeInteger(Number(env[key])) && Number(env[key]) > 0, `Set ${key} explicitly to the non-root music owner's numeric ID from the NAS.`);
  const port = (key, fallback) => {
    const value = env[key] ?? fallback;
    add(key.toLowerCase(), /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535, `Set ${key} to an integer port from 1 through 65535.`);
    return Number(value);
  };
  add('separate-ports', port('HTTP_PORT', '8080') !== port('CORE_PORT', '4533'), 'Use different HTTP_PORT and CORE_PORT values. Port availability still requires a host check.');
  const paths = {};
  for (const key of ['MUSIC_PATH', 'MUSIC_SHARE', 'INCOMING_PATH', 'DATA_DIR']) {
    try {
      if (!env[key] || !isAbsolute(env[key])) throw new Error();
      const path = realpathSync(env[key]);
      if (path === sep || !statSync(path).isDirectory()) throw new Error();
      accessSync(path, constants.R_OK | constants.X_OK);
      paths[key] = path;
      add(key.toLowerCase(), true);
    } catch { add(key.toLowerCase(), false, `Set ${key} to an existing readable, searchable absolute directory on the NAS. No directories are created.`); }
  }
  if (Object.keys(paths).length === 4) {
    const { MUSIC_PATH: music, MUSIC_SHARE: share, INCOMING_PATH: incoming, DATA_DIR: data } = paths;
    add('librarian-layout', music === join(share, 'library') && incoming === join(share, 'incoming'), 'This Compose file fixes the librarian paths to MUSIC_SHARE/library and MUSIC_SHARE/incoming. Use exactly that layout for this spike.');
    add('state-isolation', !within(share, data) && !within(data, share), 'Keep DATA_DIR and the music share in separate directory trees, including resolved symlinks.');
    try { add('settings-isolation', !within(share, realpathSync(envPath)), 'Move the .env outside the music share.'); }
    catch { add('settings-isolation', false, 'Keep a readable .env outside the music share.'); }
    for (const folder of ['postgres', 'navidrome', 'brain', 'librarian', 'caddy', 'caddy-config']) {
      try {
        const path = realpathSync(join(data, folder));
        if (!within(data, path) || !statSync(path).isDirectory()) throw new Error();
        accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK);
        add(`state-${folder}`, true);
      } catch { add(`state-${folder}`, false, `Create DATA_DIR/${folder} on local NAS storage and check permissions. This only checks the invoking user's access, not container UID access.`); }
    }
    try {
      const path = realpathSync(join(share, '.synamp'));
      if (!within(share, path) || !statSync(path).isDirectory()) throw new Error();
      accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK);
      add('shared-journal', true);
    } catch { add('shared-journal', false, 'Create MUSIC_SHARE/.synamp and verify journal/export permissions.'); }
  }
  const deploy = dirname(resolve(envPath));
  // A release download has no source to build: its Compose file names published images instead.
  let builds = true;
  try { builds = /^\s*build:/m.test(readFileSync(join(deploy, 'docker-compose.yml'), 'utf8')); } catch { /* reported as compose-file */ }
  for (const [id, path] of [
    ['compose-file', join(deploy, 'docker-compose.yml')], ['edge-config', join(deploy, 'Caddyfile')],
    ...(builds ? [['brain-build', join(deploy, '../apps/brain/Dockerfile')], ['web-build', join(deploy, '../apps/web/Dockerfile')]] : []),
  ]) {
    try { if (!statSync(path).isFile()) throw new Error(); accessSync(path, constants.R_OK); add(id, true); }
    catch { add(id, false, builds ? 'Keep deploy/ beside apps/ with readable Compose, Caddyfile and Dockerfiles.' : 'Keep the deploy folder complete, as it came in the release download.'); }
  }
  // docker: false when the caller checks Docker itself (deploy/setup.sh runs this inside a container).
  if (docker) for (const [id, args] of [
    ['docker-daemon', ['info', '--format', '{{.Architecture}}']],
    ['compose-plugin', ['compose', 'version', '--short']],
    ['compose-config', ['compose', '--env-file', resolve(envPath), '-f', join(deploy, 'docker-compose.yml'), 'config', '--quiet']],
  ]) {
    const result = run('docker', args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, cwd: deploy });
    const architectureOK = id !== 'docker-daemon' || /^(x86_64|amd64)\s*$/.test(result.stdout ?? '');
    add(id, !result.error && result.status === 0 && architectureOK, 'Check Docker daemon access, Linux x86-64 Docker host and Compose v2 support on the NAS. Raw Docker output is suppressed to protect settings.');
  }
  return finish(checks);
}

function finish(checks) {
  return { format: 'synamp.install-preflight/1', evidence: 'read-only-prerequisites', ready: checks.every(c => c.status === 'pass'), checks,
    pending: ['DSM and Container Manager version', 'container UID/GID permissions', 'local storage and available disk/memory', 'port availability and private-network access', 'backup/restore', 'cold install and first playback', 'Mac analyzer setup and subset throughput', 'upgrade and rollback'],
    caveat: 'Passing prerequisites does not establish supported hardware, installation success, safety, or release readiness. No files, services, or settings were changed.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') console.log('Read-only NAS preflight: node tools/install/preflight.mjs --env /absolute/path/deploy/.env\nNo shell evaluation, network calls by SynAmp, setup writes, builds, or service starts. Docker info/version/config only.');
  else if (args.length !== 2 || args[0] !== '--env' || !isAbsolute(args[1])) { console.error('Use --env with an absolute settings-file path.'); process.exitCode = 2; }
  else {
    try { const report = preflight({ envPath: args[1] }); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.ready ? 0 : 1; }
    catch { console.error('Preflight could not complete. Check access to the supplied settings directory; no raw errors or settings are printed.'); process.exitCode = 2; }
  }
}

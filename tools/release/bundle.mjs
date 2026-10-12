/**
 * Make the download for a release: synamp-<version>.zip, unzipped straight into
 * the SynAmp folder on the NAS (e.g. /volume1/docker/synamp). It holds only
 * what an install needs: the release Compose file (images pinned by digest),
 * the guided setup, the recovery tool and the licence. No .env, no data.
 *
 *   node tools/release/bundle.mjs --version 0.1.0 \
 *     --brain ghcr.io/tracyapps/synamp-brain:0.1.0@sha256:… \
 *     --web ghcr.io/tracyapps/synamp-web:0.1.0@sha256:… --out dist/release
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseCompose } from './compose.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Files copied as they are, relative to the repository and to the bundle. */
export const BUNDLED = [
  'LICENSE.txt',
  'deploy/Caddyfile', 'deploy/.env.example', 'deploy/setup.sh',
  'tools/install/setup.mjs', 'tools/install/preflight.mjs', 'tools/install/brain-state.mjs',
  'tools/install/README.md', 'tools/install/RECOVERY.md',
];

export function readme(version) {
  return `SynAmp ${version}

New install
  1. Install Container Manager (DSM Package Center).
  2. Unzip this into a folder for SynAmp, e.g. /volume1/docker/synamp
  3. Over SSH:  cd /volume1/docker/synamp/deploy  then  sudo ./setup.sh
     It shows you its plan and changes nothing until you type yes.
  4. Container Manager: Project -> Create. Name: synamp.
     Path: the deploy folder. Use the existing docker-compose.yml.

Update, or go back to an earlier version
  1. Back up your SynAmp data folder (DATA_DIR in deploy/.env).
  2. Unzip the release you want over the same folder.
     Your settings (deploy/.env) and data are not in this zip, so they're kept.
  3. Container Manager: Project -> synamp -> Action -> Build.

Going back to an earlier version may need the data backup from before the
update, if the newer version changed how it stores things.

More: https://github.com/tracyapps/synamp/releases
`;
}

export function makeBundle({ version, images, out }) {
  const stage = mkdtempSync(join(tmpdir(), 'synamp-bundle-'));
  try {
    for (const file of BUNDLED) {
      mkdirSync(dirname(join(stage, file)), { recursive: true });
      copyFileSync(join(root, file), join(stage, file));
    }
    chmodSync(join(stage, 'deploy/setup.sh'), 0o755);
    writeFileSync(join(stage, 'deploy/docker-compose.yml'), releaseCompose(readFileSync(join(root, 'deploy/docker-compose.yml'), 'utf8'), { version, images }));
    writeFileSync(join(stage, 'deploy/VERSION'), `${version}\n`);
    writeFileSync(join(stage, 'README.txt'), readme(version));
    mkdirSync(out, { recursive: true });
    const zip = join(resolve(out), `synamp-${version}.zip`);
    rmSync(zip, { force: true });
    // -X: no extra file attributes, so the same inputs give the same zip contents.
    execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: stage });
    const sum = createHash('sha256').update(readFileSync(zip)).digest('hex');
    writeFileSync(`${zip}.sha256`, `${sum}  synamp-${version}.zip\n`);
    return { zip, sha256: sum };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) => (i % 2 ? pairs : [...pairs, [value.replace(/^--/, ''), all[i + 1]]]), []));
  const version = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)$/.exec(args.version ?? '')?.[1];
  if (!version || !args.brain || !args.web || !args.out) {
    console.error('Use: --version 1.2.3 --brain <image@sha256:…> --web <image@sha256:…> --out <folder>');
    process.exit(2);
  }
  const result = makeBundle({ version, images: { brain: args.brain, web: args.web }, out: args.out });
  console.log(`${result.zip}\nsha256 ${result.sha256}`);
}

/**
 * The release copy of deploy/docker-compose.yml: SynAmp's own services use the
 * images GitHub published for this release (pinned by digest) instead of
 * building on the NAS, and there's no source copy to compare against.
 *
 * Line-based on purpose (no YAML library in the install path). It knows the
 * shape of our Compose file and refuses anything it doesn't recognise, so a
 * change to the file fails the release build instead of shipping a half-edit.
 */
const OWN = { brain: 'brain', librarian: 'brain', web: 'web' };
const PINNED = /^[a-z0-9.-]+(?::\d+)?\/[a-z0-9._/-]+:[\w.-]+@sha256:[0-9a-f]{64}$/;

export function releaseCompose(text, { version, images }) {
  for (const kind of ['brain', 'web']) {
    if (!PINNED.test(images?.[kind] ?? '')) throw new Error(`${kind} image must be registry/name:tag@sha256:digest`);
  }
  const lines = text.split('\n');
  const out = [];
  let service = null;
  const done = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const top = /^  ([a-z][\w-]*):\s*$/.exec(line);
    if (top) service = top[1];
    else if (/^\S/.test(line)) service = null;
    const own = service && OWN[service];
    if (own && /^    build:\s*$/.test(line)) {
      // Drop the build block (deeper-indented lines and comments inside it).
      while (i + 1 < lines.length && /^(      |\s*$)/.test(lines[i + 1]) && !/^\s*$/.test(lines[i + 1])) i++;
      out.push(`    image: ${images[own]}`);
      done.add(service);
      continue;
    }
    if (own && /^    pull_policy: build\s*$/.test(line)) continue;
    // Release installs have no source copy on the NAS to fingerprint.
    if (service === 'brain' && /^      # The NAS copy of the code/.test(line)) continue;
    if (service === 'brain' && /^      SOURCE_PATH: \/source\s*$/.test(line)) continue;
    if (service === 'brain' && /^      - \.\.\/apps:\/source:ro\s*$/.test(line)) continue;
    out.push(line);
  }
  // The file's opening comments describe building on the NAS; the release header replaces them.
  const first = out.findIndex((line) => line.trim() && !line.startsWith('#'));
  const result = out.slice(first).join('\n');
  for (const name of Object.keys(OWN)) if (!done.has(name)) throw new Error(`no build block found for ${name}`);
  const settings = result.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  if (/^\s*build:|pull_policy: build|\.\.\/apps|SOURCE_PATH/m.test(settings)) throw new Error('release compose still refers to building or the source copy');
  return [
    `# SynAmp ${version}, for DSM 7 Container Manager (or any Docker Compose v2).`,
    '# Generated from deploy/docker-compose.yml by tools/release/compose.mjs; edit that, not this.',
    '#',
    '# Every image is pinned to a version and its fingerprint: SynAmp\'s own come from',
    '# GitHub for this release, so nothing is built on the NAS. To update, or go back,',
    '# unzip another release over this folder (your .env and data are kept), then',
    '# Container Manager: Project -> synamp -> Action -> Build. Back up DATA_DIR first.',
    '',
    result,
  ].join('\n');
}

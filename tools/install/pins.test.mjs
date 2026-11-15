// Every image an install pulls is pinned to a version and its sha256 fingerprint,
// so two installs of the same SynAmp build get the same parts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const pinned = /^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/;

test('Compose images are pinned by version and fingerprint', () => {
  const images = [...read('deploy/docker-compose.yml').matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(images.length >= 3, 'expected the database, Navidrome and edge images');
  for (const image of images) assert.match(image, pinned, `${image} is not pinned`);
});

test('Dockerfile base images are pinned by version and fingerprint', () => {
  for (const file of ['apps/brain/Dockerfile', 'apps/web/Dockerfile']) {
    // `--platform=$BUILDPLATFORM` (build on the build machine's chip) comes before the image.
    const bases = [...read(file).matchAll(/^FROM\s+(?:--platform=\S+\s+)?(\S+)/gm)].map((m) => m[1]);
    assert.ok(bases.length > 0, `${file} has no FROM`);
    for (const base of bases) assert.match(base, pinned, `${file}: ${base} is not pinned`);
  }
});

test("Dockerfiles build with the older builder Container Manager uses", () => {
  // That builder doesn't set $BUILDPLATFORM. Used bare, it's empty there and the
  // build stops at the first line ("failed to parse platform"), so every use
  // needs a fallback: ${BUILDPLATFORM:-linux}. Same for the other automatic names.
  for (const file of ['apps/brain/Dockerfile', 'apps/web/Dockerfile']) {
    const froms = read(file).split('\n').filter((line) => /^FROM\s/.test(line));
    for (const line of froms) {
      const bare = line.match(/\$(?:\{)?(BUILDPLATFORM|TARGETPLATFORM|BUILDARCH|TARGETARCH|BUILDOS|TARGETOS)\b(?!:-)/);
      assert.equal(bare, null, `${file}: "${line.slice(0, 60)}…" uses $${bare?.[1]} with no fallback`);
    }
  }
});

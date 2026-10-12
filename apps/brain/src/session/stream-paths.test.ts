import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { resolveFilesInside } from "./stream.ts";

test("queue file checks yield to the event loop and retain missing-file and containment rules", async () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-queue-files-"));
  try {
    const root = join(dir, "music"); mkdirSync(root);
    writeFileSync(join(root, "song.flac"), "audio"); writeFileSync(join(dir, "private.flac"), "private");
    symlinkSync(join(dir, "private.flac"), join(root, "escape.flac"));
    let yielded = false;
    const work = resolveFilesInside(root, ["song.flac", "missing", "escape.flac", "../private.flac", "/etc/passwd", undefined, "bad\0path", ...Array(500).fill("song.flac")]);
    setImmediate(() => { yielded = true; });
    const files = await work;
    assert.equal(yielded, true, "other requests can run while queue file checks are pending");
    assert.equal(files[0], realpathSync(join(root, "song.flac")));
    assert.deepEqual(files.slice(1, 7), Array(6).fill(null));
    assert.equal(files.length, 507);
    assert.ok(files.slice(7).every(file => file === files[0]));
    assert.deepEqual(await resolveFilesInside(join(dir, "absent"), ["song.flac"]), [null]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

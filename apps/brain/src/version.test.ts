/** Noticing that a newer copy of SynAmp is on the NAS, waiting for Build. */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fingerprint, VersionCheck } from "./version.ts";

function apps(dir: string) {
  mkdirSync(join(dir, "brain/src/library"), { recursive: true });
  mkdirSync(join(dir, "web/src/styles"), { recursive: true });
  mkdirSync(join(dir, "web/node_modules/x"), { recursive: true });
  writeFileSync(join(dir, "brain/src/index.ts"), "console.log(1)\n");
  writeFileSync(join(dir, "brain/src/library/a.ts"), "export const a = 1\n");
  writeFileSync(join(dir, "web/src/App.tsx"), "export default 1\n");
  writeFileSync(join(dir, "web/src/styles/x.css"), "a{}\n");
  writeFileSync(join(dir, "web/index.html"), "<!doctype html>\n");
}

test("the same code gives the same fingerprint; Finder litter and installed packages don't count", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-version-"));
  try {
    apps(dir);
    const first = fingerprint(dir)!;
    assert.equal(first.files, 5);
    writeFileSync(join(dir, "web/src/.DS_Store"), "junk");
    writeFileSync(join(dir, "brain/src/notes.txt"), "not code");
    writeFileSync(join(dir, "web/node_modules/x/index.js"), "huge");
    assert.equal(fingerprint(dir)!.fingerprint, first.fingerprint);
    writeFileSync(join(dir, "web/src/styles/x.css"), "a{color:red}\n");
    assert.notEqual(fingerprint(dir)!.fingerprint, first.fingerprint, "a CSS-only change is an update too");
    assert.equal(fingerprint(join(dir, "nothing-here")), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("running vs the NAS copy: same, waiting for Build, or unknown", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-version-"));
  try {
    const source = join(dir, "apps");
    apps(source);
    // What the Dockerfile does at build time.
    const json = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", new URL("./version.ts", import.meta.url).pathname, source], { encoding: "utf8" });
    writeFileSync(join(dir, "build.json"), json);

    const check = new VersionCheck(join(dir, "build.json"), source);
    const now = Date.now();
    const same = check.view(now);
    assert.equal(same.copy, "same");
    assert.equal(same.running!.short.length, 7);

    writeFileSync(join(source, "brain/src/index.ts"), "console.log(2)\n"); // synamp-sync copied a change
    assert.equal(check.view(now + 1000).copy, "same", "checked at most once a minute");
    const waiting = check.view(now + 61_000);
    assert.equal(waiting.copy, "waiting");
    assert.ok(waiting.copied_at! > 0);

    assert.equal(new VersionCheck(join(dir, "build.json"), "").view().copy, "unknown", "no NAS copy mounted");
    assert.equal(new VersionCheck(join(dir, "missing.json"), source).view().running, null, "not built as an image");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

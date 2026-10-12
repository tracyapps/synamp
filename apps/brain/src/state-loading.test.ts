import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { WordChecks } from "./library/wordchecks.ts";
import { SpotChecks } from "./library/spotcheck.ts";
import { MoodChecks } from "./library/moodcheck.ts";
import { Favourites } from "./library/favourites.ts";
import { RuntimeSettings } from "./settings.ts";

const defaults = { musicbrainzContact: "", lastfmApiKey: "", lastfmApiSecret: "", publicUrl: "", uploadMaxMb: 2048, listeningPolicy: "epoch-v1" as const, updateChecks: true, updateBeta: false };
const stores = [
  { name: "words", load: (path: string) => new WordChecks(path), format: "synamp.wordchecks/1", field: "checks" },
  { name: "tempo", load: (path: string) => new SpotChecks(path), format: "synamp.spotchecks/1", field: "checks" },
  { name: "mood", load: (path: string) => new MoodChecks(path), format: "synamp.moodchecks/1", field: "answers" },
  { name: "favourites", load: (path: string) => new Favourites(path), format: "synamp.favourites/1", field: "items" },
  { name: "settings", load: (path: string) => new RuntimeSettings(path, defaults), format: "synamp.settings/1", field: "settings" },
];
for (const store of stores) {
  test(`${store.name}: only a missing file is a first run; malformed state stays untouched`, () => {
    const dir = mkdtempSync(join(tmpdir(), "synamp-load-"));
    const path = join(dir, "state.json");
    try {
      assert.doesNotThrow(() => store.load(path));
      for (const bytes of ['{"private_secret":"do-not-print"', 'null', '[]', 'false', JSON.stringify({ format: "synamp.future/2" }), JSON.stringify({ [store.field]: [] })]) {
        writeFileSync(path, bytes);
        assert.throws(() => store.load(path), (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /recovery/i);
          assert.ok(!error.message.includes("do-not-print"));
          return true;
        });
        assert.equal(readFileSync(path, "utf8"), bytes);
      }
      // Older unversioned objects and omitted optional containers stay compatible.
      for (const value of [{}, { [store.field]: {} }, { format: store.format, [store.field]: {} }]) {
        writeFileSync(path, JSON.stringify(value));
        assert.doesNotThrow(() => store.load(path));
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  test(`${store.name}: read errors do not become empty state`, () => {
    const dir = mkdtempSync(join(tmpdir(), "synamp-read-error-"));
    const path = join(dir, "not-a-file");
    try { mkdirSync(path); assert.throws(() => store.load(path), /recovery/i); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test("a dangling state symlink is refused and retained, rather than replaced by first-run defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-dangling-state-"));
  const path = join(dir, "state.json");
  try {
    symlinkSync(join(dir, "missing-target.json"), path);
    for (const store of stores) assert.throws(() => store.load(path), /recovery/i);
    assert.ok(lstatSync(path).isSymbolicLink());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

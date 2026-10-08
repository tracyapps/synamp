/** The librarian writing song details: checked first, audio untouched, all or nothing, and Undo puts files back byte for byte. */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { JobDecision } from "../library/organise.ts";
import { readTags } from "../library/tags.ts";
import { Journal } from "./apply.ts";
import { applyTags, undoTags } from "./tags-apply.ts";

const syncsafe = (n: number) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
function frame(id: string, value: string): Buffer {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from(value, "latin1")]);
  const header = Buffer.alloc(10);
  header.write(id, 0, "latin1");
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}
function mp3(title: string, track: string): Buffer {
  const body = Buffer.concat([frame("TIT2", title), frame("TPE1", "Ani DiFranco"), frame("TRCK", track), Buffer.alloc(100)]);
  return Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0]), syncsafe(body.length), body, Buffer.from([0xff, 0xfb]), randomBytes(5000)]);
}

function setup() {
  const share = mkdtempSync(join(tmpdir(), "synamp-tags-apply-"));
  const root = join(share, "library");
  const files: Record<string, Buffer> = {
    "Ani DiFranco/Dilate/01 - Untouchable Face.mp3": mp3("Untouchable Face", "1"),
    "Ani DiFranco/Dilate/02 - Outta Me.mp3": mp3("Outta Me", "3"),
  };
  for (const [path, bytes] of Object.entries(files)) { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); }
  const journal = join(share, ".synamp", "renames.jsonl");
  const ctx = { root, batch: "b_test", journal: new Journal(journal), backups: join(share, ".synamp", "tag-backups"), now: () => 1 };
  return { share, root, files, ctx, journal, cleanup: () => rmSync(share, { recursive: true, force: true }) };
}
const decision = (edits: JobDecision["edits"]): JobDecision => ({ id: "tags:1", title: "Ani DiFranco — Dilate", kind: "tags", moves: [], folders: [], edits });

test("writes the reviewed details, keeps a small backup, journals it; Undo puts the files back byte for byte", () => {
  const { root, files, ctx, journal, share, cleanup } = setup();
  try {
    const result = applyTags(decision([
      { path: "Ani DiFranco/Dilate/01 - Untouchable Face.mp3", track_id: "t1", now: {}, set: { album: "Dilate", year: 1996 } },
      { path: "Ani DiFranco/Dilate/02 - Outta Me.mp3", track_id: "t2", now: { track_no: 3 }, set: { track_no: 2, album: "Dilate" } },
    ]), ctx);
    assert.equal(result.status, "applied", result.errors.join("; "));
    assert.equal(result.written!.length, 2);
    const one = readTags(join(root, "Ani DiFranco/Dilate/01 - Untouchable Face.mp3"));
    assert.deepEqual([one.title, one.album, one.year], ["Untouchable Face", "Dilate", 1996]);
    assert.equal(readTags(join(root, "Ani DiFranco/Dilate/02 - Outta Me.mp3")).track_no, 2);
    assert.ok(readdirSync(join(root, "Ani DiFranco/Dilate")).every((name) => !name.includes(".synamp-part")), "no temporary files left");
    const backups = readdirSync(join(share, ".synamp", "tag-backups", "b_test"));
    assert.equal(backups.length, 2);
    assert.ok(readFileSync(join(share, ".synamp", "tag-backups", "b_test", backups[0]!)).length < 1000, "only the tag parts are kept, not the music");
    const lines = readFileSync(journal, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.retag, l.reason]), [["Ani DiFranco/Dilate/01 - Untouchable Face.mp3", "song details"], ["Ani DiFranco/Dilate/02 - Outta Me.mp3", "song details"]]);
    assert.ok(lines.every((l) => l.from === undefined), "no from/to: the analyzer doesn't take it for a rename");

    const undone = undoTags({ ...decision([]), restore: result.written }, ctx);
    assert.equal(undone.status, "applied", undone.errors.join("; "));
    for (const [path, bytes] of Object.entries(files)) assert.ok(readFileSync(join(root, path)).equals(bytes), `${path} back exactly`);
  } finally { cleanup(); }
});

test("a file that changed since the review stops the whole album; a failure half-way puts the first files back", () => {
  const { root, files, ctx, cleanup } = setup();
  try {
    const stale = applyTags(decision([
      { path: "Ani DiFranco/Dilate/01 - Untouchable Face.mp3", track_id: "t1", now: {}, set: { album: "Dilate" } },
      { path: "Ani DiFranco/Dilate/02 - Outta Me.mp3", track_id: "t2", now: { track_no: 5 }, set: { track_no: 2 } },
    ]), ctx);
    assert.equal(stale.status, "failed");
    assert.match(stale.errors[0]!, /changed since you reviewed it: its track number is now “3”, not “5”/);
    for (const [path, bytes] of Object.entries(files)) assert.ok(readFileSync(join(root, path)).equals(bytes), "nothing written");

    let calls = 0;
    const broken = applyTags(decision([
      { path: "Ani DiFranco/Dilate/01 - Untouchable Face.mp3", track_id: "t1", now: {}, set: { album: "Dilate" } },
      { path: "Ani DiFranco/Dilate/02 - Outta Me.mp3", track_id: "t2", now: { track_no: 3 }, set: { track_no: 2 } },
    ]), { ...ctx, beforeRename: () => { if (++calls === 2) throw new Error("disk full"); } });
    assert.equal(broken.status, "failed");
    assert.match(broken.errors[0]!, /disk full/);
    assert.deepEqual(broken.notes, ["The files already written in this album were put back."]);
    for (const [path, bytes] of Object.entries(files)) assert.ok(readFileSync(join(root, path)).equals(bytes), `${path} as it was`);

    const missing = applyTags(decision([{ path: "Ani DiFranco/Dilate/09 - Gone.mp3", track_id: "t9", now: {}, set: { album: "Dilate" } }]), ctx);
    assert.match(missing.errors[0]!, /no longer there/);
    const escape = applyTags(decision([{ path: "../outside.mp3", track_id: "t9", now: {}, set: { album: "x" } }]), ctx);
    assert.match(escape.errors[0]!, /Unsafe path refused/);
  } finally { cleanup(); }
});

test("Undo leaves alone a file changed after SynAmp wrote it", () => {
  const { root, ctx, cleanup } = setup();
  try {
    const result = applyTags(decision([{ path: "Ani DiFranco/Dilate/01 - Untouchable Face.mp3", track_id: "t1", now: {}, set: { album: "Dilate" } }]), ctx);
    const path = join(root, "Ani DiFranco/Dilate/01 - Untouchable Face.mp3");
    const edited = Buffer.concat([readFileSync(path), Buffer.from("x")]);
    writeFileSync(path, edited);
    const undone = undoTags({ ...decision([]), restore: result.written }, ctx);
    assert.equal(undone.status, "failed");
    assert.match(undone.errors[0]!, /changed after SynAmp wrote it/);
    assert.ok(readFileSync(path).equals(edited), "left exactly as you made it");
    assert.ok(existsSync(join(ctx.backups, result.written![0]!.backup)), "the backup is kept");
  } finally { cleanup(); }
});

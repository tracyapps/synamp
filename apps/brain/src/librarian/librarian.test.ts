/** The librarian on real (temporary) folders: apply, refuse, put back, undo, report. */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { reverseMove } from "../library/organise.ts";
import type { JobDecision } from "../library/organise.ts";
import { applyDecision, inside, Journal, pruneEmpty, runJob, undoDecision } from "./apply.ts";
import { checkSetup, runOnce } from "./main.ts";

function library(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "synamp-librarian-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  const journalPath = join(root, "..", `${root.split("/").pop()}-journal.jsonl`);
  return {
    root, journalPath, journal: new Journal(journalPath),
    has: (path: string) => existsSync(join(root, path)),
    read: (path: string) => readFileSync(join(root, path), "utf8"),
    tree: () => {
      const out: string[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const name of readdirSync(dir, { withFileTypes: true })) {
          if (name.isDirectory()) walk(join(dir, name.name), `${prefix}${name.name}/`);
          else out.push(prefix + name.name);
        }
      };
      walk(root, "");
      return out.sort();
    },
    journalLines: () => (existsSync(journalPath) ? readFileSync(journalPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []),
    cleanup: () => { rmSync(root, { recursive: true, force: true }); rmSync(journalPath, { force: true }); },
  };
}

const albumDecision = (): JobDecision => ({
  id: "album:1", title: "Ani DiFranco — Little Plastic Castle", kind: "album",
  moves: [
    { from: "Ani DiFranco/Little Plastic Castle/Gravel.mp3", to: "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3", track_id: "p:1", audio_hash: "h1" },
    { from: "Ani DiFranco/Little Plastic Castle/CD2/Fuel.mp3", to: "Ani DiFranco/Little Plastic Castle (1998)/2-01 - Fuel.mp3", track_id: "p:2" },
  ],
  folders: [
    { from: "Ani DiFranco/Little Plastic Castle/CD2", to: "Ani DiFranco/Little Plastic Castle (1998)", keep: [] },
    { from: "Ani DiFranco/Little Plastic Castle", to: "Ani DiFranco/Little Plastic Castle (1998)", keep: ["Ani DiFranco/Little Plastic Castle/Bonus"] },
  ],
});

const startingFiles = {
  "Ani DiFranco/Little Plastic Castle/Gravel.mp3": "gravel-audio",
  "Ani DiFranco/Little Plastic Castle/CD2/Fuel.mp3": "fuel-audio",
  "Ani DiFranco/Little Plastic Castle/cover.jpg": "art",
  "Ani DiFranco/Little Plastic Castle/Scans/back.jpg": "scan",
  "Ani DiFranco/Little Plastic Castle/.DS_Store": "junk",
  "Ani DiFranco/Little Plastic Castle/CD2/._Fuel.mp3": "junk",
  "Ani DiFranco/Little Plastic Castle/Bonus/Demo.mp3": "another album's",
};

test("apply: renames, artwork follows, empty folders tidied, every move journaled", () => {
  const lib = library(startingFiles);
  try {
    const result = applyDecision(albumDecision(), { root: lib.root, batch: "b_1", journal: lib.journal, now: () => 42 });
    assert.equal(result.status, "applied", result.errors.join("; "));
    assert.deepEqual(lib.tree(), [
      "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3",
      "Ani DiFranco/Little Plastic Castle (1998)/2-01 - Fuel.mp3",
      "Ani DiFranco/Little Plastic Castle (1998)/Scans/back.jpg",
      "Ani DiFranco/Little Plastic Castle (1998)/cover.jpg",
      "Ani DiFranco/Little Plastic Castle/.DS_Store",
      "Ani DiFranco/Little Plastic Castle/Bonus/Demo.mp3",
    ], "CD2 and its ._ junk are gone; the nested Bonus album stayed, so its folder (and .DS_Store) stays");
    assert.equal(lib.read("Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3"), "gravel-audio", "bytes untouched");
    const journal = lib.journalLines();
    assert.equal(journal.length, 4);
    assert.deepEqual(journal[0], {
      from: "Ani DiFranco/Little Plastic Castle/Gravel.mp3", to: "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3",
      track_id: "p:1", audio_hash: "h1", reason: "organise: Ani DiFranco — Little Plastic Castle", batch: "b_1", decision: "album:1", at: 42,
    });
    assert.ok(journal.slice(2).every((entry) => /moved with its folder/.test(entry.reason)));
    assert.equal(result.moved.length, 4, "the report lists artwork moves too, so undo can put them back");

    // Undo puts everything back where it was (junk files aside).
    const back = undoDecision({ ...albumDecision(), moves: [...result.moved].reverse().map((m) => ({ ...m, from: m.to, to: m.from })) },
      { root: lib.root, batch: "b_1", journal: lib.journal });
    assert.equal(back.status, "applied", back.errors.join("; "));
    assert.deepEqual(lib.tree(), Object.keys(startingFiles).filter((p) => !/\/\._/.test(p)).sort());
    assert.equal(lib.journalLines().at(-1).reason, "undo");
  } finally { lib.cleanup(); }
});

test("apply: refuses before touching anything when a file vanished or a target exists", () => {
  const lib = library({ ...startingFiles, "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3": "already here" });
  try {
    const before = lib.tree();
    const result = applyDecision(albumDecision(), { root: lib.root, batch: "b", journal: lib.journal });
    assert.equal(result.status, "failed");
    assert.match(result.errors[0]!, /already exists/);
    assert.deepEqual(lib.tree(), before);
    assert.equal(lib.journalLines().length, 0);

    rmSync(join(lib.root, "Ani DiFranco/Little Plastic Castle (1998)"), { recursive: true });
    rmSync(join(lib.root, "Ani DiFranco/Little Plastic Castle/Gravel.mp3"));
    const gone = applyDecision(albumDecision(), { root: lib.root, batch: "b", journal: lib.journal });
    assert.match(gone.errors[0]!, /no longer there/);

    const twice: JobDecision = { ...albumDecision(), moves: [
      { from: "Ani DiFranco/Little Plastic Castle/cover.jpg", to: "x/a.jpg" },
      { from: "Ani DiFranco/Little Plastic Castle/CD2/Fuel.mp3", to: "x/a.jpg" },
    ] };
    assert.match(applyDecision(twice, { root: lib.root, batch: "b", journal: lib.journal }).errors.join(), /both become/);
  } finally { lib.cleanup(); }
});

test("apply: a failure half-way puts back what was already moved", () => {
  const lib = library(startingFiles);
  try {
    const before = lib.tree();
    let renames = 0;
    const result = applyDecision(albumDecision(), {
      root: lib.root, batch: "b", journal: lib.journal,
      beforeRename: () => { if (++renames === 2) throw new Error("disk said no"); },
    });
    assert.equal(result.status, "failed");
    assert.deepEqual(result.errors, ["disk said no"]);
    assert.deepEqual(result.moved, []);
    assert.deepEqual(lib.tree(), before, "first rename undone, new folder removed");
    assert.deepEqual(lib.journalLines().map((e) => e.reason), ["organise: Ani DiFranco — Little Plastic Castle", "put back after a failed step"]);
  } finally { lib.cleanup(); }
});

test("paths that could leave the library are refused; the library root is never removed", () => {
  const lib = library({ "a/b.mp3": "x" });
  try {
    for (const bad of ["../outside.mp3", "/etc/passwd", "a/../../x"]) assert.throws(() => inside(lib.root, bad), /refused/);
    const evil: JobDecision = { id: "x", title: "x", kind: "album", moves: [{ from: "a/b.mp3", to: "../escaped.mp3" }], folders: [] };
    const result = applyDecision(evil, { root: lib.root, batch: "b", journal: lib.journal });
    assert.equal(result.status, "failed");
    assert.ok(lib.has("a/b.mp3"));
    rmSync(join(lib.root, "a/b.mp3"));
    pruneEmpty(lib.root, join(lib.root, "a"));
    assert.ok(existsSync(lib.root));
    assert.ok(!lib.has("a"));
  } finally { lib.cleanup(); }
});

test("artist merge: whole folders, everything follows, the variant folder disappears", () => {
  const lib = library({
    "Ani Difranco/Dilate/01 Untouchable Face.mp3": "a",
    "Ani Difranco/Dilate/folder.jpg": "art",
    "Ani Difranco/notes.txt": "n",
    "Ani DiFranco/Evolve/01 Promised Land.mp3": "b",
  });
  try {
    const merge: JobDecision = { id: "artist:1", title: "Merge", kind: "artist",
      moves: [{ from: "Ani Difranco/Dilate/01 Untouchable Face.mp3", to: "Ani DiFranco/Dilate/01 Untouchable Face.mp3" }],
      folders: [{ from: "Ani Difranco", to: "Ani DiFranco" }] };
    const [result] = runJob({ kind: "apply", batch: "b", decisions: [merge] }, { root: lib.root, journal: lib.journal });
    assert.equal(result!.status, "applied", result!.errors.join());
    assert.deepEqual(lib.tree(), ["Ani DiFranco/Dilate/01 Untouchable Face.mp3", "Ani DiFranco/Dilate/folder.jpg", "Ani DiFranco/Evolve/01 Promised Land.mp3", "Ani DiFranco/notes.txt"]);
  } finally { lib.cleanup(); }
});

test("the librarian loop: claims a job from the brain, does it, reports — and resends a lost report", async () => {
  const lib = library(startingFiles);
  const state = mkdtempSync(join(tmpdir(), "synamp-librarian-state-"));
  try {
    assert.deepEqual(checkSetup({ root: lib.root, brainUrl: "x", token: "t", journal: lib.journalPath, stateDir: state, pollSeconds: 10 }), []);
    assert.equal(checkSetup({ root: "", brainUrl: "x", token: "", stateDir: state, pollSeconds: 10 }).length, 2);
    assert.match(checkSetup({ root: "/", brainUrl: "x", token: "", journal: "j", stateDir: state, pollSeconds: 10 })[0]!, /filesystem root/);

    const reports: unknown[] = [];
    const progress: Array<{ done: number; current?: string }> = [];
    let failReport = true;
    let offered = false;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      assert.equal((init?.headers as Record<string, string>).authorization, "Bearer secret");
      if (href.endsWith("/api/v1/librarian/claim")) {
        const job = offered ? null : { id: "j_000000000001", batch: "b_1", kind: "apply", status: "running", created_at: 0, decisions: [albumDecision()] };
        offered = true;
        return Response.json({ job });
      }
      if (href.endsWith("/api/v1/librarian/jobs/j_000000000001/progress")) {
        progress.push(JSON.parse(String(init?.body)));
        return Response.json({ ok: true });
      }
      if (href.endsWith("/api/v1/librarian/jobs/j_000000000001")) {
        if (failReport) { failReport = false; return new Response("down", { status: 503 }); }
        reports.push(JSON.parse(String(init?.body)));
        return Response.json({ job: { status: "done" } });
      }
      return new Response("?", { status: 404 });
    }) as typeof fetch;
    const config = { root: lib.root, brainUrl: "http://brain", token: "secret", journal: lib.journalPath, stateDir: state, pollSeconds: 10 };
    const quiet = () => {};
    assert.equal(await runOnce(config, fetchImpl, quiet), "unreachable", "the work was done but the report bounced");
    assert.ok(lib.has("Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3"));
    assert.ok(existsSync(join(state, "pending-report.json")));
    assert.equal(await runOnce(config, fetchImpl, quiet), "idle", "next round: report delivered first, then nothing to do");
    assert.equal(reports.length, 1);
    assert.deepEqual(progress[0], { done: 0, current: "Ani DiFranco — Little Plastic Castle" }, "the web app hears it has started");
    assert.equal((reports[0] as { results: Array<{ status: string }> }).results[0]!.status, "applied");
    assert.ok(!existsSync(join(state, "pending-report.json")));
  } finally { lib.cleanup(); rmSync(state, { recursive: true, force: true }); }
});

test("import: files from incoming/ are filed, artwork follows, identical copies set aside, undo puts them back", () => {
  const lib = library({ "Ani DiFranco/Little Plastic Castle (1998)/01 - Little Plastic Castle.mp3": "lpc" });
  const incoming = mkdtempSync(join(tmpdir(), "synamp-incoming-"));
  try {
    const add = (path: string, content: string) => { mkdirSync(dirname(join(incoming, path)), { recursive: true }); writeFileSync(join(incoming, path), content); };
    add("ani/lpc/Gravel.mp3", "gravel");
    add("ani/lpc/cover.jpg", "art");
    add("ani/lpc/.DS_Store", "junk");
    add("ani/lpc/again.mp3", "lpc");
    const decision: JobDecision = { id: "import:1", title: "New: Ani DiFranco — Little Plastic Castle", kind: "import",
      moves: [
        { from: "ani/lpc/Gravel.mp3", to: "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3", from_area: "incoming" },
        { from: "ani/lpc/again.mp3", to: "_duplicates/ani/lpc/again.mp3", from_area: "incoming", to_area: "incoming" },
      ],
      folders: [{ from: "ani/lpc", to: "Ani DiFranco/Little Plastic Castle (1998)", from_area: "incoming" }] };
    assert.match(applyDecision(decision, { root: lib.root, batch: "b", journal: lib.journal }).errors[0]!, /LIBRARIAN_INCOMING_PATH/);

    const ctx = { root: lib.root, incoming, batch: "b_2", journal: lib.journal };
    const result = applyDecision(decision, ctx);
    assert.equal(result.status, "applied", result.errors.join());
    assert.deepEqual(lib.tree(), [
      "Ani DiFranco/Little Plastic Castle (1998)/01 - Little Plastic Castle.mp3",
      "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3",
      "Ani DiFranco/Little Plastic Castle (1998)/cover.jpg",
    ]);
    assert.ok(existsSync(join(incoming, "_duplicates/ani/lpc/again.mp3")), "set aside, not deleted");
    assert.ok(!existsSync(join(incoming, "ani")), "the emptied arrival folder is tidied away");
    assert.ok(existsSync(incoming), "incoming/ itself always stays");
    const journal = lib.journalLines();
    assert.ok(journal.every((line) => line.from === undefined && line.to === undefined), "the analyzer must not read imports as renames");
    assert.equal(journal[0].source_area, "incoming");
    assert.equal(journal[0].target, "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3");

    const back = undoDecision({ ...decision, folders: [], moves: [...result.moved].reverse().map(reverseMove) }, ctx);
    assert.equal(back.status, "applied", back.errors.join());
    assert.ok(existsSync(join(incoming, "ani/lpc/Gravel.mp3")) && existsSync(join(incoming, "ani/lpc/again.mp3")) && existsSync(join(incoming, "ani/lpc/cover.jpg")));
    assert.deepEqual(lib.tree(), ["Ani DiFranco/Little Plastic Castle (1998)/01 - Little Plastic Castle.mp3"]);
  } finally { lib.cleanup(); rmSync(incoming, { recursive: true, force: true }); }
});

test("import across disks: copied, checksum-verified, then the original removed", { skip: !existsSync("/dev/shm") || statSync("/dev/shm").dev === statSync(tmpdir()).dev }, () => {
  const lib = library({});
  const incoming = mkdtempSync(join("/dev/shm", "synamp-incoming-"));
  try {
    writeFileSync(join(incoming, "song.mp3"), "a".repeat(5000));
    const decision: JobDecision = { id: "import:2", title: "New", kind: "import", moves: [{ from: "song.mp3", to: "A/B (2000)/01 - Song.mp3", from_area: "incoming" }], folders: [] };
    const result = applyDecision(decision, { root: lib.root, incoming, batch: "b", journal: lib.journal });
    assert.equal(result.status, "applied", result.errors.join());
    assert.equal(lib.read("A/B (2000)/01 - Song.mp3"), "a".repeat(5000));
    assert.ok(!existsSync(join(incoming, "song.mp3")));
    assert.deepEqual(lib.tree(), ["A/B (2000)/01 - Song.mp3"], "no temporary copies left behind");
  } finally { lib.cleanup(); rmSync(incoming, { recursive: true, force: true }); }
});

test("duplicates: the worse copy is set aside first, the better one takes its place; names never clash; undo puts both back", () => {
  const lib = library({
    "Ani DiFranco/Dilate (1996)/02 - Outta Me.flac": "16-bit",
    "DiFranco, Ani/Dilate (1996)/02 - Outta Me.flac": "24-bit",
    "DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3": "twin",
    "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3": "twin",
  });
  const incoming = mkdtempSync(join(tmpdir(), "synamp-incoming-"));
  try {
    // An earlier set-aside already holds the name: this one gets " (2)".
    mkdirSync(join(incoming, "_duplicates/DiFranco, Ani/Dilate (1996)"), { recursive: true });
    writeFileSync(join(incoming, "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3"), "older set-aside");
    const decision: JobDecision = {
      id: "artist:1", title: "Merge “DiFranco, Ani” into “Ani DiFranco”", kind: "artist",
      moves: [
        { from: "DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3", to: "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3", to_area: "incoming", track_id: "t1" },
        { from: "Ani DiFranco/Dilate (1996)/02 - Outta Me.flac", to: "_duplicates/Ani DiFranco/Dilate (1996)/02 - Outta Me.flac", to_area: "incoming", track_id: "t2" },
        { from: "DiFranco, Ani/Dilate (1996)/02 - Outta Me.flac", to: "Ani DiFranco/Dilate (1996)/02 - Outta Me.flac", track_id: "t3" },
      ],
      folders: [{ from: "DiFranco, Ani", to: "Ani DiFranco" }],
    };
    const ctx = { root: lib.root, incoming, batch: "b_d", journal: lib.journal };
    const result = applyDecision(decision, ctx);
    assert.equal(result.status, "applied", result.errors.join("; "));
    assert.deepEqual(lib.tree(), ["Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3", "Ani DiFranco/Dilate (1996)/02 - Outta Me.flac"]);
    assert.equal(lib.read("Ani DiFranco/Dilate (1996)/02 - Outta Me.flac"), "24-bit", "the better copy took the place");
    assert.equal(readFileSync(join(incoming, "_duplicates/Ani DiFranco/Dilate (1996)/02 - Outta Me.flac"), "utf8"), "16-bit", "set aside, not deleted");
    assert.equal(readFileSync(join(incoming, "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face (2).mp3"), "utf8"), "twin");
    assert.equal(readFileSync(join(incoming, "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3"), "utf8"), "older set-aside", "nothing overwritten");
    assert.equal(result.moved[0]!.to, "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face (2).mp3", "the report says where it really went");
    const journal = lib.journalLines();
    assert.equal(journal[0].target_area, "incoming");
    assert.equal(journal[0].from, undefined, "set-asides are not library renames for the analyzer");
    assert.match(journal[0].reason, /^set aside/);

    const undo: JobDecision = { ...decision, folders: [], moves: [...result.moved].reverse().map(reverseMove) };
    assert.equal(undoDecision(undo, ctx).status, "applied");
    assert.equal(lib.read("Ani DiFranco/Dilate (1996)/02 - Outta Me.flac"), "16-bit");
    assert.equal(lib.read("DiFranco, Ani/Dilate (1996)/02 - Outta Me.flac"), "24-bit");
    assert.equal(lib.read("DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3"), "twin");
    assert.equal(readFileSync(join(incoming, "_duplicates/DiFranco, Ani/Dilate (1996)/01 - Untouchable Face.mp3"), "utf8"), "older set-aside");
  } finally { lib.cleanup(); rmSync(incoming, { recursive: true, force: true }); }
});

test("duplicates: a place is only free when an earlier move in the same decision empties it", () => {
  const lib = library({ "A/x.mp3": "a", "B/x.mp3": "b" });
  const incoming = mkdtempSync(join(tmpdir(), "synamp-incoming-"));
  try {
    // Wrong order: the move comes before the set-aside that would make room.
    const decision: JobDecision = { id: "artist:2", title: "Merge", kind: "artist", folders: [], moves: [
      { from: "B/x.mp3", to: "A/x.mp3" },
      { from: "A/x.mp3", to: "_duplicates/A/x.mp3", to_area: "incoming" },
    ] };
    const result = applyDecision(decision, { root: lib.root, incoming, batch: "b", journal: lib.journal });
    assert.equal(result.status, "failed");
    assert.match(result.errors[0]!, /already exists/);
    assert.deepEqual(lib.tree(), ["A/x.mp3", "B/x.mp3"], "nothing touched");
  } finally { lib.cleanup(); rmSync(incoming, { recursive: true, force: true }); }
});

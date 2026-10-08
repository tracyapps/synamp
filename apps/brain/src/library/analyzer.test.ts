/** The analyzer driven from the web app: the brain's side of the queue. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ACTIVITY_STALE_MS, AnalyzerControl, WORKER_ONLINE_MS, macPath } from "./analyzer.ts";

const temp = () => mkdtempSync(join(tmpdir(), "synamp-analyzer-control-"));

test("buttons queue commands; the worker takes one at a time and reports back", () => {
  const dir = temp();
  try {
    const control = new AnalyzerControl(join(dir, "control.json"));
    assert.equal(control.view().worker, null, "never seen: the web app explains how to install it");
    const update = control.request("update", "you", 1);
    assert.equal(control.request("scan", "you", 2).id, update.id, "a waiting update already scans: not queued twice");
    const analyze = control.request("analyze", "you", 3);
    assert.throws(() => control.request("reformat"), /action must be/);

    const first = control.claim({ host: "tappsBook", version: "0.4", library_ok: true, library_path: "/Volumes/music/library" }, 10)!;
    assert.equal(first.id, update.id);
    assert.equal(control.view(10).worker!.online, true);
    assert.equal(control.view(10).running!.action, "update");
    control.complete(first.id, { status: "done", summary: "scan: 46,168 files; library list updated" }, 20);

    const second = control.claim({}, 30)!;
    assert.equal(second.id, analyze.id);
    assert.throws(() => control.request("analyze"), /already running/);
    assert.equal(control.check(second.id).stop, false);
    control.stop(40);
    assert.equal(control.check(second.id).stop, true, "Pause: the worker stops after the current track");
    control.complete(second.id, { status: "stopped", summary: "analysed 120 tracks" }, 50);
    assert.equal(control.claim({}, 60), null);

    const saved = new AnalyzerControl(join(dir, "control.json"));
    assert.deepEqual(saved.view(60).recent.map((c) => [c.action, c.status]), [["analyze", "stopped"], ["update", "done"]]);
    assert.equal(saved.view(60 + WORKER_ONLINE_MS + 1).worker!.online, false, "quiet for a minute: shown as not running");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an interrupted command is marked as such; the librarian's batches trigger an update unless switched off", () => {
  const dir = temp();
  try {
    const control = new AnalyzerControl(join(dir, "control.json"));
    control.request("export", "you", 1);
    control.claim({}, 2);
    // The Mac slept mid-export; when the worker asks again it is free, so that run is over.
    control.request("scan", "you", 3);
    const next = control.claim({ problem: "The music isn't reachable" }, 4)!;
    assert.equal(next.action, "scan");
    assert.match(control.view(4).recent[0]!.summary!, /Interrupted/);
    assert.equal(control.view(4).worker!.problem, "The music isn't reachable");
    control.complete(next.id, { status: "failed", summary: "The music isn't reachable" }, 5);

    assert.equal(control.afterLibrarian()!.requested_by, "the librarian");
    control.stop(6);
    assert.equal(control.view(6).recent[0]!.status, "cancelled", "Pause also clears what was waiting");
    control.setSettings({ update_after_librarian: false });
    assert.equal(control.afterLibrarian(), null);
    assert.throws(() => control.setSettings({ update_after_librarian: "yes" }), /true or false/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("while analysis waits for a library list update, the web app sees how far along it is", () => {
  const dir = temp();
  try {
    const control = new AnalyzerControl(join(dir, "control.json"));
    control.request("analyze", "you", 1);
    const job = control.claim({ host: "tappsBook" }, 2)!;
    control.setActivity(job.id, { activity: { kind: "export" } }, 3);
    assert.deepEqual(control.view(3).running!.activity, { kind: "export", at: 3 }, "started, count not known yet");
    control.setActivity(job.id, { activity: { kind: "export", done: 26_300, total: 46_151 } }, 4);
    assert.deepEqual(control.view(4).running!.activity, { kind: "export", done: 26_300, total: 46_151, at: 4 });
    control.setActivity(job.id, { activity: { kind: "export", done: 99, total: 10 } }, 5);
    assert.equal(control.view(5).running!.activity!.done, 10, "never more than the total");
    assert.throws(() => control.setActivity(job.id, { activity: { kind: "dance" } }), /activity must be/);
    assert.throws(() => control.setActivity("a_000000000000", { activity: null }), /No command/);
    assert.equal(control.view(5 + ACTIVITY_STALE_MS + 1).running!.activity, undefined, "old numbers aren't shown");
    control.setActivity(job.id, { activity: null }, 6);
    assert.equal(control.view(6).running!.activity, undefined, "cleared when the update is done");
    control.setActivity(job.id, { activity: { kind: "export" } }, 7);
    control.complete(job.id, { status: "done" }, 8);
    assert.equal(control.view(8).recent[0]!.activity, undefined, "a finished command carries none");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("memory for analysis: steady, more at set hours, or more while you're away", () => {
  const dir = temp();
  try {
    const control = new AnalyzerControl(join(dir, "control.json"));
    assert.deepEqual(control.memory(), { mode: "steady", normal_gb: null, more_gb: null, from: "22:00", to: "07:00", away_minutes: 10 }, "recommended until you choose");
    control.setSettings({ memory: { normal_gb: 8 } });
    control.setSettings({ memory: { mode: "hours", more_gb: 24, from: "23:30", to: "06:00" } });
    const saved = new AnalyzerControl(join(dir, "control.json"));
    assert.deepEqual(saved.memory(), { mode: "hours", normal_gb: 8, more_gb: 24, from: "23:30", to: "06:00", away_minutes: 10 }, "kept, and earlier choices survive a partial change");
    assert.equal(saved.view().settings.update_after_librarian, true);
    saved.setSettings({ memory: { normal_gb: null } });
    assert.equal(saved.memory().normal_gb, null, "back to the recommendation");
    assert.throws(() => saved.setSettings({ memory: { mode: "turbo" } }), /mode must be/);
    assert.throws(() => saved.setSettings({ memory: { normal_gb: 0 } }), /between 1 and 1024/);
    assert.throws(() => saved.setSettings({ memory: { from: "25:00" } }), /time like 22:00/);
    assert.throws(() => saved.setSettings({ memory: { from: "06:00", to: "06:00" } }), /same/);

    const command = saved.request("analyze", "you", 1);
    saved.claim({ host: "mac", memory_gb: 48, cores: 14, memory_now: { gb: 8, songs: 2, why: "normal" } }, 2);
    assert.equal(saved.view(2).worker!.memory_gb, 48);
    assert.deepEqual(saved.view(2).worker!.memory_now, { gb: 8, songs: 2, why: "normal", at: 2 });
    const answer = saved.check(command.id, { memory_now: { gb: 24, songs: 8, why: "hours" } }, 3);
    assert.equal(answer.memory.mode, "hours", "the worker hears the setting while it analyses");
    assert.equal(saved.view(3).worker!.memory_now!.why, "hours");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Open in Finder: the Mac that analyses the music opens the folder; each request is handed out once", () => {
  const worker = { last_seen: 1, library_path: "/Volumes/music/library" };
  assert.equal(macPath(worker, "library", "Eric Clapton/Conception (2003)"), "/Volumes/music/library/Eric Clapton/Conception (2003)");
  assert.equal(macPath(worker, "incoming", "_duplicates"), "/Volumes/music/incoming/_duplicates");
  assert.equal(macPath(worker, "library", ""), "/Volumes/music/library");
  for (const bad of ["../x", "/etc", "a/../../b"]) assert.equal(macPath(worker, "library", bad), undefined, bad);
  assert.equal(macPath(worker, "home", "x"), undefined);
  assert.equal(macPath({ last_seen: 1 }, "library", "x"), undefined, "the Mac hasn't said where the music is");

  const control = new AnalyzerControl(join(mkdtempSync(join(tmpdir(), "synamp-reveal-")), "c.json"));
  assert.throws(() => control.reveal("library", "A", 1000), /isn’t connected/);
  control.claim({ host: "Mac.local", library_path: "/Volumes/music/library" }, 1000);
  assert.deepEqual(control.reveal("library", "A/B", 2000), { host: "Mac.local", path: "/Volumes/music/library/A/B" });
  control.reveal("library", "A/B", 2100);
  control.reveal("incoming", "_duplicates", 2200);
  assert.throws(() => control.reveal("library", "../../Users", 2300), /can’t be opened/);
  assert.deepEqual(control.takeReveals(3000), ["/Volumes/music/library/A/B", "/Volumes/music/incoming/_duplicates"], "the same folder once");
  assert.deepEqual(control.takeReveals(3500), []);
  control.reveal("library", "C", 4000);
  assert.deepEqual(control.takeReveals(4000 + 61_000), [], "nobody asked in time: dropped, not opened later by surprise");
  assert.throws(() => control.reveal("library", "C", 4000 + 61_000 + 60_000), /isn’t connected/);
});

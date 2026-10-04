/** The analyzer driven from the web app: the brain's side of the queue. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AnalyzerControl, WORKER_ONLINE_MS } from "./analyzer.ts";

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
    assert.deepEqual(control.check(second.id), { stop: false });
    control.stop(40);
    assert.deepEqual(control.check(second.id), { stop: true }, "Pause: the worker stops after the current track");
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

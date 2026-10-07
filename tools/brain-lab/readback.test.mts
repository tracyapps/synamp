import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const script = new URL("./readback.mts", import.meta.url).pathname;
const library = new URL("../../apps/brain/fixtures/library.sample.json", import.meta.url).pathname;
const now = Date.parse("2026-10-07T18:00:00Z");

test("read-back uses explicit snapshots/clock, reports usable coverage, and never changes inputs", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-readback-"));
  const input = join(dir, "input");
  mkdirSync(input);
  const events = join(input, "events.jsonl");
  const line = (id: string, ts: number) => JSON.stringify({ id, ts, signal: "love", track_id: "sample-001", scope: "global", source: "player", policy_version: "epoch-v1" });
  writeFileSync(events, [line("love", now - 1000), line("future", now + 1000)].join("\n") + "\n");
  const before = readFileSync(events);
  const libraryBefore = readFileSync(library);
  const args = ["--library", library, "--events", events, "--prompt", "focus", "--now", new Date(now).toISOString(), "--timezone", "America/Chicago", "--material", "synthetic"];
  const run = (...extra: string[]) => spawnSync(process.execPath, ["--experimental-strip-types", script, ...args, ...extra], { encoding: "utf8" });
  try {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.material, "synthetic");
    assert.equal(report.evidence_state, "offline-replay-only");
    assert.equal(report.denominators.future_events_excluded, 1);
    assert.equal(report.denominators.as_of_events, 1);
    assert.equal(report.adaptive.policy, "epoch-v1");
    assert.equal(report.legacy.policy, "heuristic-v1");
    assert.ok(report.adjustments.find((a: any) => a.track_id === "sample-001").value > 0);
    assert.ok(report.axis_coverage.bpm.usable <= report.axis_coverage.bpm.measured);
    assert.equal(run("--out", events).status, 1, "cannot replace an input");
    const out = join(dir, "report.json");
    assert.equal(run("--out", out).status, 0);
    const saved = readFileSync(out);
    assert.equal(run("--out", out).status, 1, "cannot replace a prior report");
    assert.deepEqual(readFileSync(out), saved);
    const second = run();
    const replay = JSON.parse(second.stdout);
    delete report.computational_ms;
    delete replay.computational_ms;
    assert.deepEqual(report, replay, "all policy output except measured runtime is deterministic");
    assert.deepEqual(readFileSync(events), before);
    assert.deepEqual(readFileSync(library), libraryBefore);
    const ambiguousArgs = [...args];
    ambiguousArgs[ambiguousArgs.indexOf("--prompt") + 1] = "fast relaxing bangers";
    const ambiguous = spawnSync(process.execPath, ["--experimental-strip-types", script, ...ambiguousArgs], { encoding: "utf8" });
    assert.equal(ambiguous.status, 1);
    assert.match(ambiguous.stderr, /contradictory/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("read-back refuses an ambient clock or timezone", () => {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script, "--library", library, "--events", "unused"], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--timezone is required/);
});

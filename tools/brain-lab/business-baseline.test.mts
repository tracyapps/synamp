import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseline } from "./business-baseline.mts";

test("unknown signals never become measured passes and unsupported/manual cases remain visible", () => {
  const cases = baseline({ version: "unknown", tracks: [{ id: "unknown", title: "Unknown", signals: {} }] }, Date.parse("2026-10-11T18:00:00Z"));
  assert.equal(cases.length, 12);
  const noVocals = cases.find(c => c.id === "Q02")!;
  assert.ok(noVocals.status === "evaluated-unrated");
  assert.equal(noVocals.returned, 0);
  assert.equal(noVocals.requested, 12);
  assert.equal(noVocals.underfilled, true);
  assert.ok(Object.values(noVocals.counts!.unknown_by).some(n => n > 0));
  assert.equal(cases.find(c => c.id === "Q07")!.status, "interpretation-review");
  assert.equal(cases.filter(c => c.status === "manual-pending").length, 3);
  assert.ok(cases.every(c => c.judgment.useful === null && c.judgment.audible_hard_rule_violations === null));
});

test("CLI preserves frozen input, creates a private exclusive report and emits no track names", () => {
  const root = mkdtempSync(join(tmpdir(), "synamp-business-baseline-"));
  try {
    const inputs = join(root, "inputs"), outputs = join(root, "outputs");
    mkdirSync(inputs); mkdirSync(outputs);
    const library = join(inputs, "library.json"), out = join(outputs, "report.json");
    const bytes = JSON.stringify({ tracks: [{ id: "private-id", title: "Private title", stages_done: ["identity"], signals: {} }], counts: { failed: 7 } });
    writeFileSync(library, bytes);
    const args = ["--experimental-strip-types", "tools/brain-lab/business-baseline.mts", "--library", library, "--now", "2026-10-11T18:00:00Z", "--material", "unverified", "--out", out];
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("Private title") && !result.stdout.includes("private-id"));
    assert.equal(readFileSync(library, "utf8"), bytes);
    assert.equal(statSync(out).mode & 0o777, 0o600);
    const report = JSON.parse(readFileSync(out, "utf8"));
    assert.equal(report.quality_gate, "not-assessed");
    assert.equal(report.export_counts.failed, 7);
    assert.deepEqual(report.stages.identity, { marked_complete: 1, not_marked_complete: 0 });
    assert.deepEqual(report.stages.voice, { marked_complete: 0, not_marked_complete: 1 });
    assert.match(report.input_sha256, /^[a-f0-9]{64}$/);
    assert.match(report.source.head, /^[a-f0-9]{40}$/);
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 1, "never overwrite a previous report");
    args[args.length - 1] = join(inputs, "report.json");
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 1, "never write into the input store");
    mkdirSync(join(inputs, "nested"));
    args[args.length - 1] = join(inputs, "nested/report.json");
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 1, "nested output is still in the input store");
    args[args.length - 1] = join(outputs, "bad.json");
    args[args.indexOf("2026-10-11T18:00:00Z")] = "2026-10-11T18:00:00";
    assert.equal(spawnSync(process.execPath, args, { encoding: "utf8" }).status, 1, "clock must carry an offset");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

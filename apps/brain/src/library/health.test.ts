import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AnalysisStatus, cleanProgress, libraryStats, STALE_AFTER_MS } from "./health.ts";

const report = (overrides: Record<string, unknown> = {}) => ({
  format: "synamp.analysis-progress/1", state: "analyzing", analyzer_version: "0.2.0", host: "mac",
  catalog: { tracks: 100, present: 98, missing: 2 }, queue: { pending: 40, running: 1, done: 55, failed: 2 },
  stage_order: ["identity", "dsp_core", "beat"], stages: { identity: 60, dsp_core: 57, beat: 55 }, fully_analysed: 55,
  fingerprints: { tool_missing: 60 }, recent_failures: [{ path: "A/bad.flac", error: "unreadable", attempts: 3 }],
  run: { started_at: 1, completed: 12, failed: 1, reused: 2, remaining: 41, current: "song.flac", rate_per_minute: 6, eta_seconds: 410 },
  ...overrides,
});

test("progress reports are type-checked and trimmed to what the UI uses", () => {
  const clean = cleanProgress(report({ catalog: { tracks: "lots", present: -4 }, extra: "ignored", recent_failures: Array(50).fill({ path: "x", error: "e".repeat(999) }) }), 5);
  assert.deepEqual(clean.catalog, { tracks: 0, present: 0, missing: 0 });
  assert.equal((clean.recent_failures as unknown[]).length, 20);
  assert.equal(((clean.recent_failures as Array<{ error: string }>)[0]!.error).length, 300);
  assert.ok(!("extra" in clean));
  assert.equal(clean.received_at, 5);
  assert.throws(() => cleanProgress({ format: "other" }), /Expected a synamp.analysis-progress\/1 report/);
});

test("the latest report survives a restart, and silence while analysing shows as stale", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-health-"));
  try {
    const path = join(dir, "analysis-status.json");
    const status = new AnalysisStatus(path);
    assert.deepEqual(status.view(), { reported: false });
    status.record(report(), 1_000);
    const reopened = new AnalysisStatus(path);
    const fresh = reopened.view(1_000 + 30_000);
    assert.equal(fresh.reported && fresh.stale, false);
    const later = reopened.view(1_000 + STALE_AFTER_MS + 1);
    assert.equal(later.reported && later.stale, true, "the Mac probably went to sleep");
    reopened.record(report({ state: "idle" }), 2_000);
    const idle = reopened.view(2_000 + STALE_AFTER_MS * 10);
    assert.equal(idle.reported && idle.stale, false, "idle is never stale");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("library stats count names, identity and duplicate copies", () => {
  const stats = libraryStats({ version: "v", tracks: [
    { id: "a", title: "A", artist: "X", album: "One", metadata_source: "tags", audio_hash: "h1", signals: { bpm: 100 } },
    { id: "b", title: "B", artist: "x", album: "one", metadata_source: "tags", audio_hash: "h1", signals: {} },
    { id: "c", title: "C", artist: "Y", metadata_source: "path", audio_hash: "h1" },
    { id: "d", title: "D", artist: "Y", metadata_source: "path", audio_hash: "h2" },
    { id: "e", title: "E" },
  ] });
  assert.equal(stats.tracks, 5);
  assert.equal(stats.artists, 2, "artist names compare case-insensitively");
  assert.equal(stats.albums, 1);
  assert.equal(stats.named_from_tags, 2);
  assert.equal(stats.named_from_folders, 3);
  assert.equal(stats.with_audio_identity, 4);
  assert.equal(stats.with_measurements, 1);
  assert.equal(stats.duplicate_groups, 1);
  assert.equal(stats.duplicate_extra_copies, 2);
});

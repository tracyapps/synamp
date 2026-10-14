/** When SynAmp counts as busy (the Mac app keeps the computer awake then). */

import assert from "node:assert/strict";
import { test } from "node:test";
import { activity, isStreamRequest, SESSION_STALE_MS, STREAM_RECENT_MS } from "./activity.ts";

const now = 1_000_000_000;
const quiet = { now, session: { state: "idle" as const, updated_at: now }, lastStreamAt: null, analyzer: { running: null, worker: null } };

test("idle SynAmp lets the computer sleep", () => {
  assert.deepEqual(activity(quiet), { busy: false, reasons: [] });
  assert.equal(activity({ ...quiet, session: { state: "paused", updated_at: now } }).busy, false, "paused is not playing");
});

test("playing, a phone streaming, or listening to the library keeps it awake", () => {
  assert.deepEqual(activity({ ...quiet, session: { state: "playing", updated_at: now - 1000 } }).reasons, ["playing"]);
  assert.deepEqual(activity({ ...quiet, lastStreamAt: now - 60_000 }).reasons, ["phone"]);
  assert.deepEqual(activity({ ...quiet, analyzer: { running: { action: "analyze" }, worker: null } }).reasons, ["listening"]);
  assert.deepEqual(activity({ ...quiet, analyzer: { running: null, worker: { state: "analyzing", online: true } } }).reasons, ["listening"]);
});

test("old signs of activity don't count", () => {
  assert.equal(activity({ ...quiet, session: { state: "playing", updated_at: now - SESSION_STALE_MS } }).busy, false, "a player that went away");
  assert.equal(activity({ ...quiet, lastStreamAt: now - STREAM_RECENT_MS }).busy, false);
  assert.equal(activity({ ...quiet, analyzer: { running: null, worker: { state: "analyzing", online: false } } }).busy, false, "a worker that stopped reporting");
});

test("which phone-app requests are audio", () => {
  for (const path of ["/rest/stream", "/rest/stream.view", "/rest/download.view"]) assert.ok(isStreamRequest(path), path);
  for (const path of ["/rest/ping.view", "/rest/getCoverArt.view", "/rest/streamy"]) assert.ok(!isStreamRequest(path), path);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { clipWindow } from "./clip.ts";

test("clips start a third of the way in, and short songs play from the start", () => {
  assert.deepEqual(clipWindow(240), { start_s: 84, seconds: 30 });
  assert.deepEqual(clipWindow(40), { start_s: 0, seconds: 30 });
  assert.deepEqual(clipWindow(20), { start_s: 0, seconds: 20 });
  assert.deepEqual(clipWindow(50), { start_s: 15, seconds: 30 }, "ends 5 s before the end");
  assert.deepEqual(clipWindow(undefined), { start_s: 0, seconds: 30 });
});

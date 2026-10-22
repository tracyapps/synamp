import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stallVerdict } from '../apps/web/src/audio/engine.ts';

const watch = (position: number, retried = false) => ({ position, since: 0, retried });

test('a song that is moving is fine, however long it has been', () => {
  assert.equal(stallVerdict(watch(10), 60_000, 10.25, 200, true), 'moving');
});

test('a song stuck partway: wait a little, reload once, then give up', () => {
  assert.equal(stallVerdict(watch(90), 5_000, 90, 200, true), 'wait', 'a short buffering pause is not stuck');
  assert.equal(stallVerdict(watch(90), 13_000, 90, 200, true), 'retry');
  assert.equal(stallVerdict(watch(90, true), 13_000, 90, 200, true), 'failed');
});

test('a song that never starts gets longer (decoding a big file takes time)', () => {
  assert.equal(stallVerdict(watch(0), 20_000, 0, 0, false), 'wait');
  assert.equal(stallVerdict(watch(0), 31_000, 0, 0, false), 'retry');
  assert.equal(stallVerdict(watch(0, true), 31_000, 0, 0, false), 'failed');
});

test('stuck at the very end counts as finished, so the next song plays', () => {
  assert.equal(stallVerdict(watch(199.2), 13_000, 199.2, 200, true), 'ended');
  assert.equal(stallVerdict(watch(150), 13_000, 150, 200, true), 'retry');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ceiling, recommended, recommendedMore, songsFor } from '../apps/web/src/analysis-memory.ts';

test('the Settings numbers match what the analyzer does (pipeline.py / allowance.py)', () => {
  assert.equal(recommended(48), 12); assert.equal(recommended(8), 3); assert.equal(recommended(16), 4);
  assert.equal(recommendedMore(48), 24); assert.equal(recommendedMore(16), 8); assert.equal(recommendedMore(8), 3);
  assert.equal(ceiling(48), 44); assert.equal(ceiling(6), 3);
  assert.equal(songsFor(12, 48, 14), 4);
  assert.equal(songsFor(30, 48, 14), 10);
  assert.equal(songsFor(200, 48, 14), 12, 'cores minus two');
  assert.equal(songsFor(2, 8, 8), 1, 'always at least one');
  assert.equal(songsFor(100, 16, 10), 4, 'never past memory minus 4 GB');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, keepVisible, kindOf, NOTHING_PICKED, pick, pickAll, summarise } from '../apps/web/src/organise-select.ts';

const order = ['a', 'b', 'c', 'd', 'e', 'f'];
const ids = (state: { selected: ReadonlySet<string> }) => [...state.selected].sort();

test('click ticks one; shift-click ticks the run between the two clicks', () => {
  let s = pick(NOTHING_PICKED, order, 'b', false);
  assert.deepEqual(ids(s), ['b']);
  s = pick(s, order, 'e', true);
  assert.deepEqual(ids(s), ['b', 'c', 'd', 'e']);
  // Upwards works too, and the anchor moves to the last click.
  s = pick(pick(NOTHING_PICKED, order, 'f', false), order, 'd', true);
  assert.deepEqual(ids(s), ['d', 'e', 'f']);
  assert.equal(s.anchor, 'd');
});

test('shift-click on a ticked one unticks the run; shift with no earlier click ticks just one', () => {
  let s = pick(pick(NOTHING_PICKED, order, 'a', false), order, 'f', true); // a–f all on
  s = pick(pick(s, order, 'b', false), order, 'b', false); // anchor b, still on
  s = pick(s, order, 'd', true); // d is on, so the run b–d goes off
  assert.deepEqual(ids(s), ['a', 'e', 'f']);
  assert.deepEqual(ids(pick(NOTHING_PICKED, order, 'c', true)), ['c']);
});

test('select all toggles; leaving the page drops what is no longer shown', () => {
  let s = pickAll(NOTHING_PICKED, order);
  assert.deepEqual(ids(s), order);
  assert.deepEqual(ids(pickAll(s, order)), []);
  s = pick(pick(NOTHING_PICKED, order, 'a', false), order, 'c', true);
  const kept = keepVisible(s, ['c', 'x']);
  assert.deepEqual(ids(kept), ['c']);
  assert.equal(kept.anchor, 'c');
  assert.equal(keepVisible(kept, ['c', 'x']), kept, 'unchanged when nothing left the page');
});

test('batch problems read as one line', () => {
  const problems = ['“A/01.mp3” is no longer there', '“A/02.mp3” is no longer there', '“B/01.mp3” already exists', 'Left “x.jpg”: “y.jpg” already exists', 'Two files would both become “z”'];
  assert.equal(kindOf(problems[3]!), 'left');
  assert.equal(describe(summarise(problems)), '2 files were no longer there, 1 new name was already taken, 1 file was left where it was, 1 other problem');
});

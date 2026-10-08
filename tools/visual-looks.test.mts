import { test } from 'node:test';
import assert from 'node:assert/strict';
import { change, lookLabel, matches, NO_LOOKS, poolOf, step, type Looks } from '../apps/web/src/visuals/looks.ts';

const order = ['A', 'B', 'C', 'D', 'E'];
const looks = (over: Partial<Looks>): Looks => ({ ...NO_LOOKS, ...over });

test('Next and Previous skip hidden looks and wrap around', () => {
  const l = looks({ hidden: ['B', 'E'] });
  assert.equal(step(order, l, 'A', 1), 'C');
  assert.equal(step(order, l, 'D', 1), 'A');
  assert.equal(step(order, l, 'A', -1), 'D');
  assert.equal(step(order, l, 'B', 1), 'C', 'from a hidden look (picked by hand) it moves on');
});

test('"My favourites" keeps Next, Previous and Change-by-itself inside your favourites', () => {
  const l = looks({ favourites: ['B', 'D'], pool: 'favourites' });
  assert.equal(step(order, l, 'B', 1), 'D');
  assert.equal(step(order, l, 'D', 1), 'B');
  assert.equal(step(order, l, 'C', 1), 'D', 'from a look that isn’t a favourite, the next favourite');
  assert.equal(step(order, l, 'C', -1), 'B');
  assert.equal(step(order, looks({ favourites: ['B'], pool: 'favourites' }), 'B', 1), 'B', 'one favourite: it stays');
});

test('no favourites, or every look hidden: fall back to all, and say why', () => {
  assert.deepEqual(poolOf(order, looks({ pool: 'favourites' })), { pool: order, fallback: 'no-favourites' });
  assert.deepEqual(poolOf(order, looks({ pool: 'favourites', favourites: ['B'], hidden: ['B'] })).fallback, 'no-favourites');
  assert.deepEqual(poolOf(order, looks({ hidden: order })), { pool: order, fallback: 'all-hidden' });
  assert.deepEqual(poolOf(order, looks({ favourites: ['C'] })), { pool: order, fallback: null }, '"All looks" includes favourites');
});

test('favourite and hidden exclude each other, as in the brain', () => {
  let l = change(NO_LOOKS, 'A', { favourite: true });
  assert.deepEqual([l.favourites, l.hidden], [['A'], []]);
  l = change(l, 'A', { hidden: true });
  assert.deepEqual([l.favourites, l.hidden], [[], ['A']]);
  l = change(l, 'A', { favourite: true });
  assert.deepEqual([l.favourites, l.hidden], [['A'], []]);
  l = change(l, 'A', { favourite: false });
  assert.deepEqual([l.favourites, l.hidden], [[], []]);
});

test('labels and search', () => {
  assert.equal(lookLabel('Geiss - Spiral - v2'), 'Geiss — Spiral - v2');
  assert.ok(matches('Flexi + Martin - Café spiral', 'cafe SPIRAL'));
  assert.ok(matches('anything', '  '));
  assert.ok(!matches('Geiss - Spiral', 'geiss fire'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardsPerRow, Layout, pagesFor, plan } from '../apps/web/src/library-window.ts';

test('layout: estimated heights until rows are drawn, then the average of the real ones', () => {
  const layout = new Layout(100_000, 50);
  assert.equal(layout.height, 5_000_000);
  assert.equal(layout.lineAt(0), 0);
  assert.equal(layout.lineAt(149), 2);
  assert.equal(layout.lineAt(10e9), 99_999, 'past the end: the last line');
  assert.equal(layout.measure(0, 40), true);
  assert.equal(layout.measure(0, 40), false, 'no change, no work');
  assert.equal(layout.top(1), 40);
  assert.equal(layout.height, 4_000_000, 'undrawn lines follow the average');
  layout.measure(1, 60);
  assert.equal(layout.top(2), 100);
  assert.equal(layout.height, 100 + 99_998 * 50);
  assert.deepEqual(layout.range(1_000, 1_200, 100), { first: 18, last: 26 });
});

test('plan: rows near the screen, gaps for the rest, and the focused row stays', () => {
  const layout = new Layout(1000, 10);
  const pieces = plan(layout, 1000, 1, { first: 100, last: 102 }, null);
  assert.deepEqual(pieces, [
    { kind: 'gap', from: 0, to: 100, height: 1000 },
    { kind: 'row', index: 100 }, { kind: 'row', index: 101 }, { kind: 'row', index: 102 },
    { kind: 'gap', from: 103, to: 1000, height: 8970 },
  ]);
  const pinned = plan(layout, 1000, 1, { first: 100, last: 100 }, 5);
  assert.deepEqual(pinned.map((p) => p.kind === 'row' ? p.index : `gap ${p.from}-${p.to}`), ['gap 0-5', 5, 'gap 6-100', 100, 'gap 101-1000']);
  const sum = pinned.reduce((total, p) => total + (p.kind === 'gap' ? p.height : 10), 0);
  assert.equal(sum, layout.height, 'gaps plus rows are exactly as tall as the whole list');
  // Grid: 4 cards a line, 10 cards in all (3 lines; the last one short).
  const grid = new Layout(3, 100);
  assert.deepEqual(plan(grid, 10, 4, { first: 2, last: 2 }).map((p) => p.kind === 'row' ? p.index : p.height), [200, 8, 9]);
  assert.deepEqual(plan(new Layout(0, 10), 0, 1, { first: 0, last: -1 }), []);
});

test('pages to fetch, and cards per row', () => {
  assert.deepEqual(pagesFor(0, 30, 46_039), [0]);
  assert.deepEqual(pagesFor(95, 230, 46_039), [0, 1, 2]);
  assert.deepEqual(pagesFor(46_000, 46_100, 46_039), [460]);
  assert.deepEqual(pagesFor(10, 5, 100), []);
  assert.equal(cardsPerRow(1000, 230, 14), 4);
  assert.equal(cardsPerRow(200, 230, 14), 1);
});

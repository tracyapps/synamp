import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPresentation, moveColumn, columnWidth, columnOrder } from '../apps/web/src/library-table.ts';

test('legacy column visibility survives, required columns remain, and stored order round-trips', () => {
  const legacy = readPresentation({ view: 'table', columns: ['year', 'album_artist'] });
  assert.deepEqual(legacy.columns, ['title', 'year', 'album_artist', 'actions']);
  const order = moveColumn(legacy.order, 'year', 'title');
  const next = readPresentation(JSON.parse(JSON.stringify({ ...legacy, order, widths: { ...legacy.widths, year: 230 }, sort: 'year', direction: 'desc' })));
  assert.deepEqual(next.order, order);
  assert.equal(next.widths.year, 230);
  assert.equal(next.sort, 'year');
  assert.equal(next.direction, 'desc');
});
test('malformed preferences cannot duplicate/drop columns, choose invalid sorts or unbounded widths', () => {
  const result = readPresentation({ columns: ['year', 'year', 'bogus'], order: ['actions', 'actions', 'bogus'], widths: { year: 9999, title: -1, artist: null }, sort: 'actions' });
  assert.deepEqual(result.columns, ['title', 'year', 'actions']);
  assert.equal(new Set(result.order).size, columnOrder.length);
  assert.equal(result.widths.year, 800);
  assert.equal(result.widths.title, 80);
  assert.equal(result.widths.artist, 200);
  assert.equal(result.sort, 'artist');
  assert.equal(columnWidth(NaN, 200), 200);
});
test('move to a neighbor works in both directions and preserves every column exactly once', () => {
  assert.deepEqual(moveColumn(['title', 'year', 'actions'], 'title', 'year'), ['year', 'title', 'actions']);
  assert.deepEqual(moveColumn(['title', 'year', 'actions'], 'actions', 'year'), ['title', 'actions', 'year']);
  assert.deepEqual(moveColumn(columnOrder, 'title', 'title'), columnOrder);
});

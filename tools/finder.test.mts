import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderOf, macName } from '../apps/web/src/finder.ts';

test('Open in Finder: the folder a proposal is about, as it is now', () => {
  assert.deepEqual(folderOf({ kind: 'album', preview: [{ from: "Eric Clapton/Conception_ an interpretation" }], moves: [] }),
    { area: 'library', path: 'Eric Clapton/Conception_ an interpretation' });
  assert.deepEqual(folderOf({ kind: 'artist', preview: [{ from: 'DiFranco, Ani/Dilate (1996)' }], moves: [] }), { area: 'library', path: 'DiFranco, Ani' });
  assert.deepEqual(folderOf({ kind: 'import', preview: [{ from: 'incoming/_web/Björk' }], moves: [] }), { area: 'incoming', path: '_web/Björk' });
  assert.deepEqual(folderOf({ kind: 'import', preview: [{ from: 'incoming' }], moves: [] }), { area: 'incoming', path: '' });
  assert.deepEqual(folderOf({ kind: 'album', preview: [], moves: [{ from: 'A/B/01 - x.mp3' }] }), { area: 'library', path: 'A/B' });
  assert.deepEqual(folderOf({ kind: 'album', preview: [{ from: '../../etc' }], moves: [] }), { area: 'library', path: 'etc' }, 'no climbing out');
  assert.equal(folderOf({ kind: 'album', preview: [], moves: [] }), null);
  assert.equal(macName({ host: 'tappsBook-Pro.local' }), 'tappsBook-Pro');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortcut } from '../apps/web/src/player-commands.ts';
const key = { altKey: true, shiftKey: true, ctrlKey: false, metaKey: false, repeat: false, code: 'KeyL' };
test('focused player commands require the chord and never consume typing or repeated keydown', () => {
  assert.equal(shortcut(key, false), 'love');
  assert.equal(shortcut({ ...key, code: 'ArrowRight' }, false), 'next');
  assert.equal(shortcut({ ...key, code: 'KeyM' }, false), 'more-like-this');
  assert.equal(shortcut(key, true), undefined);
  assert.equal(shortcut({ ...key, altKey: false }, false), undefined);
  assert.equal(shortcut({ ...key, repeat: true }, false), undefined);
  assert.equal(shortcut({ ...key, metaKey: true }, false), undefined);
});

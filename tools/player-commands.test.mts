import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortcut, undoOffered, UNDO_OFFER_MS, PLAYLIST_ONLY } from '../apps/web/src/player-commands.ts';
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

test('Undo is offered beside the message for a while after a removal, then only from the menu', () => {
  const at = 1_000_000;
  assert.equal(undoOffered(undefined, at), false);
  assert.equal(undoOffered({ at }, at), true);
  assert.equal(undoOffered({ at }, at + UNDO_OFFER_MS - 1), true);
  assert.equal(undoOffered({ at }, at + UNDO_OFFER_MS), false);
  assert.equal(undoOffered({ at }, at - 5), false, 'a clock that jumped back never shows it early');
});
test('removing with a reason only applies to songs playing from a playlist', () => {
  assert.ok(PLAYLIST_ONLY.has('remove-wrong-energy') && PLAYLIST_ONLY.has('remove-wrong-vibe'));
});

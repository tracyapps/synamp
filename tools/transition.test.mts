import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDecode, skipBlendSeconds, transitionFor } from '../apps/web/src/audio/transition.ts';
import { trimFor } from '../apps/web/src/audio/engine.ts';

const settings = { crossfade: 0, albumsStraight: true, skipBlend: true };
const a1 = { album_key: 'A/Album', gapless: { delay: 1105, padding: 0, samples: 44100 * 200, rate: 44100 } };
const a2 = { album_key: 'A/Album' };
const b1 = { album_key: 'B/Other', bpm: 128 };

test('same album: gapless, decoded when it can be; other albums: the crossfade setting or a cut', () => {
  assert.deepEqual(transitionFor(a1, a2, settings, undefined, false), { transition: { kind: 'gapless', seconds: 0 }, decode: true });
  assert.deepEqual(transitionFor(a1, a2, settings, undefined, true), { transition: { kind: 'gapless', seconds: 0 }, decode: false }, 'lighter streams are streamed');
  assert.equal(transitionFor(a1, a2, settings, undefined, false, 2).decode, false, 'low-memory phones stream');
  assert.deepEqual(transitionFor(a1, b1, settings, undefined, false).transition, { kind: 'cut', seconds: 0 });
  assert.deepEqual(transitionFor(a1, b1, { ...settings, crossfade: 6 }, undefined, false).transition, { kind: 'crossfade', seconds: 6 });
  assert.deepEqual(transitionFor(a1, a2, { ...settings, crossfade: 6, albumsStraight: false }, undefined, false).transition, { kind: 'crossfade', seconds: 6 });
  assert.deepEqual(transitionFor(a1, undefined, settings, undefined, false).transition, { kind: 'cut', seconds: 0 });
  assert.equal(canDecode({ gapless: { delay: 0, padding: 0, samples: 44100 * 60 * 45, rate: 44100 } }, false), false, 'a 45-minute mix is streamed');
});

test('DJ mode: a long blend sized to 16 beats; skips blend too', () => {
  assert.deepEqual(transitionFor(b1, a1, settings, 'dj', false).transition, { kind: 'crossfade', seconds: 7.5 });
  assert.deepEqual(transitionFor({ bpm: 60 }, a1, settings, 'dj', false).transition, { kind: 'crossfade', seconds: 12 }, 'at most 12 s');
  assert.deepEqual(transitionFor({}, a1, settings, 'dj', false).transition, { kind: 'crossfade', seconds: 8 }, 'no tempo: 8 s');
  assert.equal(skipBlendSeconds(settings, undefined), 2.5);
  assert.equal(skipBlendSeconds({ ...settings, crossfade: 10 }, undefined), 4);
  assert.equal(skipBlendSeconds(settings, 'dj'), 6);
  assert.equal(skipBlendSeconds({ ...settings, skipBlend: false }, undefined), 0);
});

test('encoder silence: trimmed only when the browser left it in', () => {
  const g = { delay: 1105, padding: 389, samples: 110250, rate: 44100 };
  assert.deepEqual(trimFor(110250 / 44100, g), { start: 0, length: 2.5 }, 'already trimmed');
  const t = trimFor((110250 + 1105 + 389) / 44100, g);
  assert.ok(Math.abs(t.start - 1105 / 44100) < 1e-9 && t.length === 2.5, 'both ends trimmed');
  assert.deepEqual(trimFor(3, undefined), { start: 0, length: 3 }, 'no information: as decoded');
});

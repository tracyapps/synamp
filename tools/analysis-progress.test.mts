import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overview, summarise, type ProgressReport } from '../apps/web/src/analysis-progress.ts';

// The owner's library on 2026-10-10: first pass done, the singing/instruments/mood step being redone.
const today: ProgressReport = {
  state: 'analyzing', catalog: { present: 46039 }, queue: { failed: 15 },
  fully_analysed: 25415, analysed_once: 46024,
  updates: { voice: { total: 20587, waiting: 20587 } }, run: { eta_seconds: 52_000 },
};

test('a step being redone reads as an update, not as half the library left to do', () => {
  const s = summarise(today);
  assert.equal(s.headline, 'Every song analysed — now updating 20,587 songs for singing, instruments and mood');
  assert.equal(s.detail, 'about 14 h 27 min left · 15 songs couldn’t be read.');
  assert.deepEqual(s.bar, { value: 0, max: 20587, label: 'Updating singing, instruments and mood: 0 of 20,587 done' });
  const later = summarise({ ...today, updates: { voice: { total: 20587, waiting: 587 } } });
  assert.equal(later.bar.value, 20000, 'the bar fills as updates finish');
});

test('first pass still going: count songs analysed once, mention any updates', () => {
  const s = summarise({ ...today, analysed_once: 30000, run: { eta_seconds: null } }, { current: 'Kids.mp3' });
  assert.equal(s.headline, 'Analysing your library — 30,000 of 46,039 songs done');
  assert.equal(s.detail, 'estimating time left… · now: Kids.mp3 · Also updating 20,587 songs for singing, instruments and mood.');
  assert.deepEqual(s.bar, { value: 30000, max: 46039, label: 'Analysed: 30,000 of 46,039 songs' });
});

test('finished', () => {
  const done = { ...today, state: 'idle' as const, fully_analysed: 46024, analysed_once: 46024, updates: {}, queue: { failed: 0 }, catalog: { present: 46024 } };
  assert.equal(summarise(done).headline, 'All 46,024 songs analysed');
  assert.equal(summarise(done).detail, '');
  assert.equal(summarise({ ...done, queue: { failed: 1 }, catalog: { present: 46025 } }).headline, '46,024 of 46,025 songs analysed');
});

test('two steps being redone at once', () => {
  const s = summarise({ ...today, updates: { dsp_core: { total: 89, waiting: 89 }, voice: { total: 20299, waiting: 20299 } } });
  assert.equal(s.headline, 'Every song analysed — now updating 20,388 songs for tempo, energy and loudness, plus singing, instruments and mood');
});

test('an older analyzer (no update counts) still works', () => {
  const old: ProgressReport = { state: 'analyzing', catalog: { present: 100 }, queue: { failed: 0 }, fully_analysed: 40, run: { eta_seconds: 600 } };
  assert.equal(overview(old).once, 40);
  assert.equal(overview(old).update, null);
  assert.equal(summarise(old).headline, 'Analysing your library — 40 of 100 songs done');
});

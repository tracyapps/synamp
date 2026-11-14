import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headline, lines, type SystemStatus } from '../apps/web/src/system-status.ts';

const quiet: SystemStatus = { player: null, phone: false, listening: null, music: null, anywhere: { ready: false } };
const text = (status: SystemStatus) => lines(status).map((line) => line.text);

test('a quiet SynAmp says only what it knows', () => {
  assert.deepEqual(text(quiet), ['Listen anywhere: not set up']);
  assert.deepEqual(headline(quiet), { text: 'Ready', tone: 'ok' });
  assert.equal(lines(quiet)[0]!.href, '#/anywhere', 'and offers the way to set it up');
});

test('a busy evening, in the same words as the Mac menu', () => {
  const status: SystemStatus = {
    player: { state: 'playing', title: 'Monkey Wrench', artist: 'Foo Fighters' }, phone: true,
    listening: { active: true, done: 12_340, total: 46_024, eta_seconds: 10_800 },
    music: { ok: true, away: false }, anywhere: { ready: true, name: 'syd.tail1234.ts.net' },
  };
  assert.deepEqual(text(status), [
    'Playing: Monkey Wrench, by Foo Fighters',
    'Playing to a phone app',
    'Music: connected',
    'Listening to your library: 12,340 of 46,024 songs, about 3 h left',
    'Listen anywhere: on (syd.tail1234.ts.net)',
  ]);
  assert.equal(headline(status).text, 'Playing');
});

test('the button leads with what needs a look', () => {
  const away: SystemStatus = { ...quiet, player: { state: 'playing', title: 'Song' }, music: { ok: false, away: true } };
  assert.deepEqual(headline(away), { text: 'Music not connected', tone: 'warn' });
  assert.match(text(away)[1]!, /^Music: out of reach/);
  assert.equal(headline({ ...quiet, phone: true }).text, 'Playing on a phone');
  assert.equal(headline({ ...quiet, listening: { active: true, done: 1, total: 9, eta_seconds: null } }).text, 'Listening to your library');
  assert.equal(headline({ ...quiet, player: { state: 'paused', title: 'Song' } }).text, 'Ready', 'paused is not busy');
});

test('listening: finished, stopped, and nothing found yet', () => {
  assert.deepEqual(text({ ...quiet, listening: { active: false, done: 460, total: 460, eta_seconds: null } })[0], 'Your whole library is listened to: 460 songs');
  assert.deepEqual(text({ ...quiet, listening: { active: false, done: 120, total: 460, eta_seconds: null } })[0], 'Listened to 120 of 460 songs so far. Not listening right now');
  assert.deepEqual(text({ ...quiet, listening: { active: true, done: 120, total: 460, eta_seconds: null } })[0], 'Listening to your library: 120 of 460 songs');
  assert.equal(text({ ...quiet, listening: { active: false, done: 0, total: 0, eta_seconds: null } }).length, 1);
});

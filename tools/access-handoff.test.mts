import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeAccessToken } from '../apps/web/src/access-handoff.ts';

const token = 'a'.repeat(64);

test('the Mac app’s token is taken from the address and the address tidied', () => {
  assert.deepEqual(takeAccessToken(`#/library?access=${token}`), { token, hash: '#/library' });
  assert.deepEqual(takeAccessToken(`#/library?view=x&access=${token}`), { token, hash: '#/library?view=x' });
});

test('addresses without a token are left alone', () => {
  assert.deepEqual(takeAccessToken('#/library?view=x'), { token: null, hash: '#/library?view=x' });
  assert.deepEqual(takeAccessToken('#/playlists'), { token: null, hash: '#/playlists' });
  assert.deepEqual(takeAccessToken(''), { token: null, hash: '' });
});

test('a strange token is dropped (and still taken out of the address)', () => {
  assert.deepEqual(takeAccessToken('#/library?access=%3Cscript%3E'), { token: null, hash: '#/library' });
  assert.deepEqual(takeAccessToken('#/library?access=short'), { token: null, hash: '#/library' });
});

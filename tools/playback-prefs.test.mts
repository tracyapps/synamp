import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awayReason, streamUrl, wantsLighter, type PlaybackPrefs } from '../apps/web/src/playback-prefs.ts';

const prefs = (quality: PlaybackPrefs['quality']): PlaybackPrefs => ({ crossfade: 0, albumsStraight: true, volume: 1, quality, skipBlend: true });

test('Automatic: lighter on mobile data, with Data Saver, or through Tailscale; full at home', () => {
  assert.equal(awayReason('syd.local', { type: 'wifi' }), null);
  assert.equal(awayReason('192.168.1.20', undefined), null);
  assert.equal(awayReason('localhost', undefined), null);
  assert.equal(awayReason('syd.local', { type: 'cellular' }), 'mobile-data');
  assert.equal(awayReason('syd.local', { saveData: true }), 'data-saver');
  assert.equal(awayReason('syd.tail1234.ts.net', undefined), 'tailscale');
  assert.equal(awayReason('100.101.102.103', undefined), 'tailscale');
  assert.equal(awayReason('100.20.1.1', undefined), null, 'outside Tailscale’s 100.64–100.127 range');
  assert.equal(awayReason('100.128.0.1', undefined), null);
});

test('the choice decides; Always overrides what Automatic would do', () => {
  assert.equal(wantsLighter(prefs('auto'), null), false);
  assert.equal(wantsLighter(prefs('auto'), 'tailscale'), true);
  assert.equal(wantsLighter(prefs('full'), 'mobile-data'), false);
  assert.equal(wantsLighter(prefs('lighter'), null), true);
});

test('stream links ask for the lighter copy only when wanted', () => {
  (globalThis as { window?: unknown }).window = { location: { hostname: 'syd.local' } };
  const link = '/api/v1/tracks/t1/stream?exp=1&sig=abc';
  assert.equal(streamUrl(link, prefs('auto')), link);
  assert.equal(streamUrl(link, prefs('full')), link);
  assert.equal(streamUrl(link, prefs('lighter')), `${link}&quality=lighter`);
  (globalThis as { window?: unknown }).window = { location: { hostname: 'syd.tail1234.ts.net' } };
  assert.equal(streamUrl(link, prefs('auto')), `${link}&quality=lighter`);
});

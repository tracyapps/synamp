import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectLink } from '../apps/web/src/connect-link.ts';

test('the link carries the home address, the token and the away-from-home name', () => {
  const link = connectLink({ origin: 'http://Syd.local:8080', hostname: 'syd.local', token: 'tok en/+', tailscaleName: 'syd.halley-dory.ts.net' })!;
  assert.equal(link.includes('+'), false, 'spaces travel as %20: the Mac app reads + as a plus sign');
  const url = new URL(link);
  assert.equal(url.protocol, 'synamp:');
  assert.equal(url.host, 'connect');
  assert.equal(url.searchParams.get('home'), 'http://Syd.local:8080');
  assert.equal(url.searchParams.get('token'), 'tok en/+', 'whatever is in the token survives the trip');
  assert.equal(url.searchParams.get('away'), 'syd.halley-dory.ts.net');
});

test('no away-from-home name yet: the link just leaves it out', () => {
  const url = new URL(connectLink({ origin: 'http://nas.local:8080', hostname: 'nas.local', token: 'abc' })!);
  assert.equal(url.searchParams.has('away'), false);
});

test('opened through the away-from-home address, the page can’t say what the home address is', () => {
  assert.equal(connectLink({ origin: 'http://syd.halley-dory.ts.net:8080', hostname: 'syd.halley-dory.ts.net', token: 'abc', tailscaleName: 'syd.halley-dory.ts.net' }), null);
  assert.equal(connectLink({ origin: 'http://other.tail1.ts.net:8080', hostname: 'other.tail1.ts.net', token: 'abc', tailscaleName: 'syd' }), null);
  assert.equal(connectLink({ origin: 'http://Syd.local:8080', hostname: 'syd.local', token: '' }), null, 'and never without a token');
});

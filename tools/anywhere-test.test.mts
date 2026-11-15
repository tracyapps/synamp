import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reach, reachWords } from '../apps/web/src/anywhere-test.ts';

const answering = (body: unknown, status = 200) => (async (url: string | URL | Request) => {
  assert.equal(String(url), 'http://syd.tail1234.ts.net:8080/health');
  return new Response(JSON.stringify(body), { status });
}) as typeof fetch;

test('SynAmp answering at the away-from-home name', async () => {
  assert.equal(await reach('http://syd.tail1234.ts.net:8080/', answering({ status: 'ok', service: 'synamp-brain' })), 'reached');
});

test('something else answering there, or an error page', async () => {
  assert.equal(await reach('http://syd.tail1234.ts.net:8080', answering({ hello: 'router' })), 'not_synamp');
  assert.equal(await reach('http://syd.tail1234.ts.net:8080', answering({ service: 'synamp-brain' }, 502)), 'not_synamp');
  assert.equal(await reach('http://syd.tail1234.ts.net:8080', (async () => new Response('<html>', { status: 200 })) as typeof fetch), 'not_synamp');
});

test('nothing answering: a wrong name, or Tailscale off on this device', async () => {
  assert.equal(await reach('http://halley-dory.ts.net:8080', (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch), 'no_answer');
  const never = ((_url: unknown, options?: RequestInit) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  })) as typeof fetch;
  assert.equal(await reach('http://halley-dory.ts.net:8080', never, 30), 'no_answer', 'it gives up instead of waiting forever');
});

test('the words say what to check', () => {
  assert.deepEqual(reachWords('reached', 'syd.tail1234.ts.net'), { ok: true, text: 'This device reached SynAmp at syd.tail1234.ts.net. Listen anywhere works from here.' });
  assert.match(reachWords('reached', 'syd.tail1234.ts.net', true).text, /right now/);
  const missed = reachWords('no_answer', 'halley-dory.ts.net');
  assert.equal(missed.ok, false);
  assert.match(missed.text, /couldn’t reach SynAmp at halley-dory\.ts\.net/);
  assert.match(missed.text, /Tailscale is switched on on this device/);
  assert.match(reachWords('not_synamp', 'syd').text, /isn’t SynAmp/);
});

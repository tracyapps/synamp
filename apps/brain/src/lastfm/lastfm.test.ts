/** Last.fm scrobbling against a fake API — nothing here talks to last.fm. */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library } from "../query/evaluate.ts";
import type { ListeningEvent } from "../session/events.ts";
import { LastfmClient, sign } from "./client.ts";
import { qualifies, Scrobbler } from "./scrobbler.ts";

type Reply = Record<string, unknown> | ((params: URLSearchParams) => Record<string, unknown>);
function fakeLastfm(replies: Reply[]) {
  const calls: URLSearchParams[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const params = new URLSearchParams(String(init?.body));
    calls.push(params);
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
    const body = typeof reply === "function" ? reply(params) : reply;
    return new Response(JSON.stringify(body), { status: "error" in body ? 400 : 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, client: new LastfmClient({ apiKey: "KEY", secret: "SECRET", fetchImpl }) };
}
const acceptAll = (params: URLSearchParams) => {
  const n = [...params.keys()].filter((key) => key.startsWith("track[")).length;
  return { scrobbles: { "@attr": { accepted: n, ignored: 0 }, scrobble: Array.from({ length: n }, () => ({ ignoredMessage: { code: "0", "#text": "" } })) } };
};

const library: Library = { version: "t", tracks: [
  { id: "tagged", title: "Real Title", artist: "Real Artist", album: "Real Album", metadata_source: "tags", duration_s: 200 },
  { id: "guessed", title: "untagged", artist: "Folder", metadata_source: "path", duration_s: 200 },
  { id: "short", title: "Jingle", artist: "Real Artist", metadata_source: "tags", duration_s: 20 },
] };
const base = { scope: "playlist" as const, source: "server" as const, policy_version: "heuristic-v1" };
let seq = 0;
const play = (track: string, playMs: number, ts: number, signal: ListeningEvent["signal"] = "full_play"): ListeningEvent =>
  ({ ...base, id: `e${++seq}`, ts, signal, track_id: track, play_ms: playMs, duration_ms: (library.tracks.find((t) => t.id === track)?.duration_s ?? 200) * 1000 });

function setup(replies: Reply[]) {
  const dir = mkdtempSync(join(tmpdir(), "synamp-lastfm-"));
  const fake = fakeLastfm(replies);
  const path = join(dir, "lastfm.json");
  const make = () => {
    const s = new Scrobbler(path, fake.client);
    let clock = 1_800_000_000_000;
    s.now = () => clock;
    return { s, advance: (ms: number) => { clock += ms; }, at: () => clock };
  };
  return { ...fake, make, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

async function connected(h: ReturnType<typeof setup>) {
  const m = h.make();
  const url = new URL(m.s.connectUrl("http://nas:8080"));
  const cb = new URL(url.searchParams.get("cb")!);
  assert.equal(url.origin + url.pathname, "https://www.last.fm/api/auth/");
  assert.equal(cb.pathname, "/api/v1/lastfm/callback");
  await m.s.completeConnect(cb.searchParams.get("state"), "tokentoken123");
  return m;
}

test("request signing follows the Last.fm recipe", () => {
  const params = { method: "auth.getSession", token: "abc", api_key: "KEY", format: "json" };
  const expected = createHash("md5").update("api_keyKEYmethodauth.getSessiontokenabcSECRET").digest("hex");
  assert.equal(sign(params, "SECRET"), expected, "sorted name+value pairs, format excluded, secret appended");
});

test("Last.fm's play rule: over 30 s, and half the track or 4 minutes", () => {
  assert.equal(qualifies(100_000, 200), true);
  assert.equal(qualifies(99_000, 200), false);
  assert.equal(qualifies(240_000, 1200), true, "4 minutes is enough for a long track");
  assert.equal(qualifies(30_000, 30), false, "30 s tracks never count");
  assert.equal(qualifies(1000, undefined), false);
});

test("connecting needs the one-time state; then only plays while on are sent", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, acceptAll]);
  try {
    const bad = h.make();
    await assert.rejects(bad.s.completeConnect("forged", "tokentoken123"), /expired or was not started here/);
    const m = await connected(h);
    assert.equal(h.calls[0]!.get("method"), "auth.getSession");
    const before = play("tagged", 150_000, m.at() - 60_000);
    m.advance(1000);
    const during = play("tagged", 150_000, m.at());
    const result = await m.s.flush([before, during], library);
    assert.equal(result.sent, 1, "plays from before scrobbling was turned on are not sent");
    const sent = h.calls.at(-1)!;
    assert.equal(sent.get("method"), "track.scrobble");
    assert.equal(sent.get("sk"), "SK");
    assert.equal(sent.get("artist[0]"), "Real Artist");
    assert.equal(sent.get("track[0]"), "Real Title");
    assert.equal(sent.get("album[0]"), "Real Album");
    assert.equal(sent.get("timestamp[0]"), String(Math.floor((during.ts - 150_000) / 1000)), "timestamp = when the play started");
    assert.ok(sent.get("api_sig"));
    // Nothing is sent twice, including after a restart.
    assert.equal((await m.s.flush([before, during], library)).sent, 0);
    assert.equal((await h.make().s.flush([before, during], library)).sent, 0);
  } finally { h.cleanup(); }
});

test("folder-guessed names are held back, never sent; short and partial plays don't count", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, acceptAll]);
  try {
    const m = await connected(h);
    m.advance(1000);
    const evts = [play("guessed", 150_000, m.at()), play("short", 20_000, m.at()), play("tagged", 30_000, m.at(), "skip_late")];
    assert.equal((await m.s.flush(evts, library)).sent, 0);
    const status = m.s.status(evts, library);
    assert.equal(status.pending, 0);
    assert.deepEqual(status.held, [{ reason: "names were guessed from folders, not read from tags", count: 1 }]);
  } finally { h.cleanup(); }
});

test("plays captured from other apps use the library core's names", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, acceptAll]);
  try {
    const m = await connected(h);
    m.advance(1000);
    const external: ListeningEvent = { id: "ext:1", ts: m.at(), signal: "external_play", track_id: "p:x", scope: "global", source: "subsonic",
      policy_version: "heuristic-v1", detail: { title: "Hat Shaped Hat", artist: "Ani DiFranco", album: "Educated Guess", duration_s: 300, played_at: m.at() - 1000, client: "Symfonium" } };
    assert.equal((await m.s.flush([external], library)).sent, 1);
    assert.equal(h.calls.at(-1)!.get("track[0]"), "Hat Shaped Hat");
  } finally { h.cleanup(); }
});

test("more than 50 plays go in batches of 50, oldest first", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, acceptAll]);
  try {
    const m = await connected(h);
    const evts = Array.from({ length: 120 }, (_, i) => { m.advance(1000); return play("tagged", 150_000, m.at() + i); });
    const result = await m.s.flush(evts, library);
    assert.equal(result.sent, 120);
    const batches = h.calls.filter((call) => call.get("method") === "track.scrobble");
    assert.deepEqual(batches.map((call) => [...call.keys()].filter((k) => k.startsWith("track[")).length), [50, 50, 20]);
  } finally { h.cleanup(); }
});

test("outages back off and keep the plays; a bad session pauses until reconnect", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, { error: 11, message: "Service Offline" }, acceptAll]);
  try {
    const m = await connected(h);
    m.advance(1000);
    const evts = [play("tagged", 150_000, m.at())];
    assert.equal((await m.s.flush(evts, library)).sent, 0);
    const status = m.s.status(evts, library);
    assert.equal(status.pending, 1);
    assert.ok(status.retry_at && status.retry_at > m.at());
    assert.equal((await m.s.flush(evts, library)).sent, 0, "still backing off");
    m.advance(5 * 60_000);
    assert.equal((await m.s.flush(evts, library)).sent, 1, "sent once the backoff passed");
  } finally { h.cleanup(); }
  const h2 = setup([{ session: { key: "SK", name: "tapps" } }, { error: 9, message: "Invalid session key" }]);
  try {
    const m = await connected(h2);
    m.advance(1000);
    const evts = [play("tagged", 150_000, m.at())];
    await m.s.flush(evts, library);
    assert.equal(m.s.status(evts, library).needs_reconnect, true);
    const callsBefore = h2.calls.length;
    await m.s.flush(evts, library);
    assert.equal(h2.calls.length, callsBefore, "nothing is sent until you reconnect");
  } finally { h2.cleanup(); }
});

test("refusals are recorded once and never retried", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } },
    { scrobbles: { scrobble: [{ ignoredMessage: { code: "3", "#text": "Timestamp too old" } }] } }]);
  try {
    const m = await connected(h);
    m.advance(1000);
    const evts = [play("tagged", 150_000, m.at())];
    assert.equal((await m.s.flush(evts, library)).refused, 1);
    const calls = h.calls.length;
    await m.s.flush(evts, library);
    assert.equal(h.calls.length, calls);
    assert.deepEqual(m.s.status(evts, library).refused.map((item) => item.message), ["Timestamp too old"]);
  } finally { h.cleanup(); }
});

test("off means off, and disconnect forgets the session", async () => {
  const h = setup([{ session: { key: "SK", name: "tapps" } }, acceptAll]);
  try {
    const m = await connected(h);
    m.advance(1000);
    const during = play("tagged", 150_000, m.at());
    m.s.setEnabled(false);
    m.advance(1000);
    const whileOff = play("tagged", 150_000, m.at());
    assert.equal((await m.s.flush([during, whileOff], library)).sent, 0, "nothing is sent while off");
    m.advance(1000);
    m.s.setEnabled(true);
    assert.equal((await m.s.flush([during, whileOff], library)).sent, 1, "plays from while it was off are never sent");
    m.s.disconnect();
    assert.equal(h.make().s.status([], library).connected, false);
    assert.throws(() => m.s.setEnabled(true), /Connect a Last.fm account first/);
  } finally { h.cleanup(); }
});

/** The Subsonic pass-through, against a fake library core. No real Navidrome needed. */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { relativeFromReported, trackIdForPath } from "./identity.ts";
import { createSubsonicProxy, playsFrom, subsonicOk } from "./proxy.ts";
import type { CapturedPlay } from "./proxy.ts";

const BIG = "x".repeat(300_000);

async function harness() {
  const seen: string[] = [];
  const core = createServer((req, res) => {
    const url = new URL(req.url!, "http://core");
    seen.push(`${req.method} ${url.pathname}`);
    const ok = url.searchParams.get("u") === "tapps" || (req.method === "POST");
    if (url.pathname === "/rest/stream.view") { res.writeHead(200, { "content-type": "audio/mpeg" }); res.end(BIG); return; }
    if (url.pathname.startsWith("/rest/scrobble")) {
      if (!ok) { res.writeHead(200, { "content-type": "text/xml" }); res.end('<subsonic-response status="failed"><error code="40"/></subsonic-response>'); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end('{"subsonic-response":{"status":"ok","version":"1.16.1"}}'); return;
    }
    if (url.pathname === "/rest/getSong.view") {
      assert.equal(url.searchParams.get("t"), "tok", "the lookup reuses the app's own credentials");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ "subsonic-response": { status: "ok", song: {
        id: url.searchParams.get("id"), title: "Click Track", artist: "Some Artist", album: "First Album", duration: 200,
        path: "/music/Some Artist/First Album/01 - Click Track.flac" } } }));
      return;
    }
    res.writeHead(404); res.end();
  }).listen(0);
  const corePort = (core.address() as AddressInfo).port;
  const captured: CapturedPlay[][] = [];
  let resolveNext: () => void = () => undefined;
  const handler = createSubsonicProxy({ coreUrl: `http://127.0.0.1:${corePort}`, onPlays: (plays) => { captured.push(plays); resolveNext(); }, log: () => undefined });
  const proxy = createServer((req, res) => { void handler(req, res); }).listen(0);
  const base = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const nextCapture = () => new Promise<void>((resolve) => { resolveNext = resolve; });
  return { base, seen, captured, nextCapture, close: () => { core.close(); proxy.close(); } };
}

test("ordinary calls and streams pass straight through", async () => {
  const h = await harness();
  try {
    const response = await fetch(`${h.base}/rest/stream.view?id=1&u=tapps&t=tok&s=salt`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal((await response.text()).length, BIG.length);
    assert.equal((await fetch(`${h.base}/rest/nope.view`)).status, 404);
    assert.equal(h.captured.length, 0);
  } finally { h.close(); }
});

test("an accepted scrobble is captured and mapped to the analyzer's track id", async () => {
  const h = await harness();
  try {
    const capture = h.nextCapture();
    const response = await fetch(`${h.base}/rest/scrobble.view?id=nd-1&submission=true&time=1790000000000&u=tapps&t=tok&s=salt&c=Symfonium&v=1.16.1&f=json`);
    assert.ok(subsonicOk(await response.text()), "the app still gets Navidrome's own answer");
    await capture;
    const [play] = h.captured[0]!;
    assert.equal(play!.submission, true);
    assert.equal(play!.client, "Symfonium");
    assert.equal(play!.time, 1790000000000);
    assert.equal(play!.song?.title, "Click Track");
    const relative = relativeFromReported(play!.song?.path, "/music");
    assert.equal(relative, "Some Artist/First Album/01 - Click Track.flac");
    // Same recipe as services/analyzer export.track_id — value computed in Python.
    assert.equal(trackIdForPath(relative!), "p:38e2da417b608d730ff5");
  } finally { h.close(); }
});

test("a scrobble Navidrome rejects records nothing", async () => {
  const h = await harness();
  try {
    const response = await fetch(`${h.base}/rest/scrobble.view?id=nd-1&u=intruder&t=bad&s=salt`);
    assert.match(await response.text(), /status="failed"/);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(h.captured.length, 0);
    assert.ok(!h.seen.includes("GET /rest/getSong.view"));
  } finally { h.close(); }
});

test("form-encoded POST scrobbles (OpenSubsonic) work, including several ids", async () => {
  const h = await harness();
  try {
    const capture = h.nextCapture();
    const response = await fetch(`${h.base}/rest/scrobble`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "u=tapps&t=tok&s=salt&c=Feishin&id=a&id=b&time=1&time=2&submission=false",
    });
    assert.equal(response.status, 200);
    await capture;
    assert.deepEqual(h.captured[0]!.map((play) => [play.songId, play.submission, play.time]), [["a", false, 1], ["b", false, 2]]);
  } finally { h.close(); }
});

test("only real paths inside the library map to ids", () => {
  assert.equal(relativeFromReported("Some Artist/Album/01 - Song.flac", "/music"), null, "Navidrome's synthetic path is not a file");
  assert.equal(relativeFromReported("/elsewhere/a.flac", "/music"), null);
  assert.equal(relativeFromReported("/music/../etc/passwd", "/music"), null);
  assert.equal(relativeFromReported("/music/A/b.flac", "/music/"), "A/b.flac");
  assert.equal(playsFrom(new URLSearchParams("id=x")).at(0)!.submission, true, "submission defaults to true per the Subsonic spec");
});

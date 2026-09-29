import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { checkPlayback } from "./check-playback.mjs";

let server;
let base;
let mode = "ok";
const requests = [];

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push({ path: url.pathname, params: url.searchParams, range: req.headers.range });
    if (url.pathname.endsWith("/stream.view")) {
      res.writeHead(206, { "content-type": mode === "html" ? "text/html" : "audio/mpeg" });
      res.end(mode === "html" ? "<html>Login</html>" : "audio sample");
      return;
    }
    const body = mode === "auth"
      ? { status: "failed", error: { message: "Wrong username or password" } }
      : { status: "ok", ...(url.pathname.endsWith("/getRandomSongs.view")
        ? { randomSongs: { song: mode === "empty" ? [] : [{ id: "song-1", title: "Test track" }] } }
        : {}) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ "subsonic-response": body }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("checks the native-client playback path without passing a plaintext password", async () => {
  mode = "ok";
  requests.length = 0;
  const result = await checkPlayback(base, "listener", "secret-password");
  assert.equal(result.track, "Test track");
  assert.deepEqual(requests.map((r) => r.path), [
    "/rest/ping.view", "/rest/getRandomSongs.view", "/rest/stream.view",
  ]);
  assert.equal(requests[2].range, "bytes=0-1023");
  for (const request of requests) {
    assert.equal(request.params.get("u"), "listener");
    assert.ok(request.params.get("t"));
    assert.ok(request.params.get("s"));
    assert.equal(request.params.has("p"), false);
    assert.equal(request.params.toString().includes("secret-password"), false);
  }
});

test("reports an unindexed library", async () => {
  mode = "empty";
  await assert.rejects(checkPlayback(base, "listener", "secret-password"), /No indexed songs found/);
});

test("reports Subsonic authentication failures", async () => {
  mode = "auth";
  await assert.rejects(checkPlayback(base, "listener", "secret-password"), /Wrong username or password/);
});

test("does not accept a login page as audio", async () => {
  mode = "html";
  await assert.rejects(checkPlayback(base, "listener", "secret-password"), /expected audio/);
});

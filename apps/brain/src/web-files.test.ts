/** The brain serving the web app itself (the desktop app has no nginx or Caddy). */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isApiPath, serveWeb, webFile } from "./web-files.ts";

function site() {
  const root = mkdtempSync(join(tmpdir(), "synamp-web-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html><title>SynAmp</title>");
  writeFileSync(join(root, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(root, "favicon.svg"), "<svg/>");
  const outside = mkdtempSync(join(tmpdir(), "synamp-secret-"));
  writeFileSync(join(outside, "secret.txt"), "no");
  symlinkSync(join(outside, "secret.txt"), join(root, "assets", "link.txt"));
  return root;
}

async function serve(root: string) {
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (!serveWeb(req, res, root, path)) { res.writeHead(404); res.end("brain 404"); }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((done) => server.close(() => done())) };
}

test("files stay inside the web folder", () => {
  const root = site();
  assert.ok(webFile(root, "/assets/index-abc123.js"));
  assert.equal(webFile(root, "/../../etc/passwd"), null);
  assert.equal(webFile(root, "/%2e%2e/%2e%2e/etc/passwd"), null);
  assert.equal(webFile(root, "/assets/link.txt"), null, "a symlink pointing out of the folder");
  assert.equal(webFile(root, "/a%00b"), null);
  assert.equal(webFile(root, "/%E0%A4%A"), null, "bad escapes");
  assert.match(webFile(root, "/")!, /index\.html$/);
});

test("the brain's own paths are never web files", () => {
  for (const path of ["/api/v1/system", "/rest/ping.view", "/health"]) assert.ok(isApiPath(path), path);
  assert.ok(!isApiPath("/library"));
});

test("serves the app, its assets and the history fallback like nginx did", async () => {
  const { base, close } = await serve(site());
  try {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(home.headers.get("content-type")!, /^text\/html/);
    assert.equal(home.headers.get("cache-control"), "no-cache", "an update shows at once");
    assert.match(await home.text(), /<title>SynAmp/);

    const asset = await fetch(`${base}/assets/index-abc123.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("cache-control")!, /immutable/);
    assert.match(asset.headers.get("content-type")!, /javascript/);

    const bookmark = await fetch(`${base}/library/artist/Somebody`);
    assert.equal(bookmark.status, 200, "an old bookmark still opens the app");
    assert.match(await bookmark.text(), /<title>SynAmp/);

    assert.equal((await fetch(`${base}/assets/index-old999.js`)).status, 404, "a missing script is not the app");
    assert.equal((await fetch(`${base}/api/v1/nothing`)).status, 404);
    assert.equal(await (await fetch(`${base}/api/v1/nothing`)).text(), "brain 404");
    assert.equal((await fetch(`${base}/`, { method: "POST" })).status, 404, "only GET and HEAD");
    const head = await fetch(`${base}/favicon.svg`, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), "6");
  } finally { await close(); }
});

test("without a web folder nothing changes", async () => {
  const { base, close } = await serve("");
  try { assert.equal((await fetch(`${base}/`)).status, 404); } finally { await close(); }
});

import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { test } from "node:test";
import { parseRoadmap } from "../build.mjs";
import subscribe from "../api/subscribe.js";
import contact from "../api/contact.js";

test("roadmap: ticks decide each phase's badge; shipped is newest first", () => {
  const { phases, shipped } = parseRoadmap(`
<!-- a comment with - [x] in it is ignored -->
## All done
id: one
- [x] a
- [x] b
## Half way
- [x] a
- [ ] b
## Under way
- [~] a
## Up next
next: yes
- [ ] a
## Later
- [ ] a
## Recently shipped
- 2026-10-01 — older
- 2026-10-05 — newer
`);
  assert.deepEqual(phases.map((p) => p.status), ["done", "active", "active", "next", "planned"]);
  assert.equal(phases[0].id, "one");
  assert.equal(phases[1].id, "half-way");
  assert.deepEqual(phases[1].items.map((i) => i.state), ["done", "todo"]);
  assert.deepEqual(shipped.map((s) => s.text), ["newer", "older"]);
});

function call(handler, body, { accept = "application/json", method = "POST" } = {}) {
  const req = Readable.from([new URLSearchParams(body).toString()]);
  req.method = method;
  req.headers = { accept, "content-type": "application/x-www-form-urlencoded" };
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { resolve({ status: this.statusCode, headers: this.headers, body: text ? JSON.parse(text.startsWith("{") ? text : "{}") : {} }); } };
    handler(req, res);
  });
}

function withResend(fn) {
  return async () => {
    const sent = [];
    const original = globalThis.fetch;
    process.env.RESEND_API_KEY = "re_test"; process.env.NOTIFY_EMAIL = "me@example.com";
    globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response("{}", { status: 200 }); };
    try { await fn(sent); } finally { globalThis.fetch = original; delete process.env.RESEND_API_KEY; delete process.env.NOTIFY_EMAIL; delete process.env.RESEND_AUDIENCE_ID; delete process.env.RESEND_SEGMENT_ID; }
  };
}

test("subscribe: emails you the signup, reply goes to them", withResend(async (sent) => {
  const r = await call(subscribe, { email: "Fan@Example.com ", has_server: "yes", source: "popup", elapsed_ms: "5000" });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.to[0], "me@example.com");
  assert.equal(sent[0].body.reply_to, "fan@example.com");
  assert.match(sent[0].body.text, /NAS or home server: yes/);
}));

test("subscribe: adds a new contact straight into the segment", withResend(async (sent) => {
  process.env.RESEND_SEGMENT_ID = "seg_1";
  await call(subscribe, { email: "fan@example.com" });
  assert.match(sent[0].url, /\/contacts$/);
  assert.deepEqual(sent[0].body.segments, [{ id: "seg_1" }]);
  assert.match(sent[1].body.text, /Added to your Resend news list/);
}));

test("subscribe: someone already in contacts is added to the segment instead", async () => {
  const sent = [];
  const original = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test"; process.env.NOTIFY_EMAIL = "me@example.com"; process.env.RESEND_SEGMENT_ID = "seg_1";
  globalThis.fetch = async (url, init) => {
    sent.push(url);
    if (url.endsWith("/contacts")) return new Response('{"name":"validation_error"}', { status: 422 });
    return new Response("{}", { status: 200 });
  };
  try {
    await call(subscribe, { email: "fan@example.com" });
    assert.match(sent[1], /contacts\/fan%40example\.com\/segments\/seg_1$/);
  } finally { globalThis.fetch = original; delete process.env.RESEND_API_KEY; delete process.env.NOTIFY_EMAIL; delete process.env.RESEND_SEGMENT_ID; }
});

test("subscribe: bad email refused; bots get a polite nothing", withResend(async (sent) => {
  assert.equal((await call(subscribe, { email: "nope" })).status, 400);
  assert.equal((await call(subscribe, { email: "bot@example.com", website: "http://spam" })).status, 200);
  assert.equal((await call(subscribe, { email: "fast@example.com", elapsed_ms: "300" })).status, 200);
  assert.equal(sent.length, 0);
}));

test("subscribe: without JavaScript, the browser is sent to a thanks page", withResend(async () => {
  const r = await call(subscribe, { email: "fan@example.com" }, { accept: "text/html" });
  assert.equal(r.status, 303);
  assert.equal(r.headers.location, "/thanks");
  const bad = await call(subscribe, { email: "nope" }, { accept: "text/html" });
  assert.equal(bad.headers.location, "/oops");
}));

test("contact: needs the basics; sends the message with topic and version", withResend(async (sent) => {
  assert.equal((await call(contact, { email: "a@b.co" })).status, 400);
  const r = await call(contact, { name: "Ada", email: "ada@example.com", topic: "Bug report", subject: "Undo", message: "It undid.", version: "c3a19f", urgency: "soon" });
  assert.equal(r.status, 200);
  assert.match(sent[0].body.subject, /\[SynAmp · Bug report\] Undo/);
  assert.match(sent[0].body.text, /SynAmp version: c3a19f/);
  assert.equal(sent[0].body.reply_to, "ada@example.com");
  assert.match(sent[0].body.text, /Product news: no/);
}));

test("contact: ticking product news joins the audience; leaving it doesn't", withResend(async (sent) => {
  process.env.RESEND_AUDIENCE_ID = "aud_1";
  await call(contact, { name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello", updates: "yes" });
  assert.deepEqual(sent[0].body.segments, [{ id: "aud_1" }], "an audience ID still works");
  assert.match(sent[1].body.text, /Product news: yes/);
  sent.length = 0;
  await call(contact, { name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello" });
  assert.equal(sent.length, 1, "no audience call without the tick");
}));

test("forms: not set up yet → a clear failure, not a crash", async () => {
  const r = await call(contact, { name: "Ada", email: "ada@example.com", subject: "Hi", message: "Hello" });
  assert.equal(r.status, 502);
  assert.equal(r.body.ok, false);
});

test("forms: GET is refused", async () => {
  const r = await call(contact, {}, { method: "GET" });
  assert.equal(r.status, 405);
});

// ---- the download buttons

import { latestRelease, shape, RELEASES_PAGE } from "../api/_lib/release.js";
import { readFileSync, readdirSync } from "node:fs";

const githubRelease = {
  tag_name: "v0.2.0", published_at: "2026-11-16T18:12:27Z", html_url: "https://github.com/tracyapps/synamp/releases/tag/v0.2.0",
  assets: ["appcast-apple-silicon.xml", "appcast-intel.xml", "SynAmp-0.2.0-apple-silicon.dmg", "SynAmp-0.2.0-intel.dmg", "synamp-0.2.0.zip", "synamp-0.2.0.zip.sha256"]
    .map((name) => ({ name, browser_download_url: `https://github.com/tracyapps/synamp/releases/download/v0.2.0/${name}` })),
};

test("download: the newest release gives a version and a file for each kind of Mac", () => {
  const release = shape(githubRelease);
  assert.equal(release.version, "0.2.0");
  assert.match(release.apple_silicon, /SynAmp-0\.2\.0-apple-silicon\.dmg$/);
  assert.match(release.intel, /SynAmp-0\.2\.0-intel\.dmg$/);
  assert.equal(shape({ tag_name: "nightly" }), null, "a tag that isn't a version is ignored");
  assert.equal(shape({ tag_name: "v0.3.0", assets: [] }).apple_silicon, null);
});

test("download: when GitHub can't be reached, nothing breaks", async () => {
  assert.equal(await latestRelease(async () => { throw new Error("offline"); }), null);
  assert.equal(await latestRelease(async () => ({ ok: false, json: async () => ({}) })), null);
  const release = await latestRelease(async () => ({ ok: true, json: async () => githubRelease }));
  assert.equal(release.version, "0.2.0");
});

test("download: the buttons go to the newest file, or to the release page when it's missing", async () => {
  const { default: download } = await import("../api/download.js");
  const { default: releaseInfo } = await import("../api/release.js");
  const original = globalThis.fetch;
  const ask = async (handler, url, method = "GET") => {
    const headers = {}; let body = "";
    const res = { statusCode: 0, setHeader: (k, v) => { headers[k] = v; }, end: (text = "") => { body = text; } };
    await handler({ method, url, headers: {} }, res);
    return { status: res.statusCode, headers, body };
  };
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => githubRelease });
    assert.match((await ask(download, "/api/download?chip=apple-silicon")).headers.location, /apple-silicon\.dmg$/);
    assert.match((await ask(download, "/api/download?chip=intel")).headers.location, /intel\.dmg$/);
    assert.equal((await ask(download, "/api/download?chip=windows")).headers.location, githubRelease.html_url);
    assert.deepEqual(JSON.parse((await ask(releaseInfo, "/api/release")).body), { version: "0.2.0", published: githubRelease.published_at, page: githubRelease.html_url });
    assert.equal((await ask(download, "/api/download?chip=intel", "POST")).status, 405);
    globalThis.fetch = async () => { throw new Error("offline"); };
    const offline = await ask(download, "/api/download?chip=intel");
    assert.equal(offline.status, 302);
    assert.equal(offline.headers.location, RELEASES_PAGE);
    assert.equal(JSON.parse((await ask(releaseInfo, "/api/release")).body).version, null);
  } finally { globalThis.fetch = original; }
});

test("download: no page still points at the old early-access page", () => {
  const src = new URL("../src/", import.meta.url);
  const files = [...readdirSync(src).filter((f) => f.endsWith(".html")).map((f) => new URL(f, src)), ...readdirSync(new URL("partials/", src)).map((f) => new URL(`partials/${f}`, src))];
  for (const file of files) assert.doesNotMatch(readFileSync(file, "utf8"), /\/coming-soon|Get early access/, `${file.pathname}`);
});

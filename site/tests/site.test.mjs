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
    try { await fn(sent); } finally { globalThis.fetch = original; delete process.env.RESEND_API_KEY; delete process.env.NOTIFY_EMAIL; delete process.env.RESEND_AUDIENCE_ID; }
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

test("subscribe: adds to the audience when one is set", withResend(async (sent) => {
  process.env.RESEND_AUDIENCE_ID = "aud_1";
  await call(subscribe, { email: "fan@example.com" });
  assert.match(sent[0].url, /audiences\/aud_1\/contacts/);
  assert.equal(sent.length, 2);
}));

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

/** Telling people a new SynAmp is out: what counts as newer, and when we ask GitHub at all. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { compareVersions, newestRelease, UpdateCheck } from "./updates.ts";

const rel = (tag: string, extra: Record<string, unknown> = {}) => ({ tag_name: tag, name: `SynAmp ${tag}`, body: `Notes for ${tag}`, html_url: `https://github.com/tracyapps/synamp/releases/tag/${tag}`, published_at: "2026-10-12T00:00:00Z", draft: false, prerelease: tag.includes("-"), ...extra });

test("versions sort the way people expect", () => {
  const ordered = ["0.9.9", "0.10.0-alpha", "0.10.0-beta.2", "0.10.0-beta.10", "0.10.0", "0.10.1", "1.0.0"];
  for (let i = 1; i < ordered.length; i++) assert.ok(compareVersions(ordered[i - 1]!, ordered[i]!) < 0, `${ordered[i - 1]} < ${ordered[i]}`);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("the newest release skips drafts and odd tags, and betas unless asked", () => {
  const list = [rel("v0.2.0"), rel("v0.3.0-beta.1"), rel("v0.2.1"), rel("v9.9.9", { draft: true }), rel("nightly"), { tag_name: 5 }];
  assert.equal(newestRelease(list, false)!.version, "0.2.1");
  assert.equal(newestRelease(list, true)!.version, "0.3.0-beta.1");
  assert.equal(newestRelease([rel("v0.1.0", { html_url: "https://evil.example/x" })], false)!.url, "https://github.com/tracyapps/synamp/releases", "only GitHub links");
  assert.throws(() => newestRelease({ message: "Not Found" }, false));
});

function setup(options: { current?: string; enabled?: boolean; beta?: boolean; respond?: () => Response | Promise<Response> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "synamp-updates-"));
  const state = { current: "current" in options ? options.current : "0.2.0", enabled: options.enabled ?? true, beta: options.beta ?? false, calls: [] as Array<{ url: string; init?: RequestInit }> };
  const fetcher = (async (url: string, init?: RequestInit) => {
    state.calls.push({ url, init });
    return options.respond ? options.respond() : Response.json([rel("v0.2.0"), rel("v0.3.0"), rel("v0.4.0-beta.1")]);
  }) as typeof fetch;
  const make = () => new UpdateCheck({ path: join(dir, "updates.json"), feedUrl: "https://feed.test/releases", fetcher,
    current: () => state.current, enabled: () => state.enabled, beta: () => state.beta });
  return { dir, state, make, check: make(), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("a newer release is offered with its notes; the request carries nothing personal", async () => {
  const f = setup();
  try {
    const view = await f.check.check();
    assert.equal(view.available!.version, "0.3.0", "stable only by default, even with a newer beta out");
    assert.equal(view.available!.notes, "Notes for v0.3.0");
    assert.equal(view.show_notice, true, "first time: say what the check does");
    assert.equal(f.state.calls.length, 1);
    const headers = f.state.calls[0]!.init!.headers as Record<string, string>;
    assert.deepEqual(Object.keys(headers).sort(), ["Accept", "User-Agent"]);
    assert.equal(headers["User-Agent"], "SynAmp-update-check", "no version, name or library details");
    f.state.beta = true;
    assert.equal(f.check.view().available!.version, "0.4.0-beta.1", "beta switch on: no new request needed");
    assert.equal(f.state.calls.length, 1);
  } finally { f.cleanup(); }
});

test("skip this version and remind me later are remembered, and a newer release still shows", async () => {
  const f = setup();
  try {
    await f.check.check();
    f.check.noticeSeen();
    assert.equal(f.check.skip("v0.3.0").available, null);
    const reloaded = f.make();
    assert.equal(reloaded.view().skipped, "0.3.0", "kept across restarts");
    assert.equal(reloaded.view().show_notice, false);
    assert.equal(reloaded.view().newer!.version, "0.3.0", "About this install still says it exists");
    f.state.beta = true;
    assert.equal(reloaded.view().available!.version, "0.4.0-beta.1", "skipping one version doesn't hide the next");
    f.state.beta = false;
    reloaded.skip("0.2.0");
    const now = Date.now();
    assert.equal(reloaded.remindLater(now).available, null);
    assert.equal(reloaded.view(now + 2 * 86_400_000).available, null, "two days later: still quiet");
    assert.equal(reloaded.view(now + 4 * 86_400_000).available!.version, "0.3.0", "after three days it comes back");
    assert.throws(() => reloaded.skip("whatever"), /version number/);
  } finally { f.cleanup(); }
});

test("no requests at all when checks are off, or on a copy built on the NAS", async () => {
  const off = setup({ enabled: false });
  const nas = setup({ current: undefined });
  try {
    const a = await off.check.check();
    assert.equal(a.enabled, false);
    assert.equal(a.show_notice, false);
    assert.equal((await nas.check.check()).current, null);
    off.check.start(0, 10); nas.check.start(0, 10);
    await new Promise((r) => setTimeout(r, 60));
    off.check.stop(); nas.check.stop();
    assert.equal(off.state.calls.length + nas.state.calls.length, 0);
  } finally { off.cleanup(); nas.cleanup(); }
});

test("an older or equal release, or a failed check, offers nothing and says why", async () => {
  const same = setup({ current: "0.3.0" });
  const down = setup({ respond: () => new Response("slow down", { status: 403 }) });
  const broken = setup({ respond: () => { throw new TypeError("fetch failed"); } });
  try {
    assert.equal((await same.check.check()).available, null);
    const d = await down.check.check();
    assert.equal(d.available, null);
    assert.match(d.error!, /slow down/);
    assert.match((await broken.check.check()).error!, /^Couldn't check for updates: fetch failed\.$/);
    // A later good check clears the error.
    const ok = setup();
    try { assert.equal((await ok.check.check()).error, null); } finally { ok.cleanup(); }
  } finally { same.cleanup(); down.cleanup(); broken.cleanup(); }
});

test("checks at the same moment share one request; a damaged state file is never replaced", async () => {
  const f = setup();
  try {
    await Promise.all([f.check.check(), f.check.check(), f.check.check()]);
    assert.equal(f.state.calls.length, 1);
    writeFileSync(join(f.dir, "updates.json"), "{not json");
    assert.throws(() => f.make(), /RECOVERY/);
    assert.equal(readFileSync(join(f.dir, "updates.json"), "utf8"), "{not json");
  } finally { f.cleanup(); }
});

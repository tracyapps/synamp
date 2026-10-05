/** "Listen anywhere": the Phase 1 checklist. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { otherAppPlays, pingCore, SetupStore } from "./setup.ts";

test("ticks and the NAS's tailnet name are kept; pasted addresses are cleaned up", () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-setup-"));
  try {
    const store = new SetupStore(join(dir, "setup.json"));
    store.update({ step: "navidrome_account", done: true }, 5);
    store.update({ tailscale_name: "  http://Syd.tail1234.ts.net:8080/ " });
    assert.equal(store.state.tailscale_name, "syd.tail1234.ts.net");
    assert.throws(() => store.update({ step: "fly", done: true }), /step must be/);
    assert.throws(() => store.update({ step: "away_test", done: "yes" }), /true or false/);
    assert.throws(() => store.update({ tailscale_name: "my nas!" }), /device name/);
    const saved = new SetupStore(join(dir, "setup.json"));
    assert.equal(saved.state.done.navidrome_account, 5);
    saved.update({ step: "navidrome_account", done: false });
    saved.update({ tailscale_name: "" });
    assert.deepEqual(saved.state.done, {});
    assert.equal(saved.state.tailscale_name, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("plays from other apps are grouped by app; only Subsonic plays count", () => {
  const apps = otherAppPlays([
    { source: "subsonic", signal: "external_play", ts: 10, detail: { client: "Symfonium" } },
    { source: "subsonic", signal: "now_playing", ts: 30, detail: { client: "Symfonium" } },
    { source: "subsonic", signal: "external_play", ts: 20, detail: { client: "Feishin" } },
    { source: "player", signal: "completed", ts: 40 },
  ]);
  assert.deepEqual(apps.map((a) => [a.name, a.plays, a.last_at]), [["Symfonium", 2, 30], ["Feishin", 1, 20]]);
});

test("Navidrome's ping: up, answering oddly, or not there", async () => {
  assert.deepEqual(await pingCore("http://core:4533/", async () => new Response("ok")), { ok: true });
  assert.match((await pingCore("http://core:4533", async () => new Response("", { status: 503 }))).problem!, /503/);
  assert.match((await pingCore("http://core:4533", async () => { throw new Error("ECONNREFUSED"); })).problem!, /isn't answering/);
});

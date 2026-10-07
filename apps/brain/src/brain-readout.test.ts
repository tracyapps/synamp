/** Real HTTP boundary, scratch stores only. Fixtures prove behavior, not music accuracy. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

// Reserve an OS-selected port before starting our child; readiness also asserts its own stdout.
async function availablePort() {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  return port;
}

test("brain routes preserve playlist context, reading notes, policy rollback and proposal log honesty", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-brain-readout-"));
  const now = Date.now();
  const eventsPath = join(dir, "events.jsonl");
  const sessionPath = join(dir, "session.json");
  const trackId = "sample-001";
  const event = (id: string, ts: number, signal: string, extra: object = {}) => ({
    id, ts, signal, track_id: trackId, scope: "session", session_id: "test-session",
    source: "player", policy_version: "epoch-v1", ...extra,
  });
  const history = [
    // Three closed epochs on three dates, comfortably away from midnight in any timezone.
    ...[3, 2, 1].flatMap((days) => [
      event(`skip-${days}-a`, now - days * 86_400_000, "skip_early"),
      event(`skip-${days}-b`, now - days * 86_400_000 + 1000, "skip_early"),
    ]),
    event("playlist-thumb", now - 1000, "thumb_up", { scope: "playlist", scope_id: "P1" }),
  ];
  const original = history.map((e) => JSON.stringify(e)).join("\n") + "\n";
  writeFileSync(eventsPath, original);
  writeFileSync(sessionPath, JSON.stringify({
    id: "test-session", queue: ["P1", "P2"].map((playlist_id, i) => ({
      entry_id: `entry-${i}`, track_id: trackId, title: "Synthetic track", source: { playlist_id, rank: 0 },
    })), index: 0, state: "idle", completed: [], updated_at: now, policy_version: "epoch-v1",
  }));
  const port = await availablePort();
  const child = spawn(process.execPath, ["--experimental-strip-types", new URL("./index.ts", import.meta.url).pathname], {
    env: { ...process.env, BRAIN_HOST: "127.0.0.1", BRAIN_PORT: String(port),
      PLAYLIST_DATA_PATH: join(dir, "playlists.json"), EVENTS_PATH: eventsPath, SESSION_PATH: sessionPath,
      LIBRARY_SIGNALS_PATH: new URL("../fixtures/library.sample.json", import.meta.url).pathname,
      LIBRARY_PATH: join(dir, "music"), INCOMING_PATH: "", SOURCE_PATH: "", CORE_URL: "http://127.0.0.1:1",
      MUSICBRAINZ_CONTACT: "", LASTFM_API_KEY: "", LASTFM_API_SECRET: "", LASTFM_STATE_PATH: join(dir, "lastfm.json"),
      PLAYLIST_API_TOKEN: "scratch-test-token", TZ: "America/Chicago",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child did not start: ${output}`)), 8000);
      child.once("error", (e) => { clearTimeout(timer); reject(e); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Child exited ${code}: ${output}`)); });
      child.stdout.on("data", (chunk) => {
        output += chunk;
        if (output.includes(`listening on http://127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); }
      });
    });
    async function request(path: string, body?: object, expected = 200) {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
        method: body ? "POST" : "GET", headers: { authorization: "Bearer scratch-test-token", "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await res.json() as any;
      assert.equal(res.status, expected, JSON.stringify(payload));
      return payload;
    }
    const unauth = await fetch(`http://127.0.0.1:${port}/api/v1/brain/session`);
    assert.equal(unauth.status, 401);
    for (const route of ["/library/explore?types=song", "/library/galaxy", "/library/galaxy/artist?key=absent", "/library/galaxy/random"]) {
      const blocked = await fetch(`http://127.0.0.1:${port}/api/v1${route}`);
      assert.equal(blocked.status, 401, `${route} retains the library token boundary`);
    }
    assert.ok((await request("/library/explore?types=song&limit=1")).total > 0);
    assert.equal((await request("/library/explore?from=2000&to=1990", undefined, 400)).error, "Year range must run from earlier to later");
    const planets = await request("/library/galaxy?limit=1&offset=1");
    assert.equal(planets.nodes.length, 1);
    assert.equal((await request(`/library/galaxy/artist?key=${encodeURIComponent(planets.nodes[0].key)}`)).artist.key, planets.nodes[0].key);
    assert.equal((await request("/library/galaxy/random?q=not-an-artist-at-all")).node, null);
    const view = await request("/brain/session");
    assert.equal(view.queue_adjustments.length, 2);
    const p1 = view.queue_adjustments.find((a: any) => a.playlist_id === "P1");
    const p2 = view.queue_adjustments.find((a: any) => a.playlist_id === "P2");
    assert.ok(p1.value > p2.value, "playlist thumb appears only in that playlist's readout");
    const draft = await request("/plans/draft", { prompt: "focus 1990–2005" });
    assert.equal(draft.interpretation.accuracy, "partial");
    assert.ok(draft.interpretation.readings[0].culture_notes.length > 0);
    assert.ok(draft.interpretation.readings[0].caveats.length > 0);
    assert.ok(draft.interpretation.asks.length > 0);
    const proposal = view.proposals.find((p: any) => p.kind === "track_repeat_skip");
    assert.ok(proposal);
    const accepted = await request("/brain/proposals", { id: proposal.id, action: "accept" });
    assert.ok(!accepted.hides.includes(trackId), "accepted thumb is not a session exclusion");
    const after = readFileSync(eventsPath, "utf8");
    assert.ok(after.startsWith(original));
    const last = JSON.parse(after.trim().split("\n").at(-1)!);
    assert.equal(last.signal, "thumb_down");
    assert.equal(last.scope, "global");
    assert.equal(last.reason, undefined);
    assert.equal(last.detail.proposal_id, proposal.id);
    await request("/brain/proposals", { id: proposal.id, action: "accept" });
    assert.equal(readFileSync(eventsPath, "utf8"), after, "retry appends no duplicate signal");
    await request("/brain/proposals", { id: proposal.id, action: "dismiss" }, 409);
    await request("/brain/proposals", { id: "missing", action: "accept" }, 404);
    await request("/settings", { listening_policy: "legacy-v1" });
    assert.equal((await request("/brain/session")).policy_version, "heuristic-v1");
    await request("/settings", { listening_policy: "epoch-v1" });
    assert.equal((await request("/brain/session")).policy_version, "epoch-v1");
    await request("/brain/forget", { scope: "all" }, 400);
    await request("/brain/forget", { scope: "epoch" });
    assert.ok(readFileSync(eventsPath, "utf8").startsWith(after));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      await stopped;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

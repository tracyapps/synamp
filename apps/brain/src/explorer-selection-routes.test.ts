/** Real HTTP authorization and durable snapshot boundary, isolated scratch stores. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

test("explorer selection routes authorize, snapshot every match, persist once and retry without duplicates", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "synamp-selection-http-"));
  const libraryPath = join(dir, "library.json"); const playlistsPath = join(dir, "playlists.json");
  const tracks = Array.from({ length: 320 }, (_, i) => ({ id: `selection-${i}`, title: `Song ${String(i).padStart(3, "0")}`, artist: "Selection Artist", album: "Collection", year: 2000, path: `Selection Artist/Collection/${i}.mp3` }));
  writeFileSync(libraryPath, JSON.stringify({ tracks }));
  const reservation = createServer(); reservation.listen(0, "127.0.0.1"); await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  const child = spawn(process.execPath, ["--experimental-strip-types", new URL("./index.ts", import.meta.url).pathname], {
    env: { ...process.env, BRAIN_HOST: "127.0.0.1", BRAIN_PORT: String(port), PLAYLIST_DATA_PATH: playlistsPath,
      EVENTS_PATH: join(dir, "events.jsonl"), SESSION_PATH: join(dir, "session.json"), LIBRARY_SIGNALS_PATH: libraryPath,
      LIBRARY_PATH: join(dir, "music"), INCOMING_PATH: "", SOURCE_PATH: "", CORE_URL: "http://127.0.0.1:1",
      MUSICBRAINZ_CONTACT: "", LASTFM_API_KEY: "", LASTFM_API_SECRET: "", LASTFM_STATE_PATH: join(dir, "lastfm.json"),
      PLAYLIST_API_TOKEN: "selection-test-token", TZ: "America/Chicago" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = ""; child.stderr.on("data", chunk => { output += chunk; });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Child did not start: ${output}`)), 8000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`Child exited ${code}: ${output}`)); });
      child.stdout.on("data", chunk => { output += chunk; if (output.includes(`listening on http://127.0.0.1:${port}`)) { clearTimeout(timer); resolve(); } });
    });
    const base = `http://127.0.0.1:${port}/api/v1`;
    const call = async (path: string, input?: object, expected = 200) => {
      const response = await fetch(base + path, { method: input ? "POST" : "GET", headers: { authorization: "Bearer selection-test-token", "content-type": "application/json" }, ...(input ? { body: JSON.stringify(input) } : {}) });
      const payload = await response.json() as any; assert.equal(response.status, expected, JSON.stringify(payload)); return payload;
    };
    assert.equal((await fetch(`${base}/library/explore/selection`)).status, 401);
    assert.equal((await fetch(`${base}/library/explore/playlist`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ selection_id: "not-authenticated", name: "Blocked" }) })).status, 401);
    assert.equal((await call("/playlists")).nodes.length, 0);
    const preview = await call("/library/explore/selection?types=album&offset=300&limit=1&sort=title&direction=desc");
    assert.equal(preview.track_count, 320); assert.equal(preview.sample.length, 8); assert.equal(preview.sample[0].id, "selection-319");
    // Ongoing analysis exports must not invalidate a still-present selection.
    writeFileSync(libraryPath, JSON.stringify({ tracks: tracks.map(track => ({ ...track, signals: { bpm: 112 } })) }));
    const input = { selection_id: preview.selection_id, name: "Filtered snapshot" };
    const created = await call("/library/explore/playlist", input, 201); assert.equal(created.track_count, 320); assert.equal(created.duplicate, false);
    assert.equal(created.playlist.type, "playlist"); assert.equal(created.playlist.tracks.length, 320);
    assert.equal(created.playlist.tracks.at(-1).id, "selection-0");
    const bytes = readFileSync(playlistsPath, "utf8");
    const retry = await call("/library/explore/playlist", input); assert.equal(retry.duplicate, true); assert.equal(retry.playlist.id, created.playlist.id);
    assert.equal(readFileSync(playlistsPath, "utf8"), bytes);
    await call("/library/explore/playlist", { ...input, name: "Other name" }, 409);
    await call("/library/explore/playlist", { selection_id: "missing", name: "Missing" }, 410);
    const second = await call("/library/explore/selection?types=artist");
    writeFileSync(libraryPath, JSON.stringify({ tracks: tracks.slice(1) }));
    await call("/library/explore/playlist", { selection_id: second.selection_id, name: "No missing songs" }, 409);
    assert.equal(readFileSync(playlistsPath, "utf8"), bytes);
    await call("/library/explore/selection?types=", undefined, 400);
    const empty = await call("/library/explore/selection?q=no-such-song"); assert.equal(empty.track_count, 0);
    await call("/library/explore/playlist", { selection_id: empty.selection_id, name: "Empty" }, 400);
    assert.equal((await call("/playlists")).nodes.length, 1);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped; }
    rmSync(dir, { recursive: true, force: true });
  }
});

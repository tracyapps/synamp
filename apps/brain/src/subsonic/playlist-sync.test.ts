import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaylistSync, syncName } from "./playlist-sync.ts";

/** A pretend Navidrome: one user, some songs, and the playlist calls. */
function fakeNavidrome(options: { password?: string; songs?: Array<{ id: string; path: string }>; emptyQueryWorks?: boolean; returnsCreated?: boolean } = {}) {
  const password = options.password ?? "secret";
  const songs = options.songs ?? [];
  const playlists = new Map<string, { id: string; name: string; songs: string[]; comment?: string; owner: string }>();
  let next = 1;
  const calls: string[] = [];
  const ok = (extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ "subsonic-response": { status: "ok", version: "1.16.1", ...extra } }));
  const fail = (code: number, message: string) => new Response(JSON.stringify({ "subsonic-response": { status: "failed", error: { code, message } } }));
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const params = new URLSearchParams(url.search);
    if (init?.body) for (const [key, value] of new URLSearchParams(String(init.body))) params.append(key, value);
    const method = url.pathname.replace(/^\/rest\//, "").replace(/\.view$/, "");
    calls.push(method);
    const salt = params.get("s") ?? "";
    if (params.get("u") !== "tapps" || params.get("t") !== createHash("md5").update(password + salt).digest("hex")) return fail(40, "Wrong username or password");
    switch (method) {
      case "ping": return ok();
      case "search3": {
        const query = params.get("query");
        const works = options.emptyQueryWorks ?? true;
        if ((query === "" && !works) || (query === '""' && works)) return ok({ searchResult3: {} });
        const offset = Number(params.get("songOffset") ?? 0), count = Number(params.get("songCount") ?? 20);
        return ok({ searchResult3: { song: songs.slice(offset, offset + count) } });
      }
      case "getPlaylists": return ok({ playlists: { playlist: [...playlists.values()].map(({ id, name }) => ({ id, name })) } });
      case "createPlaylist": {
        const id = params.get("playlistId");
        if (id) { playlists.get(id)!.songs = params.getAll("songId"); return ok(); }
        const made = { id: `pl${next++}`, name: params.get("name")!, songs: params.getAll("songId"), owner: "tapps" };
        playlists.set(made.id, made);
        return options.returnsCreated === false ? ok() : ok({ playlist: { id: made.id, name: made.name } });
      }
      case "updatePlaylist": {
        const item = playlists.get(params.get("playlistId")!)!;
        item.name = params.get("name") ?? item.name;
        item.comment = params.get("comment") ?? item.comment;
        return ok();
      }
      case "deletePlaylist": playlists.delete(params.get("id")!); return ok();
      default: return fail(0, `unknown ${method}`);
    }
  }) as typeof fetch;
  return { fetchImpl, playlists, calls };
}

const tempFile = () => join(mkdtempSync(join(tmpdir(), "synamp-phone-")), "phone-playlists.json");
const songs = [
  { id: "nd-1", path: "/music/A/One.mp3" },
  { id: "nd-2", path: "/music/A/Two.mp3" },
  { id: "nd-3", path: "/music/B/Three.mp3" },
  { id: "nd-x", path: "/elsewhere/Nope.mp3" },
];
const idForPath = (relative: string) => ({ "A/One.mp3": "t1", "A/Two.mp3": "t2", "B/Three.mp3": "t3" } as Record<string, string>)[relative];

test("sign-in checks the password with Navidrome and keeps only a salted token", async () => {
  const nd = fakeNavidrome();
  const file = tempFile();
  const sync = new PlaylistSync(file, { coreUrl: "http://core:4533", coreMusicPath: "/music", fetchImpl: nd.fetchImpl });
  await assert.rejects(sync.signIn("tapps", "wrong"), /didn't accept/);
  assert.equal(sync.signedIn, false);
  await sync.signIn("tapps", "secret");
  assert.equal(sync.signedIn, true);
  const saved = readFileSync(file, "utf8");
  assert.doesNotMatch(saved, /secret/);
  assert.match(saved, /"token"/);
  assert.equal(sync.view().user, "tapps");
  assert.equal((sync.view() as Record<string, unknown>).token, undefined);
});

test("sends each playlist with matched songs, counts the rest, and replaces on the next send", async () => {
  const nd = fakeNavidrome({ songs });
  const sync = new PlaylistSync(tempFile(), { coreUrl: "http://core:4533", coreMusicPath: "/music", fetchImpl: nd.fetchImpl });
  await sync.signIn("tapps", "secret");
  const first = await sync.sync([
    { id: "p1", name: "Evenings › Slow burn", trackIds: ["t1", "t3", "t-unscanned"] },
    { id: "p2", name: "Dinner", trackIds: ["t2"] },
  ], "v1", idForPath, 1000);
  assert.deepEqual(first, { at: 1000, sent: 2, removed: 0, missing: 1 });
  const lists = [...nd.playlists.values()];
  assert.deepEqual(lists.map((item) => [item.name, item.songs]), [["Evenings › Slow burn", ["nd-1", "nd-3"]], ["Dinner", ["nd-2"]]]);
  assert.match(lists[0]!.comment!, /Made in SynAmp/);

  // Change one, delete the other: same Navidrome playlist is rewritten, the deleted one goes.
  const searchesBefore = nd.calls.filter((call) => call === "search3").length;
  await sync.sync([{ id: "p1", name: "Evenings › Slow burn", trackIds: ["t2"] }], "v1", idForPath, 2000);
  assert.deepEqual([...nd.playlists.values()].map((item) => [item.id, item.songs]), [["pl1", ["nd-2"]]]);
  assert.equal(nd.calls.filter((call) => call === "search3").length, searchesBefore, "song list reused while the library is unchanged");
  assert.equal(sync.view().last?.removed, 1);
});

test("never touches playlists it didn't make, and remakes one deleted by hand", async () => {
  const nd = fakeNavidrome({ songs });
  nd.playlists.set("mine", { id: "mine", name: "Made on my phone", songs: ["nd-1"], owner: "tapps" });
  const sync = new PlaylistSync(tempFile(), { coreUrl: "http://core:4533", coreMusicPath: "/music", fetchImpl: nd.fetchImpl });
  await sync.signIn("tapps", "secret");
  await sync.sync([{ id: "p1", name: "Gym", trackIds: ["t1"] }], "v1", idForPath);
  nd.playlists.delete("pl1");
  await sync.sync([], "v1", idForPath);
  await sync.sync([{ id: "p1", name: "Gym", trackIds: ["t1"] }], "v1", idForPath);
  assert.deepEqual([...nd.playlists.values()].map((item) => item.name).sort(), ["Gym", "Made on my phone"]);
});

test("falls back to a quoted empty query and finds new playlists by name on older servers", async () => {
  const nd = fakeNavidrome({ songs, emptyQueryWorks: false, returnsCreated: false });
  const sync = new PlaylistSync(tempFile(), { coreUrl: "http://core:4533", coreMusicPath: "/music", fetchImpl: nd.fetchImpl });
  await sync.signIn("tapps", "secret");
  const result = await sync.sync([{ id: "p1", name: "Gym", trackIds: ["t1", "t2"] }], "v1", idForPath);
  assert.equal(result?.missing, 0);
  assert.deepEqual([...nd.playlists.values()][0]!.songs, ["nd-1", "nd-2"]);
});

test("a password changed in Navidrome signs SynAmp out instead of retrying forever", async () => {
  const nd = fakeNavidrome({ songs });
  const sync = new PlaylistSync(tempFile(), { coreUrl: "http://core:4533", coreMusicPath: "/music", fetchImpl: nd.fetchImpl });
  await sync.signIn("tapps", "secret");
  const other = fakeNavidrome({ songs, password: "changed" });
  (sync as unknown as { fetchImpl: typeof fetch }).fetchImpl = other.fetchImpl;
  await assert.rejects(sync.sync([{ id: "p1", name: "Gym", trackIds: [] }], "v2", idForPath), /didn't accept/);
  assert.equal(sync.signedIn, false);
  assert.match(sync.view().last?.error ?? "", /didn't accept/);
});

test("folder names become part of the playlist name", () => {
  const nodes = [
    { id: "f", name: "Evenings", parentId: null },
    { id: "g", name: "Weekend", parentId: "f" },
    { id: "p", name: "Slow burn", parentId: "g" },
  ];
  assert.equal(syncName(nodes, "p"), "Evenings › Weekend › Slow burn");
  assert.equal(syncName(nodes, "f"), "Evenings");
});

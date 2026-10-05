/** Discography gaps (LIBRARY-CARE step 6) against a fake MusicBrainz — no network. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import type { ListeningEvent } from "../session/events.ts";
import { artistStats, checkArtist, chooseArtist, DiscographyChecker, discographyReport, DiscographyStore, gapLinks } from "./discography.ts";
import type { AlbumRecord } from "./missing.ts";
import { MusicBrainz } from "./musicbrainz.ts";

const ANI = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ANI_OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const rg = (id: string, title: string, date: string, type = "Album", secondary: string[] = []) =>
  ({ id, title, "primary-type": type, "secondary-types": secondary, "first-release-date": date });
const GROUPS = [
  rg("11111111-0000-0000-0000-000000000001", "Dilate", "1996-05-14"),
  rg("11111111-0000-0000-0000-000000000002", "Little Plastic Castle", "1998-02-17"),
  rg("11111111-0000-0000-0000-000000000003", "Up Up Up Up Up Up", "1999-01-19"),
  rg("11111111-0000-0000-0000-000000000004", "Living in Clip", "1997-04-22", "Album", ["Live"]),
  rg("11111111-0000-0000-0000-000000000005", "Little Plastic Remixes", "1999-01-01", "EP"),
  rg("11111111-0000-0000-0000-000000000006", "Unprecedented Sh!t", "2024-09-01"),
  rg("11111111-0000-0000-0000-000000000007", "Next Year's Record", "2099-01-01"),
];

function fakeMb(routes: { artists?: unknown[]; groups?: Record<string, unknown[]> }) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    if (href.includes("/artist?query=")) return Response.json({ artists: routes.artists ?? [] });
    const artist = href.match(/release-group\?artist=([0-9a-f-]{36})/)?.[1];
    if (artist) {
      const all = routes.groups?.[artist] ?? [];
      const offset = Number(href.match(/offset=(\d+)/)?.[1] ?? 0);
      return Response.json({ "release-groups": all.slice(offset, offset + 100), "release-group-count": all.length });
    }
    return new Response("?", { status: 404 });
  }) as typeof fetch;
  return { mb: new MusicBrainz({ contact: "me@example.org", fetchImpl, sleep: async () => {}, now: () => 0 }), calls };
}

const track = (id: string, path: string): LibraryTrack => ({ id, path, title: "t", metadata_source: "tags" });
const library: Library = { version: "1", tracks: [
  track("a1", "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3"),
  track("a2", "Ani DiFranco/Dilate (1996)/02 - Outta Me, Onto You.mp3"),
  track("a3", "Ani DiFranco/LPC/01 - Little Plastic Castle.mp3"),
  track("b1", "Tracy Chapman/Tracy Chapman (1988)/01 - Talkin' Bout a Revolution.mp3"),
  track("v1", "Various Artists/Now 42 (1999)/01 - Song.mp3"),
] };
const event = (signal: ListeningEvent["signal"], track_id: string): ListeningEvent => ({ id: `${signal}${track_id}${Math.random()}`, ts: 0, signal, track_id, scope: "global", source: "player", policy_version: "t" });
const lpcRecord: AlbumRecord = { key: "Ani DiFranco/LPC", status: "matched", fingerprint: "f", checked_at: 0,
  release: { id: "22222222-2222-2222-2222-222222222222", title: "Little Plastic Castle", artist: "Ani DiFranco", track_count: 1, media: [],
    artist_ids: [ANI], release_group_id: "11111111-0000-0000-0000-000000000002" } };

function store() {
  const dir = mkdtempSync(join(tmpdir(), "synamp-disco-"));
  return { store: new DiscographyStore(join(dir, "discography.json")), dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("who you love: kept, played and loved; compilations aren't artists; top artists followed unless you unfollow", () => {
  const stats = artistStats(library, [event("full_play", "b1"), event("external_play", "b1"), event("love", "b1"), event("love", "b1"), event("skip_early", "a1")]);
  assert.deepEqual(stats.map((s) => [s.name, s.tracks, s.albums, s.plays, s.loves]), [["Tracy Chapman", 1, 1, 2, 2], ["Ani DiFranco", 3, 2, 0, 0]]);
  const { store: s, cleanup } = store();
  try {
    s.setSettings({ auto_follow: 1 });
    assert.deepEqual(s.followed(stats).map((x) => x.name), ["Tracy Chapman"]);
    s.follow(stats[1]!.key, true, stats);
    s.follow(stats[0]!.key, false, stats);
    assert.deepEqual(s.followed(stats).map((x) => x.name), ["Ani DiFranco"]);
    assert.throws(() => s.follow("nobody", true, stats), /No artist/);
    assert.throws(() => s.setSettings({ albums: "yes" }), /true or false/);
  } finally { cleanup(); }
});

test("which artist: from matched albums without a search; a clear search hit; namesakes go to you", async () => {
  const [ani] = artistStats(library, []).filter((s) => s.name === "Ani DiFranco");
  const viaAlbums = fakeMb({ groups: { [ANI]: GROUPS } });
  const record = await checkArtist(ani!, viaAlbums.mb, { "Ani DiFranco/LPC": lpcRecord });
  assert.equal(record.status, "matched");
  assert.equal(record.source, "albums");
  assert.equal(record.groups!.length, GROUPS.length);
  assert.ok(viaAlbums.calls.every((c) => !c.includes("/artist?")), "no artist search needed");

  const clear = fakeMb({ artists: [{ id: ANI, name: "Ani DiFranco", score: 100 }, { id: ANI_OTHER, name: "Annie Franco", score: 70 }], groups: { [ANI]: GROUPS } });
  assert.equal((await checkArtist(ani!, clear.mb, {})).mbid, ANI);

  const namesakes = fakeMb({ artists: [{ id: ANI, name: "Ani DiFranco", score: 100, disambiguation: "folk singer" }, { id: ANI_OTHER, name: "Ani DiFranco", score: 100, disambiguation: "a different one" }] });
  const unclear = await checkArtist(ani!, namesakes.mb, {});
  assert.equal(unclear.status, "needs_choice");
  assert.equal(unclear.candidates!.length, 2);
  assert.equal((await checkArtist(ani!, fakeMb({ artists: [] }).mb, {})).status, "not_found");
});

test("the gaps: owned by release group or title, types and live albums filtered, new and upcoming flagged, ignore hides", async () => {
  const { store: s, cleanup } = store();
  try {
    const stats = artistStats(library, []);
    const { mb } = fakeMb({ groups: { [ANI]: GROUPS } });
    const ani = stats.find((x) => x.name === "Ani DiFranco")!;
    s.set(await checkArtist(ani, mb, { "Ani DiFranco/LPC": lpcRecord }));
    const now = Date.parse("2024-10-01");
    let report = discographyReport(library, stats, s, { "Ani DiFranco/LPC": lpcRecord }, now);
    const gaps = report.artists.find((a) => a.name === "Ani DiFranco")!;
    // Dilate owned by title, LPC by release group (folder is just "LPC"); live and EP filtered out.
    assert.deepEqual(gaps.gaps.map((g) => [g.title, g.fresh ?? ""]), [["Up Up Up Up Up Up", ""], ["Unprecedented Sh!t", "new"], ["Next Year's Record", "upcoming"]]);
    assert.equal(gaps.have, 2);
    assert.equal(gaps.total, 5);
    assert.equal(report.summary.fresh, 2);
    assert.equal(gaps.gaps[0]!.links[0]!.url, "https://musicbrainz.org/release-group/11111111-0000-0000-0000-000000000003");

    s.setSettings({ eps: true, include_other: true });
    report = discographyReport(library, stats, s, { "Ani DiFranco/LPC": lpcRecord }, now);
    assert.equal(report.artists[0]!.gaps.length + report.artists.slice(1).reduce((n, a) => n + a.gaps.length, 0), 5, "live album and EP now count too");

    s.note("11111111-0000-0000-0000-000000000003", "ignore");
    report = discographyReport(library, stats, s, { "Ani DiFranco/LPC": lpcRecord }, now);
    assert.equal(report.artists.find((a) => a.name === "Ani DiFranco")!.gaps.find((g) => g.id.endsWith("003"))!.note, "ignore");
    assert.equal(report.summary.gaps, 4, "ignored gaps aren't counted");
    assert.throws(() => s.note("x", "want"), /Unknown/);
  } finally { cleanup(); }
});

test("the checker works through followed artists, skips ones waiting for you, and re-checks monthly", async () => {
  const { store: s, cleanup } = store();
  try {
    const stats = artistStats(library, []);
    const { mb, calls } = fakeMb({ artists: [{ id: ANI, name: "Ani DiFranco", score: 100 }, { id: ANI_OTHER, name: "Tracy Chapman", score: 100 }, { id: "cccccccc-cccc-cccc-cccc-cccccccccccc", name: "Tracy Chapman", score: 95 }], groups: { [ANI]: GROUPS } });
    const checker = new DiscographyChecker(s, () => mb, () => stats, () => ({}));
    await checker.start();
    assert.equal(checker.state, "idle");
    assert.equal(s.state.artists[stats.find((x) => x.name === "Ani DiFranco")!.key]!.status, "matched");
    const tracy = stats.find((x) => x.name === "Tracy Chapman")!;
    assert.equal(s.state.artists[tracy.key]!.status, "needs_choice");
    assert.equal(s.due(stats).length, 0, "nothing due: one checked, one waiting for you");
    assert.equal(s.due(stats, Date.now() + 31 * 86_400_000).length, 1, "a month later: re-check for new releases");
    const before = calls.length;
    await chooseArtist(s, tracy, ANI_OTHER, mb);
    assert.equal(s.state.artists[tracy.key]!.status, "matched");
    assert.equal(s.state.artists[tracy.key]!.mb_name, "Tracy Chapman");
    assert.equal(calls.length, before + 1, "one browse request for the chosen artist");
    await chooseArtist(s, tracy, null, mb);
    assert.equal(s.state.artists[tracy.key]!.status, "skipped");
  } finally { cleanup(); }
});

test("listen/buy links are plain searches with the names encoded", () => {
  const links = gapLinks("Simon & Garfunkel", "Bookends?", "11111111-0000-0000-0000-000000000009");
  assert.deepEqual(links.map((l) => l.label), ["MusicBrainz", "Bandcamp", "Apple Music", "Spotify", "YouTube Music", "Discogs (CD/vinyl)"]);
  assert.ok(links.every((l) => l.url.startsWith("https://")));
  assert.match(links[1]!.url, /q=Simon%20%26%20Garfunkel%20Bookends%3F/);
});

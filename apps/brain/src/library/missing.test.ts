/** Missing tracks (LIBRARY-CARE step 3) against a fake MusicBrainz — no network. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { groupAlbums, matchRelease, missingTracks, normalTitle, titleSimilarity } from "./albums.ts";
import { AlbumMatches, chooseRelease, Matcher, matchAlbum, MissingNotes, missingCsv, missingList } from "./missing.ts";
import { luceneEscape, MusicBrainz, MusicBrainzError } from "./musicbrainz.ts";

const LPC = "11111111-1111-1111-1111-111111111111"; // Little Plastic Castle, CD
const LPC_DELUXE = "22222222-2222-2222-2222-222222222222";
const TITLES = ["Little Plastic Castle", "Fuel", "Gravel", "As Is", "Two Little Girls", "Deep Dish", "Loom", "Pulse", "Swan Dive", "Glass House"];

function releaseJson(id: string, titles: string[], extra: Record<string, unknown> = {}) {
  return {
    id, title: "Little Plastic Castle", date: "1998-02-17", status: "Official",
    "artist-credit": [{ name: "Ani DiFranco", joinphrase: "" }],
    media: [{ position: 1, format: "CD", tracks: titles.map((title, i) => ({ position: i + 1, number: String(i + 1), title, length: 200_000 + i * 1000 })) }],
    ...extra,
  };
}

function fakeMb(routes: { search?: unknown[]; releases?: Record<string, unknown>; fail?: number }) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push(href);
    assert.match(String((init?.headers as Record<string, string>)["user-agent"]), /^SynAmp\/0\.1 \( me@example\.org \)$/);
    if (routes.fail) return new Response("busy", { status: routes.fail });
    if (href.includes("/release?query=")) return Response.json({ releases: routes.search ?? [] });
    const id = href.match(/\/release\/([0-9a-f-]{36})/)?.[1] ?? "";
    const body = routes.releases?.[id];
    return body ? Response.json(body) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  let clock = 0;
  const mb = new MusicBrainz({ contact: "me@example.org", fetchImpl, sleep: async (ms) => { clock += ms; }, now: () => clock });
  return { mb, calls, elapsed: () => clock };
}

const searchHit = (id: string, extra: Record<string, unknown> = {}) => ({
  id, score: 100, title: "Little Plastic Castle", "track-count": 10, status: "Official", date: "1998-02-17",
  "artist-credit": [{ name: "Ani DiFranco" }], media: [{ format: "CD" }], ...extra,
});

function track(id: string, path: string, title: string, extra: Partial<LibraryTrack> = {}): LibraryTrack {
  return { id, path, title, artist: "Ani DiFranco", album: "Little Plastic Castle", metadata_source: "tags", ...extra };
}

// One track left of ten — the iTunes story.
const lonely: Library = { version: "1", tracks: [track("t3", "Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel (Remastered).mp3", "Gravel (Remastered)", { track_no: 3 })] };

function stores() {
  const dir = mkdtempSync(join(tmpdir(), "synamp-missing-"));
  return { dir, matches: new AlbumMatches(join(dir, "albums.json")), notes: new MissingNotes(join(dir, "notes.json")), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("album folders: disc folders fold in, loose files are ignored, names come from tags or folders", () => {
  const units = groupAlbums({ version: "1", tracks: [
    track("a", "X/Double (2001)/CD1/01 - One.flac", "One", { album: undefined, artist: "X" }),
    track("b", "X/Double (2001)/CD2/01 - Two.flac", "Two", { album: undefined, artist: "X" }),
    track("c", "loose.mp3", "Loose"),
    track("d", "Comp/Mix/01.mp3", "A", { artist: "P", album: "Mix" }),
    track("e", "Comp/Mix/02.mp3", "B", { artist: "Q", album: "Mix" }),
    track("f", "Comp/Mix/03.mp3", "C", { artist: "R", album: "Mix" }),
  ] });
  assert.deepEqual(units.map((u) => u.key), ["Comp/Mix", "X/Double (2001)"]);
  const double = units.find((u) => u.key === "X/Double (2001)")!;
  assert.equal(double.title, "Double");
  assert.equal(double.year, 2001);
  assert.equal(double.tracks.length, 2);
  assert.equal(units[0]!.artist, "Various Artists");
});

test("titles compare loosely: remaster suffixes, accents, punctuation, ampersands", () => {
  assert.equal(normalTitle("Gravel (Remastered 2011)"), "gravel");
  assert.equal(titleSimilarity("Café & Bar", "cafe and bar"), 1);
  assert.equal(titleSimilarity("Don’t Stop", "Dont Stop"), 1);
  assert.ok(titleSimilarity("Gravel", "Fuel") < 0.6);
});

test("a folder with one track left lists the other nine as missing", () => {
  const release = (fakeMb({}), {
    id: LPC, title: "Little Plastic Castle", artist: "Ani DiFranco", track_count: 10,
    media: [{ position: 1, tracks: TITLES.map((title, i) => ({ position: i + 1, number: String(i + 1), title, length_ms: 200_000 + i * 1000 })) }],
  });
  const unit = groupAlbums(lonely)[0]!;
  const match = matchRelease(unit, release);
  assert.equal(match.matched, 1);
  assert.equal(match.confident, true);
  const gaps = missingTracks(release, match);
  assert.equal(gaps.length, 9);
  assert.ok(!gaps.some((gap) => gap.title === "Gravel"));
  assert.equal(gaps[0]!.id, `${LPC}:1-1`);
});

test("number and length can match a track whose title differs", () => {
  const release = { id: LPC, title: "Little Plastic Castle", artist: "Ani DiFranco", track_count: 3,
    media: [{ position: 1, tracks: [{ position: 1, number: "1", title: "Fuel", length_ms: 180_000 }, { position: 2, number: "2", title: "Track Two", length_ms: 240_000 }, { position: 3, number: "3", title: "Gravel", length_ms: 200_000 }] }] };
  const unit = groupAlbums({ version: "1", tracks: [
    track("x", "A/Little Plastic Castle/01 - Fuel.mp3", "Fuel", { track_no: 1 }),
    track("y", "A/Little Plastic Castle/02 - Piste 2.mp3", "Piste 2", { track_no: 2, duration_s: 241 }),
  ] })[0]!;
  const match = matchRelease(unit, release);
  assert.equal(match.matched, 2);
  assert.deepEqual(missingTracks(release, match).map((g) => g.title), ["Gravel"]);
});

test("the client is polite: contact required, one request per ~second, Lucene escaping", async () => {
  assert.throws(() => new MusicBrainz({ contact: "  " }), /contact/);
  const fake = fakeMb({ search: [searchHit(LPC)], releases: { [LPC]: releaseJson(LPC, TITLES) } });
  await Promise.all([fake.mb.searchReleases("A", "B"), fake.mb.release(LPC), fake.mb.release(LPC)]);
  assert.ok(fake.elapsed() >= 2 * 1100, "three requests take at least two spacing intervals");
  assert.equal(luceneEscape('AC/DC: "Live"'), 'AC\\/DC\\: \\"Live\\"');
  assert.match(decodeURIComponent(fake.calls[0]!), /release:"A" AND artist:"B"/);
});

test("a MusicBrainz ID in the tags is used directly: one request, no search", async () => {
  const fake = fakeMb({ releases: { [LPC]: releaseJson(LPC, TITLES) } });
  const unit = groupAlbums({ version: "1", tracks: [track("t3", "A/LPC/03.mp3", "Gravel", { mb_albumid: LPC })] })[0]!;
  const record = await matchAlbum(unit, fake.mb);
  assert.equal(record.status, "matched");
  assert.equal(record.source, "tag");
  assert.equal(fake.calls.length, 1);
});

test("search picks the edition that explains the files, and keeps the others as alternatives", async () => {
  const fake = fakeMb({
    search: [searchHit(LPC_DELUXE, { "track-count": 14, disambiguation: "deluxe" }), searchHit(LPC)],
    releases: { [LPC]: releaseJson(LPC, TITLES), [LPC_DELUXE]: releaseJson(LPC_DELUXE, [...TITLES, "Bonus 1", "Bonus 2", "Bonus 3", "Bonus 4"], { disambiguation: "deluxe" }) },
  });
  const unit = groupAlbums(lonely)[0]!;
  const record = await matchAlbum(unit, fake.mb);
  assert.equal(record.status, "matched");
  assert.equal(record.source, "search");
  assert.equal(record.release!.id, LPC, "the plain CD edition, not the deluxe one with bonus tracks");
  assert.deepEqual(record.alternatives!.map((c) => c.id), [LPC_DELUXE], "the other edition stays one click away");
});

test("nothing confident goes to review; nothing found is no_match", async () => {
  const wrong = fakeMb({ search: [searchHit(LPC)], releases: { [LPC]: releaseJson(LPC, ["Totally", "Different", "Songs"]) } });
  const unit = groupAlbums(lonely)[0]!;
  const review = await matchAlbum(unit, wrong.mb);
  assert.equal(review.status, "needs_review");
  assert.equal(review.candidates![0]!.id, LPC);
  assert.equal((await matchAlbum(unit, fakeMb({ search: [] }).mb)).status, "no_match");
  const { matches, notes, cleanup } = stores();
  try {
    matches.set(await matchAlbum(unit, fakeMb({ search: [] }).mb));
    const report = missingList(lonely, matches, notes);
    assert.equal(report.review[0]!.not_found, true, "albums search couldn't find still reach you, to search by hand");
  } finally { cleanup(); }
});

test("the list clears itself when a re-ripped track arrives, and keeps your notes", async () => {
  const { matches, notes, cleanup } = stores();
  try {
    const fake = fakeMb({ search: [searchHit(LPC)], releases: { [LPC]: releaseJson(LPC, TITLES) } });
    const unit = groupAlbums(lonely)[0]!;
    matches.set(await matchAlbum(unit, fake.mb));
    let report = missingList(lonely, matches, notes);
    assert.equal(report.summary.missing_tracks, 9);
    assert.equal(report.summary.with_gaps, 1);
    const fuel = report.rows.find((row) => row.title === "Fuel")!;
    assert.equal(fuel.album_have, 1);
    assert.equal(fuel.year, "1998");
    notes.update(fuel.id, { status: "have_source", tags: ["box 3", "box 3", " "], note: "CD in the garage" });
    report = missingList(lonely, matches, new MissingNotes(join(stores().dir, "x.json")));
    const reopened = new MissingNotes((notes as unknown as { path: string }).path);
    assert.deepEqual(reopened.entries[fuel.id]!.tags, ["box 3"], "notes persist and tags are de-duplicated");

    const rerip: Library = { version: "2", tracks: [...lonely.tracks, track("t2", "Ani DiFranco/Little Plastic Castle (1998)/02 - Fuel.flac", "Fuel", { track_no: 2 })] };
    report = missingList(rerip, matches, reopened);
    assert.equal(report.summary.missing_tracks, 8);
    assert.ok(!report.rows.some((row) => row.title === "Fuel"), "re-ripped track drops off");
    assert.deepEqual(report.found.map((f) => f.id), [fuel.id], "and shows up as found again, notes intact");
    assert.throws(() => reopened.update(fuel.id, { status: "lost" }), /status must be one of/);
    assert.throws(() => reopened.update("nope", {}), /Unknown/);
  } finally { cleanup(); }
});

test("you can choose another edition, or say the album isn't on MusicBrainz", async () => {
  const { matches, notes, cleanup } = stores();
  try {
    const fake = fakeMb({ search: [searchHit(LPC)], releases: { [LPC]: releaseJson(LPC, TITLES), [LPC_DELUXE]: releaseJson(LPC_DELUXE, [...TITLES, "Bonus"], { disambiguation: "deluxe" }) } });
    const unit = groupAlbums(lonely)[0]!;
    matches.set(await matchAlbum(unit, fake.mb));
    const chosen = await chooseRelease(matches, unit, LPC_DELUXE, fake.mb);
    assert.equal(chosen.source, "you");
    assert.ok(chosen.alternatives!.some((c) => c.id === LPC), "the previous edition becomes an alternative");
    assert.equal(missingList(lonely, matches, notes).summary.missing_tracks, 10);
    await chooseRelease(matches, unit, null, fake.mb);
    const report = missingList(lonely, matches, notes);
    assert.equal(report.summary.skipped, 1);
    assert.equal(report.summary.missing_tracks, 0);
  } finally { cleanup(); }
});

test("the matcher works through folders, re-opens uncertain ones when they change, and backs off when MusicBrainz is busy", async () => {
  const { matches, cleanup } = stores();
  try {
    let library: Library = lonely;
    const good = fakeMb({ search: [searchHit(LPC)], releases: { [LPC]: releaseJson(LPC, TITLES) } });
    const matcher = new Matcher(matches, () => good.mb, () => library, async () => undefined);
    await matcher.start();
    assert.equal(matcher.state, "idle");
    assert.equal(matches.records[groupAlbums(lonely)[0]!.key]!.status, "matched");
    assert.equal(matches.due(groupAlbums(library)).length, 0);

    library = { version: "2", tracks: [...lonely.tracks, track("n", "New/Thing/01 - X.mp3", "X", { album: "Thing", artist: "New" })] };
    const busy = fakeMb({ fail: 503 });
    let sleeps = 0;
    const waiting = new Matcher(matches, () => busy.mb, () => library, async () => { sleeps++; if (sleeps === 2) waiting.pause(); });
    await waiting.start();
    assert.ok(sleeps >= 2, "retryable errors wait and retry instead of recording failure");
    assert.equal(matches.records["New/Thing"], undefined);

    const broken = fakeMb({ fail: 400 });
    await new Matcher(matches, () => broken.mb, () => library, async () => undefined).start();
    assert.equal(matches.records["New/Thing"]!.status, "error");
    assert.throws(() => new Matcher(matches, () => new MusicBrainz({ contact: "" }), () => library).start(), MusicBrainzError);
  } finally { cleanup(); }
});

test("CSV quotes commas, quotes and newlines", () => {
  const csv = missingCsv([{
    id: `${LPC}:1-2`, release_id: LPC, disc: 1, discs: 1, position: 2, number: "2", title: 'He said "hi", twice', length_ms: 125_000,
    album_key: "A/B", album: "B", artist: "A", album_have: 1, album_total: 10, status: "want", tags: ["x", "y"], note: "line1\nline2",
  }]);
  const line = csv.split("\r\n")[1]!;
  assert.match(line, /"He said ""hi"", twice"/);
  assert.match(line, /,2:05,want,x; y,"line1\nline2",1,10,A\/B$/);
});

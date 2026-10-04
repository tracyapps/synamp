/** Organise (LIBRARY-CARE step 4): naming, the plan, reviews, batches and the overlay. Pure; no files touched. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Library, LibraryTrack } from "../query/evaluate.ts";
import { AlbumMatches } from "./missing.ts";
import type { AlbumRecord } from "./missing.ts";
import type { MbRelease } from "./musicbrainz.ts";
import { albumFolderName, artistKey, isSafeRelative, safeName, trackFileName, unswapName } from "./naming.ts";
import { buildPlan, carryMatches, DEFAULT_SETTINGS, OrganiseStore, PathOverlay, rebase } from "./organise.ts";
import type { Decision } from "./organise.ts";

function track(id: string, path: string, title: string, extra: Partial<LibraryTrack> = {}): LibraryTrack {
  return { id, path, title, metadata_source: "tags", ...extra };
}
const lib = (tracks: LibraryTrack[], version = "1"): Library => ({ version, tracks });
const release = (id: string, artist: string, title: string, titles: string[][], extra: Partial<MbRelease> = {}): MbRelease => ({
  id, title, artist, date: "1998-02-17", status: "Official",
  track_count: titles.flat().length,
  media: titles.map((disc, d) => ({ position: d + 1, format: "CD", tracks: disc.map((t, i) => ({ position: i + 1, number: String(i + 1), title: t })) })),
  ...extra,
});
const matched = (key: string, rel: MbRelease): AlbumRecord => ({ key, status: "matched", fingerprint: "x", release: rel, source: "search", checked_at: 0 });
const tempDir = () => mkdtempSync(join(tmpdir(), "synamp-organise-"));
const byKind = (plan: Decision[], kind: Decision["kind"]) => plan.filter((d) => d.kind === kind);

test("naming: safe on macOS and the NAS, the standard track and album forms", () => {
  assert.equal(safeName('What? "Live": AC/DC <1979>*'), "What 'Live' - AC-DC 1979");
  assert.equal(safeName("..hidden trailing. . "), "hidden trailing");
  assert.equal(safeName("é".normalize("NFD")), "é".normalize("NFC"));
  assert.equal(safeName("???"), "_");
  assert.ok(new TextEncoder().encode(safeName("ü".repeat(300))).length <= 180);
  assert.equal(albumFolderName("Little Plastic Castle", 1998, true), "Little Plastic Castle (1998)");
  assert.equal(albumFolderName("Rumours [1977]", 2004, true), "Rumours [1977]", "a year already in the name is kept");
  assert.equal(albumFolderName("Rumours", undefined, true), "Rumours");
  assert.equal(trackFileName({ title: "Gravel", ext: ".MP3", track: 3, multiDisc: false, width: 2, stem: "x" }), "03 - Gravel.mp3");
  assert.equal(trackFileName({ title: "Fuel", ext: ".flac", track: 7, disc: 2, multiDisc: true, width: 2, stem: "x" }), "2-07 - Fuel.flac");
  assert.equal(trackFileName({ title: "Odd", ext: ".m4a", multiDisc: false, width: 2, stem: "odd one" }), "odd one.m4a", "no number: name kept");
  assert.equal(artistKey("Ani Difranco"), artistKey("ANI DIFRANCO"));
  assert.equal(artistKey("Simon & Garfunkel"), artistKey("Simon and Garfunkel"));
  assert.equal(artistKey("The Beatles"), artistKey("Beatles, The"));
  assert.equal(artistKey("Björk"), artistKey("Bjork"));
  assert.notEqual(artistKey("坂本龍一"), "", "names in other scripts still get a key");
  assert.equal(unswapName("DiFranco, Ani"), "Ani DiFranco");
  assert.equal(unswapName("Crosby, Stills & Nash"), undefined);
  assert.equal(unswapName("Beatles, The"), undefined);
  for (const bad of ["../x", "/etc/passwd", "a//b", "a/./b", "", "a\\b", "a/..", 5]) assert.equal(isSafeRelative(bad), false, String(bad));
  assert.ok(isSafeRelative("Ani DiFranco/Little Plastic Castle (1998)/03 - Gravel.mp3"));
});

test("plan: album folders get the year, tracks get numbers, from tags or MusicBrainz", () => {
  const library = lib([
    track("a1", "Ani Difranco/Little Plastic Castle/Gravel.mp3", "Gravel", { year: 1998 }),
    track("a2", "Ani Difranco/Little Plastic Castle/Fuel.mp3", "Fuel", { year: 1998 }),
    track("a3", "Ani Difranco/Little Plastic Castle/01 Little Plastic Castle.mp3", "Little Plastic Castle", { track_no: 1, year: 1998 }),
    track("b1", "Ani Difranco/Dilate/02 - Superhero.mp3", "Superhero", { track_no: 2 }),
  ]);
  const rel = release("11111111-1111-1111-1111-111111111111", "Ani DiFranco", "Little Plastic Castle", [["Little Plastic Castle", "Fuel", "Gravel"]]);
  const dilate = release("33333333-3333-3333-3333-333333333333", "Ani DiFranco", "Dilate", [["Untouchable Face", "Superhero"]], { date: "1996-05-14" });
  const plan = buildPlan(library, {
    "Ani Difranco/Little Plastic Castle": matched("Ani Difranco/Little Plastic Castle", rel),
    "Ani Difranco/Dilate": matched("Ani Difranco/Dilate", dilate),
  }, DEFAULT_SETTINGS);
  const lpc = plan.find((d) => d.title.endsWith("Little Plastic Castle"))!;
  assert.deepEqual(lpc.moves.map((m) => m.to).sort(), [
    "Ani Difranco/Little Plastic Castle (1998)/01 - Little Plastic Castle.mp3",
    "Ani Difranco/Little Plastic Castle (1998)/02 - Fuel.mp3",
    "Ani Difranco/Little Plastic Castle (1998)/03 - Gravel.mp3",
  ]);
  assert.ok(lpc.changes.some((c) => /year from the tags/.test(c)));
  assert.ok(lpc.changes.some((c) => /2 numbered from MusicBrainz/.test(c)));
  assert.deepEqual(lpc.folders, [{ from: "Ani Difranco/Little Plastic Castle", to: "Ani Difranco/Little Plastic Castle (1998)" }]);
  assert.equal(lpc.moves[0]!.track_id !== undefined, true, "moves carry the track id for the journal");
  const dil = plan.find((d) => d.title.endsWith("Dilate"))!;
  assert.deepEqual(dil.moves.map((m) => m.to), ["Ani Difranco/Dilate (1996)/02 - Superhero.mp3"], "no tag year: MusicBrainz's");
  assert.ok(dil.changes.some((c) => /from MusicBrainz/.test(c)));

  // Nothing to do once the files follow the standard; settings switch parts off.
  const tidy = lib([track("c1", "Ani DiFranco/Dilate (1996)/02 - Superhero.mp3", "Superhero", { track_no: 2, year: 1996 })]);
  assert.equal(buildPlan(tidy, {}, DEFAULT_SETTINGS).length, 0);
  const noYear = buildPlan(library, {}, { ...DEFAULT_SETTINGS, add_year: false });
  assert.ok(noYear.every((d) => d.moves.every((m) => !m.to.includes("(1998)"))));
  const noNumbers = buildPlan(library, {}, { ...DEFAULT_SETTINGS, number_tracks: false, add_year: false });
  assert.equal(noNumbers.length, 0);
  // Loose files in an artist folder are not an album folder to rename.
  assert.equal(buildPlan(lib([track("l1", "Ani Difranco/song.mp3", "Song", { year: 2000, track_no: 1 })]), {}, DEFAULT_SETTINGS).length, 0);
});

test("plan: disc folders fold in with 1-01 numbering; copies get (2); compilations go to Various Artists", () => {
  const library = lib([
    track("d1", "Pink Floyd/The Wall/CD1/01 In the Flesh.flac", "In the Flesh?", { track_no: 1, disc_no: 1, disc_total: 2, year: 1979 }),
    track("d2", "Pink Floyd/The Wall/CD2/01 Hey You.flac", "Hey You", { track_no: 1, disc_no: 2, disc_total: 2, year: 1979 }),
    track("d3", "Pink Floyd/The Wall/CD2/cover-copy/x.flac", "nested", {}),
    track("c1", "Compilations/Now 42/01 Song.mp3", "Song", { track_no: 1, album_artist: "Various Artists", year: 1999 }),
    track("c2", "Compilations/Now 42/01 Song copy.mp3", "Song", { track_no: 1, album_artist: "Various Artists", year: 1999 }),
  ]);
  const plan = buildPlan(library, {}, DEFAULT_SETTINGS);
  const wall = plan.find((d) => d.title.endsWith("The Wall"))!;
  assert.deepEqual(wall.moves.map((m) => m.to).sort(), ["Pink Floyd/The Wall (1979)/1-01 - In the Flesh.flac", "Pink Floyd/The Wall (1979)/2-01 - Hey You.flac"]);
  assert.ok(wall.changes.some((c) => /out of disc folders/.test(c)));
  assert.ok(wall.folders.findIndex((f) => f.from === "Pink Floyd/The Wall/CD1") < wall.folders.findIndex((f) => f.from === "Pink Floyd/The Wall"), "deeper folders first");
  assert.deepEqual(wall.folders.find((f) => f.from === "Pink Floyd/The Wall")!.keep, ["Pink Floyd/The Wall/CD2/cover-copy"], "a nested album folder is left where it is");
  assert.deepEqual(wall.folders.find((f) => f.from === "Pink Floyd/The Wall/CD2")!.keep, ["Pink Floyd/The Wall/CD2/cover-copy"]);
  const now = plan.find((d) => d.title.includes("Now 42"))!;
  assert.deepEqual(now.moves.map((m) => m.to).sort(), ["Various Artists/Now 42 (1999)/01 - Song (2).mp3", "Various Artists/Now 42 (1999)/01 - Song.mp3"]);
  assert.ok(now.changes.some((c) => /Moves to “Various Artists”/.test(c)));
  assert.ok(now.changes.some((c) => /duplicate copy/.test(c)));
  const stay = buildPlan(library, {}, { ...DEFAULT_SETTINGS, compilations_folder: "" }).find((d) => d.title.includes("Now 42"))!;
  assert.ok(stay.moves.every((m) => m.to.startsWith("Compilations/")));
});

test("plan: a folder name that's taken gets the edition, or is flagged — never overwritten", () => {
  const library = lib([
    track("r1", "Fleetwood Mac/Rumours/01 Second Hand News.mp3", "Second Hand News", { track_no: 1, year: 1977 }),
    track("r2", "Fleetwood Mac/Rumours (1977)/01 - Second Hand News.mp3", "Second Hand News", { track_no: 1, year: 1977 }),
    track("t1", "Fleetwood Mac/Tusk/01 Over & Over.mp3", "Over & Over", { track_no: 1, year: 1979 }),
    track("t2", "Fleetwood Mac/Tusk (1979)/01 - Over & Over.mp3", "Over & Over", { track_no: 1, year: 1979 }),
  ]);
  const deluxe = release("44444444-4444-4444-4444-444444444444", "Fleetwood Mac", "Rumours", [["Second Hand News"]], { disambiguation: "Deluxe" });
  const plan = buildPlan(library, { "Fleetwood Mac/Rumours": matched("Fleetwood Mac/Rumours", deluxe) }, DEFAULT_SETTINGS);
  const rumours = plan.find((d) => d.preview[0]!.from === "Fleetwood Mac/Rumours")!;
  assert.equal(rumours.preview[0]!.to, "Fleetwood Mac/Rumours (1977) [Deluxe]");
  assert.deepEqual(rumours.conflicts, []);
  const tusk = plan.find((d) => d.preview[0]!.from === "Fleetwood Mac/Tusk")!;
  assert.match(tusk.conflicts[0]!, /already exists/);
});

test("plan: artist spellings merge into the MusicBrainz / tagged spelling", () => {
  const library = lib([
    track("x1", "Ani Difranco/Dilate (1996)/01 - Untouchable Face.mp3", "Untouchable Face", { track_no: 1, year: 1996, artist: "Ani Difranco" }),
    track("x2", "DiFranco, Ani/Up Up Up Up Up Up (1999)/01 - Tis of Thee.mp3", "'Tis of Thee", { track_no: 1, year: 1999, artist: "Ani DiFranco" }),
    track("x3", "ANI DIFRANCO/Evolve (2003)/01 - Promised Land.mp3", "Promised Land", { track_no: 1, year: 2003 }),
    track("x4", "Various Artists/Mix (2000)/01 - A.mp3", "A", { track_no: 1, year: 2000 }),
    track("x5", "Various/Other (2001)/01 - B.mp3", "B", { track_no: 1, year: 2001 }),
  ]);
  const dilate = release("33333333-3333-3333-3333-333333333333", "Ani DiFranco", "Dilate", [["Untouchable Face"]]);
  const plan = buildPlan(library, { "Ani Difranco/Dilate (1996)": matched("Ani Difranco/Dilate (1996)", dilate) }, DEFAULT_SETTINGS);
  const merges = byKind(plan, "artist");
  assert.equal(merges.length, 1, "Various / Various Artists are not merged automatically");
  const merge = merges[0]!;
  assert.match(merge.title, /into “Ani DiFranco”/);
  assert.ok(merge.changes.some((c) => /spelling MusicBrainz uses/.test(c)));
  assert.deepEqual(merge.moves.map((m) => m.to).sort(), [
    "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3",
    "Ani DiFranco/Evolve (2003)/01 - Promised Land.mp3",
    "Ani DiFranco/Up Up Up Up Up Up (1999)/01 - Tis of Thee.mp3",
  ]);
  assert.equal(new Set(merge.folders.map((f) => f.to)).size, 1);
  // Without MusicBrainz, the spelling the tags use wins.
  const tagged = byKind(buildPlan(library, {}, DEFAULT_SETTINGS), "artist")[0]!;
  assert.match(tagged.title, /into “DiFranco, Ani”|into “Ani Difranco”/);
  assert.equal(byKind(buildPlan(library, {}, { ...DEFAULT_SETTINGS, merge_artists: false }), "artist").length, 0);
  assert.equal(rebase("Ani Difranco/Dilate (1996)/x.mp3", [{ from: "Ani Difranco", to: "Ani DiFranco" }]), "Ani DiFranco/Dilate (1996)/x.mp3");
  assert.equal(rebase("Ani Difrancos/x.mp3", [{ from: "Ani Difranco", to: "Ani DiFranco" }]), "Ani Difrancos/x.mp3", "prefix must be a whole folder");
});

test("reviews, batches and the librarian's reports", () => {
  const dir = tempDir();
  try {
    const library = lib([
      track("x1", "Ani Difranco/Dilate/01 Untouchable Face.mp3", "Untouchable Face", { track_no: 1, year: 1996, artist: "Ani DiFranco" }),
      track("x2", "Ani DiFranco/Evolve/01 Promised Land.mp3", "Promised Land", { track_no: 1, year: 2003, artist: "Ani DiFranco" }),
      track("y1", "Tusk/Tusk/01 Over.mp3", "Over", { track_no: 1, year: 1979 }),
    ]);
    const store = new OrganiseStore(join(dir, "organise.json"));
    let plan = buildPlan(library, {}, store.state.settings);
    assert.throws(() => store.apply(plan), /Nothing approved/);
    const merge = byKind(plan, "artist")[0]!;
    const dilate = plan.find((d) => d.title.endsWith("Dilate"))!;
    store.review([merge, dilate], "approved");
    assert.equal(store.statusOf(dilate).status, "approved");

    // A changed plan (here: different settings) un-approves the decision it changed.
    const changed = buildPlan(library, {}, { ...store.state.settings, add_year: false });
    assert.deepEqual(store.statusOf(changed.find((d) => d.id === dilate.id)!), { status: "proposed", changed: true });

    // The batch runs the merge first and moves the album decision's paths along with it.
    const batch = store.apply(plan, 1000);
    assert.throws(() => store.apply(plan), /still working/);
    // "Pause file changes": the librarian checks in but gets nothing until resumed.
    store.setPaused(true, 1500);
    assert.equal(store.claim({ version: "t" }, 1600), null);
    assert.equal(new OrganiseStore(join(dir, "organise.json")).state.paused?.at, 1500, "a pause survives a restart");
    assert.throws(() => store.setPaused("yes"), /true or false/);
    store.setPaused(false);
    assert.equal(store.claim({ version: "t" }, 2000)!.batch, batch.id);
    const job = store.state.jobs.find((j) => j.batch === batch.id)!;
    assert.deepEqual(job.decisions.map((d) => d.kind), ["artist", "album"]);
    assert.deepEqual(job.decisions[1]!.moves.map((m) => [m.from, m.to]), [[
      "Ani DiFranco/Dilate/01 Untouchable Face.mp3", "Ani DiFranco/Dilate (1996)/01 - Untouchable Face.mp3"]]);
    assert.equal(store.claim({}, 3000), null, "a running job isn't handed out twice");
    assert.equal(store.claim({}, 2000 + 61 * 60_000)?.id, job.id, "…unless it never reported back");

    // The report: one applied, one failed; unknown ids and unsafe paths are ignored.
    const result = store.complete(job.id, { results: [
      { id: merge.id, status: "applied", moved: [...job.decisions[0]!.moves, { from: "../etc", to: "x" }] },
      { id: dilate.id, status: "failed", errors: ["“…” already exists"] },
      { id: "album:nope", status: "applied", moved: [{ from: "a", to: "b" }] },
    ] }, 5000);
    assert.equal(result.moved.length, 1);
    assert.deepEqual(result.folders, [{ from: "Ani Difranco", to: "Ani DiFranco" }]);
    const saved = new OrganiseStore(join(dir, "organise.json"));
    const kept = saved.state.batches[0]!;
    assert.equal(kept.status, "partial");
    assert.equal(kept.decisions.find((d) => d.id === dilate.id)!.errors![0], "“…” already exists");
    assert.equal(saved.state.reviews[merge.id], undefined, "applied: the approval is used up");
    assert.equal(saved.state.reviews[dilate.id]!.status, "approved", "failed: still approved, to retry");
    assert.equal(store.complete(job.id, { results: [] }).moved.length, 0, "a repeated report changes nothing");

    // Undo: newest first, reversed moves.
    const undone = store.undo(batch.id, 6000);
    assert.equal(undone.undo!.status, "queued");
    const undoJob = store.claim({}, 7000)!;
    assert.equal(undoJob.kind, "undo");
    assert.deepEqual(undoJob.decisions[0]!.moves[0], { ...job.decisions[0]!.moves[0]!, from: job.decisions[0]!.moves[0]!.to, to: job.decisions[0]!.moves[0]!.from });
    store.complete(undoJob.id, { results: [{ id: merge.id, status: "applied", moved: undoJob.decisions[0]!.moves }] }, 8000);
    assert.equal(store.state.batches[0]!.undo!.status, "done");
    assert.throws(() => store.undo(batch.id), /already undone/);
    plan = buildPlan(library, {}, store.state.settings);
    assert.ok(plan.length);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("overlay: moved tracks follow their files until the next export; matches are carried", () => {
  const dir = tempDir();
  try {
    const onDisk = new Set(["A/New/01 - x.mp3"]);
    const overlay = new PathOverlay(join(dir, "moves.jsonl"), "/music", (path) => onDisk.has(path.replace("/music/", "")));
    const library = lib([track("t1", "A/Old/x.mp3", "x"), track("t2", "B/y.mp3", "y")], "v1");
    assert.equal(overlay.apply(library), library, "no moves: the library as exported");
    overlay.record([{ from: "A/Old/x.mp3", to: "A/New/01 - x.mp3" }]);
    const view = overlay.apply(library);
    assert.equal(view.tracks[0]!.path, "A/New/01 - x.mp3");
    assert.equal(view.tracks[1]!.path, "B/y.mp3");
    assert.notEqual(view.version, library.version);
    assert.equal(overlay.idForPath("A/New/01 - x.mp3", library), "t1");
    // A fresh export already at the new path is taken as it is.
    const fresh = lib([track("t1", "A/New/01 - x.mp3", "x")], "v2");
    assert.equal(overlay.apply(fresh), fresh);
    // Moved and moved back (undo): the file is at the old path again, so nothing changes.
    overlay.record([{ from: "A/New/01 - x.mp3", to: "A/Old/x.mp3" }]);
    onDisk.clear(); onDisk.add("A/Old/x.mp3");
    assert.equal(overlay.apply(library).tracks[0]!.path, "A/Old/x.mp3");
    // Survives a restart.
    assert.equal(new PathOverlay(join(dir, "moves.jsonl"), "/music").count, 2);

    const matches = new AlbumMatches(join(dir, "albums.json"));
    matches.set({ key: "Ani Difranco/Dilate", status: "matched", fingerprint: "f", checked_at: 0 });
    assert.equal(carryMatches(matches, [{ from: "Ani Difranco", to: "Ani DiFranco" }, { from: "Ani DiFranco/Dilate", to: "Ani DiFranco/Dilate (1996)" }]), 2);
    assert.equal(matches.records["Ani DiFranco/Dilate (1996)"]!.status, "matched");
    assert.ok(matches.records["Ani Difranco/Dilate"], "the old key stays until the export catches up");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("batches with new music: imports go first, undo swaps the areas back, the overlay ignores arrivals", () => {
  const dir = tempDir();
  try {
    const store = new OrganiseStore(join(dir, "organise.json"));
    const library = lib([track("x1", "Tusk/Tusk/01 Over.mp3", "Over", { track_no: 1, year: 1979 })]);
    const album = buildPlan(library, {}, store.state.settings)[0]!;
    const arrival: Decision = { id: "import:a", rev: "r1", kind: "import", title: "New: A — B", changes: [], conflicts: [], preview: [],
      moves: [{ from: "a/b/1.mp3", to: "A/B (2000)/01 - One.mp3", from_area: "incoming" }], folders: [{ from: "a/b", to: "A/B (2000)", from_area: "incoming" }] };
    store.review([album, arrival], "approved");
    const batch = store.apply([album, arrival], 1);
    const job = store.claim({}, 2)!;
    assert.deepEqual(job.decisions.map((d) => d.kind), ["import", "album"]);
    assert.deepEqual(job.decisions[0]!.folders, arrival.folders, "incoming paths are never rebased");
    const done = store.complete(job.id, { results: [
      { id: arrival.id, status: "applied", moved: [{ ...arrival.moves[0]!, from_area: "incoming" }, { from: "a/b/cover.jpg", to: "A/B (2000)/cover.jpg", from_area: "incoming" }] },
      { id: album.id, status: "applied", moved: job.decisions[1]!.moves },
    ] }, 3);
    assert.equal(done.moved[0]!.from_area, "incoming", "areas survive the report");
    assert.deepEqual(done.folders, [{ from: "Tusk/Tusk", to: "Tusk/Tusk (1979)" }], "only library folders carry matches");
    const overlay = new PathOverlay(join(dir, "moves.jsonl"), "/music", () => false);
    overlay.record(done.moved);
    assert.equal(overlay.count, 1, "arrivals aren't renames of known tracks");

    store.undo(batch.id, 4);
    const undoJob = store.claim({}, 5)!;
    assert.deepEqual(undoJob.decisions.map((d) => d.kind), ["album", "import"]);
    assert.deepEqual(undoJob.decisions[1]!.moves[0], { from: "A/B (2000)/cover.jpg", to: "a/b/cover.jpg", to_area: "incoming" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("live progress from the librarian: shown while running, keeps a slow big batch from being handed out again", () => {
  const dir = tempDir();
  try {
    const store = new OrganiseStore(join(dir, "organise.json"));
    const library = lib([track("y1", "Tusk/Tusk/01 Over.mp3", "Over", { track_no: 1, year: 1979 })]);
    const plan = buildPlan(library, {}, store.state.settings);
    store.review(plan, "approved");
    store.apply(plan, 0);
    assert.equal(store.progressView()!.claimed_at, undefined, "queued: waiting for the librarian");
    const job = store.claim({}, 1000)!;
    store.progress(job.id, { done: 1, current: "Tusk — Tusk", total: 999 }, 2000);
    assert.deepEqual({ ...store.progressView()!, updated_at: 0 }, { job: job.id, batch: job.batch, kind: "apply", done: 1, total: 1, current: "Tusk — Tusk", updated_at: 0, claimed_at: 1000 });
    // Two hours in, but it reported progress a minute ago: still its job.
    store.progress(job.id, { done: 1 }, 2 * 3600_000);
    assert.equal(store.claim({}, 2 * 3600_000 + 60_000), null);
    // Silent for over an hour: offered again.
    assert.equal(store.claim({}, 4 * 3600_000)?.id, job.id);
    store.progress("j_000000000000", { done: 5 }); // unknown job: ignored
    store.complete(job.id, { results: [] });
    assert.equal(store.progressView(), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

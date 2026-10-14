/** "Send feedback": what a tester's report may say, and what it must never say. */

import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, installSections, problemSection, RecentProblems, redact } from "./report.ts";
import type { Facts } from "./report.ts";

const roots = ["/music", "/incoming"];
const off = { musicRoots: roots, names: false };
const on = { musicRoots: roots, names: true };

test("song and folder names stay out unless the tester says so", () => {
  const message = "ENOENT: no such file or directory, open '/music/library/Foo Fighters/The Colour and the Shape/03 Monkey Wrench.flac'";
  const hidden = redact(message, off);
  assert.doesNotMatch(hidden, /Foo|Monkey|Colour/);
  assert.match(hidden, /ENOENT: no such file or directory, open '<music>\/…'/);
  const shown = redact(message, on);
  assert.match(shown, /'<music>\/library\/Foo Fighters\/The Colour and the Shape\/03 Monkey Wrench\.flac'/);

  assert.equal(redact("No release found for “Brian Eno – Music for Airports”", off), "No release found for “…”");
  assert.equal(redact("Couldn't tag \"Ambient 1\" (FLAC)", off), "Couldn't tag \"…\" (FLAC)");
  assert.equal(redact("scan /incoming/_web/Some Album/01.mp3 stopped", off), "scan <music>/…");
  assert.equal(redact("library at /music is empty", off), "library at <music> is empty");
  assert.equal(redact("/musical/thing", off), "/musical/thing", "only the folder itself, not names that start the same");
});

test("secrets, emails and home folders go even when names are included", () => {
  for (const options of [off, on]) {
    const text = redact([
      "GET http://core:4533/rest/ping?u=tapps&t=5f4dcc3b5aa765d61d8327deb882cf99&s=abc123&v=1.16",
      "authorization: Bearer 9d1c7f2a8b3e4d5c6f7a8b9c0d1e2f3a4b5c6d7e",
      "contact me at t@thisroad.org",
      "open /Users/tapps/SynAmp-data/analyzer.sqlite3",
      "session key 0123456789abcdef0123456789abcdef01",
    ].join("\n"), options);
    assert.doesNotMatch(text, /5f4dcc3b|9d1c7f2a|thisroad|tapps|0123456789abcdef/, JSON.stringify(text));
    assert.match(text, /u=\[hidden\]&t=\[hidden\]&s=\[hidden\]/);
    assert.match(text, /Bearer \[hidden\]/);
    assert.match(text, /\[email\]/);
    assert.match(text, /\/Users\/<you>\/SynAmp-data/);
  }
});

test("recent problems: newest first, repeats counted, oldest dropped, made safe on the way out", () => {
  const problems = new RecentProblems(3);
  problems.record("Album matching stopped", new Error("MusicBrainz said 503"), 1000);
  problems.record("Album matching stopped", new Error("MusicBrainz said 503"), 2000);
  problems.record("Last.fm flush failed", "token=abcd1234 refused", 3000);
  problems.record("Brain request failed", new Error("open '/music/a/b.flac'"), 4000);
  problems.record("warning", "fourth", 5000);
  const list = problems.list(off);
  assert.equal(list.length, 3, "only the newest three kept");
  assert.deepEqual(list.map((p) => p.where), ["warning", "Brain request failed", "Last.fm flush failed"]);
  assert.match(list[1]!.message, /^Error: open '<music>\/…'/);
  assert.match(list[2]!.message, /token=\[hidden\]/);

  const again = new RecentProblems();
  again.record("x", new Error("same"), 10);
  again.record("x", new Error("same"), 20);
  const [only] = again.list(off);
  assert.equal(only!.times, 2);
  assert.equal(only!.at, 10);
  assert.equal(only!.last_at, 20);
});

test("watching the console keeps a copy and still logs", () => {
  const logged: unknown[][] = [];
  const target = { error: (...args: unknown[]) => { logged.push(args); }, warn: (...args: unknown[]) => { logged.push(args); } };
  const problems = new RecentProblems();
  problems.watchConsole(target);
  target.error("Brain request failed", new Error("boom"));
  target.warn("phone playlists: Navidrome refused");
  assert.equal(logged.length, 2, "the log itself is unchanged");
  const list = problems.list(off);
  assert.equal(list[0]!.where, "warning");
  assert.equal(list[0]!.message, "phone playlists: Navidrome refused");
  assert.equal(list[1]!.where, "Brain request failed");
  assert.match(list[1]!.message, /^Error: boom\n {0}at /);
});

test("an error reads as its kind, code, message and where it happened", () => {
  const error = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  const text = describe(error);
  assert.match(text, /^Error \(ENOSPC\): disk full/);
  assert.ok(text.split("\n").length <= 4);
  assert.equal(describe({ a: 1 }), '{"a":1}');
});

const facts: Facts = {
  version: { release: "0.2.0", short: "abc1234", built_at: Date.UTC(2026, 9, 12, 20, 0) },
  server: { node: "22.11.0", platform: "linux", arch: "x64", uptime_ms: 3 * 3_600_000, memory_mb: 212 },
  disks: [{ label: "SynAmp data folder", free_gb: 812.4, total_gb: 3600 }, { label: "Music folder", free_gb: null, total_gb: null }],
  navidrome: { ok: true },
  library: { tracks: 46039, artists: 3120, albums: 4410, with_measurements: 45000 },
  analysis: {
    reported: true, state: "analyzing", stale: false, age_ms: 20_000, analyzer_version: "0.4.0", host: "Tapps-MacBook-Pro",
    queue: { pending: 120, running: 4, done: 45000, failed: 15 }, fully_analysed: 30000,
    recent_failures: [{ path: "/music/library/Artist/Album/01 Song.mp3", error: "can't decode '01 Song.mp3'" }],
  },
  features: { access_token: true, lyrics_lookup: false },
  first_picks: { count: 40, listened: 12 },
};

test("about this install: plain lines, names and the Mac's name only when asked", () => {
  const hidden = installSections(facts, { ...off, now: Date.UTC(2026, 9, 13) }).flatMap((s) => [s.title, ...s.lines]).join("\n");
  assert.match(hidden, /Version: 0\.2\.0 \(abc1234\), built 2026-10-12 20:00 UTC/);
  assert.match(hidden, /46,039 songs, 3,120 artists, 4,410 albums/);
  assert.match(hidden, /SynAmp data folder: 812\.4 GB free of 3600 GB/);
  assert.match(hidden, /Music folder: free space unknown/);
  assert.match(hidden, /Listen to these first: 12 of 40 picks ready/);
  assert.match(hidden, /Queue: 120 waiting, 4 now, 45000 done, 15 failed/);
  assert.match(hidden, /Songs that couldn't be read lately: 1\n {2}- can't decode '…'/);
  assert.match(hidden, /Access token required: yes\nLook up lyrics on LRCLIB: no/);
  assert.doesNotMatch(hidden, /Tapps|Artist\/Album|01 Song/);

  const shown = installSections(facts, on).flatMap((s) => s.lines).join("\n");
  assert.match(shown, /Analyzer version: 0\.4\.0 on Tapps-MacBook-Pro/);
  assert.match(shown, /<music>\/library\/Artist\/Album\/01 Song\.mp3: can't decode '01 Song\.mp3'/);

  const dev = installSections({ ...facts, version: null, library: null, analysis: { reported: false }, first_picks: null }, off).flatMap((s) => s.lines);
  assert.ok(dev.includes("Version: development copy (not built by Container Manager)"));
  assert.ok(dev.includes("The library list couldn't be read"));
  assert.ok(dev.includes("The Mac hasn't reported yet"));
});

test("recent problems section says when there are none", () => {
  assert.deepEqual(problemSection([]).lines, ["None since the server last started."]);
  const lines = problemSection([{ at: 0, last_at: 60_000 * 30, where: "x", message: "one\ntwo", times: 3 }], 60_000 * 32).lines;
  assert.equal(lines[0], "- 2 minutes ago (3 times, first 32 minutes ago), x:");
  assert.deepEqual(lines.slice(1), ["    one", "    two"]);
});

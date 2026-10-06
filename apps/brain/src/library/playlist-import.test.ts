import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPath, matchPlaylists, parseItunesXml, parseM3u, parsePlaylistFile, parsePlist } from "./playlist-import.ts";
import type { Library, LibraryTrack } from "../query/evaluate.ts";

const t = (id: string, path: string, title: string, artist: string, album: string, extra: Partial<LibraryTrack> = {}): LibraryTrack =>
  ({ id, path, title, artist, album, ...extra });
const LIB: Library = { version: "v", tracks: [
  t("dreams", "Fleetwood Mac/Rumours (1977)/02 - Dreams.mp3", "Dreams", "Fleetwood Mac", "Rumours", { duration_s: 257 }),
  t("dreams-live", "Fleetwood Mac/The Dance (1997)/05 - Dreams.mp3", "Dreams", "Fleetwood Mac", "The Dance", { duration_s: 280 }),
  t("pagan", "Björk/Vespertine (2001)/05 - Pagan Poetry.flac", "Pagan Poetry", "Björk", "Vespertine"),
  t("teardrop", "Massive Attack/Mezzanine (1998)/03 - Teardrop.mp3", "Teardrop", "Massive Attack", "Mezzanine"),
  t("something", "The Beatles/Abbey Road (1969)/02 - Something.mp3", "Something (Remastered 2009)", "The Beatles", "Abbey Road"),
] };

test("paths from any OS and file:// URLs become forward-slash paths", () => {
  assert.equal(cleanPath("C:\\Users\\me\\Music\\A\\B\\01 x.mp3"), "/Users/me/Music/A/B/01 x.mp3");
  assert.equal(cleanPath("file:///Users/me/Music/iTunes/Bj%C3%B6rk/Vespertine/05%20Pagan%20Poetry.m4a"), "/Users/me/Music/iTunes/Björk/Vespertine/05 Pagan Poetry.m4a");
  assert.equal(cleanPath("file://localhost/C:/Music/x.mp3"), "/Music/x.mp3");
});

test("M3U: EXTINF gives length, artist and title; comments and streams are skipped", () => {
  const playlist = parseM3u([
    "#EXTM3U",
    "#EXTINF:257,Fleetwood Mac - Dreams",
    "/old/Music/Fleetwood Mac/Rumours/02 Dreams.m4a",
    "# a comment",
    "http://radio.example/stream",
    "#EXTINF:-1,Just A Title",
    "relative/song.mp3",
  ].join("\r\n"), "Road trip");
  assert.equal(playlist.name, "Road trip");
  assert.deepEqual(playlist.entries, [
    { duration_s: 257, artist: "Fleetwood Mac", title: "Dreams", path: "/old/Music/Fleetwood Mac/Rumours/02 Dreams.m4a" },
    { title: "Just A Title", path: "relative/song.mp3" },
  ]);
});

test("songs are found by path end, then artist + title (choosing the album copy), then title + album", () => {
  const [result] = matchPlaylists([parseM3u([
    "/Volumes/old/Massive Attack/Mezzanine (1998)/03 - Teardrop.wav",          // path end, other format
    "#EXTINF:250,Fleetwood Mac - Dreams",
    "/gone/somewhere/else.mp3",                                                 // artist + title, Rumours copy by length
    "D:\\Music\\Bjork\\Vespertine\\05 Pagan Poetry.m4a",                        // guessed from folders; accents ignored
    "#EXTINF:183,The Beatles - Something",
    "/x/y.mp3",                                                                 // "(Remastered 2009)" ignored
    "#EXTINF:100,Nobody - Never Ripped",
    "/x/z.mp3",
  ].join("\n"), "Mix")], LIB);
  assert.deepEqual(result!.tracks.map((track) => track.id), ["teardrop", "dreams", "pagan", "something"]);
  assert.deepEqual(result!.missing, ["Nobody – Never Ripped"]);
  assert.equal(result!.total, 5);
});

test("the album breaks a tie between copies of the same song", () => {
  const [result] = matchPlaylists([{ key: "k", name: "n", entries: [{ title: "Dreams", artist: "Fleetwood Mac", album: "The Dance" }] }], LIB);
  assert.deepEqual(result!.tracks.map((track) => track.id), ["dreams-live"]);
});

const ITUNES = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Major Version</key><integer>1</integer>
  <key>Tracks</key>
  <dict>
    <key>101</key>
    <dict><key>Track ID</key><integer>101</integer><key>Name</key><string>Dreams</string><key>Artist</key><string>Fleetwood Mac</string>
      <key>Album</key><string>Rumours</string><key>Total Time</key><integer>257000</integer>
      <key>Location</key><string>file:///Users/t/Music/iTunes/iTunes%20Media/Music/Fleetwood%20Mac/Rumours/02%20Dreams.m4a</string></dict>
    <key>102</key>
    <dict><key>Track ID</key><integer>102</integer><key>Name</key><string>Teardrop</string><key>Artist</key><string>Massive Attack</string>
      <key>Album</key><string>Mezzanine</string><key>Compilation</key><true/></dict>
    <key>103</key>
    <dict><key>Track ID</key><integer>103</integer><key>Name</key><string>Lost &amp; Found</string><key>Artist</key><string>Nobody</string></dict>
  </dict>
  <key>Playlists</key>
  <array>
    <dict><key>Name</key><string>Library</string><key>Master</key><true/><key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict></array></dict>
    <dict><key>Name</key><string>Music</string><key>Distinguished Kind</key><integer>4</integer><key>Playlist Items</key><array/></dict>
    <dict><key>Name</key><string>Moods</string><key>Playlist Persistent ID</key><string>F1</string><key>Folder</key><true/></dict>
    <dict><key>Name</key><string>Rainy days</string><key>Playlist Persistent ID</key><string>P1</string><key>Parent Persistent ID</key><string>F1</string>
      <key>Playlist Items</key><array><dict><key>Track ID</key><integer>101</integer></dict><dict><key>Track ID</key><integer>102</integer></dict><dict><key>Track ID</key><integer>103</integer></dict></array></dict>
    <dict><key>Name</key><string>Top 25 Most Played</string><key>Playlist Persistent ID</key><string>S1</string><key>Smart Info</key><data>AQEAAwAAAAI=</data>
      <key>Playlist Items</key><array><dict><key>Track ID</key><integer>102</integer></dict></array></dict>
  </array>
</dict>
</plist>`;

test("plist reader handles dicts, arrays, entities, empty and boolean tags", () => {
  const value = parsePlist("<plist><dict><key>a</key><string>x &amp; y</string><key>b</key><array/><key>c</key><false/><key>d</key><real>1.5</real></dict></plist>");
  assert.deepEqual(value, { a: "x & y", b: [], c: false, d: 1.5 });
});

test("iTunes library XML: your playlists and folders, not the built-in lists", () => {
  const lists = parseItunesXml(ITUNES);
  assert.deepEqual(lists.map((item) => [item.name, item.entries.length, item.parent ?? null, !!item.folder, !!item.smart]), [
    ["Moods", 0, null, true, false],
    ["Rainy days", 3, "F1", false, false],
    ["Top 25 Most Played", 1, null, false, true],
  ]);
  assert.deepEqual(lists[1]!.entries[0], { path: "/Users/t/Music/iTunes/iTunes Media/Music/Fleetwood Mac/Rumours/02 Dreams.m4a", title: "Dreams", artist: "Fleetwood Mac", album: "Rumours", duration_s: 257 });
  const [, rainy] = matchPlaylists(lists, LIB);
  assert.deepEqual(rainy!.tracks.map((track) => track.id), ["dreams", "teardrop"]);
  assert.deepEqual(rainy!.missing, ["Nobody – Lost & Found"]);
});

test("the format is worked out from the file", () => {
  assert.equal(parsePlaylistFile(ITUNES, "Library.xml").length, 3);
  assert.equal(parsePlaylistFile("#EXTM3U\n/a/b/c.mp3\n", "Gym.m3u8")[0]!.name, "Gym");
  assert.throws(() => parsePlaylistFile("#EXTM3U\n# nothing\n", "Empty.m3u"), /No songs found/);
  assert.throws(() => parsePlaylistFile("<plist><dict></dict></plist>", "x.xml"), /no Tracks or Playlists/);
});

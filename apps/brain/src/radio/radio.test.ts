import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { isPrivateAddress, Radio, toStation } from "./radio.ts";

const raw = (id: string, extra: Record<string, unknown> = {}) => ({
  stationuuid: id, name: `Station ${id}`, url: "http://stream.example/live", url_resolved: "http://stream.example/live.mp3",
  tags: "jazz, smooth jazz,,lounge", country: "Netherlands", countrycode: "NL", codec: "MP3", bitrate: 128, hls: 0, ...extra,
});
const tempFile = () => join(mkdtempSync(join(tmpdir(), "synamp-radio-")), "radio.json");

test("stations: resolved URL, tidy tags; HLS and broken entries are left out", () => {
  assert.deepEqual(toStation(raw("a")), {
    id: "a", name: "Station a", url: "http://stream.example/live.mp3", tags: ["jazz", "smooth jazz", "lounge"],
    country: "Netherlands", countrycode: "NL", codec: "MP3", bitrate: 128,
  });
  assert.equal(toStation(raw("b", { hls: 1 })), null);
  assert.equal(toStation(raw("c", { url: "rtsp://x", url_resolved: "" })), null);
  assert.equal(toStation(raw("d", { name: "  " })), null);
});

test("your own network counts as private", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.20", "172.20.0.5", "169.254.1.1", "100.100.1.1", "::1", "fd12::1", "fe80::1", "::ffff:192.168.0.1", "0.0.0.0"]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  for (const address of ["91.98.4.78", "8.8.8.8", "172.32.0.1", "2a01:4f8::1"]) assert.equal(isPrivateAddress(address), false, address);
});

function directory(stations: unknown[]) {
  const asked: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input));
    asked.push(url.pathname + url.search);
    if (url.hostname === "all.api.radio-browser.info") return new Response(JSON.stringify([{ name: "de1.api.radio-browser.info" }]));
    if (url.pathname === "/json/stations/search") return new Response(JSON.stringify(stations));
    if (url.pathname.startsWith("/json/stations/byuuid/")) return new Response(JSON.stringify(stations.filter((s) => (s as { stationuuid: string }).stationuuid === url.pathname.split("/").pop())));
    return new Response("[]");
  }) as typeof fetch;
  return { fetchImpl, asked };
}

test("search asks the directory with SynAmp's filters and remembers stations for favourites", async () => {
  const dir = directory([raw("a"), raw("b", { hls: 1 })]);
  const file = tempFile();
  const radio = new Radio(file, { fetchImpl: dir.fetchImpl });
  const found = await radio.search({ q: "jazz fm", tag: "Jazz", country: "nl" });
  assert.deepEqual(found.map((s) => s.id), ["a"]);
  const query = dir.asked.find((item) => item.startsWith("/json/stations/search"))!;
  assert.match(query, /hidebroken=true/);
  assert.match(query, /name=jazz\+fm/);
  assert.match(query, /tag=jazz/);
  assert.match(query, /countrycode=NL/);
  radio.addFavourite("a");
  assert.throws(() => radio.addFavourite("never-seen"), /Search for the station again/);
  assert.deepEqual(new Radio(file, { fetchImpl: dir.fetchImpl }).favourites.map((s) => s.id), ["a"]);
  radio.removeFavourite("a");
  assert.deepEqual(new Radio(file, { fetchImpl: dir.fetchImpl }).favourites, []);
});

test("an unknown station ID is looked up in the directory", async () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const radio = new Radio(tempFile(), { fetchImpl: directory([raw(id)]).fetchImpl });
  assert.equal((await radio.station(id)).name, `Station ${id}`);
  await assert.rejects(radio.station("not-a-uuid"), /Unknown station/);
});

async function relayThrough(radio: Radio, station: { id: string; name: string; url: string; tags: string[] }) {
  const server = createServer((req, res) => {
    radio.relay(req, res, station).catch((error) => { res.writeHead((error as { status?: number }).status ?? 500); res.end((error as Error).message); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const text = await response.text();
  server.close();
  return { status: response.status, type: response.headers.get("content-type"), text };
}

test("the relay passes audio through and follows redirects", async () => {
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input));
    if (url.pathname === "/moved") return new Response(null, { status: 302, headers: { location: "https://cdn.example/live" } });
    return new Response("AUDIO-BYTES", { headers: { "content-type": "audio/mpeg" } });
  }) as typeof fetch;
  const radio = new Radio(tempFile(), { fetchImpl, resolve: async () => ["93.184.216.34"] });
  const result = await relayThrough(radio, { id: "a", name: "A", url: "http://radio.example/moved", tags: [] });
  assert.deepEqual(result, { status: 200, type: "audio/mpeg", text: "AUDIO-BYTES" });
});

test("the relay refuses stations that point into your own network, even after a redirect", async () => {
  const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "http://nas.local:5000/" } })) as typeof fetch;
  const resolve = async (host: string) => (host === "nas.local" ? ["192.168.1.10"] : ["93.184.216.34"]);
  const radio = new Radio(tempFile(), { fetchImpl, resolve });
  const result = await relayThrough(radio, { id: "a", name: "A", url: "http://radio.example/", tags: [] });
  assert.equal(result.status, 403);
  assert.match(result.text, /inside your own network/);
  const direct = await relayThrough(radio, { id: "b", name: "B", url: "http://127.0.0.1:8080/", tags: [] });
  assert.equal(direct.status, 403);
});

test("a web page instead of audio is refused", async () => {
  const fetchImpl = (async () => new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
  const radio = new Radio(tempFile(), { fetchImpl, resolve: async () => ["93.184.216.34"] });
  const result = await relayThrough(radio, { id: "a", name: "A", url: "http://radio.example/", tags: [] });
  assert.equal(result.status, 502);
});

#!/usr/bin/env node
// Verify the Phase 1 path through the same Subsonic endpoint native apps use.
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const CLIENT = "synamp-smoke";

function endpoint(base, method, params) {
  const url = new URL(base);
  if (url.username || url.password) throw new Error("Put credentials in environment variables, not the URL");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/rest/${method}.view`;
  url.search = "";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

function auth(user, password) {
  const salt = randomBytes(16).toString("hex");
  const token = createHash("md5").update(password + salt).digest("hex");
  return { u: user, t: token, s: salt, v: "1.16.1", c: CLIENT };
}

async function subsonic(base, method, credentials, extra = {}, fetcher = fetch) {
  const url = endpoint(base, method, { ...auth(...credentials), f: "json", ...extra });
  let response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  } catch (error) {
    throw new Error(`${method}: connection failed (${error.cause?.code ?? error.name ?? "network error"})`);
  }
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  let data;
  try {
    data = (await response.json())["subsonic-response"];
  } catch {
    throw new Error(`${method}: invalid JSON response`);
  }
  if (!data || data.status !== "ok") {
    throw new Error(`${method}: ${data?.error?.message ?? "Subsonic request failed"}`);
  }
  return data;
}

export async function checkPlayback(base, user, password, fetcher = fetch) {
  const credentials = [user, password];
  await subsonic(base, "ping", credentials, {}, fetcher);
  const songs = await subsonic(base, "getRandomSongs", credentials, { size: "1" }, fetcher);
  const track = songs.randomSongs?.song?.[0];
  if (!track?.id) throw new Error("No indexed songs found; wait for the Navidrome scan and check MUSIC_PATH");

  const url = endpoint(base, "stream", { ...auth(user, password), id: track.id });
  let response;
  try {
    response = await fetcher(url, {
      headers: { Range: "bytes=0-1023" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`stream: connection failed (${error.cause?.code ?? error.name ?? "network error"})`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`stream: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.startsWith("text/") || contentType.includes("json")) {
    await response.body?.cancel();
    throw new Error(`stream: expected audio, got ${contentType}`);
  }
  const reader = response.body?.getReader();
  const sample = await reader?.read();
  await reader?.cancel();
  if (!sample?.value?.length) throw new Error("stream: empty audio response");
  return { track: track.title ?? track.id, bytes: sample.value.length };
}

async function main() {
  const base = process.argv[2] ?? process.env.SYNAMP_URL;
  const user = process.env.SUBSONIC_USER;
  const password = process.env.SUBSONIC_PASSWORD;
  if (!base || !user || !password) {
    console.error("Usage: SUBSONIC_USER=… SUBSONIC_PASSWORD=… node tools/nas/check-playback.mjs http://nas:8080");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await checkPlayback(base, user, password);
    console.log(`Subsonic ping, library lookup, and stream passed (${result.bytes} bytes from ${result.track})`);
  } catch (error) {
    console.error(`Playback check failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

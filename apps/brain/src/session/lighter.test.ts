import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ffmpegArgs, LIGHTER_KBPS, parseRange, planLighter, probeSeconds, secondsAt, sendLighter } from "./lighter.ts";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const dir = mkdtempSync(join(tmpdir(), "synamp-lighter-"));

test("plan: big files get a lighter copy of a known length; light ones and unknown lengths stay original", () => {
  const flac = join(dir, "big.flac");
  writeFileSync(flac, Buffer.alloc(5_000_000)); // 5 MB for 10 s = 4000 kbps
  const plan = planLighter(flac, 10, true);
  assert.deepEqual(plan, { kind: "lighter", seconds: 10, total: 160_000 });
  assert.deepEqual(planLighter(flac, undefined, true), { kind: "original", reason: "no-length" });
  assert.deepEqual(planLighter(flac, 10, false), { kind: "original", reason: "unavailable" });
  const mp3 = join(dir, "small.mp3");
  writeFileSync(mp3, Buffer.alloc(160_000)); // 128 kbps already
  assert.deepEqual(planLighter(mp3, 10, true), { kind: "original", reason: "already-light" });
  // Whatever the format: a copy that would be bigger than the original is pointless.
  const flacSmall = join(dir, "quiet.flac");
  writeFileSync(flacSmall, Buffer.alloc(150_000));
  assert.deepEqual(planLighter(flacSmall, 10, true), { kind: "original", reason: "already-light" });
});

test("ranges: single ranges, open ends and suffixes; nonsense is refused", () => {
  assert.equal(parseRange(undefined, 1000), null);
  assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.equal(parseRange("bytes=1000-", 1000), "bad");
  assert.equal(parseRange("bytes=-", 1000), "bad");
  assert.equal(parseRange("bytes=0-1,5-9", 1000), "bad");
  assert.equal(secondsAt((LIGHTER_KBPS * 1000) / 8 * 30), 30);
});

test("ffmpeg is asked for audio only, no tags, constant bitrate, from the right second", () => {
  const args = ffmpegArgs("/music/a.flac", 30);
  assert.deepEqual(args.slice(args.indexOf("-ss"), args.indexOf("-ss") + 2), ["-ss", "30.000"]);
  assert.ok(args.includes("-map_metadata") && args.includes("libmp3lame") && args.includes(`${LIGHTER_KBPS}k`));
  assert.ok(!ffmpegArgs("/music/a.flac", 0).includes("-ss"));
  assert.equal(args.at(-1), "pipe:1");
});

async function serve(file: string, seconds: number): Promise<{ server: Server; base: string }> {
  const plan = planLighter(file, seconds, true);
  assert.equal(plan.kind, "lighter");
  const server = createServer((req, res) => sendLighter(req, res, file, plan as Extract<typeof plan, { kind: "lighter" }>));
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("a real conversion: exact promised length, ranges seek, MP3 that ffprobe reads", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const wav = join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-ar", "44100", "-ac", "2", wav]);
  assert.ok(Math.abs((await probeSeconds(wav))! - 12) < 0.05);
  const { server, base } = await serve(wav, 12);
  try {
    const whole = await fetch(base);
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get("content-type"), "audio/mpeg");
    assert.equal(whole.headers.get("x-synamp-quality"), "lighter");
    const bytes = Buffer.from(await whole.arrayBuffer());
    assert.equal(bytes.length, 192_000);
    assert.equal(Number(whole.headers.get("content-length")), 192_000);
    const out = join(dir, "out.mp3");
    writeFileSync(out, bytes);
    const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,bit_rate,sample_rate", "-of", "default=nw=1", out]).toString();
    assert.match(probe, /codec_name=mp3/);
    assert.match(probe, /bit_rate=128000/);
    assert.ok(Math.abs((await probeSeconds(out))! - 12) < 0.3, "plays for about as long as the original");

    // Seeking: half-way in, the browser asks for a range; the brain starts at second 6.
    const half = await fetch(base, { headers: { range: "bytes=96000-" } });
    assert.equal(half.status, 206);
    assert.equal(half.headers.get("content-range"), "bytes 96000-191999/192000");
    assert.equal((await half.arrayBuffer()).byteLength, 96_000);

    const small = await fetch(base, { headers: { range: "bytes=0-1023" } });
    assert.equal(small.status, 206);
    assert.equal((await small.arrayBuffer()).byteLength, 1024);

    const head = await fetch(base, { method: "HEAD" });
    assert.equal(head.headers.get("content-length"), "192000");
    assert.equal((await fetch(base, { headers: { range: "bytes=192000-" } })).status, 416);
  } finally { server.close(); }
});

test("an unreadable file fails the request instead of sending silence", { skip: !hasFfmpeg && "ffmpeg not installed" }, async () => {
  const junk = join(dir, "junk.flac");
  writeFileSync(junk, Buffer.alloc(2_000_000, 7));
  const { server, base } = await serve(junk, 10);
  try {
    await assert.rejects(async () => { const response = await fetch(base); await response.arrayBuffer(); });
  } finally { server.close(); }
});

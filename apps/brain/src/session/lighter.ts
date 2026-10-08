/**
 * Lighter streams for SynAmp's own player: a smaller MP3 made on the fly, for
 * mobile data. At home the player keeps getting the original file.
 *
 * Why constant-bitrate MP3: at a fixed 128 kbps every second of music is the
 * same number of bytes, so the brain can promise a length up front and answer
 * byte ranges by starting ffmpeg at the matching second. That keeps the things
 * the player relies on — a known duration, seeking, the next song lined up
 * early — working exactly as they do with the original file. Every browser
 * plays MP3.
 *
 * The promised length is an estimate (frames don't divide seconds exactly), so
 * the stream is trimmed to it, or padded with zero bytes, which decoders skip.
 *
 * Phone apps don't come through here: they ask Navidrome for a lower bitrate
 * themselves (see "Listen anywhere").
 */

import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

export const LIGHTER_KBPS = 128;
const BYTES_PER_SECOND = (LIGHTER_KBPS * 1000) / 8;
/** Files already this small (or smaller) are sent as they are: making them "lighter" would only cost quality. */
const ALREADY_LIGHT_KBPS = LIGHTER_KBPS * 1.25;
/** At most this many conversions at once (two decks, a seek or two, a second device). */
const MAX_RUNNING = 6;

export type Plan =
  | { kind: "original"; reason: "already-light" | "unavailable" | "no-length" }
  | { kind: "lighter"; seconds: number; total: number };

/** Is ffmpeg here? Checked once; without it every stream is the original. */
let ffmpegFound: boolean | undefined;
export function lighterAvailable(binary = process.env.FFMPEG_PATH || "ffmpeg"): boolean {
  if (ffmpegFound === undefined) {
    try { ffmpegFound = spawnSync(binary, ["-version"], { stdio: "ignore", timeout: 5000 }).status === 0; }
    catch { ffmpegFound = false; }
  }
  return ffmpegFound;
}
/** Tests only. */
export function resetLighterCheck(): void { ffmpegFound = undefined; }

const probed = new Map<string, number | null>();
/**
 * How long a file plays, asked of ffprobe — for songs the library doesn't have
 * a length for yet (not analysed). Remembered per file; null when unknown.
 */
export function probeSeconds(file: string, binary = process.env.FFPROBE_PATH || "ffprobe"): Promise<number | null> {
  const key = `${file}\n${statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0}`;
  if (probed.has(key)) return Promise.resolve(probed.get(key)!);
  return new Promise((done) => {
    execFile(binary, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { timeout: 10_000 }, (error, stdout) => {
      const seconds = error ? NaN : Number(String(stdout).trim());
      const value = Number.isFinite(seconds) && seconds > 0 ? seconds : null;
      if (probed.size > 20_000) probed.clear();
      probed.set(key, value);
      done(value);
    });
  });
}

/** Decide how to answer: the original file, or a lighter copy of a known length. */
export function planLighter(file: string, seconds: number | undefined, available = lighterAvailable()): Plan {
  if (!available) return { kind: "original", reason: "unavailable" };
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return { kind: "original", reason: "no-length" };
  const size = statSync(file).size;
  const sourceKbps = (size * 8) / seconds / 1000;
  if (sourceKbps <= ALREADY_LIGHT_KBPS) return { kind: "original", reason: "already-light" };
  return { kind: "lighter", seconds, total: Math.ceil(seconds * BYTES_PER_SECOND) };
}

/** A single byte range ("bytes=a-b", "bytes=a-", "bytes=-n") inside total, or null (whole thing), or "bad". */
export function parseRange(header: string | undefined, total: number): { start: number; end: number } | null | "bad" {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return "bad";
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : total - 1;
  if (Number.isNaN(start)) { start = Math.max(0, total - end); end = total - 1; }
  end = Math.min(end, total - 1);
  if (start > end || start >= total) return "bad";
  return { start, end };
}

/** Where in the song a byte offset falls. */
export const secondsAt = (byte: number) => byte / BYTES_PER_SECOND;

/** ffmpeg arguments: from `start` seconds, audio only, no tags, constant 128 kbps MP3 to stdout. */
export function ffmpegArgs(file: string, start: number): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin",
    ...(start > 0 ? ["-ss", start.toFixed(3)] : []),
    "-i", file,
    "-map", "0:a:0", "-vn", "-sn", "-dn", "-map_metadata", "-1",
    "-c:a", "libmp3lame", "-b:a", `${LIGHTER_KBPS}k`, "-ar", "44100", "-ac", "2",
    "-write_xing", "0", "-id3v2_version", "0", "-f", "mp3", "pipe:1",
  ];
}

const running = new Set<ChildProcess>();

/**
 * Send the lighter copy (or the asked-for part of it). Exactly the promised
 * number of bytes goes out: extra is cut off, a short ending is padded.
 */
export function sendLighter(req: IncomingMessage, res: ServerResponse, file: string, plan: Extract<Plan, { kind: "lighter" }>,
  binary = process.env.FFMPEG_PATH || "ffmpeg"): void {
  const range = parseRange(req.headers.range, plan.total);
  if (range === "bad") {
    res.writeHead(416, { "content-range": `bytes */${plan.total}` });
    res.end();
    return;
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? plan.total - 1;
  const length = end - start + 1;
  const headers: Record<string, string | number> = {
    "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff", "x-synamp-quality": "lighter", "content-length": length,
    ...(range ? { "content-range": `bytes ${start}-${end}/${plan.total}` } : {}),
  };
  if (req.method === "HEAD") { res.writeHead(range ? 206 : 200, headers); res.end(); return; }
  if (running.size >= MAX_RUNNING) {
    res.writeHead(503, { "retry-after": "2", "content-type": "application/json" });
    res.end(JSON.stringify({ error: "SynAmp is busy making lighter streams — try again in a moment" }));
    return;
  }
  res.writeHead(range ? 206 : 200, headers);

  // Start at the second that byte falls on; the browser finds the next frame from there.
  const child = spawn(binary, ffmpegArgs(file, secondsAt(start)), { stdio: ["ignore", "pipe", "ignore"] });
  running.add(child);
  let sent = 0;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    running.delete(child);
    if (!child.killed && child.exitCode === null) child.kill("SIGKILL");
  };
  const padAndEnd = () => {
    if (res.writableEnded || res.destroyed) return finish();
    // ffmpeg made nothing (an unreadable file): fail the request rather than send silence.
    if (sent === 0) { res.destroy(); return finish(); }
    // Short by a few frames (the estimate): fill up to the promised length.
    let left = length - sent;
    const zeros = Buffer.alloc(Math.min(left, 64 * 1024));
    while (left > 0) { const chunk = zeros.subarray(0, Math.min(left, zeros.length)); res.write(chunk); left -= chunk.length; }
    res.end();
    finish();
  };
  child.stdout!.on("data", (chunk: Buffer) => {
    if (finished) return;
    const room = length - sent;
    const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
    sent += piece.length;
    const more = res.write(piece);
    if (sent >= length) { res.end(); finish(); return; }
    if (!more) { child.stdout!.pause(); res.once("drain", () => child.stdout!.resume()); }
  });
  child.stdout!.on("end", padAndEnd);
  child.on("error", () => { if (!res.headersSent) res.writeHead(500); res.destroy(); finish(); });
  res.on("close", finish);
}

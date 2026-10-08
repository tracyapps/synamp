/**
 * The librarian writes song details (tags) into files, and puts them back on Undo.
 *
 * Rules, on top of apply.ts's:
 *   - Check first: every file in the decision must still say what you reviewed
 *     (for the details that change). If one doesn't, nothing is written.
 *   - Only the tag parts of a file are rebuilt (tag-writer.ts); the audio is
 *     copied across and checked byte for byte (SHA-256) before the file is replaced.
 *   - The old tag parts are kept first (a small backup per file, in
 *     `.synamp/tag-backups/<batch>/` beside the library), so Undo can put the
 *     file back exactly as it was.
 *   - Written beside the original under a temporary name, read back and
 *     checked, then renamed over it: a file is never left half-written.
 *   - All or nothing per decision: if a file fails, the ones already done are put back.
 *   - Undo only restores a file that's exactly as SynAmp left it; anything
 *     changed since is left alone (and said so).
 */

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import type { JobDecision, Written } from "../library/organise.ts";
import { formatOf, join as joinParts, rewrite, sha256, splitParts, TAG_FIELDS, TagWriteError } from "../library/tag-writer.ts";
import type { Parts, TagValues } from "../library/tag-writer.ts";
import { readTags } from "../library/tags.ts";
import { fieldLabel } from "../library/song-details.ts";
import { inside } from "./apply.ts";
import type { Context, DecisionResult } from "./apply.ts";

export type TagContext = Context & {
  /** Where the old tag parts are kept (outside the library, so nothing scans them). */
  backups: string;
};

const fail = (decision: JobDecision, errors: string[], notes: string[] = []): DecisionResult => ({ id: decision.id, status: "failed", moved: [], written: [], errors, notes });

/** "title is now “X”, not “Y” as reviewed" — or undefined when the file still says what was reviewed. */
function drifted(path: string, now: TagValues, set: TagValues): string | undefined {
  const current = readTags(path);
  for (const field of TAG_FIELDS) {
    if (set[field] === undefined) continue;
    if ((current[field] ?? undefined) !== (now[field] ?? undefined)) {
      return `its ${fieldLabel(field)} is now ${current[field] === undefined ? "empty" : `“${current[field]}”`}, not ${now[field] === undefined ? "empty" : `“${now[field]}”`} as reviewed`;
    }
  }
  return undefined;
}

/** Old tag parts, kept for Undo: [4-byte head length][head][tail]. */
function saveBackup(ctx: TagContext, path: string, parts: Parts): string {
  const name = `${ctx.batch}/${createHash("sha256").update(path).digest("hex").slice(0, 24)}.tagbak`;
  const file = join(ctx.backups, name);
  mkdirSync(dirname(file), { recursive: true });
  const size = Buffer.alloc(4);
  size.writeUInt32BE(parts.head.length);
  writeFileSync(file, Buffer.concat([size, parts.head, parts.tail]));
  return name;
}
function readBackup(ctx: TagContext, name: string): { head: Buffer; tail: Buffer } {
  if (!/^[\w-]+\/[0-9a-f]{24}\.tagbak$/.test(name)) throw new Error("the backup's name isn't one SynAmp made");
  const data = readFileSync(join(ctx.backups, name));
  const length = data.readUInt32BE(0);
  return { head: data.subarray(4, 4 + length), tail: data.subarray(4 + length) };
}

/** Write `bytes` beside `path`, flush it to disk, check it with `check`, then put it in place. */
function replaceFile(path: string, bytes: Buffer, check: (temp: string) => void): void {
  const temp = `${path}.synamp-part-${randomBytes(4).toString("hex")}`;
  const mode = statSync(path).mode & 0o7777;
  const fd = openSync(temp, "wx", mode);
  try {
    for (let at = 0; at < bytes.length;) at += writeSync(fd, bytes, at, bytes.length - at);
    fsyncSync(fd);
  } finally { closeSync(fd); }
  try {
    chmodSync(temp, mode);
    check(temp);
    renameSync(temp, path);
  } catch (error) {
    try { unlinkSync(temp); } catch { /* already gone */ }
    throw error;
  }
}

/** Put one file back from its backup, if it's still exactly as SynAmp left it. */
function restoreOne(ctx: TagContext, written: Written): void {
  const path = inside(ctx.root, written.path);
  const format = formatOf(path);
  if (!format) throw new Error("not a format SynAmp writes");
  const bytes = readFileSync(path);
  if (sha256(bytes) !== written.after_sha) throw new Error("it changed after SynAmp wrote it, so it was left as it is");
  const audio = splitParts(bytes, format).audio;
  if (sha256(audio) !== written.audio_sha) throw new Error("its audio doesn't match, so it was left as it is");
  const old = readBackup(ctx, written.backup);
  replaceFile(path, joinParts({ head: old.head, audio, tail: old.tail }), (temp) => {
    if (sha256(splitParts(readFileSync(temp), format).audio) !== written.audio_sha) throw new Error("the restored file's audio didn't match");
  });
}

export function applyTags(decision: JobDecision, ctx: TagContext): DecisionResult {
  const edits = decision.edits ?? [];
  const now = ctx.now ?? Date.now;
  // 1. Check everything first.
  const problems: string[] = [];
  for (const edit of edits) {
    let path: string;
    try { path = inside(ctx.root, edit.path); } catch (error) { problems.push((error as Error).message); continue; }
    if (!formatOf(path)) { problems.push(`“${edit.path}”: SynAmp can't write details into this kind of file yet`); continue; }
    try { if (!statSync(path).isFile()) throw new Error("not a file"); } catch { problems.push(`“${edit.path}” is no longer there`); continue; }
    const why = drifted(path, edit.now, edit.set);
    if (why) problems.push(`“${edit.path}” changed since you reviewed it: ${why}`);
  }
  if (problems.length) return fail(decision, problems.slice(0, 20), ["Nothing in this album was changed. Review it again once the list refreshes."]);

  // 2. Write, one file at a time; put the earlier ones back if one fails.
  const written: Written[] = [];
  for (const edit of edits) {
    const path = inside(ctx.root, edit.path);
    try {
      const format = formatOf(path)!;
      const bytes = readFileSync(path);
      const before = splitParts(bytes, format);
      const parts = rewrite(bytes, format, edit.set);
      const audioSha = sha256(before.audio);
      if (sha256(parts.audio) !== audioSha) throw new Error("the audio would have changed");
      const next = joinParts(parts);
      const backup = saveBackup(ctx, edit.path, before);
      ctx.beforeRename?.(edit.path, edit.path);
      replaceFile(path, next, (temp) => {
        const check = readFileSync(temp);
        if (sha256(splitParts(check, format).audio) !== audioSha) throw new Error("the written file's audio didn't match the original");
        const tags = readTags(temp);
        for (const field of TAG_FIELDS) {
          if (edit.set[field] !== undefined && tags[field] !== edit.set[field]) throw new Error(`the ${fieldLabel(field)} didn't read back as written`);
        }
      });
      written.push({ path: edit.path, track_id: edit.track_id, backup, audio_sha: audioSha, after_sha: sha256(next) });
      ctx.journal.append({ retag: edit.path, track_id: edit.track_id, reason: "song details", batch: ctx.batch, decision: decision.id, at: now() });
    } catch (error) {
      const reason = error instanceof TagWriteError ? `SynAmp can't safely rewrite its details: ${error.message}` : (error as Error).message;
      const errors = [`“${edit.path}”: ${reason}`];
      const putBack: string[] = [];
      for (const done of [...written].reverse()) {
        try { restoreOne(ctx, done); ctx.journal.append({ retag: done.path, track_id: done.track_id, reason: "put back after a failed step", batch: ctx.batch, decision: decision.id, at: now() }); }
        catch (undo) { putBack.push(`“${done.path}” couldn't be put back: ${(undo as Error).message}`); }
      }
      return fail(decision, [...errors, ...putBack], written.length && !putBack.length ? ["The files already written in this album were put back."] : []);
    }
  }
  return { id: decision.id, status: "applied", moved: [], written, errors: [], notes: [] };
}

export function undoTags(decision: JobDecision, ctx: TagContext): DecisionResult {
  const now = ctx.now ?? Date.now;
  const restored: Written[] = [];
  const errors: string[] = [];
  for (const written of decision.restore ?? []) {
    try {
      restoreOne(ctx, written);
      restored.push(written);
      ctx.journal.append({ retag: written.path, track_id: written.track_id, reason: "undo", batch: ctx.batch, decision: decision.id, at: now() });
    } catch (error) {
      errors.push(`“${written.path}”: ${(error as Error).message}`);
    }
  }
  return { id: decision.id, status: errors.length ? "failed" : "applied", moved: [], written: restored, errors: errors.slice(0, 20), notes: [] };
}

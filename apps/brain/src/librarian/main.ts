/**
 * SynAmp librarian — the only SynAmp process allowed to change the music files.
 *
 * It asks the brain for approved work, carries it out (renames and moves only),
 * journals every move, and reports back. Run it where the music is writable,
 * ideally on the NAS itself (fast, same-volume renames, correct ownership):
 *
 *   LIBRARIAN_MUSIC_PATH=/music            the library root (read-write)
 *   LIBRARIAN_INCOMING_PATH=/incoming      new music to file (optional; imports)
 *   SYNAMP_BRAIN_URL=http://brain:3001     where the brain is
 *   SYNAMP_BRAIN_TOKEN=…                   the brain's PLAYLIST_API_TOKEN
 *   RENAME_JOURNAL_PATH=/journal/renames.jsonl
 *                                          shared with the analyzer, so moved
 *                                          tracks keep their analysis
 *   LIBRARIAN_STATE_DIR=/data              unsent reports wait here
 *   LIBRARIAN_POLL_SECONDS=10
 *
 *   node --experimental-strip-types src/librarian/main.ts          # keep running
 *   node --experimental-strip-types src/librarian/main.ts --once   # one check, then exit
 */

import { accessSync, constants, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Job } from "../library/organise.ts";
import { Journal, runJob } from "./apply.ts";
import type { DecisionResult } from "./apply.ts";

export const LIBRARIAN_VERSION = "0.1.0";

export type LibrarianConfig = {
  root: string;
  incoming?: string;
  brainUrl: string;
  token: string;
  journal?: string;
  stateDir: string;
  pollSeconds: number;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): LibrarianConfig {
  const root = env.LIBRARIAN_MUSIC_PATH ?? "";
  const stateDir = env.LIBRARIAN_STATE_DIR || "./data/librarian";
  return {
    root, stateDir,
    ...(env.LIBRARIAN_INCOMING_PATH ? { incoming: env.LIBRARIAN_INCOMING_PATH } : {}),
    brainUrl: (env.SYNAMP_BRAIN_URL || "http://127.0.0.1:3001").replace(/\/+$/, ""),
    token: env.SYNAMP_BRAIN_TOKEN ?? "",
    ...(env.RENAME_JOURNAL_PATH ? { journal: env.RENAME_JOURNAL_PATH } : {}),
    pollSeconds: Math.max(2, Number(env.LIBRARIAN_POLL_SECONDS) || 10),
  };
}

/** Refuses to start on a setup that could do damage or silently lose the journal. */
export function checkSetup(config: LibrarianConfig): string[] {
  const problems: string[] = [];
  if (!config.root) problems.push("Set LIBRARIAN_MUSIC_PATH to the library folder (the one Navidrome scans).");
  else if (resolve(config.root) === "/") problems.push("LIBRARIAN_MUSIC_PATH must not be the filesystem root.");
  else if (!existsSync(config.root) || !statSync(config.root).isDirectory()) problems.push(`LIBRARIAN_MUSIC_PATH ${config.root} is not a folder.`);
  else {
    try { accessSync(config.root, constants.W_OK); } catch { problems.push(`The librarian can't write to ${config.root} (mounted read-only, or the wrong user).`); }
  }
  if (config.incoming) {
    if (!existsSync(config.incoming) || !statSync(config.incoming).isDirectory()) problems.push(`LIBRARIAN_INCOMING_PATH ${config.incoming} is not a folder.`);
    else try { accessSync(config.incoming, constants.W_OK); } catch { problems.push(`The librarian can't write to ${config.incoming}.`); }
  }
  if (!config.journal) problems.push("Set RENAME_JOURNAL_PATH so the analyzer can follow the moves (otherwise moved tracks are re-analysed).");
  return problems;
}

type Pending = { job: string; results: DecisionResult[] };

/** One round: send any unsent report, then ask for a job and do it. Returns what happened. */
export async function runOnce(config: LibrarianConfig, fetchImpl: typeof fetch = fetch, log: (line: string) => void = console.log): Promise<"idle" | "worked" | "unreachable"> {
  const headers = { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) };
  const pendingFile = join(config.stateDir, "pending-report.json");
  const post = async (path: string, body: unknown) => {
    const response = await fetchImpl(`${config.brainUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`brain answered HTTP ${response.status} for ${path}`);
    return await response.json() as Record<string, unknown>;
  };
  const report = async (pending: Pending) => {
    await post(`/api/v1/librarian/jobs/${encodeURIComponent(pending.job)}`, { results: pending.results });
    try { unlinkSync(pendingFile); } catch { /* already gone */ }
  };

  try {
    // A report that didn't get through last time goes first: the brain must hear what was done.
    if (existsSync(pendingFile)) await report(JSON.parse(readFileSync(pendingFile, "utf8")) as Pending);
    const claimed = await post("/api/v1/librarian/claim", {
      librarian: { version: LIBRARIAN_VERSION, root: config.root, incoming: config.incoming ?? "", journal: config.journal ?? "", host: hostname() },
    });
    const job = claimed.job as Job | null;
    if (!job) return "idle";
    log(`${job.kind === "apply" ? "Applying" : "Undoing"} batch ${job.batch}: ${job.decisions.length} decision(s)`);
    const results = runJob(job, { root: config.root, ...(config.incoming ? { incoming: config.incoming } : {}), journal: new Journal(config.journal) });
    for (const result of results) {
      log(`  ${result.status === "applied" ? "✓" : "✗"} ${job.decisions.find((d) => d.id === result.id)?.title ?? result.id} — ${result.moved.length} moved${result.errors.length ? `; ${result.errors.join("; ")}` : ""}`);
    }
    const pending: Pending = { job: job.id, results };
    mkdirSync(config.stateDir, { recursive: true });
    const temp = `${pendingFile}.tmp`;
    writeFileSync(temp, JSON.stringify(pending));
    renameSync(temp, pendingFile);
    await report(pending);
    return "worked";
  } catch (error) {
    log(`Can't reach the brain at ${config.brainUrl}: ${(error as Error).message}`);
    return "unreachable";
  }
}

async function main(): Promise<void> {
  const config = configFromEnv();
  const problems = checkSetup(config);
  if (problems.length) {
    for (const problem of problems) console.error(`librarian: ${problem}`);
    process.exit(2);
  }
  mkdirSync(dirname(join(config.stateDir, "x")), { recursive: true });
  console.log(`synamp-librarian ${LIBRARIAN_VERSION}: ${config.root} → journal ${config.journal}; asking ${config.brainUrl} every ${config.pollSeconds}s`);
  const once = process.argv.includes("--once");
  let stopping = false;
  process.on("SIGTERM", () => { stopping = true; });
  process.on("SIGINT", () => { stopping = true; });
  do {
    const outcome = await runOnce(config);
    if (once) break;
    // Straight on to the next job after work; otherwise wait.
    if (outcome !== "worked") await new Promise((done) => setTimeout(done, config.pollSeconds * 1000));
  } while (!stopping);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("librarian/main.ts")) {
  void main();
}

/** B02 offline baseline, using explicit frozen library snapshots only. */
import { readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { LibrarySource } from "../../apps/brain/src/query/library.ts";
import { interpretGoal } from "../../apps/brain/src/intent/interpret.ts";
import { validatePlan } from "../../apps/brain/src/query/plan.ts";
import { evaluatePlan } from "../../apps/brain/src/query/evaluate.ts";
import type { Library } from "../../apps/brain/src/query/evaluate.ts";

const suitePath = new URL("./business-prompts.v1.json", import.meta.url);
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
type Case = { id: string; prompt: string; method: string; scope: string; listen_for: string };
const suiteBytes = readFileSync(suitePath);
const suite = JSON.parse(suiteBytes.toString()) as { version: string; target_size: number; cases: Case[] };

export function baseline(library: Library, now: number) {
  return suite.cases.map(item => {
    const judgment = { raters: [], fit: null, audible_hard_rule_violations: null, useful: null };
    if (item.method === "manual") return { ...item, status: "manual-pending" as const, judgment };
    const intent = interpretGoal(item.prompt, { library, now });
    if (intent.accuracy !== "specific" || intent.readings.length !== 1) return {
      ...item, status: "interpretation-review" as const, accuracy: intent.accuracy, asks: intent.asks,
      readings: intent.readings, judgment,
    };
    const original = validatePlan(intent.readings[0]!.plan);
    if (!original.ok) throw new Error(`Invalid interpreted plan for ${item.id}`);
    const checked = validatePlan({ ...original.plan, target_size: suite.target_size });
    if (!checked.ok) throw new Error(`Invalid interpreted plan for ${item.id}`);
    const result = evaluatePlan(checked, library);
    return { ...item, status: "evaluated-unrated" as const, accuracy: intent.accuracy, plan: checked.plan, plan_hash: checked.hash,
      requested: checked.plan.target_size, returned: result.strict.length, counts: result.counts,
      underfilled: result.underfilled, unenforced: result.unenforced, unsupported: result.unsupported,
      blind_spots: result.blind_spots, warnings: result.warnings, relaxations_applied: result.relaxations_applied,
      strict: result.strict.map(t => ({ id: t.id, reasons: t.reasons, unverified: t.unverified })),
      near_miss_count: result.near_miss.length, judgment };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = new Map<string, string>();
    const input = process.argv.slice(2);
    if (input.length === 1 && input[0] === "--help") {
      console.log('node --experimental-strip-types tools/brain-lab/business-baseline.mts --library /private/snapshots/library.json --now 2026-10-11T18:00:00Z --material real|synthetic|unverified --out /private/reports/baseline.json');
      process.exit(0);
    }
    for (let i = 0; i < input.length; i += 2) {
      const key = input[i]!, value = input[i + 1];
      if (!["--library", "--now", "--material", "--out"].includes(key) || !value || value.startsWith("--") || args.has(key)) throw new Error("Invalid or duplicate argument");
      args.set(key, value);
    }
    for (const key of ["--library", "--now", "--material", "--out"]) if (!args.has(key)) throw new Error(`${key} is required`);
    const libraryPath = realpathSync(resolve(args.get("--library")!));
    const outputPath = resolve(args.get("--out")!);
    const outputRelative = relative(dirname(libraryPath), realpathSync(dirname(outputPath)));
    if (outputRelative === "" || (outputRelative !== ".." && !outputRelative.startsWith(`..${sep}`) && !isAbsolute(outputRelative))) throw new Error("Output must be outside the input directory");
    const nowText = args.get("--now")!;
    const now = Date.parse(nowText);
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(nowText) || !Number.isFinite(now)) throw new Error("Use a valid ISO clock with UTC offset");
    const material = args.get("--material")!;
    if (!["real", "synthetic", "unverified"].includes(material)) throw new Error("Invalid material declaration");
    if (statSync(libraryPath).size > 100 * 1024 * 1024) throw new Error("Snapshot exceeds the 100 MiB baseline limit; use a bounded subset");
    const bytes = readFileSync(libraryPath);
    const raw = JSON.parse(bytes.toString()) as { counts?: unknown };
    const source = new LibrarySource(libraryPath), library = source.get();
    const cases = baseline(library, now);
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const git = (args: string[]) => { const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" }); if (r.status !== 0) throw new Error("Cannot establish source identity"); return r.stdout.trim(); };
    const report = { format: "synamp.business-baseline/1", suite: suite.version, suite_sha256: hash(suiteBytes),
      source: { head: git(["rev-parse", "HEAD"]), dirty: git(["status", "--porcelain"]) !== "" },
      material, evidence: "offline-unrated", now: new Date(now).toISOString(), input_sha256: hash(bytes),
      library_version: library.version, library_tracks: library.tracks.length, rejected_rows: source.rejected,
      export_counts: raw.counts ?? null,
      stages: Object.fromEntries(["identity", "dsp_core", "beat", "tonal", "voice"].map(stage => {
        const marked = library.tracks.filter(t => ((t as unknown as { stages_done?: string[] }).stages_done ?? []).includes(stage)).length;
        return [stage, { marked_complete: marked, not_marked_complete: library.tracks.length - marked }];
      })),
      cases, pending_raters: 2, quality_gate: "not-assessed",
      caveat: "Material is declared, not verified. Missing stage markers mean unknown completion, not analysis failure. Export failure counts are unavailable when absent. No audio was heard; no usefulness or hard-rule accuracy verdict is inferred. Manual cases and every ambiguity remain pending. This reads no live corrections, events, or rename overlay." };
    if (hash(readFileSync(libraryPath)) !== hash(bytes)) throw new Error("Input changed during baseline; use a frozen snapshot");
    writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ format: report.format, suite: suite.version, library_tracks: library.tracks.length,
      cases: cases.length, evaluated: cases.filter(c => c.status === "evaluated-unrated").length,
      interpretation_review: cases.filter(c => c.status === "interpretation-review").length,
      manual_pending: cases.filter(c => c.status === "manual-pending").length, quality_gate: "not-assessed" }));
  } catch (error) {
    // Do not echo private filesystem paths, track names, or raw parse errors.
    const message = (error as Error).message;
    console.error(/^(--[a-z]+ is required|Invalid or duplicate argument|Output must|Use a valid ISO|Invalid material|Snapshot exceeds|Cannot establish|Input changed|Invalid interpreted)/.test(message) ? message : "Baseline failed. Check snapshot format/access and use a new output filename outside the input directory.");
    process.exitCode = 1;
  }
}

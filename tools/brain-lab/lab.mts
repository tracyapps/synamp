/**
 * brain-lab — SynAmp fast-learning brain scenario lab (B4 verification harness).
 *
 * Deterministic, runnable scenario lab for the fast-learning brain. Runs the
 * existing P2/P3 pipeline (draft → validate → evaluate) plus — as modules land —
 * the B1 interpretation layer, B2 epoch learning, and B1 sequencing. Missing
 * modules are reported as `pending`, never stubbed.
 *
 * Usage:
 *   node --experimental-strip-types tools/brain-lab/lab.mts
 *   node --experimental-strip-types tools/brain-lab/lab.mts --json <path>
 *   node --experimental-strip-types tools/brain-lab/lab.mts --only <substring>
 *   node --experimental-strip-types tools/brain-lab/lab.mts --list
 *
 * Exit code: 0 when no check failed (pending is allowed and reported);
 *            1 when at least one check failed; 2 on a harness-level error.
 *
 * The lab reads the repo read-only (except the --json file you point it at) and
 * never writes into apps/brain stores.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

import { LAB_DIR, BRAIN_DIR, REPO_ROOT, readJson, j, gitInfo, errorMessage } from "./lib/util.mts";
import { loadAllModules, type LoadedModule } from "./lib/modules.mts";
import { ScenarioRun, summarize } from "./lib/checks.mts";
import { runScenario, type LabContext, type Scenario } from "./lib/runner.mts";

const SCENARIO_DIR = join(LAB_DIR, "scenarios");

type Args = { json?: string; only?: string; list: boolean; help: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { list: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (token === "--json") args.json = argv[++index];
    else if (token === "--only") args.only = argv[++index];
    else if (token === "--list") args.list = true;
    else if (token === "--help" || token === "-h") args.help = true;
    else if (token.startsWith("--")) console.error(`[brain-lab] unknown flag "${token}" (ignored)`);
  }
  return args;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Scenario inheritance: deep-merge objects; arrays and `checks` are replaced wholesale; child wins. */
function mergeScenario(parent: Record<string, unknown>, child: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parent };
  for (const [key, value] of Object.entries(child)) {
    if (key === "extends") continue;
    if (key === "checks") { out[key] = value; continue; }
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = mergeScenario(out[key] as Record<string, unknown>, value);
    else out[key] = value;
  }
  return out;
}

function loadScenarios(): Scenario[] {
  const files = readdirSync(SCENARIO_DIR).filter((name) => name.endsWith(".json")).sort();
  const cache = new Map<string, Record<string, unknown>>();
  const resolveFile = (name: string): Record<string, unknown> => {
    if (cache.has(name)) return cache.get(name)!;
    const path = join(SCENARIO_DIR, name);
    let parsed: Record<string, unknown>;
    try {
      parsed = readJson(path) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`scenario ${name}: ${errorMessage(error)}`);
    }
    const parent = typeof parsed.extends === "string" ? resolveFile(parsed.extends) : null;
    const merged = parent ? mergeScenario(parent, parsed) : parsed;
    cache.set(name, merged);
    return merged;
  };
  return files.map((name) => resolveFile(name) as unknown as Scenario);
}

function truncate(text: string, max = 420): string {
  return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
}

function printCheck(check: { status: string; id: string; expected?: string; actual?: string; note?: string }): void {
  const mark = { pass: "PASS", fail: "FAIL", pending: "PEND", skip: "SKIP" }[check.status] ?? check.status.toUpperCase();
  let line = `    ${mark}  ${check.id}`;
  if (check.status === "pass" && check.actual) line += ` — ${truncate(check.actual)}`;
  else if (check.status === "fail") line += ` — expected: ${truncate(check.expected ?? "?")} · actual: ${truncate(check.actual ?? "?")}`;
  else if (check.note) line += ` — ${truncate(check.note)}`;
  console.log(line);
}

function printModuleStatus(modules: Map<string, LoadedModule>): void {
  for (const mod of modules.values()) {
    if (mod.status === "loaded") {
      if (!mod.found.length) {
        console.log(`  LOADED, NO WANTED EXPORTS ${mod.path} — exports: ${mod.exports.join(", ") || "none"}`);
        continue;
      }
      const fallbacks = mod.wanted.filter((name) => !mod.found.includes(name));
      const fallbackNote = fallbacks.length ? ` · fallbacks not needed/absent: ${fallbacks.join(", ")}` : "";
      console.log(`  loaded      ${mod.path} (${mod.found.join(", ")}${fallbackNote})`);
    } else if (mod.status === "missing") {
      console.log(`  not present ${mod.path} — checks pending until it lands`);
    } else {
      console.log(`  LOAD ERROR  ${mod.path} — ${truncate(mod.error ?? "unknown error", 300)}`);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("brain-lab — usage:\n  node --experimental-strip-types tools/brain-lab/lab.mts [--json <path>] [--only <substring>] [--list]");
    return;
  }

  const startedAt = new Date().toISOString();
  const git = gitInfo();
  const scenarios = loadScenarios();
  if (args.list) {
    for (const scenario of scenarios) console.log(`${scenario.id}\t${scenario.kind}\t${scenario.title}`);
    return;
  }

  console.log(`[brain-lab] SynAmp fast-learning brain — scenario lab`);
  console.log(`[brain-lab] run ${startedAt} · repo ${REPO_ROOT}`);
  console.log(`[brain-lab] git HEAD ${git.head ?? "?"}${git.branch ? ` @ ${git.branch}` : ""}${git.dirty === null ? "" : git.dirty ? " (working tree dirty)" : " (working tree clean)"} · node ${process.version}`);
  console.log(`[brain-lab] NOTE: timestamps in scenarios are pinned; the lab is deterministic given the same module state.\n`);

  // Library
  const libraryPath = join(BRAIN_DIR, "fixtures", "library.sample.json");
  const library = readJson(libraryPath) as LabContext["library"];
  if (!library || !Array.isArray(library.tracks)) throw new Error(`sample library malformed: ${libraryPath}`);
  const trackIds = new Set(library.tracks.map((track) => track.id));
  console.log(`[brain-lab] library ${libraryPath} — ${library.tracks.length} tracks (synthetic sample; fixtures are never evidence about real music)\n`);

  // Modules
  const modules = await loadAllModules();
  console.log(`[brain-lab] modules:`);
  printModuleStatus(modules);
  const notLoaded = [...modules.values()].filter((mod) => mod.status !== "loaded");
  const loadErrors = notLoaded.filter((mod) => mod.status === "load_error");
  if (loadErrors.length) console.log(`[brain-lab] ⚠ ${loadErrors.length} module(s) FAILED to import — dependent checks will fail or pend; read the messages above.`);
  console.log("");

  const ctx: LabContext = { library, trackIds, modules };
  const wanted = args.only ? scenarios.filter((scenario) => scenario.id.toLowerCase().includes(args.only!.toLowerCase())) : scenarios;
  if (!wanted.length) console.error(`[brain-lab] --only "${args.only}" matched no scenario`);
  if (args.only) console.log(`[brain-lab] --only "${args.only}" → ${wanted.length} scenario(s)\n`);

  const runs: ScenarioRun[] = [];
  for (const scenario of wanted) {
    console.log(`──────────────────────────────────────────────────────────────`);
    console.log(`▶ ${scenario.id} — ${scenario.title}`);
    if (scenario.note) console.log(`    · scenario note: ${truncate(scenario.note, 400)}`);
    let run: ScenarioRun;
    try {
      run = await runScenario(scenario, ctx);
    } catch (error) {
      run = new ScenarioRun(scenario.id, scenario.title, scenario.kind);
      run.fail("scenario-runs", "no throw", errorMessage(error));
    }
    for (const note of run.notes) console.log(`    · ${truncate(note)}`);
    for (const check of run.checks) printCheck(check);
    const counts = run.counts();
    console.log(`  → ${run.status().toUpperCase()} — ${counts.pass} pass, ${counts.fail} fail, ${counts.pending} pending, ${counts.skip} skip`);
    runs.push(run);
    console.log("");
  }

  // Summary
  const summary = summarize(runs);
  console.log(`══════════════════════════════════════════════════════════════`);
  console.log(`[brain-lab] SUMMARY — scenarios: ${runs.length} (${summary.scenarios.pass} pass, ${summary.scenarios.partial} partial, ${summary.scenarios.pending} pending, ${summary.scenarios.fail} fail)`);
  console.log(`[brain-lab] checks: ${summary.checks.pass} pass · ${summary.checks.fail} fail · ${summary.checks.pending} pending · ${summary.checks.skip} skip`);
  if (notLoaded.length) {
    const pendingNames = notLoaded.map((mod) => `${mod.path}${mod.status === "load_error" ? " (LOAD ERROR)" : ""}`);
    console.log(`[brain-lab] modules not loaded: ${pendingNames.join(", ")}`);
  }
  if (summary.checks.fail > 0) {
    console.log(`[brain-lab] RESULT: FAIL — ${summary.checks.fail} check(s) failed`);
  } else if (summary.checks.pending > 0) {
    console.log(`[brain-lab] RESULT: OK (partial) — no failures; ${summary.checks.pending} check(s) pending module land`);
  } else {
    console.log(`[brain-lab] RESULT: OK — all checks pass`);
  }

  if (args.json) {
    const outPath = resolve(process.cwd(), args.json);
    const evidence = {
      format: "synamp.brain-lab/1",
      generated_at: startedAt,
      repo: { root: REPO_ROOT, head: git.head, branch: git.branch, dirty: git.dirty },
      node: process.version,
      library: { path: "apps/brain/fixtures/library.sample.json", tracks: library.tracks.length },
      modules: [...modules.values()].map((mod) => ({
        key: mod.key, path: mod.path, status: mod.status,
        ...(mod.error ? { error: mod.error } : {}),
        wanted: mod.wanted, found: mod.found, exports: mod.exports,
      })),
      scenarios: runs.map((run) => {
        const scenario = wanted.find((item) => item.id === run.id);
        const withNote = run.toJSON();
        return scenario?.note ? { ...withNote, scenario_note: scenario.note } : withNote;
      }),
      summary,
    };
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(evidence, null, 2) + "\n");
    console.log(`[brain-lab] JSON evidence → ${outPath}`);
  }

  process.exitCode = summary.checks.fail > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`[brain-lab] fatal: ${errorMessage(error)}`);
  console.error(error instanceof Error ? error.stack : "");
  process.exitCode = 2;
});

/**
 * brain-lab — graceful module loader.
 *
 * The lab must be runnable while other agents are mid-flight. Every brain module
 * is imported dynamically; a missing file, a file mid-edit, or a missing expected
 * export is reported per module and turns the dependent checks into `pending`
 * (or a hard fail when the file exists but breaks the frozen interface).
 *
 * Nothing here stubs, mocks, or fakes a missing module: absent modules are absent.
 */

import { abs, fileUrl, fileExists, errorMessage } from "./util.mts";

export type ModuleStatus = "loaded" | "missing" | "load_error";

export type LoadedModule = {
  key: string;
  /** repo-relative path, for evidence */
  path: string;
  status: ModuleStatus;
  /** all named exports when loaded */
  exports: string[];
  /** export names this lab wants (fallbacks in order) */
  wanted: string[];
  /** wanted names that are actually present */
  found: string[];
  error?: string;
  mod: Record<string, unknown> | null;
};

/** Which module keys the lab knows about. Paths are repo-relative. */
export const MODULE_SPECS: Array<{ key: string; path: string; wanted: string[]; note: string }> = [
  { key: "draft", path: "apps/brain/src/query/draft.ts", wanted: ["draftPlan"], note: "rule-based draft parser (P2, exists)" },
  { key: "plan", path: "apps/brain/src/query/plan.ts", wanted: ["validatePlan", "planHash"], note: "plan schema + validator (P2, exists)" },
  { key: "evaluate", path: "apps/brain/src/query/evaluate.ts", wanted: ["evaluatePlan"], note: "deterministic evaluation (P2, exists)" },
  { key: "feedback", path: "apps/brain/src/session/feedback.ts", wanted: ["deriveFeedback"], note: "heuristic-v1 feedback view (P3, exists)" },
  { key: "sequence", path: "apps/brain/src/query/sequence.ts", wanted: ["sequenceTracks"], note: "arc sequencing (B1, new)" },
  { key: "intent", path: "apps/brain/src/intent/interpret.ts", wanted: ["interpretGoal"], note: "goal interpretation (B1, new)" },
  { key: "learning", path: "apps/brain/src/learning/derive.ts", wanted: ["deriveEpochPolicy", "deriveAdaptive"], note: "epoch learning (B2, new)" },
];

export async function loadAllModules(specs = MODULE_SPECS): Promise<Map<string, LoadedModule>> {
  const out = new Map<string, LoadedModule>();
  for (const spec of specs) {
    out.set(spec.key, await loadModule(spec));
  }
  return out;
}

async function loadModule(spec: { key: string; path: string; wanted: string[] }): Promise<LoadedModule> {
  const absPath = abs(spec.path);
  const base: LoadedModule = {
    key: spec.key, path: spec.path, status: "missing", exports: [], wanted: spec.wanted, found: [], mod: null,
  };
  if (!fileExists(absPath)) return base; // genuinely not present yet — not an error
  try {
    const mod = (await import(fileUrl(absPath))) as Record<string, unknown>;
    const exports = Object.keys(mod).sort();
    return { ...base, status: "loaded", exports, found: spec.wanted.filter((name) => name in mod), mod };
  } catch (error) {
    // File exists but cannot be imported (syntax the stripper rejects, a throw at module scope, mid-edit state).
    return { ...base, status: "load_error", error: errorMessage(error) };
  }
}

/**
 * Pick a function by candidate names. Returns null and a reason when absent.
 * `wanted` is ordered: e.g. deriveEpochPolicy first, deriveAdaptive as fallback.
 */
export function pickExport(mod: LoadedModule | undefined, names: string[]): { fn: ((...args: any[]) => any) | null; used: string | null; reason: string } {
  if (!mod) return { fn: null, used: null, reason: "module not tracked" };
  if (mod.status === "missing") return { fn: null, used: null, reason: `${mod.path} not present yet` };
  if (mod.status === "load_error") return { fn: null, used: null, reason: `${mod.path} failed to import: ${mod.error ?? "unknown error"}` };
  for (const name of names) {
    const value = mod.mod?.[name];
    if (typeof value === "function") return { fn: value as (...args: any[]) => any, used: name, reason: "ok" };
  }
  return { fn: null, used: null, reason: `${mod.path} exports none of: ${names.join(", ")} (exports: ${mod.exports.join(", ") || "none"})` };
}

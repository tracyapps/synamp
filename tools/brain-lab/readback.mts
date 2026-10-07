/** Read-only policy comparison. Requires explicit snapshots and clock; no live writes. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { LibrarySource } from "../../apps/brain/src/query/library.ts";
import { EventLog } from "../../apps/brain/src/session/events.ts";
import { deriveEpochPolicy } from "../../apps/brain/src/learning/derive.ts";
import { deriveFeedback } from "../../apps/brain/src/session/feedback.ts";
import { interpretGoal } from "../../apps/brain/src/intent/interpret.ts";
import { validatePlan } from "../../apps/brain/src/query/plan.ts";
import { evaluatePlan } from "../../apps/brain/src/query/evaluate.ts";
import { sequenceTracks } from "../../apps/brain/src/query/sequence.ts";
import { CENTROID_AXES, axisReliability } from "../../apps/brain/src/learning/reliability.ts";

const HELP = `Read-only fast-brain comparison (no listening events are written)
node --experimental-strip-types tools/brain-lab/readback.mts \\
  --library /path/library.json --events /path/events.jsonl \\
  --plan /path/plan.json --now 2026-10-07T18:00:00Z --timezone America/Chicago \\
  [--playlist ID] [--material real|synthetic|unverified] [--out /path/report.json]
Use --prompt "focus" instead of --plan to interpret one unambiguous reading.
No tuning, causal improvement claim, or fabricated propensities.`;

try {
  const args = new Map<string, string>();
  const allowed = new Set(["--library", "--events", "--plan", "--prompt", "--now", "--timezone", "--playlist", "--material", "--out"]);
  const input = process.argv.slice(2);
  if (input.includes("--help")) { console.log(HELP); process.exit(0); }
  for (let i = 0; i < input.length; i += 2) {
    const key = input[i]!;
    const value = input[i + 1];
    if (!allowed.has(key) || !value || value.startsWith("--") || args.has(key)) throw new Error(`Invalid argument ${key}`);
    args.set(key, value);
  }
  const required = (key: string) => {
    const value = args.get(key);
    if (!value) throw new Error(`${key} is required`);
    return value;
  };
  const libraryPath = resolve(required("--library"));
  const eventsPath = resolve(required("--events"));
  const timezone = required("--timezone");
  new Intl.DateTimeFormat("en", { timeZone: timezone });
  const nowText = required("--now");
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(nowText)) throw new Error("--now needs an ISO date-time with an explicit UTC offset");
  const now = Date.parse(nowText);
  if (!Number.isFinite(now)) throw new Error("--now must be a valid ISO date-time");
  if (args.has("--plan") === args.has("--prompt")) throw new Error("Choose exactly one of --plan or --prompt");
  const material = args.get("--material") ?? "unverified";
  if (!["real", "synthetic", "unverified"].includes(material)) throw new Error("Invalid --material");
  const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
  const snapshots = [libraryPath, eventsPath, ...(args.has("--plan") ? [resolve(args.get("--plan")!)] : [])]
    .map((path) => ({ path, bytes: readFileSync(path) }));
  if (args.has("--out")) {
    const out = resolve(args.get("--out")!);
    // Never replace inputs or write into their private store directories.
    if (snapshots.some((s) => out === s.path || dirname(out) === dirname(s.path))) throw new Error("--out must be outside the input store directories");
  }
  const source = new LibrarySource(libraryPath);
  const library = source.get();
  const log = new EventLog(eventsPath);
  const allEvents = log.all();
  const events = allEvents.filter((e) => e.ts <= now);
  const prompt = args.get("--prompt");
  if (prompt && (!prompt.trim() || prompt.length > 500)) throw new Error("--prompt must be 1–500 characters");
  const interpretation = prompt ? interpretGoal(prompt, { library, now }) : undefined;
  if (interpretation && (interpretation.accuracy !== "specific" || interpretation.readings.length !== 1)) {
    throw new Error(`Prompt is ${interpretation.accuracy}; resolve its asks/readings first, then supply the validated plan`);
  }
  const planInput = interpretation ? interpretation.readings[0]!.plan : JSON.parse(snapshots[2]!.bytes.toString("utf8"));
  const checked = validatePlan(planInput);
  if (!checked.ok) throw new Error(`Invalid plan: ${JSON.stringify(checked.errors)}`);
  const canonical = (id: string) => source.canonicalId(id);
  const start = performance.now();
  const epoch = deriveEpochPolicy(events, { now, timezone, library, canonical, scopePersistence: "declared" });
  const legacy = deriveFeedback(events, now, canonical, "heuristic-v1");
  const playlistId = args.get("--playlist");
  const compare = (feedback?: typeof legacy, adaptive?: typeof epoch) => {
    const result = evaluatePlan(checked, library, { ...(feedback ? { feedback } : {}), ...(adaptive ? { adaptive } : {}), playlistId });
    const ordered = sequenceTracks(result.strict, checked.plan, { library });
    return {
      policy: result.feedback_policy ?? "no-feedback", counts: result.counts, underfilled: result.underfilled,
      sequencing_notes: ordered.applied,
      strict: ordered.tracks.map((t, rank) => ({ id: t.id, rank, score: t.score, reasons: t.reasons, unverified: t.unverified })),
      near_miss_count: result.near_miss.length, warnings: result.warnings,
    };
  };
  const baseline = compare();
  const earlier = compare(legacy);
  const adaptive = compare(epoch, epoch);
  const report = {
    format: "synamp.brain-readback/1", material, evidence_state: "offline-replay-only",
    caveat: "Material is user-declared. Replay exposes differences and invariants; it does not prove accuracy, usefulness, or causal improvement. No propensities are estimated.",
    inputs: snapshots.map((s) => ({ name: s.path.split("/").at(-1), bytes: s.bytes.length, sha256: hash(s.bytes) })),
    now: new Date(now).toISOString(), timezone, playlist_id: playlistId ?? null,
    plan_hash: checked.hash, library_version: library.version,
    interpreter: interpretation?.parser ?? null,
    denominators: { library_tracks: library.tracks.length, rejected_library_rows: source.rejected, event_log_nonblank_lines: snapshots[1]!.bytes.toString("utf8").split("\n").filter((line) => line.trim()).length, parsed_deduplicated_events: allEvents.length,
      as_of_events: events.length, future_events_excluded: allEvents.length - events.length },
    axis_coverage: Object.fromEntries(CENTROID_AXES.map((axis) => [axis, { measured: library.tracks.filter((t) => typeof t.signals?.[axis] === "number" && Number.isFinite(t.signals?.[axis])).length, usable: library.tracks.filter((t) => axisReliability(t, axis).usable).length }])),
    epoch: epoch.epoch, hidden: [...epoch.epochHides()].sort(), reliability_notes: epoch.reliabilityNotes(),
    proposals: epoch.proposals(),
    baseline, legacy: earlier, adaptive,
    adjustments: adaptive.strict.map((t) => ({ track_id: t.id, ...epoch.adjust(t.id, playlistId) })),
    ranking_changes: adaptive.strict.map((t) => ({ track_id: t.id, baseline_rank: baseline.strict.find((b) => b.id === t.id)?.rank ?? null, adaptive_rank: t.rank })),
    computational_ms: Math.round((performance.now() - start) * 100) / 100,
  };
  for (const snapshot of snapshots) {
    if (hash(readFileSync(snapshot.path)) !== hash(snapshot.bytes)) throw new Error("An input changed during replay; retry with frozen snapshots");
  }
  const output = JSON.stringify(report, null, 2) + "\n";
  if (args.has("--out")) writeFileSync(resolve(args.get("--out")!), output, { flag: "wx", mode: 0o600 });
  else process.stdout.write(output);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}

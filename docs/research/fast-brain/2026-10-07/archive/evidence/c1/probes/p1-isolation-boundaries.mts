/**
 * C1 probe 1 — epoch isolation, boundaries, determinism (adversarial re-derivation).
 *
 * Independent re-check of B2/B4 claims against the ACTUAL code on the frozen tree:
 *   - isolation: appended later-day implicit events leave a past snapshot byte-identical
 *     (both directions), full JSON compare;
 *   - boundaries: gap exactly 30:00 vs 30:01, midnight, missing session_id buckets,
 *     shuffled input order;
 *   - determinism: repeated derives byte-equal incl. exploration flag OFF.
 *
 * Read-only: imports repo modules; writes nothing anywhere.
 * Run: node --experimental-strip-types p1-isolation-boundaries.mts
 */
import { readFileSync } from "node:fs";
import { deriveEpochPolicy } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/derive.ts";
import { resolveEpochs } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/epochs.ts";
import { pickExplorationSlot } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/explore.ts";
import type { ListeningEvent, Signal } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/session/events.ts";
import type { Library, LibraryTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

const FIXTURE = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain/fixtures/library.sample.json";
const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as { tracks: LibraryTrack[] };
const sampleLib: Library = { version: "sample", tracks: raw.tracks };

const TZ = "America/Chicago";
/** An instant at local h:mm:ss in America/Chicago on 2026-10-<day> (CDT, UTC-5). */
const local = (day: number, hour: number, minute = 0, second = 0): number => Date.UTC(2026, 9, day, hour + 5, minute, second);

let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `p1-${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}

let pass = 0; let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

/** Stable stringify (keys sorted recursively) so compare does not depend on insertion order. */
function stable(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) out[key] = walk((v as Record<string, unknown>)[key]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

const IDS = raw.tracks.slice(0, 60).map((t) => t.id);
function snapshot(view: ReturnType<typeof deriveEpochPolicy>, ids: string[] = IDS.slice(0, 20)): string {
  return stable({
    events: view.events,
    epoch: view.epoch,
    hides: [...view.epochHides()].sort(),
    removedPL1: [...view.removed("PL1")].sort(),
    removedPL2: [...view.removed("PL2")].sort(),
    adjusts: ids.map((id) => [id, view.adjust(id), view.adjust(id, "PL1")]),
    notes: view.reliabilityNotes(),
    proposals: view.proposals(),
  });
}

console.log("== p1: epoch isolation ==");
{
  // Epoch A: day 1 evening, session s1 — implicit + one explicit; uses sample-library tracks.
  const dayA: ListeningEvent[] = [
    ev(local(1, 21, 0), "love", "sample-001", { session_id: "s1", scope: "global" }),
    ev(local(1, 21, 1), "full_play", "sample-002", { session_id: "s1", playlist_id: "PL1" }),
    ev(local(1, 21, 2), "skip_early", "sample-026", { session_id: "s1" }),
    ev(local(1, 21, 3), "skip_early", "sample-026", { session_id: "s1" }),
    ev(local(1, 21, 4), "repeat", "sample-033", { session_id: "s1", playlist_id: "PL1" }),
  ];
  // Day 2 implicit-only stream (session s2).
  const dayB: ListeningEvent[] = [
    ev(local(2, 10, 0), "full_play", "sample-001", { session_id: "s2", playlist_id: "PL1" }),
    ev(local(2, 10, 1), "repeat", "sample-034", { session_id: "s2" }),
    ev(local(2, 10, 2), "skip_early", "sample-033", { session_id: "s2" }),
    ev(local(2, 10, 3), "skip_early", "sample-033", { session_id: "s2" }),
  ];
  const nowA = local(1, 21, 15); // 10 min after the last day-1 event

  const before = deriveEpochPolicy(dayA, { now: nowA, timezone: TZ, library: sampleLib });
  const after = deriveEpochPolicy([...dayA, ...dayB], { now: nowA, timezone: TZ, library: sampleLib });
  check("isolation fwd: appending day-2 events leaves the day-1 snapshot byte-identical", snapshot(before) === snapshot(after),
    snapshot(before) === snapshot(after) ? "" : `diff: ${firstDiff(snapshot(before), snapshot(after))}`);
  check("isolation fwd: day-2 events stay out of the active view (hidden set has the day-1 skip pair only)",
    [...after.epochHides()].join(",") === "sample-026" && after.epoch?.id === before.epoch?.id);

  // Reverse: day-2 view must not inherit day-1 IMPLICIT signals.
  // (dayA carries an explicit love — the sanctioned cross-epoch channel — so the reverse
  //  fixture uses an implicit-only day-1 stream, as epoch isolation is about implicit behaviour.)
  const dayAImplicit = dayA.filter((e) => e.signal !== "love");
  const nowB = local(2, 10, 15);
  const dayBOnly = deriveEpochPolicy(dayB, { now: nowB, timezone: TZ, library: sampleLib });
  const both = deriveEpochPolicy([...dayAImplicit, ...dayB], { now: nowB, timezone: TZ, library: sampleLib });
  check("isolation rev: day-1 implicit events do not move day-2 values (full snapshot)", snapshot(both) === snapshot(dayBOnly),
    snapshot(both) === snapshot(dayBOnly) ? "" : `diff: ${firstDiff(snapshot(both), snapshot(dayBOnly))}`);
  // And the same with the explicit love present: values DO legitimately gain the love part —
  // the probe asserts the sanctioned difference is exactly the explicit part (no implicit leakage).
  const bothExplicit = deriveEpochPolicy([...dayA, ...dayB], { now: nowB, timezone: TZ, library: sampleLib });
  const lovePart = bothExplicit.adjust("sample-001").parts.find((p) => p.label === "you loved this");
  const day2Parts = dayBOnly.adjust("sample-001").parts.map((p) => p.label).sort();
  const bothParts = bothExplicit.adjust("sample-001").parts.filter((p) => p.label !== "you loved this").map((p) => p.label).sort();
  check("isolation rev (with explicit): the only day-1 fingerprint in day-2 values is the explicit love part",
    lovePart !== undefined && Math.abs(lovePart.value - Math.round(2 * Math.pow(0.5, (nowB - local(1, 21, 0)) / (180 * 86_400_000)) * 100) / 100) < 1e-9 &&
    JSON.stringify(day2Parts) === JSON.stringify(bothParts),
    `love=${lovePart?.value} day2parts=${JSON.stringify(day2Parts)} bothParts-minus-love=${JSON.stringify(bothParts)}`);
  // Sanity: the reverse fixture is non-trivial — the two views do differ from the forward one.
  check("isolation fixture sanity: day-2 hides are the day-2 pair, not the day-1 pair",
    [...dayBOnly.epochHides()].join(",") === "sample-033");

  // Also check the day-1 key with an explicit event: the explicit channel DOES cross (by design) — assert it does, so the probe can detect a silent over-isolation too.
  const withLove = deriveEpochPolicy([...dayA], { now: nowB, timezone: TZ, library: sampleLib });
  check("explicit channel sanity: the day-1 love is visible at day-2 time (documented cross-epoch channel)",
    withLove.adjust("sample-001").value > 1.9);
}

console.log("== p1: boundaries ==");
{
  const t0 = local(2, 14, 0);
  // gap exactly 30:00 → same epoch; 30:01 → split.
  const keep = [ev(t0, "full_play", "X", { session_id: "s1" }), ev(t0 + 30 * 60_000, "started", "Y", { session_id: "s1" })];
  const split = [ev(t0, "full_play", "X", { session_id: "s1" }), ev(t0 + 30 * 60_000 + 1_000, "started", "Y", { session_id: "s1" })];
  check("gap 30:00 exactly: one epoch (strict > comparison)", resolveEpochs(keep, { timezone: TZ }).length === 1);
  check("gap 30:01: two epochs", resolveEpochs(split, { timezone: TZ }).length === 2);

  const keepNow = t0 + 30 * 60_000; // age of X's event = exactly one half-life
  const keepView = deriveEpochPolicy(keep, { now: keepNow, timezone: TZ });
  const splitView = deriveEpochPolicy(split, { now: t0 + 30 * 60_000 + 6_000, timezone: TZ });
  check("value flips with the split: 30:00 keeps the full_play (0.25·0.5 = 0.125 at one half-life), 30:01 kills it",
    Math.abs(keepView.adjust("X").value - 0.125) < 1e-9 && splitView.adjust("X").value === 0,
    `keep=${keepView.adjust("X").value} split=${splitView.adjust("X").value}`);

  // Midnight split: 60 s apart across local midnight, same session — must split by day.
  const mid = [ev(local(2, 23, 59, 30), "repeat", "X", { session_id: "s1" }), ev(local(3, 0, 0, 30), "repeat", "Y", { session_id: "s1" })];
  const epochs = resolveEpochs(mid, { timezone: TZ });
  check("midnight: 23:59:30 → 00:00:30 splits into 2 epochs despite the 60 s gap", epochs.length === 2,
    `length=${epochs.length}`);
  const midView = deriveEpochPolicy(mid, { now: local(3, 0, 5), timezone: TZ });
  check("midnight: previous day's repeat is killed, the new day's scores",
    midView.adjust("X").value === 0 && Math.abs(midView.adjust("Y").value - 0.7 * Math.pow(0.5, (4.5 * 60_000) / (30 * 60_000))) < 1e-9,
    `X=${midView.adjust("X").value} Y=${midView.adjust("Y").value}`);

  // Missing session_id buckets.
  const sandwich = [
    ev(t0, "started", "A", { session_id: "s1" }),
    ev(t0 + 2 * 60_000, "started", "B"), // no session_id at all
    ev(t0 + 4 * 60_000, "started", "C", { session_id: "s1" }),
  ];
  const runs = resolveEpochs(sandwich, { timezone: TZ });
  check("missing session_id sandwich (s1 → ∅ → s1) → 3 epochs", runs.length === 3, `length=${runs.length}`);
  check("missing bucket has empty session_ids, s1 epochs keep theirs",
    runs[0]!.session_ids.join(",") === "s1" && runs[1]!.session_ids.length === 0 && runs[2]!.session_ids.join(",") === "s1");

  const chain = [ev(t0, "started", "A"), ev(t0 + 2 * 60_000, "started", "B")];
  check("consecutive missing-id events form ONE bucket", resolveEpochs(chain, { timezone: TZ }).length === 1);

  // Shuffled input derives identically.
  const stream: ListeningEvent[] = [
    ev(t0, "love", "sample-001", { session_id: "s1", scope: "global" }),
    ev(t0 + 1_000, "full_play", "sample-002", { session_id: "s1", playlist_id: "PL1" }),
    ev(t0 + 2_000, "skip_early", "sample-026", { session_id: "s1" }),
    ev(t0 + 3_000, "skip_early", "sample-026", { session_id: "s1" }),
    ev(t0 + 4_000, "repeat", "sample-033", { session_id: "s1" }),
    ev(t0 + 5_000, "external_play", "sample-034", { session_id: "s1" }),
  ];
  const shuffled = [...stream].reverse();
  // deterministic interleave shuffle too
  const interleaved: ListeningEvent[] = [];
  for (let i = 0; i < stream.length; i += 2) interleaved.unshift(stream[i]!);
  for (let i = 1; i < stream.length; i += 2) interleaved.push(stream[i]!);
  const sn = (list: ListeningEvent[]) => snapshot(deriveEpochPolicy(list, { now: t0 + 60_000, timezone: TZ, library: sampleLib }), IDS);
  check("shuffled (reversed) input derives byte-identically", sn(shuffled) === sn(stream));
  check("shuffled (interleaved) input derives byte-identically", sn(interleaved) === sn(stream));
}

console.log("== p1: determinism + exploration OFF ==");
{
  const t0 = local(2, 9, 0);
  const stream: ListeningEvent[] = [
    ev(t0, "love", "sample-001", { session_id: "s1", scope: "global" }),
    ev(t0 + 1_000, "thumb_up", "sample-002", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 2_000, "skip_early", "sample-026", { session_id: "s1" }),
    ev(t0 + 3_000, "skip_early", "sample-026", { session_id: "s1" }),
    ev(t0 + 4_000, "repeat", "sample-033", { session_id: "s1" }),
    ev(t0 + 5_000, "thumb_down", "sample-034", { session_id: "s1", scope: "global", reason: "wrong_vibe" }),
  ];
  const opts = { now: t0 + 60_000, timezone: TZ, library: sampleLib };
  const a = deriveEpochPolicy(stream, opts);
  const b = deriveEpochPolicy(stream, opts);
  check("two derives of identical inputs are byte-equal", snapshot(a) === snapshot(b));

  const off = deriveEpochPolicy(stream, { ...opts, exploration: false });
  const on = deriveEpochPolicy(stream, { ...opts, exploration: true });
  check("exploration:false identical to absent", snapshot(off) === snapshot(a));
  check("exploration:true never alters the derived view (flag is queue-build only)", snapshot(on) === snapshot(a));

  const p1 = pickExplorationSlot({ epochId: "ep1:abc", counter: 7, candidates: ["x", "y", "z"] });
  const p2 = pickExplorationSlot({ epochId: "ep1:abc", counter: 7, candidates: ["x", "y", "z"] });
  check("pickExplorationSlot deterministic", p1 === p2 && p1 !== null, `pick=${p1}`);
}

function firstDiff(x: string, y: string): string {
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return `@${i} …${x.slice(Math.max(0, i - 60), i + 60)}… vs …${y.slice(Math.max(0, i - 60), i + 60)}…`;
  return "(equal)";
}

console.log(`\np1 summary: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

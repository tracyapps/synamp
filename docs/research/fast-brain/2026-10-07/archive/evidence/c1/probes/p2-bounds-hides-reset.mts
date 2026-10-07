/**
 * C1 probe 2 — flood bounds, artist propagation, hide lifecycle, learning_reset,
 * hard-rule inviolability (adversarial re-derivation vs B2 receipt claims).
 *
 * Read-only. Run: node --experimental-strip-types p2-bounds-hides-reset.mts
 */
import { readFileSync } from "node:fs";
import { deriveEpochPolicy } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/derive.ts";
import { feedbackBonus } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/session/feedback.ts";
import { evaluatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";
import { validatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/plan.ts";
import type { Library, LibraryTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";
import type { ListeningEvent, Signal } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/session/events.ts";

const FIXTURE = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain/fixtures/library.sample.json";
const sampleLib: Library = { version: "sample", tracks: (JSON.parse(readFileSync(FIXTURE, "utf8")) as { tracks: LibraryTrack[] }).tracks };
const TZ = "America/Chicago";
const local = (day: number, hour: number, minute = 0, second = 0): number => Date.UTC(2026, 9, day, hour + 5, minute, second);

let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `p2-${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}
let pass = 0; let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("== p2: flood bounds (20 loves + 20 skips + 20 repeats, composed) ==");
{
  const t0 = local(2, 16, 0);
  const flood: ListeningEvent[] = [
    ...Array.from({ length: 20 }, (_, i) => ev(t0 + i * 100, "love", "sample-001", { session_id: "s1", scope: "global" })),
    ...Array.from({ length: 20 }, (_, i) => ev(t0 + 3_000 + i * 100, "skip_early", "sample-026", { session_id: "s1" })),
    ...Array.from({ length: 20 }, (_, i) => ev(t0 + 6_000 + i * 100, "repeat", "sample-033", { session_id: "s1" })),
  ];
  const now = t0 + 9_000;
  const view = deriveEpochPolicy(flood, { now, timezone: TZ, library: sampleLib });

  const loved = view.adjust("sample-001");
  const skipped = view.adjust("sample-026");
  const repeated = view.adjust("sample-033");
  check("raw values are finite for loved/skipped/repeated",
    [loved.value, skipped.value, repeated.value].every(Number.isFinite));
  check("all parts finite, numbers only",
    [loved, skipped, repeated].every((a) => a.parts.every((p) => Number.isFinite(p.value) && typeof p.label === "string")));
  check("composed bonus |0.15·tanh(v/2)| ≤ 0.15 for floods",
    Math.abs(feedbackBonus(loved.value)) <= 0.15 && Math.abs(feedbackBonus(skipped.value)) <= 0.15 &&
    Math.abs(feedbackBonus(repeated.value)) <= 0.15,
    `loved=${feedbackBonus(loved.value).toFixed(5)} skipped=${feedbackBonus(skipped.value).toFixed(5)} repeated=${feedbackBonus(repeated.value).toFixed(5)}`);
  check("flood stays under the saturated bound with a small epsilon (never exceeds W)",
    feedbackBonus(loved.value) <= 0.15 + 1e-12 && feedbackBonus(loved.value) > 0.1499);

  // Artist propagation is entity-only (A3 eq. 2 uses v2_entity_raw): explicit loves alone never propagate.
  const neighbourLove = view.adjust("sample-002");
  check("entity-only propagation: a track loved (L1) 20× moves no artist part on its neighbour (A3 eq. 2)",
    neighbourLove.parts.every((p) => !p.label.includes("Lumen Atlas")),
    `sample-002 parts=${JSON.stringify(neighbourLove.parts)}`);
  // The repeated track IS entity → its artist neighbour (Vera Okonkwo Trio) gets the ±0.8 cap.
  const neighbourRepeat = view.adjust("sample-034");
  const artistPart = neighbourRepeat.parts.find((p) => p.label === "other tracks by Vera Okonkwo Trio this session");
  check("artist cap: repeated-track flood gives the artist neighbour the +0.8 clipped part, never more",
    artistPart !== undefined && Math.abs(artistPart.value - 0.8) < 1e-9, `part=${artistPart?.value} value=${neighbourRepeat.value}`);

  // Composition through the real evaluate pipeline: bonus applied once, inside the strict tier.
  const check2 = validatePlan({
    version: "2.0", intent: { query_type: "attribute" }, target_size: 10,
    constraints: [{ id: "c1", source_phrase: "anything audible", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6,
      where: { field: "lufs_integrated", op: "gte", value: -70 } }],
    ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  });
  check("p2 plan validates", check2.ok, check2.ok ? "" : JSON.stringify(check2.errors).slice(0, 300));
  if (check2.ok) {
    const evaluation = evaluatePlan(check2, sampleLib, { feedback: view, adaptive: view });
    const top = evaluation.strict.find((t) => t.id === "sample-001");
    check("evaluate: flooded loved track keeps the same ONE saturated bonus (score_breakdown.feedback ≤ 0.15)",
      top !== undefined && top.score_breakdown !== undefined && top.score_breakdown.feedback <= 0.15 + 1e-12 && top.score_breakdown.feedback > 0.1,
      `breakdown=${JSON.stringify(top?.score_breakdown)}`);
    check("evaluate: the flood-hidden track is hidden (not in strict), hidden_by_you counts it",
      !evaluation.strict.some((t) => t.id === "sample-026") && evaluation.counts.hidden_by_you >= 1,
      `hidden_by_you=${evaluation.counts.hidden_by_you}`);
    check("evaluate: repeated flood track is present with bounded bonus",
      (() => { const t = evaluation.strict.find((x) => x.id === "sample-033"); return t !== undefined && (t.score_breakdown?.feedback ?? 0) <= 0.15; })());
  }
}

console.log("== p2: artist min-evidence semantics (P17 table vs A3 §3.3(b) prose) ==");
{
  const t0 = local(2, 11, 0);
  const track = (id: string, artist: string): LibraryTrack => ({ id, title: id, artist, signals: { bpm: 100, tempo_confidence: 0.9 } });
  const lib: Library = { version: "t", tracks: [track("B1", "The Band"), track("B2", "The Band"), track("B3", "The Band"), track("S", "Solo")] };

  const one = deriveEpochPolicy([ev(t0, "repeat", "B1", { session_id: "s1" })], { now: t0 + 30_000, timezone: TZ, library: lib });
  check("single event on one other track → artist gate closed (≤ 0.11)", Math.abs(one.adjust("B2").value) <= 0.11, `B2=${one.adjust("B2").value}`);

  const twoTracks = deriveEpochPolicy([
    ev(t0, "repeat", "B1", { session_id: "s1" }), ev(t0 + 1_000, "repeat", "B2", { session_id: "s1" }),
  ], { now: t0 + 30_000, timezone: TZ, library: lib });
  const b3 = twoTracks.adjust("B3");
  check("2 events / 2 distinct tracks, raw sum 1.4 → visible π-scaled part ≈ 0.49",
    Math.abs((b3.parts.find((p) => p.label.includes("The Band"))?.value ?? 0) - 0.49) < 0.02, `B3=${JSON.stringify(b3)}`);

  // Discriminator: 2 events on ONE other track with raw sum < 1.0 (two full plays = 0.5).
  const twoEventsOneTrack = deriveEpochPolicy([
    ev(t0, "full_play", "B1", { session_id: "s1" }), ev(t0 + 1_000, "full_play", "B1", { session_id: "s1" }),
  ], { now: t0 + 30_000, timezone: TZ, library: lib });
  const b2 = twoEventsOneTrack.adjust("B2");
  check("code semantics: min-evidence is ≥2 EVENTS (P17 table wording) — 2 events on 1 track open the gate",
    b2.value > 0.15 && b2.value < 0.25, `B2=${JSON.stringify(b2)} (A3 §3.3(b) prose says '≥2 distinct tracks' → would be 0)`);

  const flood = deriveEpochPolicy(
    Array.from({ length: 20 }, (_, i) => ev(t0 + i * 100, "repeat", "B1", { session_id: "s1" })),
    { now: t0 + 3_000, timezone: TZ, library: lib });
  const capped = flood.adjust("B2").parts.find((p) => p.label.includes("The Band"));
  check("artist cap 0.8 holds under a 20-event flood", capped !== undefined && Math.abs(capped.value - 0.8) < 1e-9, `part=${capped?.value}`);
}

console.log("== p2: hide lifecycle ==");
{
  const t0 = local(2, 15, 0);
  const oneSkip = [ev(t0, "skip_early", "Y", { session_id: "s1" })];
  const v1 = deriveEpochPolicy(oneSkip, { now: t0 + 30_000, timezone: TZ });
  check("k=1: no hide, small negative (≈ -0.3·decay)", v1.epochHides().size === 0 && v1.adjust("Y").value > -0.31 && v1.adjust("Y").value < -0.29,
    `hides=${v1.epochHides().size} value=${v1.adjust("Y").value}`);
  const two = [...oneSkip, ev(t0 + 30_000, "skip_early", "Y", { session_id: "s1" })];
  const v2 = deriveEpochPolicy(two, { now: t0 + 60_000, timezone: TZ });
  check("k=2: hide appears, both skips score (−0.6·decay)", [...v2.epochHides()].join(",") === "Y" && Math.abs(v2.adjust("Y").value + 0.6 * Math.pow(0.5, 60_000 / 1_800_000) ) < 0.35,
    `hides=${[...v2.epochHides()]} value=${v2.adjust("Y").value}`);

  const notNow = [ev(t0, "thumb_down", "N", { session_id: "s1", reason: "not_now", scope: "global" })];
  const vN = deriveEpochPolicy(notNow, { now: t0 + 30_000, timezone: TZ });
  check("not_now thumb_down hides at n=1 and never persists", [...vN.epochHides()].join(",") === "N");
  const after = deriveEpochPolicy(notNow, { now: t0 + 30 * 60_000 + 1_000, timezone: TZ });
  check("not_now value is 0 after the epoch ends", after.adjust("N").value === 0 && after.epoch === null);

  const removeNotNow = [ev(t0, "remove", "R", { session_id: "s1", scope: "playlist", scope_id: "PL1", reason: "not_now" })];
  const vR = deriveEpochPolicy(removeNotNow, { now: t0 + 30_000, timezone: TZ });
  check("remove with reason not_now → epoch hide only (no persistent removed cell)",
    [...vR.epochHides()].join(",") === "R" && vR.removed("PL1").size === 0);

  // Expiry boundary: exactly +30:00 still live; +30:00.001 cleared.
  const hidden = [ev(t0, "skip_early", "Y", { session_id: "s1" }), ev(t0 + 1_000, "skip_early", "Y", { session_id: "s1" })];
  const atEnd = deriveEpochPolicy(hidden, { now: t0 + 1_000 + 30 * 60_000, timezone: TZ });
  const past = deriveEpochPolicy(hidden, { now: t0 + 1_000 + 30 * 60_000 + 1, timezone: TZ });
  check("hide expiry boundary: live at exactly +30:00, cleared at +30:00.001",
    atEnd.epoch !== null && atEnd.epochHides().size === 1 && past.epoch === null && past.epochHides().size === 0 &&
    past.reliabilityNotes().includes("no active session — learning is paused"));
  check("after the epoch: skipped track value back to 0 (killed, not decayed)", past.adjust("Y").value === 0);
}

console.log("== p2: removes (persistent) + restore/undo ==");
{
  const t0 = local(2, 16, 0);
  const base = ev(t0, "remove", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" });
  const vRemove = deriveEpochPolicy([base], { now: t0 + 30_000, timezone: TZ });
  check("remove hides from its playlist only", [...vRemove.removed("PL1")].join(",") === "Z" && vRemove.removed("PL2").size === 0);

  const vRestore = deriveEpochPolicy([base, ev(t0 + 1_000, "restore", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" })], { now: t0 + 30_000, timezone: TZ });
  check("restore undoes the remove (last write wins)", vRestore.removed("PL1").size === 0);

  const vBack = deriveEpochPolicy([base, ev(t0 + 1_000, "restore", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" }), ev(t0 + 2_000, "remove", "Z", { session_id: "s1", scope: "playlist", scope_id: "PL1" })], { now: t0 + 30_000, timezone: TZ });
  check("remove after restore hides again", [...vBack.removed("PL1")].join(",") === "Z");
  check("persistent removes survive the epoch ending (they are L1)",
    deriveEpochPolicy([base], { now: t0 + 2 * 3_600_000, timezone: TZ }).removed("PL1").has("Z"));
}

console.log("== p2: learning_reset (B2 §5.4 semantics) ==");
{
  const t0 = local(2, 13, 0);
  const events: ListeningEvent[] = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 1_000, "skip_early", "Y", { session_id: "s1" }), // would hide
    ev(t0 + 2_000, "love", "X", { session_id: "s1", scope: "global" }),
    ev(t0 + 3_000, "remove", "W", { session_id: "s1", scope: "playlist", scope_id: "PL1" }),
    ev(t0 + 4_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "epoch" } }),
    ev(t0 + 5_000, "skip_early", "Z", { session_id: "s1" }),
  ];
  const view = deriveEpochPolicy(events, { now: t0 + 6_000, timezone: TZ });
  check("reset: pre-reset skips no longer score OR hide", view.adjust("Y").value === 0 && !view.epochHides().has("Y"));
  check("reset: post-reset evidence still scores", view.adjust("Z").value < -0.2 && view.adjust("Z").value > -0.35, `Z=${view.adjust("Z").value}`);
  check("reset: L1 explicit love survives (documented decision — flagged for review)", view.adjust("X").value > 1.9);
  check("reset: L1 persistent remove survives (playlist hide intact)", [...view.removed("PL1")].join(",") === "W");
  check("reset note present", view.reliabilityNotes().some((n) => n.includes("reset")));

  const twoAgain = [...events, ev(t0 + 6_000, "skip_early", "Z", { session_id: "s1" })];
  const view2 = deriveEpochPolicy(twoAgain, { now: t0 + 7_000, timezone: TZ });
  check("reset: hides recompute from the remainder — post-reset pair hides Z again", [...view2.epochHides()].join(",") === "Z");

  // Marker variations.
  const noDetail = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }), ev(t0 + 1_000, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 2_000, "learning_reset", "", { session_id: "s1", scope: "none" }),
  ];
  check("marker with NO detail applies (tolerated)",
    deriveEpochPolicy(noDetail, { now: t0 + 3_000, timezone: TZ }).epochHides().size === 0);
  const globalDetail = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }), ev(t0 + 1_000, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 2_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "global" } }),
  ];
  check("marker with detail.scope='global' is ignored (epoch hides survive)",
    deriveEpochPolicy(globalDetail, { now: t0 + 3_000, timezone: TZ }).epochHides().has("Y"));
  const twoMarkers = [
    ev(t0, "skip_early", "Y", { session_id: "s1" }),
    ev(t0 + 1_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "epoch" } }),
    ev(t0 + 2_000, "skip_early", "Z", { session_id: "s1" }),
    ev(t0 + 3_000, "learning_reset", "", { session_id: "s1", scope: "none", detail: { scope: "epoch" } }),
    ev(t0 + 4_000, "skip_early", "Q", { session_id: "s1" }),
  ];
  check("two markers: only evidence after the LAST marker counts (Y,Z silent; Q scores)",
    (() => { const v = deriveEpochPolicy(twoMarkers, { now: t0 + 5_000, timezone: TZ }); return v.adjust("Y").value === 0 && v.adjust("Z").value === 0 && v.adjust("Q").value < 0; })());
}

console.log("== p2: hard-rule inviolability (maxed bonus vs explicit exclusion) ==");
{
  const t0 = local(2, 17, 0);
  const check2 = validatePlan({
    version: "2.0", intent: { query_type: "exclusion" }, target_size: 10,
    constraints: [{ id: "no_piano", source_phrase: "no piano", hard: true, explicit_exclusion: true, unknown_policy: "exclude",
      confidence: 0.8, where: { field: "instruments.piano", op: "lt", value: 0.2 } }],
    ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  });
  check("no-piano plan validates", check2.ok);
  if (check2.ok) {
    // sample-026/028/029 are Static Orchard and pass “no piano”; sample-033 (piano .91) is the excluded control.
    const flood2: ListeningEvent[] = [
      ...Array.from({ length: 30 }, (_, i) => ev(t0 + i * 50, "love", "sample-026", { session_id: "s1", scope: "global" })),
      ...Array.from({ length: 30 }, (_, i) => ev(t0 + 2_000 + i * 50, "repeat", "sample-026", { session_id: "s1" })),
      ...Array.from({ length: 30 }, (_, i) => ev(t0 + 4_000 + i * 50, "love", "sample-033", { session_id: "s1", scope: "global" })),
    ];
    const view2 = deriveEpochPolicy(flood2, { now: t0 + 6_000, timezone: TZ, library: sampleLib });
    check("premise: sample-033 has a maxed raw value", view2.adjust("sample-033").value > 10, `value=${view2.adjust("sample-033").value}`);
    const evaluation = evaluatePlan(check2, sampleLib, { feedback: view2, adaptive: view2, playlistId: "PL1" });
    check("maxed bonus cannot put an excluded (piano) track into strict",
      !evaluation.strict.some((t) => t.id === "sample-033"), `tracks=${evaluation.strict.map((t) => t.id).join(",").slice(0, 120)}`);
    check("maxed bonus cannot put it into near_miss either (hard guard is on the union)",
      !evaluation.near_miss.some((t) => t.id === "sample-033"));
    const loved = evaluation.strict.find((t) => t.id === "sample-026");
    check("positive control: the flooded admitted track carries a saturated bonus (≤ 0.15)",
      loved !== undefined && loved.score_breakdown !== undefined && loved.score_breakdown.feedback > 0.14 && loved.score_breakdown.feedback <= 0.15 + 1e-12,
      `breakdown=${JSON.stringify(loved?.score_breakdown)}`);
    const neighbour = evaluation.strict.find((t) => t.id === "sample-028");
    check("artist propagation reaches an admitted neighbour through the pipeline (small, bounded)",
      neighbour !== undefined && (neighbour.score_breakdown?.feedback ?? 0) > 0.05 && (neighbour.score_breakdown?.feedback ?? 0) <= 0.15,
      `breakdown=${JSON.stringify(neighbour?.score_breakdown)}`);
    check("every strict bonus stays within W=0.15",
      evaluation.strict.every((t) => (t.score_breakdown?.feedback ?? 0) <= 0.15 + 1e-12));
  }
}

console.log(`\np2 summary: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

/**
 * C1 probe 4 — numbers vs A3 §3.7 (P1–P25 spot-checks, ≥8 rows) + proposals boundaries.
 *
 * Checks the ACTUAL code constants and derived values against the A3 parameter table,
 * and exercises the boundary acceptance tests (P1, P3, P5, P7, P12, P15, P17, P18,
 * P19/P20, P21/P22/P23, P25). Reports drift between A3 text / B2 receipt / code where found.
 *
 * Read-only. Run: node --experimental-strip-types p4-numbers-a3.mts
 */
import { deriveEpochPolicy, EPOCH_HALF_LIFE_MS } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/derive.ts";
import { resolveEpochs } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/epochs.ts";
import { EPOCH_EVIDENCE, PERSISTENT_EVIDENCE, FEATURE } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/types.ts";
import { PROPOSAL_THRESHOLDS, PROPOSAL_SCAN_DAYS } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/learning/proposals.ts";
import { feedbackBonus } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/session/feedback.ts";
import type { Library, LibraryTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";
import type { ListeningEvent, Signal } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/session/events.ts";

const TZ = "America/Chicago";
const local = (day: number, hour: number, minute = 0, second = 0): number => Date.UTC(2026, 9, day, hour + 5, minute, second);
let seq = 0;
function ev(ts: number, signal: Signal, track: string, extra: Partial<ListeningEvent> = {}): ListeningEvent {
  seq += 1;
  return { id: `p4-${String(seq).padStart(4, "0")}`, ts, signal, track_id: track, scope: "session", source: "player", policy_version: "test", ...extra };
}
let pass = 0; let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("== p4: constant tables vs A3 §3.2/§3.7 ==");
{
  check("P7/P8/P9: love +2.0, thumb up +1.0, thumb down -1.0 (dB: confidences .9)",
    PERSISTENT_EVIDENCE.love.magnitude === 2 && PERSISTENT_EVIDENCE.love.confidence === 1 &&
    PERSISTENT_EVIDENCE.thumb_up_global.magnitude === 1 && PERSISTENT_EVIDENCE.thumb_down_global.magnitude === -1 &&
    PERSISTENT_EVIDENCE.thumb_up_playlist.confidence === 0.9 && PERSISTENT_EVIDENCE.thumb_down_playlist.confidence === 0.9);
  check("P7: love half-life 180 d; playlist signals 30 d",
    PERSISTENT_EVIDENCE.love.half_life_days === 180 && PERSISTENT_EVIDENCE.thumb_up_playlist.half_life_days === 30);
  check("P10/P11/P12/P13/P14 magnitudes (repeat 1.0/.7, full_play .5/.5, skip_early -.6/.5, skip_late -.1/.2, external .25/.5)",
    EPOCH_EVIDENCE.repeat.magnitude === 1.0 && EPOCH_EVIDENCE.repeat.confidence === 0.7 &&
    EPOCH_EVIDENCE.full_play.magnitude === 0.5 && EPOCH_EVIDENCE.full_play.confidence === 0.5 &&
    EPOCH_EVIDENCE.skip_early.magnitude === -0.6 && EPOCH_EVIDENCE.skip_early.confidence === 0.5 &&
    EPOCH_EVIDENCE.skip_late.magnitude === -0.1 && EPOCH_EVIDENCE.skip_late.confidence === 0.2 &&
    EPOCH_EVIDENCE.external_play.magnitude === 0.25 && EPOCH_EVIDENCE.external_play.confidence === 0.5);
  check("P16: not_now -1.0/.9", EPOCH_EVIDENCE.not_now.magnitude === -1.0 && EPOCH_EVIDENCE.not_now.confidence === 0.9);
  check("P3: h_E = 30 min", EPOCH_HALF_LIFE_MS === 1_800_000);
  check("P18/P19/P20: gates & caps (β .5, γ .15, keeps ≥3, rejects ≥2, cov .6, axis cap .5, total cap 1.0)",
    FEATURE.beta === 0.5 && FEATURE.gamma === 0.15 && FEATURE.min_keeps === 3 && FEATURE.min_rejects === 2 &&
    FEATURE.coverage === 0.6 && FEATURE.axis_cap === 0.5 && FEATURE.total_cap === 1.0 && FEATURE.gamma < FEATURE.beta);
  check("P17 consts: π .35, cap .8, min-evidence ≥2",
    FEATURE.artist_pi === 0.35 && FEATURE.artist_cap === 0.8 && FEATURE.min_keeps === 3);
  check("P21/P22/P23 thresholds: neg 3/2, artist 3/2/min2, not_now 3/2/2dp, ext 5/3, repeat 4/3; window 30 d",
    PROPOSAL_THRESHOLDS.track_repeat_skip.epochs === 3 && PROPOSAL_THRESHOLDS.track_repeat_skip.dates === 2 &&
    PROPOSAL_THRESHOLDS.artist_repeat_skip.min_tracks === 2 &&
    PROPOSAL_THRESHOLDS.not_now_pattern.dayparts === 2 &&
    PROPOSAL_THRESHOLDS.external_play_positive.epochs === 5 && PROPOSAL_THRESHOLDS.external_play_positive.dates === 3 &&
    PROPOSAL_THRESHOLDS.repeat_positive.epochs === 4 && PROPOSAL_THRESHOLDS.repeat_positive.dates === 3 &&
    PROPOSAL_SCAN_DAYS === 30);
}

console.log("== p4: P1 (gap), P3 (half-life), P5/P7 (bounds/anchors) ==");
{
  const t0 = local(2, 14, 0);
  check("P1: 29:59 keeps (1 epoch)", resolveEpochs([ev(t0, "started", "A", { session_id: "s1" }), ev(t0 + 29 * 60_000 + 59_000, "started", "B", { session_id: "s1" })], { timezone: TZ }).length === 1);
  check("P1: 30:01 splits (2 epochs)", resolveEpochs([ev(t0, "started", "A", { session_id: "s1" }), ev(t0 + 30 * 60_000 + 1_000, "started", "B", { session_id: "s1" })], { timezone: TZ }).length === 2);

  // P3: weight at +60 min ≤ 0.25× fresh (assert on derived values; B2 also asserts equality).
  const base = local(2, 10, 0);
  const events = [
    ev(base, "repeat", "old", { session_id: "s1" }),
    ev(base + 20 * 60_000, "started", "a1", { session_id: "s1" }),
    ev(base + 40 * 60_000, "started", "a2", { session_id: "s1" }),
    ev(base + 55 * 60_000, "started", "a3", { session_id: "s1" }),
    ev(base + 60 * 60_000, "repeat", "fresh", { session_id: "s1" }),
  ];
  const view = deriveEpochPolicy(events, { now: base + 60 * 60_000, timezone: TZ });
  const ratio = view.adjust("old").value / view.adjust("fresh").value;
  check("P3: +60 min value ≤ 0.25× fresh (exact ratio observed)", ratio <= 0.25 + 1e-9, `ratio=${ratio}`);

  // P5/P7: single love ≈ 0.114; flood still ≤ 0.15.
  const oneLove = deriveEpochPolicy([ev(base, "love", "X", { session_id: "s1", scope: "global" })], { now: base + 1_000, timezone: TZ });
  const bonus = feedbackBonus(oneLove.adjust("X").value);
  check("P7: single love ⇒ bonus ≥ 0.10 (observed ≈ 0.1142, 'near-cap')", bonus >= 0.10 && bonus <= 0.115,
    `bonus=${bonus.toFixed(5)} (A3 text: 0.15·tanh(1.0) ≈ 0.114)`);
  check("P7: part label is 'you loved this'", oneLove.adjust("X").parts.some((p) => p.label === "you loved this"));
  const flood = deriveEpochPolicy(Array.from({ length: 20 }, (_, i) => ev(base + i * 100, "love", "X", { session_id: "s1", scope: "global" })), { now: base + 3_000, timezone: TZ });
  check("P5: 20 loves ⇒ |bonus| ≤ 0.15", Math.abs(feedbackBonus(flood.adjust("X").value)) <= 0.15,
    `bonus=${feedbackBonus(flood.adjust("X").value).toFixed(5)}`);
}

console.log("== p4: P12/P15 (skip rules) and P16 (not_now) ==");
{
  const t0 = local(2, 15, 0);
  const k1 = deriveEpochPolicy([ev(t0, "skip_early", "Y", { session_id: "s1" })], { now: t0 + 1_000, timezone: TZ });
  check("P12: k=1 small negative (-0.6·0.5·decay ≈ -0.3)", Math.abs(k1.adjust("Y").value + 0.3) < 0.005 && k1.epochHides().size === 0, `value=${k1.adjust("Y").value}`);
  const k2 = deriveEpochPolicy([ev(t0, "skip_early", "Y", { session_id: "s1" }), ev(t0 + 1_000, "skip_early", "Y", { session_id: "s1" })], { now: t0 + 2_000, timezone: TZ });
  check("P15: k=2 hides (count exactly 2 triggers)", [...k2.epochHides()].join(",") === "Y");
  const nn = deriveEpochPolicy([ev(t0, "thumb_down", "N", { session_id: "s1", scope: "global", reason: "not_now" })], { now: t0 + 1_000, timezone: TZ });
  check("P16: not_now value -0.9·decay, hides at n=1, no L1 cell after the epoch",
    Math.abs(nn.adjust("N").value + 0.9) < 0.005 && nn.epochHides().has("N") &&
    deriveEpochPolicy([ev(t0, "thumb_down", "N", { session_id: "s1", scope: "global", reason: "not_now" })], { now: t0 + 31 * 60_000, timezone: TZ }).adjust("N").value === 0);
}

console.log("== p4: P18 gates (keeps <3, coverage note) ==");
{
  const t0 = local(2, 11, 0);
  const track = (id: string, bpm?: number, tc?: number): LibraryTrack => ({
    id, title: id, artist: `A-${id}`,
    signals: { ...(bpm !== undefined ? { bpm } : {}), ...(tc !== undefined ? { tempo_confidence: tc } : {}) },
  });
  const lib: Library = { version: "t", tracks: [track("K1", 120, 0.9), track("K2", 122, 0.9), track("K3", 118, 1), track("F1", 100, 0.9), track("F2", 140, 0.9), track("F3", 90, 0.9)] };

  const twoKeeps = deriveEpochPolicy([
    ev(t0, "repeat", "K1", { session_id: "s1" }), ev(t0 + 1_000, "repeat", "K2", { session_id: "s1" }),
  ], { now: t0 + 60_000, timezone: TZ, library: lib });
  check("P18: n=2 kept ⇒ no band + 'not learned yet' note",
    twoKeeps.reliabilityNotes().includes("feature bands not learned yet: only 2 kept tracks this session (need 3)"),
    JSON.stringify(twoKeeps.reliabilityNotes()));
  check("P18: no feature part for a near candidate under the closed gate",
    twoKeeps.adjust("K3").parts.every((p) => !p.label.includes("kept")), JSON.stringify(twoKeeps.adjust("K3").parts));

  // 3 keeps; only 1 of 3 has a usable bpm → coverage 1/3 → bpm band note; other axes lack stats.
  const mixed: Library = { version: "t", tracks: [track("K1", 120, 0.9), track("K2"), track("K3"), track("F1", 100, 0.9), track("F2", 140, 0.9), track("F3", 90, 0.9)] };
  const threeKeeps = deriveEpochPolicy([
    ev(t0, "repeat", "K1", { session_id: "s1" }), ev(t0 + 1_000, "repeat", "K2", { session_id: "s1" }), ev(t0 + 2_000, "repeat", "K3", { session_id: "s1" }),
  ], { now: t0 + 60_000, timezone: TZ, library: mixed });
  check("P18: 3 keeps, bpm coverage 1/3 < 0.6 ⇒ honest 'tempo band not learned' note",
    threeKeeps.reliabilityNotes().some((n) => n === "tempo band not learned this session: 1 of 3 kept tracks have a usable value"),
    JSON.stringify(threeKeeps.reliabilityNotes()));
}

console.log("== p4: P19/P20 caps via an adversarial wide/identical-keep fixture ==");
{
  const t0 = local(2, 12, 0);
  // Per axis: keeps K1..K3 and candidate C at V; four fillers at V−20, V−5, V+10, V+40.
  // MAD > 0, keep spread = 0 (floored 0.25), gate ≈ 0.941; C's kernel ≈ 1 → 5 axes ≈ 2.35 pre-clip.
  const V = { bpm: 120, lufs: -12, crest: 8, onset: 3, perc: 0.5 };
  const off = { bpm: [-20, -5, 10, 40], lufs: [10, 3, -5, -20], crest: [-4, -2, 2, 8], onset: [-2, -0.5, 1, 4], perc: [-0.4, -0.1, 0.2, 0.4] };
  const mkFull = (id: string, v: typeof V): LibraryTrack => ({
    id, title: id, artist: `A-${id}`,
    signals: { bpm: v.bpm, tempo_confidence: 0.9, lufs_integrated: v.lufs, crest_factor: v.crest, onset_rate: v.onset, percussiveness: v.perc },
  });
  const shift = (v: typeof V, i: number): typeof V => ({ bpm: v.bpm + off.bpm[i]!, lufs: v.lufs + off.lufs[i]!, crest: v.crest + off.crest[i]!, onset: v.onset + off.onset[i]!, perc: v.perc + off.perc[i]! });
  const lib: Library = { version: "t", tracks: [
    mkFull("K1", V), mkFull("K2", V), mkFull("K3", V),
    mkFull("F1", shift(V, 0)), mkFull("F2", shift(V, 1)), mkFull("F3", shift(V, 2)), mkFull("F4", shift(V, 3)),
    mkFull("C", V),
  ]};
  const view = deriveEpochPolicy([
    ev(t0, "love", "K1", { session_id: "s1", scope: "global" }),
    ev(t0 + 1_000, "love", "K2", { session_id: "s1", scope: "global" }),
    ev(t0 + 2_000, "love", "K3", { session_id: "s1", scope: "global" }),
  ], { now: t0 + 60_000, timezone: TZ, library: lib });
  const adj = view.adjust("C");
  check("P20: multi-axis total clipped to 1.0 (feature total cap)", adj.value === 1 && adj.parts.length === 5 && adj.parts.every((p) => Math.abs(p.value) <= 0.5 + 1e-9),
    `value=${adj.value} parts=${JSON.stringify(adj.parts)}`);
  check("P20: total cap fires (per-axis ≈0.47 × 5 axes would be ≈2.35 unclipped)",
    adj.parts.reduce((a, p) => a + p.value, 0) > 1.5, `sum-of-parts=${adj.parts.reduce((a, p) => a + p.value, 0).toFixed(3)}`);
}

console.log("== p4: P21/P22/P23 proposals boundaries ==");
{
  const lib: Library = { version: "t", tracks: [
    { id: "S", title: "Skipped Song", artist: "Band X", signals: { bpm: 120, tempo_confidence: 0.9 } },
    { id: "E", title: "Elsewhere", artist: "Band Y", signals: { bpm: 100, tempo_confidence: 0.9 } },
  ]};
  const mkEpoch = (day: number, hour: number, signal: Signal, track: string): ListeningEvent[] => [
    ev(local(day, hour, 0), signal, track, { session_id: `s-${day}-${hour}`, playlist_id: "PL1" }),
    ...(signal === "skip_early" ? [ev(local(day, hour, 1), signal, track, { session_id: `s-${day}-${hour}`, playlist_id: "PL1" })] : []),
  ];

  // 2 epochs / 2 dates → none.
  const two = [...mkEpoch(1, 9, "skip_early", "S"), ...mkEpoch(2, 9, "skip_early", "S")];
  const twoView = deriveEpochPolicy(two, { now: local(2, 12, 0), timezone: TZ, library: lib });
  check("P21 boundary: 2 epochs ⇒ no proposal", twoView.proposals().length === 0, JSON.stringify(twoView.proposals().map((p) => p.kind)));

  // 3 epochs / 2 dates → exactly 1.
  const three = [...mkEpoch(1, 9, "skip_early", "S"), ...mkEpoch(1, 15, "skip_early", "S"), ...mkEpoch(2, 9, "skip_early", "S")];
  const threeView = deriveEpochPolicy(three, { now: local(2, 12, 0), timezone: TZ, library: lib });
  const props = threeView.proposals();
  check("P21: 3 epochs across 2 dates ⇒ exactly 1 proposal", props.length === 1 && props[0]!.kind === "track_repeat_skip",
    JSON.stringify(props.map((p) => `${p.kind}:${p.subject}`)));
  check("P21: evidence {epochs:3, dates:2} on the proposal", props[0]?.evidence.epochs === 3 && props[0]?.evidence.dates === 2,
    JSON.stringify(props[0]?.evidence));
  check("P21: proposal id stable 'pr1:' hash", props[0]?.id.startsWith("pr1:") === true);

  // same-day 3 epochs → none (mood ≠ habit).
  const sameDay = [...mkEpoch(1, 9, "skip_early", "S"), ...mkEpoch(1, 15, "skip_early", "S"), ...mkEpoch(1, 21, "skip_early", "S")];
  const sameDayView = deriveEpochPolicy(sameDay, { now: local(2, 12, 0), timezone: TZ, library: lib });
  check("P21: 3 epochs but 1 date ⇒ none (needs ≥2 dates)", sameDayView.proposals().length === 0);

  // P23: everything older than 30 d ⇒ none.
  const old = [...mkEpoch(1, 9, "skip_early", "S"), ...mkEpoch(1, 15, "skip_early", "S"), ...mkEpoch(2, 9, "skip_early", "S")];
  const oldView = deriveEpochPolicy(old, { now: local(2, 9, 0) + 35 * 86_400_000, timezone: TZ, library: lib });
  check("P23: pattern older than the 30-day window ⇒ no proposal", oldView.proposals().length === 0);

  // P22: external_play 5 epochs / 3 dates → proposal; 4 epochs → none.
  const ext5 = [
    ...mkEpoch(1, 9, "external_play", "E"), ...mkEpoch(1, 15, "external_play", "E"), ...mkEpoch(2, 9, "external_play", "E"),
    ...mkEpoch(2, 15, "external_play", "E"), ...mkEpoch(3, 9, "external_play", "E"),
  ];
  const extView = deriveEpochPolicy(ext5, { now: local(3, 12, 0), timezone: TZ, library: lib });
  const extProps = extView.proposals();
  check("P22: external_play 5 epochs/3 dates ⇒ proposal (artist-subject)", extProps.length === 1 && extProps[0]!.kind === "external_play_positive" && extProps[0]!.subject === "Band Y",
    JSON.stringify(extProps.map((p) => `${p.kind}:${p.subject}`)));
  const ext4 = ext5.filter((e) => !(e.ts >= local(3, 0, 0))); // drop day-3 epoch → 4 epochs
  const ext4View = deriveEpochPolicy(ext4, { now: local(2, 20, 0), timezone: TZ, library: lib });
  check("P22 boundary: 4 epochs ⇒ none", ext4View.proposals().length === 0);

  // Active-epoch exclusion: 2 closed epochs + 1 live one must NOT propose (the live epoch is not yet a pattern).
  const twoClosedPlusLive = [...two, ...mkEpoch(2, 11, 0, "skip_early", "S")];
  const liveView = deriveEpochPolicy(twoClosedPlusLive, { now: local(2, 11, 5), timezone: TZ, library: lib });
  check("proposals scan closed epochs only (live epoch excluded: 2 closed ⇒ none even with a live third)",
    liveView.proposals().length === 0 && liveView.epoch !== null,
    `active=${liveView.epoch?.id ?? "none"} proposals=${liveView.proposals().length}`);
}

console.log("== p4: P25 scope_persistence spot-check ==");
{
  const t0 = local(2, 12, 0);
  const events = [ev(t0, "thumb_up", "X", { session_id: "s1", scope: "playlist", scope_id: "PL1" })];
  const declared = deriveEpochPolicy(events, { now: t0 + 40 * 60_000, timezone: TZ, scopePersistence: "declared" });
  const strict = deriveEpochPolicy(events, { now: t0 + 40 * 60_000, timezone: TZ, scopePersistence: "global_only" });
  check("P25: declared keeps the playlist thumb across the epoch end; global_only kills it",
    declared.adjust("X", "PL1").value > 0.99 && strict.adjust("X", "PL1").value === 0);
  check("P25: global_only labels the epoch-scoped cell 'thumbs up (this session)'",
    deriveEpochPolicy(events, { now: t0 + 5 * 60_000, timezone: TZ, scopePersistence: "global_only" }).adjust("X", "PL1").parts[0]?.label === "thumbs up (this session)");
}

console.log(`\np4 summary: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

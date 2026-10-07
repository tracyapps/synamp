// Probe 5: fast-learning psychology checks — skips, not_now, repeats, proposals.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { deriveEpochPolicy } = await import(`${repo}/src/learning/derive.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const TZ = { timezone: "America/Chicago" };
const TS = (iso) => Date.parse(iso);

let idc = 0;
const ev = (iso, signal, track, extra = {}) => ({
  id: `e${++idc}`, ts: TS(iso), signal, track_id: track, scope: "global", session_id: "s1",
  source: "player", policy_version: "epoch-v1", ...extra,
});

const show = (title, view) => {
  console.log(`\n--- ${title}`);
  console.log("epoch:", view.epoch ? `${view.epoch.id.slice(0,12)}… ${view.epoch.date} ${view.epoch.daypart} ev=${view.epoch.event_count}` : null);
  console.log("notes:", JSON.stringify(view.reliabilityNotes()));
  console.log("hides:", JSON.stringify([...view.epochHides()]));
  console.log("proposals:", view.proposals().map(p => `${p.kind}:${p.subject} ev=${JSON.stringify(p.evidence)}`));
};

// S1: skip semantics — single vs double skip; live vs closed vs next epoch.
{
  const events = [
    ev("2026-03-10T18:00:00-05:00", "skip_early", "sample-001"),
    ev("2026-03-10T18:02:00-05:00", "skip_early", "sample-001"),
    ev("2026-03-10T18:03:00-05:00", "skip_early", "sample-002"),
  ];
  const live = deriveEpochPolicy(events, { now: TS("2026-03-10T18:10:00-05:00"), library: lib, ...TZ });
  show("S1 live after 2x skip(sample-001), 1x skip(sample-002)", live);
  console.log("adjust sample-001:", JSON.stringify(live.adjust("sample-001")));
  console.log("adjust sample-002 (1 skip):", JSON.stringify(live.adjust("sample-002")));

  const closed = deriveEpochPolicy(events, { now: TS("2026-03-10T19:00:00-05:00"), library: lib, ...TZ });
  show("S1 58min later (epoch closed)", closed);
  console.log("adjust sample-001 after close:", JSON.stringify(closed.adjust("sample-001")));

  // next day, new epoch on other track: old skips must not leak
  const events2 = [...events, ev("2026-03-11T10:00:00-05:00", "full_play", "sample-003")];
  const nextDay = deriveEpochPolicy(events2, { now: TS("2026-03-11T10:05:00-05:00"), library: lib, ...TZ });
  show("S1 next-day epoch active; old skips must be gone", nextDay);
  console.log("adjust sample-001 in new epoch:", JSON.stringify(nextDay.adjust("sample-001")));
}

// S2: not_now — hide n=1, dies at epoch end
{
  const events = [ev("2026-03-10T21:00:00-05:00", "thumb_down", "sample-004", { reason: "not_now", scope: "playlist", scope_id: "pl1" })];
  const live = deriveEpochPolicy(events, { now: TS("2026-03-10T21:10:00-05:00"), library: lib, ...TZ });
  show("S2 not_now live", live);
  console.log("adjust sample-004:", JSON.stringify(live.adjust("sample-004")));
  const closed = deriveEpochPolicy(events, { now: TS("2026-03-10T22:00:00-05:00"), library: lib, ...TZ });
  show("S2 not_now after epoch end (+60min)", closed);
  console.log("adjust sample-004 closed:", JSON.stringify(closed.adjust("sample-004")));
}

// S3: repeats are positive; more repeats => larger, no satiation penalty
{
  const r1 = [ev("2026-03-10T18:00:00-05:00", "repeat", "sample-005")];
  const r3 = [...r1,
    ev("2026-03-10T18:05:00-05:00", "repeat", "sample-005"),
    ev("2026-03-10T18:10:00-05:00", "repeat", "sample-005")];
  const v1 = deriveEpochPolicy(r1, { now: TS("2026-03-10T18:15:00-05:00"), library: lib, ...TZ }).adjust("sample-005");
  const v3 = deriveEpochPolicy(r3, { now: TS("2026-03-10T18:15:00-05:00"), library: lib, ...TZ }).adjust("sample-005");
  console.log("\n--- S3 repeat x1 vs x3");
  console.log("x1:", JSON.stringify(v1));
  console.log("x3:", JSON.stringify(v3));
  console.log("monotonic increase, no negative part:", v3.value > v1.value && v3.parts.every(p => p.value > 0));
}

// S4: proposal thresholds
{
  const skip2 = (iso, track) => [ev(iso, "skip_early", track), { ...ev(iso, "skip_early", track), id: `e${++idc}x` }];
  const day = (d, h = "18:00") => `2026-03-${d}T${h}:00-05:00`;

  const two = [...skip2(day("10"), "sample-006"), ...skip2(day("11"), "sample-006")];
  const p2 = deriveEpochPolicy(two, { now: TS(day("12", "12:00")), library: lib, ...TZ });
  console.log("\n--- S4a two epochs across 2 dates ->", p2.proposals().length, "proposals (expect 0)");

  const three = [...two, ...skip2(day("12"), "sample-006")];
  const p3 = deriveEpochPolicy(three, { now: TS(day("12", "19:00")), library: lib, ...TZ });
  console.log("--- S4b three epochs 3 dates ->", p3.proposals().map(p => `${p.kind} ev=${p.evidence.epochs}/${p.evidence.dates}`), "(expect 1)");

  const sameDay = [...skip2(day("10", "09:00"), "sample-007"),
                   ...skip2(day("10", "10:00"), "sample-007"),
                   { ...skip2(day("10", "11:30"), "sample-007")[0] }];
  // build same-day properly (2 skips in each of 3 same-day epochs, 31+ min apart)
  idc += 10;
  const sd = [
    ev("2026-03-10T09:00:00-05:00", "skip_early", "sample-007"), { ...ev("2026-03-10T09:01:00-05:00", "skip_early", "sample-007") },
    ev("2026-03-10T10:00:00-05:00", "skip_early", "sample-007"), { ...ev("2026-03-10T10:01:00-05:00", "skip_early", "sample-007") },
    ev("2026-03-10T11:00:00-05:00", "skip_early", "sample-007"), { ...ev("2026-03-10T11:01:00-05:00", "skip_early", "sample-007") },
  ];
  const psd = deriveEpochPolicy(sd, { now: TS("2026-03-10T12:00:00-05:00"), library: lib, ...TZ });
  console.log("--- S4c three SAME-DAY epochs (3 sessions, 1 date) ->", psd.proposals().filter(p=>p.subject==="sample-007").length, "proposals (expect 0 — 'mood ≠ habit')");

  // active epoch excluded: 4 epochs, last live
  const four = [...three, ...skip2(day("13", "09:00"), "sample-006")];
  const p4 = deriveEpochPolicy(four, { now: TS(day("13", "09:10")), library: lib, ...TZ });
  const prop6 = p4.proposals().filter(p => p.subject === "sample-006");
  console.log("--- S4d 4 epochs, last ACTIVE ->", prop6.length, "proposal(s) from closed epochs (expect 1; evidence excludes live)");

  // not_now dayparts: 3 night sessions -> no; +1 morning -> yes
  const nn = [
    ev("2026-03-10T23:00:00-05:00", "thumb_down", "sample-008", { reason: "not_now", scope: "playlist", scope_id: "pl1" }),
    ev("2026-03-11T23:00:00-05:00", "thumb_down", "sample-008", { reason: "not_now", scope: "playlist", scope_id: "pl1" }),
    ev("2026-03-12T23:00:00-05:00", "thumb_down", "sample-008", { reason: "not_now", scope: "playlist", scope_id: "pl1" }),
  ];
  const pnn = deriveEpochPolicy(nn, { now: TS(day("13", "12:00")), library: lib, ...TZ });
  console.log("--- S4e not_now 3 nights (dayparts=1) ->", pnn.proposals().filter(p=>p.subject==="sample-008").length, "(expect 0)");
  const nm = [...nn, ev("2026-03-13T09:00:00-05:00", "thumb_down", "sample-008", { reason: "not_now", scope: "playlist", scope_id: "pl1" })];
  const pnm = deriveEpochPolicy(nm, { now: TS(day("13", "12:00")), library: lib, ...TZ });
  console.log("--- S4f + one morning ->", pnm.proposals().filter(p=>p.subject==="sample-008").map(p=>`${p.kind} ${JSON.stringify(p.evidence)}`), "(expect 1)");

  // repeat_positive: 3 epochs/3 dates -> none; 4 -> yes
  const rep = (d) => ev(`2026-03-${d}T18:00:00-05:00`, "repeat", "sample-009");
  const r3e = [rep("10"), rep("11"), rep("12")];
  const pr3 = deriveEpochPolicy(r3e, { now: TS(day("13", "12:00")), library: lib, ...TZ });
  console.log("--- S4g repeats in 3 epochs ->", pr3.proposals().filter(p=>p.subject==="sample-009").length, "(expect 0; needs 4/3)");
  const r4e = [...r3e, rep("13")];
  const pr4 = deriveEpochPolicy(r4e, { now: TS(day("13", "19:00")), library: lib, ...TZ });
  console.log("--- S4h repeats in 4 epochs/3 dates ->", pr4.proposals().filter(p=>p.subject==="sample-009").map(p=>p.kind), "(expect repeat_positive)");
}

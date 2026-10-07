// Probe 3: does the "declared fields are inert" story hold under feedback?
// Simulate a real library: strip declared fields (no producer) from the fixture.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const fixture = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

const DECLARED = ["vocal_fraction","instrumental","instruments.piano","instruments.synthesizer","arousal","valence","mood"];
const lib = { version: "real-sim", tracks: fixture.tracks.map((t) => {
  const signals = { ...t.signals };
  for (const k of DECLARED) delete signals[k];
  return { ...t, signals };
})};

const interp = interpretGoal("I need to focus", { library: lib });
const plan = interp.readings[interp.chosen_index].plan;
const checked = validatePlan(plan);
console.log("emitted constraints:", plan.constraints.map(c=>`${c.id}(w=${c.weight})`).join(", "));

// feedback stub: track B gets a love (+2 -> bonus 0.114); everyone else nothing
const B = "sample-054";
const feedback = {
  policy_version: "stub",
  events: 1,
  removed: () => new Set(),
  adjust: (trackId) => trackId === B ? { value: 2, parts: [{ label: "you loved this", value: 2 }] } : { value: 0, parts: [] },
};

function order(plan, fb) {
  const r = evaluatePlan(validatePlan(plan), lib, fb ? { feedback: fb } : {});
  return { order: r.strict.map(t=>t.id), scores: new Map(r.strict.map(t=>[t.id, t.score])) };
}

const full = order(structuredClone(plan), feedback);
// variant without the declared constraints
const noDeclared = structuredClone(plan);
noDeclared.constraints = noDeclared.constraints.filter((c) => c.id !== "goal_focus_1" && c.id !== "goal_focus_10");
const wo = order(noDeclared, feedback);

console.log("\nWITH declared (full): position of B =", full.order.indexOf(B));
console.log("WITHOUT declared  : position of B =", wo.order.indexOf(B));
if (full.order.indexOf(B) !== wo.order.indexOf(B)) {
  const rank = (o, id) => o.indexOf(id);
  // find the neighbour A that B passes when declared terms exist but not without
  for (const id of full.order.slice(0, wo.order.indexOf(B))) {
    const inFull = rank(full.order, id), inWo = rank(wo.order, id);
    if (inFull < rank(full.order, B) && inWo < rank(wo.order, B)) {} 
  }
  // simpler: list first 12 of each
  console.log("full  top12:", full.order.slice(0,12).join(","));
  console.log("w/o d top12:", wo.order.slice(0,12).join(","));
}
// quantitative dilution
const weighted = (constraints) => constraints.reduce((s,c)=>s+(c.weight??0),0);
const sumFull = weighted(plan.constraints), sumWo = weighted(noDeclared.constraints);
console.log(`\ntotal soft weight: full=${sumFull.toFixed(3)} (declared mass=0.411) vs without=${sumWo.toFixed(3)}`);
console.log(`produced-term share of the average: full=${((sumWo/sumFull)*100).toFixed(1)}% vs without=100%`);
console.log(`=> any produced-term score gap is diluted by factor ${ (sumWo/sumFull).toFixed(3) } while declared terms are unmeasured`);

// find a concrete overtaking pair: rank B in both orders, show neighbours' scores
const posFull = full.order.indexOf(B), posWo = wo.order.indexOf(B);
console.log(`B=${B} with love bonus: position ${posFull} (full) vs ${posWo} (no declared)`);
// show core numbers for B vs the track it overtakes in full but not in wo
for (const cand of [full.order[Math.max(0,posFull-1)], wo.order[0]]) {}
const a1 = full.order[posFull-1], a2 = wo.order[Math.max(0,posWo-1)];
for (const a of new Set([a1, a2])) {
  console.log(`  pair B vs ${a}: full scores B=${full.scores.get(B)} ${a}=${full.scores.get(a)} | without scores B=${wo.scores.get(B)} ${a}=${wo.scores.get(a)}`);
}

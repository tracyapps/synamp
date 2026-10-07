import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const RAW = { goal_focus_1: 0.45, goal_focus_2: 0.15, goal_focus_3: 0.15, goal_focus_4: 0.15, goal_focus_5: 0.1,
              goal_focus_6: 0.1, goal_focus_7: 0.1, goal_focus_8: 0.1, goal_focus_9: 0.15, goal_focus_10: 0.25 };

function fullScores(plan, label) {
  const p = structuredClone(plan);
  p.target_size = 60; delete p.ranking.mmr_lambda; delete p.ranking.diversity; p.relaxation.min_results = 0;
  const r = evaluatePlan(validatePlan(p), lib);
  const map = new Map(r.strict.map(t => [t.id, t.score]));
  return map;
}
const interp = interpretGoal("I need to focus, some jazz", { library: lib });
const plan = interp.readings[interp.chosen_index].plan;
// strip MMR/caps in BOTH variants so we compare pure weighted-average scores
plan.ranking.mmr_lambda = undefined; delete plan.ranking.mmr_lambda;
delete plan.ranking.diversity; plan.target_size = 60; plan.relaxation.min_results = 0;
const rawPlan = structuredClone(plan);
for (const c of rawPlan.constraints) if (RAW[c.id] !== undefined) c.weight = RAW[c.id];

const S = fullScores(plan, "scaled"), R = fullScores(rawPlan, "raw");
const ids = [...S.keys()].sort((a,b) => R.get(b)-R.get(a));
let flips = 0;
console.log("Top 24 by raw-score order — scaled rank vs raw rank (+ = scaled lower):");
const orderS = [...S.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
const orderR = [...R.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
for (let i = 0; i < 24; i++) {
  const id = orderR[i];
  const sr = orderS.indexOf(id), rr = i;
  console.log(`${id} raw=${R.get(id).toFixed(3)} scaled=${S.get(id).toFixed(3)} | rawRank=${rr} scaledRank=${sr} ${sr!==rr?"<== shifted":""}`);
}
// count pairwise order flips overall
for (let i = 0; i < ids.length; i++) for (let j = i+1; j < ids.length; j++) {
  const a = ids[i], b = ids[j];
  if (Math.sign(S.get(a)-S.get(b)) !== Math.sign(R.get(a)-R.get(b)) && S.get(a)!==S.get(b) && R.get(a)!==R.get(b)) flips++;
}
console.log("total pairwise order flips (expect 0 if truly neutral):", flips);

// pure bundle cross-check for contrast
const pure = interpretGoal("I need to focus", { library: lib }).readings[0].plan;
delete pure.ranking.diversity; pure.target_size = 60; pure.relaxation.min_results = 0;
const rawPure = structuredClone(pure);
for (const c of rawPure.constraints) if (RAW[c.id] !== undefined) c.weight = RAW[c.id];
const PS = fullScores(pure,"ps"), PR = fullScores(rawPure,"pr");
let pureFlips = 0;
for (const [id, v] of PS) {
  const rv = PR.get(id);
  if (Math.abs(v - rv) > 1e-9) pureFlips++;
}
console.log("pure-bundle score differences >1e-9:", pureFlips, "(0 = exactly neutral)");

import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const RESEARCH = { goal_focus_1: 0.45, goal_focus_2: 0.15, goal_focus_3: 0.15, goal_focus_4: 0.15, goal_focus_5: 0.1,
                   goal_focus_6: 0.1, goal_focus_7: 0.1, goal_focus_8: 0.1, goal_focus_9: 0.15, goal_focus_10: 0.25 };
const SCALE = 1/1.7;
const variant = (plan, mode) => {
  const p = structuredClone(plan); delete p.ranking.diversity; delete p.ranking.mmr_lambda; p.target_size=60; p.relaxation.min_results=0;
  for (const c of p.constraints) {
    if (RESEARCH[c.id]===undefined) continue;
    c.weight = mode==="exact" ? RESEARCH[c.id]*SCALE : Math.floor(RESEARCH[c.id]*SCALE*1000)/1000;
  }
  return p;
};
const scores = (p) => { const r = evaluatePlan(validatePlan(p), lib); return new Map(r.strict.map(t=>[t.id,t.score])); };
const plan = interpretGoal("I need to focus", { library: lib }).readings[0].plan;
const ship = scores(variant(plan,"ship")), exact = scores(variant(plan,"exact"));
const ids = [...ship.keys()];
const order = (m) => [...ids].sort((a,b)=> m.get(b)-m.get(a) || a.localeCompare(b));
const os = order(ship), oe = order(exact);
for (let i=0;i<ids.length;i++) if (os[i]!==oe[i]) {
  const a=os[i], b=oe[i];
  console.log(`pos ${i}: ship=${a}(${ship.get(a)}) exact=${b}(${exact.get(b)}) | exact other side: ${a}=${exact.get(a)}, ship other side: ${b}=${ship.get(b)}`);
  break; // first divergence
}
const diffs = ids.map(id=>({id, d: ship.get(id)-exact.get(id)})).filter(x=>Math.abs(x.d)>1e-12).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
console.log("num tracks with score delta:", diffs.length, "max:", diffs[0]);

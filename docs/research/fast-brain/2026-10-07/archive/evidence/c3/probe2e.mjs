import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const RESEARCH = { goal_focus_1: 0.45, goal_focus_2: 0.15, goal_focus_3: 0.15, goal_focus_4: 0.15, goal_focus_5: 0.1,
                   goal_focus_6: 0.1, goal_focus_7: 0.1, goal_focus_8: 0.1, goal_focus_9: 0.15, goal_focus_10: 0.25 };
const SCALE = 1/1.7;

function variant(plan, mode) {
  const p = structuredClone(plan);
  delete p.ranking.diversity; delete p.ranking.mmr_lambda; p.target_size = 60; p.relaxation.min_results = 0;
  for (const c of p.constraints) {
    if (RESEARCH[c.id] === undefined) continue;
    if (mode === "raw") c.weight = RESEARCH[c.id];
    if (mode === "exact") c.weight = RESEARCH[c.id] * SCALE;
    if (mode === "ship") c.weight = Math.floor(RESEARCH[c.id] * SCALE * 1000) / 1000;
  }
  return p;
}
const scores = (p) => { const r = evaluatePlan(validatePlan(p), lib); return new Map(r.strict.map(t => [t.id, t.score])); };
const maxDiff = (a, b) => Math.max(...[...a.keys()].map(id => Math.abs(a.get(id)-b.get(id))));
const flips = (a, b) => { const ids=[...a.keys()]; let f=0; const oa=[...ids].sort((x,y)=>b2(a,x)-b2(a,y)); const ob=[...ids].sort((x,y)=>b2(b,x)-b2(b,y)); for(let i=0;i<ids.length;i++) if(oa[i]!==ob[i]) f++; return f; };
const b2 = (m,id)=>m.get(id);

for (const [label, phrase] of [["PURE", "I need to focus"], ["MIXED(jazz)", "I need to focus, some jazz"]]) {
  const plan = interpretGoal(phrase, { library: lib }).readings[0].plan;
  const ship = scores(variant(plan, "ship")), exact = scores(variant(plan, "exact")), raw = scores(variant(plan, "raw"));
  console.log(`### ${label}`);
  console.log(`  floor-only effect (ship vs exact): maxScoreDiff=${maxDiff(ship, exact).toExponential(2)} orderPositionsDifferent=${flips(ship, exact)}`);
  console.log(`  scale effect (exact vs raw):       maxScoreDiff=${maxDiff(exact, raw).toExponential(2)} orderPositionsDifferent=${flips(exact, raw)}`);
}

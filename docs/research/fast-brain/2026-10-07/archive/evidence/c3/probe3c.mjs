import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const fixture = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const DECLARED = ["vocal_fraction","instrumental","instruments.piano","instruments.synthesizer","arousal","valence","mood"];
const lib = { version: "real-sim", tracks: fixture.tracks.map((t) => { const s = { ...t.signals }; for (const k of DECLARED) delete s[k]; return { ...t, signals: s }; }) };
const plan0 = interpretGoal("I need to focus", { library: lib }).readings[0].plan;
const noDeclared0 = structuredClone(plan0);
noDeclared0.constraints = noDeclared0.constraints.filter((c) => c.id !== "goal_focus_1" && c.id !== "goal_focus_10");
const ids = (p, mmrOn = true) => {
  const p2 = structuredClone(p);
  if (!mmrOn) { delete p2.ranking.mmr_lambda; delete p2.ranking.diversity; }
  return evaluatePlan(validatePlan(p2), lib).strict.map(t=>t.id);
};
const a = ids(plan0), b = ids(noDeclared0);
console.log("as-emitted (MMR on) orders equal:", JSON.stringify(a)===JSON.stringify(b));
let diff = 0; for (let i=0;i<a.length;i++) if (a[i]!==b[i]) diff++;
console.log("positions differing:", diff, "of", a.length);
console.log("first 14 full:  ", a.slice(0,14).join(","));
console.log("first 14 noDcl: ", b.slice(0,14).join(","));
const a2 = ids(plan0, false), b2 = ids(noDeclared0, false);
console.log("score-sorted (MMR off) orders equal:", JSON.stringify(a2)===JSON.stringify(b2));
console.log("first 14 full:  ", a2.slice(0,14).join(","));
console.log("first 14 noDcl: ", b2.slice(0,14).join(","));

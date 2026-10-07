import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
const RAW = { goal_focus_1: 0.45, goal_focus_2: 0.15, goal_focus_3: 0.15, goal_focus_4: 0.15, goal_focus_5: 0.1,
              goal_focus_6: 0.1, goal_focus_7: 0.1, goal_focus_8: 0.1, goal_focus_9: 0.15, goal_focus_10: 0.25 };
const interp = interpretGoal("I need to focus, some jazz", { library: lib });
const plan = interp.readings[interp.chosen_index].plan;
const rawPlan = structuredClone(plan);
for (const c of rawPlan.constraints) if (RAW[c.id] !== undefined) c.weight = RAW[c.id];
const runEval = (p) => evaluatePlan(validatePlan(p), lib);
const A = runEval(plan), B = runEval(rawPlan);
console.log("index | scaled id/score            | raw id/score");
for (let i = 0; i < 12; i++) {
  const a = A.strict[i], b = B.strict[i];
  console.log(`${String(i).padStart(2)} | ${(a?.id ?? "-").padEnd(11)} ${a?.score?.toFixed(3)} | ${(b?.id ?? "-").padEnd(11)} ${b?.score?.toFixed(3)}`);
}

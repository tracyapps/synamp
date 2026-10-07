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
const pair = ["sample-048", "sample-054", "sample-001", "sample-058"];
for (const id of pair) {
  const a = A.strict.find(t=>t.id===id), b = B.strict.find(t=>t.id===id);
  console.log(`${id}: scaled score=${a?.score} rank=${A.strict.findIndex(t=>t.id===id)} | raw score=${b?.score} rank=${B.strict.findIndex(t=>t.id===id)}`);
}
console.log("scaled order:", A.strict.map(t=>t.id).join(","));
console.log("raw    order:", B.strict.map(t=>t.id).join(","));
// genre_hint effective contribution context
console.log("constraints:", plan.constraints.map(c=>`${c.id}:${c.where.field}${c.where.op}${JSON.stringify(c.where.value)}@${c.weight}`).join(" | "));

// Probe 2: verify B1's "floor-normalisation is score-neutral" claim.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

// research weights of the focus bundle in emitted order (F1..F10; F8 not emitted here)
const RAW = { goal_focus_1: 0.45, goal_focus_2: 0.15, goal_focus_3: 0.15, goal_focus_4: 0.15, goal_focus_5: 0.1,
              goal_focus_6: 0.1, goal_focus_7: 0.1, goal_focus_8: 0.1, goal_focus_9: 0.15, goal_focus_10: 0.25 };

function evaluate(planLike) {
  const checked = validatePlan(planLike);
  if (!checked.ok) throw new Error("invalid plan: " + JSON.stringify(checked.errors));
  const result = evaluatePlan(checked, lib);
  return { hash: checked.hash, order: result.strict.map((t) => t.id), scores: Object.fromEntries(result.strict.map((t) => [t.id, t.score])) };
}

function rawVariant(plan) {
  const clone = structuredClone(plan);
  for (const c of clone.constraints) {
    if (RAW[c.id] !== undefined) c.weight = RAW[c.id];
  }
  return clone;
}

for (const prompt of ["I need to focus", "I need to focus, some jazz"]) {
  const interp = interpretGoal(prompt, { library: lib });
  const chosen = interp.readings[interp.chosen_index];
  const plan = chosen.plan;
  console.log("=".repeat(70));
  console.log("PROMPT:", prompt, "| constraints:", plan.constraints.map(c=>`${c.id}(w=${c.weight})`).join(", "));
  const scaled = evaluate(plan);
  const raw = evaluate(rawVariant(plan));
  const sameOrder = JSON.stringify(scaled.order) === JSON.stringify(raw.order);
  console.log("same order scaled vs raw:", sameOrder);
  if (!sameOrder) {
    // find first divergence
    for (let i = 0; i < Math.max(scaled.order.length, raw.order.length); i++) {
      if (scaled.order[i] !== raw.order[i]) {
        console.log(`first divergence at position ${i}: scaled=${scaled.order[i]} raw=${raw.order[i]}`);
        console.log("scaled top10:", scaled.order.slice(0,10).join(","));
        console.log("raw    top10:", raw.order.slice(0,10).join(","));
        break;
      }
    }
  }
  // bundle share of the weighted average denominator (sum of soft weights)
  const T_scaled = plan.constraints.reduce((s,c)=>s+(c.weight??0),0);
  const T_raw = rawVariant(plan).constraints.reduce((s,c)=>s+(c.weight??0),0);
  const B_scaled = plan.constraints.filter(c=>c.id.startsWith("goal_")).reduce((s,c)=>s+(c.weight??0),0);
  const B_raw = rawVariant(plan).constraints.filter(c=>c.id.startsWith("goal_")).reduce((s,c)=>s+(c.weight??0),0);
  console.log(`bundle share: scaled ${(B_scaled/T_scaled*100).toFixed(1)}% of total weight; raw ${(B_raw/T_raw*100).toFixed(1)}%`);
  // score spread comparison
  const spread = (scores) => { const v = Object.values(scores); return (Math.max(...v)-Math.min(...v)).toFixed(3); };
  console.log("score spread: scaled", spread(scaled.scores), "raw", spread(raw.scores));
}

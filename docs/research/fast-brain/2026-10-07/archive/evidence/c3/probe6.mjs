// Probe 6: supersede + contradiction pair + emitted weight arithmetic.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { GOALS, bundleScale, emittedWeight } = await import(`${repo}/src/intent/lexicon.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

console.log("=== emitted weight arithmetic (research → emitted), ignoring missing-library skips");
for (const goal of GOALS) {
  const scale = bundleScale(goal);
  const rawTotal = goal.constraints.reduce((s,c)=>s+c.researchWeight,0);
  const emitted = goal.constraints.map(c => emittedWeight(c, scale));
  const sum = emitted.reduce((a,b)=>a+b,0);
  console.log(`${goal.id.padEnd(10)} raw=${rawTotal.toFixed(2)} scale=${scale.toFixed(3)} emitted=[${emitted.join(", ")}] sum=${sum.toFixed(3)}`);
  // truncation loss
  const exact = goal.constraints.map(c => c.researchWeight * scale);
  console.log("   truncation loss per term:", exact.map((v,i)=> (v - emitted[i]).toFixed(4)).join(", "));
}

const dump = (label, phrase) => {
  const r = interpretGoal(phrase, { library: lib });
  console.log(`\n=== ${label}: "${phrase}" -> ${r.accuracy}, readings=${r.readings.length}, chosen=${r.chosen_index}`);
  r.readings.forEach((reading, i) => {
    console.log(`  reading[${i}] "${reading.label}" conf=${reading.confidence}`);
    console.log(`    constraints: ${reading.plan.constraints.map(c=>`${c.id}(${c.where.field} ${c.where.op} ${JSON.stringify(c.where.value)} w=${c.weight})`).join("; ")}`);
    if (i === r.chosen_index) console.log(`    assumptions: ${JSON.stringify(reading.assumptions.slice(0,4), null, 0)}`);
  });
  console.log("  asks:", r.asks.map(a=>a.ask));
};

dump("supersede-check", "feeling pumped up");
dump("supersede-check", "I'm driving to work");
dump("pair", "fast relaxing bangers");
dump("pair", "pump me up but keep it calm");

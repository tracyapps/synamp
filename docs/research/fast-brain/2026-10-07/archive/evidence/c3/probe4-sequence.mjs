// Probe 4: sequencing — re-order-only check + proxy/coverage behaviour.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { validatePlan } = await import(`${repo}/src/query/plan.ts`);
const { evaluatePlan } = await import(`${repo}/src/query/evaluate.ts`);
const { sequenceTracks } = await import(`${repo}/src/query/sequence.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

// intensity proxy clone (must match sequence.ts)
const COMPONENTS = [
  { field: "bpm", low: 60, high: 180, weight: 0.35, damp: true },
  { field: "onset_rate", low: 0, high: 8, weight: 0.25 },
  { field: "percussiveness", low: 0, high: 1, weight: 0.2 },
  { field: "lufs_integrated", low: -24, high: -4, weight: 0.2 },
];
const measured = (t, f) => (typeof t.signals?.[f] === "number" && Number.isFinite(t.signals[f]) ? t.signals[f] : null);
function intensityOf(t) {
  let sum = 0, w = 0;
  for (const c of COMPONENTS) {
    const v = measured(t, c.field); if (v === null) continue;
    let term = Math.min(1, Math.max(0, (v - c.low) / (c.high - c.low)));
    if (c.damp) { const conf = measured(t, "tempo_confidence"); if (conf === null || conf < 0.5) term *= 0.5; }
    sum += c.weight * term; w += c.weight;
  }
  return w > 0 ? sum / w : null;
}

for (const [prompt, arc] of [["pump me up for the gym", "build"], ["I want to dance", "peak"], ["wind down", "cooldown"]]) {
  const interp = interpretGoal(prompt, { library: lib });
  const plan = interp.readings[interp.chosen_index].plan;
  console.log("=".repeat(70));
  console.log("PROMPT:", prompt, "arc:", plan.sequencing?.arc);
  const checked = validatePlan(plan);
  const result = evaluatePlan(checked, lib);
  const before = result.strict.map(t => t.id);
  const seq = sequenceTracks(result.strict, checked.plan, { library: lib });
  const after = seq.tracks.map(t => t.id);
  const sameSet = JSON.stringify([...before].sort()) === JSON.stringify([...after].sort());
  console.log("same set (pure re-order):", sameSet, "| count:", after.length);
  console.log("applied:", seq.applied);
  // measured intensity sequence
  const byId = new Map(lib.tracks.map(t => [t.id, t]));
  const ints = after.map(id => { const v = intensityOf(byId.get(id)); return v === null ? null : Number(v.toFixed(3)); });
  console.log("intensity sequence:", ints.join(", "));
  if (arc === "build") {
    const known = ints.filter(v => v !== null);
    const asc = known.every((v, i) => i === 0 || known[i-1] <= v);
    console.log("ascending?", asc);
  }
  if (arc === "cooldown") {
    const known = ints.filter(v => v !== null);
    const desc = known.every((v, i) => i === 0 || known[i-1] >= v);
    console.log("descending?", desc);
  }
  // unknown placement: positions of nulls in input vs output
  const inNull = before.map((id,i)=>[i, intensityOf(byId.get(id))===null]);
  const outNull = after.map((id,i)=>[i, intensityOf(byId.get(id))===null]);
  console.log("null positions input:", JSON.stringify(inNull.filter(x=>x[1]).map(x=>x[0])), "output:", JSON.stringify(outNull.filter(x=>x[1]).map(x=>x[0])));
}

// coverage gate: a library slice where most tracks lack all components
console.log("=".repeat(70));
const bareLib = { version: "bare", tracks: lib.tracks.map((t, i) => i < 30 ? { ...t, signals: {} } : t) };
const p2 = interpretGoal("pump me up for the gym", { library: lib }).readings[0].plan;
const checked2 = validatePlan(p2);
const res2 = evaluatePlan(checked2, bareLib);
const seq2 = sequenceTracks(res2.strict, checked2.plan, { library: bareLib });
console.log("coverage scenario applied:", seq2.applied);
console.log("order unchanged:", JSON.stringify(res2.strict.map(t=>t.id)) === JSON.stringify(seq2.tracks.map(t=>t.id)));

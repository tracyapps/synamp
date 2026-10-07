import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

for (const phrase of ["wind down for bed", "chill music for cleaning", "focus playlist for studying", "music for my workout then sleep"]) {
  const r = interpretGoal(phrase, { library: lib });
  console.log("=== " + phrase + " -> " + r.accuracy + " readings=" + r.readings.length);
  r.readings.forEach((reading, i) => {
    console.log(`  [${i}] ${reading.label}: ${reading.plan.constraints.map(c=>`${c.id}(${c.where.field} ${c.where.op} ${JSON.stringify(c.where.value)} w=${c.weight})`).join("; ")}`);
    console.log(`      arc=${reading.plan.sequencing?.arc}`);
  });
  console.log("  asks:", r.asks.map(a=>a.ask));
}

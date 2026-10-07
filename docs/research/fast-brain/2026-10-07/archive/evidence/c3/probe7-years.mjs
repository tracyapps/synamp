import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const { draftPlan } = await import(`${repo}/src/query/draft.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

for (const phrase of [
  "throwback, years 1990 to 2005",
  "nostalgic music from 1990 to 2005",
  "back in the day, 1990-2005",
  "music from 1990 to 2005",
]) {
  const r = interpretGoal(phrase, { library: lib });
  const d = draftPlan(phrase, lib);
  console.log("=== " + phrase);
  console.log("  accuracy:", r.accuracy, "readings:", r.readings.length);
  for (const reading of r.readings) {
    console.log("   constraints:", reading.plan.constraints.map(c=>`${c.id}(${c.where.field} ${c.where.op} ${JSON.stringify(c.where.value)})`).join("; "));
  }
  console.log("  draft uparsed:", JSON.stringify(d.unparsed), "unsupported:", JSON.stringify((d.plan.unsupported ?? []).map(u=>u.ask)));
  console.log("  asks:", r.asks.map(a=>a.ask));
  console.log("  residue audit:", r.audit.filter(a=>a.kind==="unparsed").map(a=>a.phrase));
}

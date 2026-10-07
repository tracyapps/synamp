import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));
for (const phrase of ["pump me up to do this task", "win this game", "I want to dance", "nothing too slow"]) {
  const r = interpretGoal(phrase, { library: lib });
  console.log("=== " + phrase, "->", r.accuracy, "readings", r.readings.length);
  if (r.readings[r.chosen_index]) console.log("   label:", r.readings[r.chosen_index].label, "arc:", r.readings[r.chosen_index].plan.sequencing?.arc);
  console.log("   chosen: ", r.chosen_index);
}

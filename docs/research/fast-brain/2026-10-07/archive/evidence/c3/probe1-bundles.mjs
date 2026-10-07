// Probe 1: bundle fidelity — run interpretGoal on trigger phrases, dump emitted constraints.
import { readFileSync } from "node:fs";
const repo = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain";
const { interpretGoal } = await import(`${repo}/src/intent/interpret.ts`);
const lib = JSON.parse(readFileSync(`${repo}/fixtures/library.sample.json`, "utf8"));

const phrases = [
  ["focus", ["I need to focus", "help me concentrate on my homework", "deep work session"]],
  ["pump_up", ["pump me up for the gym", "win this game", "before the game"]],
  ["dance", ["I want to dance", "dance party", "let's dance"]],
  ["calm", ["help me calm down", "I need to relax", "wind down"]],
  ["sleep", ["music to fall asleep", "bedtime", "lullaby"]],
  ["catharsis", ["feeling sad", "sad songs", "let it all out"]],
  ["nostalgia", ["throwback", "back in the day", "memory lane"]],
  ["drive", ["going for a drive", "long commute", "road trip"]],
  ["chores", ["cleaning the house", "do the dishes", "tidying up"]],
];

const out = [];
for (const [goal, list] of phrases) {
  for (const phrase of list) {
    const result = interpretGoal(phrase, { library: lib });
    const chosen = result.chosen_index >= 0 ? result.readings[result.chosen_index] : undefined;
    const plan = chosen?.plan;
    out.push({
      goal, phrase,
      accuracy: result.accuracy,
      readings: result.readings.length,
      chosen_index: result.chosen_index,
      label: chosen?.label,
      arc: plan?.sequencing?.arc,
      constraints: (plan?.constraints ?? []).map((c) => ({
        id: c.id, field: c.where.field, op: c.where.op, value: c.where.value,
        weight: c.weight, hard: c.hard, policy: c.unknown_policy, proxy: c.proxy
      })),
      assumptions: chosen?.assumptions ?? [],
      asks: result.asks.map((a) => a.ask),
      skippedNotes: result.audit.filter((a) => String(a.becomes).includes("skipped")).map((a) => a.becomes),
    });
  }
}
console.log(JSON.stringify(out, null, 1));

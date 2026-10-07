/**
 * C2 probe — run interpretGoal() on culture-sensitive prompts with the
 * synthetic sample library; dump readings/asks/audit for bias inspection.
 * Read-only against the repo. Run:
 *   node --experimental-strip-types probe-interpret.mts
 */
import { readFileSync } from "node:fs";

const REPO = "/Users/tapps/_dev/web-apps/SynAmp";
const { interpretGoal } = await import(`${REPO}/apps/brain/src/intent/interpret.ts`);

const raw = JSON.parse(readFileSync(`${REPO}/apps/brain/fixtures/library.sample.json`, "utf8"));
const library = { version: "probe-sample", tracks: raw.tracks as unknown[] };

const PROMPTS = [
  "latin party music",
  "tribal drumming",
  "gypsy jazz",
  "exotic vibes",
  "music for my ancestors",
  "west african drumming for focus",
  "sami yoik to wind down",
  "indigenous music for the gym",
  "gamelan for studying",
  "play me some world music",
  // controls
  "fast relaxing bangers",
  "I need to focus. no words, no piano, nothing too slow/relaxing.",
];

for (const prompt of PROMPTS) {
  const out = interpretGoal(prompt, { library });
  console.log("=".repeat(100));
  console.log(`PROMPT: ${JSON.stringify(prompt)}`);
  console.log(`accuracy=${out.accuracy} chosen_index=${out.chosen_index} readings=${out.readings.length} parser=${out.parser}`);
  for (const [i, r] of out.readings.entries()) {
    const plan = r.plan as { constraints?: Array<{ id: string; hard?: boolean; where: { field: string; op: string; value: unknown }; proxy?: string }>; sequencing?: { arc: string } };
    console.log(`  reading[${i}] label=${JSON.stringify(r.label)} confidence=${r.confidence} arc=${plan.sequencing?.arc ?? "(none)"}`);
    const cs = (plan.constraints ?? []).map((c) => {
      const v = Array.isArray(c.where.value) ? `[${c.where.value.join(",")}]` : String(c.where.value);
      return `${c.id}:${c.where.field} ${c.where.op} ${v}${c.hard ? " HARD" : ""}${c.proxy ? ` (proxy: ${c.proxy})` : ""}`;
    });
    console.log(`    constraints: ${cs.join(" | ") || "(none)"}`);
    console.log(`    assumptions:`);
    for (const a of r.assumptions) console.log(`      - ${a}`);
  }
  console.log(`  asks:`);
  for (const a of out.asks) {
    console.log(`    ? ${a.ask}`);
    console.log(`      reason: ${a.reason}${a.nearest_supported ? `\n      near: ${a.nearest_supported}` : ""}`);
  }
  console.log(`  audit:`);
  for (const e of out.audit) console.log(`    [${e.kind}] ${e.phrase} -> ${e.becomes}`);
}

/**
 * C1 probe 3 — arc sequencing properties + plan-hash claims.
 *
 * Independent property checks (NOT a re-run of B1's unit tests):
 *   - sequenceTracks only permutes (set/length preserved), arc properties verified
 *     against an independent re-implementation of the documented intensity proxy;
 *   - coverage < 60% falls back with the honest note; unknown-intensity placement;
 *   - hash: arcs validate; build ≠ flat; flat round-trips deterministically (the flat
 *     path is unchanged vs main — old code kept {arc:"flat"} too, see git diff evidence).
 *
 * Read-only. Run: node --experimental-strip-types p3-sequence-hash.mts
 */
import { readFileSync } from "node:fs";
import { sequenceTracks } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/sequence.ts";
import { evaluatePlan } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";
import { validatePlan, planHash } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/plan.ts";
import type { Library, LibraryTrack, ResultTrack } from "file:///Users/tapps/_dev/web-apps/SynAmp/apps/brain/src/query/evaluate.ts";

const FIXTURE = "/Users/tapps/_dev/web-apps/SynAmp/apps/brain/fixtures/library.sample.json";
const sampleLib: Library = { version: "sample", tracks: (JSON.parse(readFileSync(FIXTURE, "utf8")) as { tracks: LibraryTrack[] }).tracks };

let pass = 0; let fail = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// --- independent re-implementation of the documented proxy (sequence.ts §header) ---
function proxy(track: LibraryTrack): number | null {
  const s = track.signals ?? {};
  const num = (k: string): number | null => (typeof s[k] === "number" && Number.isFinite(s[k]) ? (s[k] as number) : null);
  const parts: Array<[number, number]> = [];
  const bpm = num("bpm");
  if (bpm !== null) {
    const tc = num("tempo_confidence");
    let term = Math.min(1, Math.max(0, (bpm - 60) / 120));
    if (tc === null || tc < 0.5) term *= 0.5;
    parts.push([0.35, term]);
  }
  const onset = num("onset_rate");
  if (onset !== null) parts.push([0.25, Math.min(1, Math.max(0, onset / 8))]);
  const perc = num("percussiveness");
  if (perc !== null) parts.push([0.2, Math.min(1, Math.max(0, perc))]);
  const lufs = num("lufs_integrated");
  if (lufs !== null) parts.push([0.2, Math.min(1, Math.max(0, (lufs + 24) / 20))]);
  if (!parts.length) return null;
  const w = parts.reduce((a, [weight]) => a + weight, 0);
  return parts.reduce((a, [weight, term]) => a + weight * term, 0) / w;
}

const basePlan = (arc: string | undefined) => ({
  version: "2.0", intent: { query_type: "attribute" }, target_size: 30,
  constraints: [{ id: "c1", source_phrase: "anything audible", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6,
    where: { field: "lufs_integrated", op: "gte", value: -70 } }],
  ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
  ...(arc ? { sequencing: { arc } } : {}),
});

console.log("== p3: sequencing properties (sample library, 30-track strict list) ==");
{
  const checked = validatePlan(basePlan("build"));
  check("plan with arc validates", checked.ok);
  if (checked.ok) {
    const evaluation = evaluatePlan(checked, sampleLib);
    const strict = evaluation.strict;
    const byId = new Map(sampleLib.tracks.map((t) => [t.id, t]));
    const inten = strict.map((t) => proxy(byId.get(t.id)!));
    const knownCount = inten.filter((v) => v !== null).length;
    console.log(`  · strict=${strict.length} tracks, measured intensity on ${knownCount} (${Math.round((knownCount / strict.length) * 100)}%)`);

    for (const arc of ["build", "cooldown", "peak", "wave"]) {
      const plan = validatePlan(basePlan(arc));
      if (!plan.ok) { check(`${arc}: validates`, false); continue; }
      const out = sequenceTracks(strict, plan.plan, { library: sampleLib });
      const outIds = out.tracks.map((t) => t.id);
      const inIds = strict.map((t) => t.id);
      check(`${arc}: permutation only (same set, same length)`,
        outIds.length === inIds.length && [...outIds].sort().join(",") === [...inIds].sort().join(","));
      check(`${arc}: input array not mutated`, strict.map((t) => t.id).join(",") === inIds.join(","));

      const outInten = out.tracks.map((t) => proxy(byId.get(t.id)!));
      // unknown placement: indices of nulls must be identical between input and output
      const nullIn = inten.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      const nullOut = outInten.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      check(`${arc}: unknown-intensity tracks keep their positions`, JSON.stringify(nullIn) === JSON.stringify(nullOut),
        `${JSON.stringify(nullIn)} vs ${JSON.stringify(nullOut)}`);

      const knownOut = outInten.filter((v): v is number => v !== null);
      if (arc === "build") {
        check(`${arc}: measured sequence nondecreasing`, knownOut.every((v, i) => i === 0 || knownOut[i - 1]! <= v + 1e-12));
      } else if (arc === "cooldown") {
        check(`${arc}: measured sequence nonincreasing`, knownOut.every((v, i) => i === 0 || knownOut[i - 1]! >= v - 1e-12));
      } else if (arc === "peak") {
        let rises = true; let peakOK = true;
        for (let i = 1; i < knownOut.length; i++) {
          if (rises && knownOut[i]! < knownOut[i - 1]! - 1e-12) rises = false;
          else if (!rises && knownOut[i]! > knownOut[i - 1]! + 1e-12) peakOK = false;
        }
        check(`${arc}: rises then relaxes (unimodal)`, peakOK);
        check(`${arc}: starts at the low end, turns at the max`,
          knownOut[0] === Math.min(...knownOut) && Math.max(...knownOut) === knownOut[knownOut.indexOf(Math.max(...knownOut))]);
      } else if (arc === "wave") {
        const sorted = [...knownOut].sort((a, b) => a - b);
        const half = Math.ceil(knownOut.length / 2);
        const lower = new Set(sorted.slice(0, half).map((v) => v.toFixed(6)));
        const upper = new Set(sorted.slice(half).map((v) => v.toFixed(6)));
        let patternOK = true;
        for (let i = 0; i < knownOut.length; i++) {
          const bucket = i % 2 === 0 ? upper : lower;
          if (!bucket.has(knownOut[i]!.toFixed(6))) patternOK = false;
        }
        check(`${arc}: alternates upper/lower half starting high`, patternOK,
          `first=${knownOut.slice(0, 4).map((v) => v.toFixed(3)).join(",")}`);
      }

      // applied[] text
      const expectedNote = knownCount === strict.length
        ? `arc ${arc}: ordered by measured intensity (100% coverage)`
        : `arc ${arc}: ordered by measured intensity (${Math.round((knownCount / strict.length) * 100)}% coverage, ${strict.length - knownCount} tracks without measurements kept in place)`;
      const singular = strict.length - knownCount === 1 ? expectedNote.replace("tracks without", "track without") : expectedNote;
      check(`${arc}: applied[] note sane`, out.applied.length === 1 && out.applied[0] === singular, out.applied.join(" | "));
    }

    // flat / absent → no-op
    const flat = validatePlan(basePlan("flat"));
    const none = validatePlan(basePlan(undefined));
    if (flat.ok && none.ok) {
      const f = sequenceTracks(strict, flat.plan, { library: sampleLib });
      const n = sequenceTracks(strict, none.plan, { library: sampleLib });
      check("flat: no-op with no notes", f.applied.length === 0 && f.tracks.map((t) => t.id).join(",") === strict.map((t) => t.id).join(","));
      check("absent: no-op with no notes", n.applied.length === 0 && n.tracks.map((t) => t.id).join(",") === strict.map((t) => t.id).join(","));
    }

    // determinism: two calls identical
    const a = sequenceTracks(strict, checked.plan, { library: sampleLib });
    const b = sequenceTracks(strict, checked.plan, { library: sampleLib });
    check("determinism: two calls give identical order and notes", JSON.stringify(a) === JSON.stringify(b));
  }
}

console.log("== p3: coverage gate + unknown placement (custom fixture) ==");
{
  const mk = (id: string, signals: Record<string, number> | undefined): LibraryTrack => ({ id, title: id, signals });
  const lib: Library = { version: "t", tracks: [
    mk("hi", { bpm: 170, tempo_confidence: 0.9, onset_rate: 7, percussiveness: 0.9, lufs_integrated: -6 }),
    mk("mid", { bpm: 120, tempo_confidence: 0.9, onset_rate: 4, percussiveness: 0.5, lufs_integrated: -14 }),
    mk("lo", { bpm: 70, tempo_confidence: 0.9, onset_rate: 1, percussiveness: 0.1, lufs_integrated: -22 }),
    mk("u1", undefined),
    mk("u2", { onset_rate: Number.NaN }),
  ]};
  const planBuild = validatePlan(basePlan("build"));
  const planWave = validatePlan(basePlan("wave"));
  if (planBuild.ok && planWave.ok) {
    const rt = (id: string): ResultTrack => ({ id, title: id, score: 0, channels: ["filter"], reasons: [], unverified: [] });
    const three = [rt("hi"), rt("mid"), rt("lo")];
    const lowCoverage = [rt("hi"), rt("mid"), rt("u1"), rt("u2"), rt("lo")]; // 3/5 measured = 60% exactly
    const atGate = sequenceTracks(lowCoverage, planBuild.plan, { library: lib });
    check("60% coverage exactly opens the gate (3/5 = 60%)",
      atGate.applied[0] === "arc build: ordered by measured intensity (60% coverage, 2 tracks without measurements kept in place)" &&
      atGate.tracks.map((t) => t.id).join(",") === "lo,mid,u1,u2,hi",
      atGate.applied.join("|") + " order=" + atGate.tracks.map((t) => t.id).join(","));

    const under = [rt("hi"), rt("mid"), rt("u1"), rt("u2"), rt("u2")]; // 2/5 = 40%
    const fallback = sequenceTracks(under, planBuild.plan, { library: lib });
    check("coverage <60%: ranked order kept + honest note",
      fallback.applied.length === 1 && fallback.applied[0] === "arc build: not enough measured intensity (40% coverage) — kept the ranked order" &&
      fallback.tracks.map((t) => t.id).join(",") === "hi,mid,u1,u2,u2",
      fallback.applied.join("|"));

    const withUnknown = [rt("hi"), rt("u1"), rt("mid"), rt("u2"), rt("lo")];
    const built = sequenceTracks(withUnknown, planBuild.plan, { library: lib });
    check("unknown tracks keep their indices while measured ascend around them",
      built.tracks.map((t) => t.id).join(",") === "lo,u1,mid,u2,hi",
      built.tracks.map((t) => t.id).join(","));

    const waved = sequenceTracks([rt("hi"), rt("mid"), rt("lo")], planWave.plan, { library: lib });
    check("wave on 3 measured (ODD): must be a permutation — BUG observed: shortened list with an undefined entry",
      waved.tracks.length === 3 && new Set(waved.tracks.map((t) => t?.id)).size === 3 && waved.tracks.every((t) => t !== undefined),
      `observed=[${waved.tracks.map((t) => t?.id ?? "UNDEFINED").join(",")}] length=${waved.tracks.length} — root cause: wave loop bounded by upper.length drops a lower-half item; arrange() then shifts past the pool`);

    const evenWave = sequenceTracks([rt("hi"), rt("mid")], planWave.plan, { library: lib });
    check("wave on 2 measured (EVEN): permutation ok",
      evenWave.tracks.map((t) => t?.id).join(",") === "hi,mid",
      evenWave.tracks.map((t) => t?.id).join(","));
  }
}

console.log("== p3: plan hash claims ==");
{
  const flat = validatePlan(basePlan("flat"));
  const flatNoSeq = validatePlan(basePlan(undefined));
  const build = validatePlan(basePlan("build"));
  const peak = validatePlan(basePlan("peak"));
  check("all arc forms validate (flat/build/peak checked; cooldown/wave covered above)",
    flat.ok && flatNoSeq.ok && build.ok && peak.ok);
  if (flat.ok && flatNoSeq.ok && build.ok && peak.ok) {
    check("build hash ≠ flat hash (arc now contributes to the SHA-256)",
      flat.hash !== build.hash && flat.hash !== peak.hash && build.hash !== peak.hash);
    check("flat plan: sequencing {arc:flat} round-trips structurally", JSON.stringify(flat.plan.sequencing) === JSON.stringify({ arc: "flat" }));
    // Determinism of the flat path (structural identity ⇒ identical hash; the old code kept {arc:"flat"} too — see receipt/git diff).
    const flatAgain = validatePlan(basePlan("flat"));
    check("flat hash deterministic across calls", flatAgain.ok && flatAgain.hash === flat.hash, flat.hash.slice(0, 16));
    check("omitting sequencing: plan carries no sequencing key", flatNoSeq.ok && flatNoSeq.plan.sequencing === undefined);
    check("planHash is a pure function of the plan (no hidden registry drift within a run)",
      flat.ok && planHash(flat.plan) === flat.hash);
    const bad = validatePlan(basePlan("rise"));
    check("unknown arc rejected with a validator error", !bad.ok && JSON.stringify(bad.errors).includes("$.sequencing.arc"),
      bad.ok ? "" : JSON.stringify(bad.errors));
    const badType = validatePlan({ ...basePlan("flat"), sequencing: { arc: 7 } });
    check("non-string arc rejected", !badType.ok);
  }
}

console.log(`\np3 summary: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);

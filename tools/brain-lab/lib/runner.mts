/**
 * brain-lab — scenario runners.
 *
 * Two scenario kinds:
 *
 *  - "phrase":     user phrasing → draftPlan → validatePlan → evaluatePlan on the
 *                  sample library; plus interpretGoal (B1) when it is present.
 *  - "learning":   a synthetic within-epoch event stream → deriveEpochPolicy (B2)
 *                  when present; probes adjustments/hides; composes a resolve and
 *                  checks reordering/hiding; plus an isolation window and a
 *                  learning_reset scenario via `extends`.
 *
 * All probes call ONLY exported module functions with explicit (already-pinned)
 * `now` values. The lab never writes into apps/brain stores and never imports
 * apps/brain/src/index.ts (which would start a server).
 */

import type { LoadedModule } from "./modules.mts";
import { pickExport } from "./modules.mts";
import { ScenarioRun } from "./checks.mts";
import { buildStream, resolveNow, type LabEvent, type StreamSpec } from "./events.mts";
import { j, errorMessage } from "./util.mts";

/** Pinned wall clock for interpretation calls — keeps phrase scenarios deterministic. */
export const PINNED_NOW_ISO = "2026-10-06T19:00:00-05:00";
const PINNED_NOW = Date.parse(PINNED_NOW_ISO);

export type LabContext = {
  library: { version: string; tracks: Array<{ id: string; [key: string]: unknown }> };
  trackIds: ReadonlySet<string>;
  modules: Map<string, LoadedModule>;
};

type PhraseSpec = {
  text: string;
  slug?: string;
  intent?: { expect_accuracy?: string; expect_accuracy_in?: string[]; chosen_validates?: boolean; min_readings?: number };
  pipeline?: { expect_validation?: "ok" | "fail" | "either"; expect_underfilled?: boolean; min_strict?: number };
};

export type Scenario = {
  id: string;
  kind: string;
  title: string;
  /** Free-form adjudication note (kept in evidence, ignored by the runner). */
  note?: string;
  phrases?: PhraseSpec[];
  phrase?: string;
  slug?: string;
  intent?: PhraseSpec["intent"];
  pipeline?: PhraseSpec["pipeline"];
  stream?: StreamSpec;
  now?: string;
  checks?: LearningChecks;
  /** kind: "culture" — culture-language prompts + defensive assertions (scenario 08). */
  prompts?: CulturePromptSpec[];
  /** kind: "culture" — words that must never appear in product-authored copy (quoted user echo excepted; see runCultureScenario). */
  banned_words?: string[];
};

type LearningChecks = {
  adjust_positive?: string[];
  adjust_negative?: string[];
  adjust_zero?: string[];
  /** Each listed track: the parts list must contain at least one negative contribution (skip evidence visible in reasons). */
  negative_parts?: string[];
  require_parts?: boolean;
  skip_hidden?: string[];
  hides_empty?: boolean;
  /**
   * C1-F1 regression probe (scenario 05): `sequenceTracks` with a wave arc over a
   * synthetic fixture. Odd measured counts must be full permutations with no
   * `undefined` (the pre-fix bug: one track dropped + `undefined` last slot → null
   * in JSON → queue build crash); even counts must keep the pre-fix interleave
   * byte-identical (H1 receipt §H1-1). Fixture + expected orders are declarative;
   * the runner only executes and compares.
   */
  sequence_wave?: SequenceWaveSpec;
  resolve?: {
    playlist_id: string;
    plan_phrase: string;
    /**
     * Epoch hides (skip ×2 / not now) that must leave `strict` and be reported via
     * `counts.hidden_by_session` — NOT via the persistent `hidden` list (C2 F4
     * display contract: only persistent playlist removes are restorable).
     */
    hidden_by_session?: string[];
    improves?: string[];
    identical_to_baseline?: boolean;
  };
};

type SequenceWaveSpec = {
  /**
   * Synthetic mini-library in ascending `bpm` order. Under the documented proxy a
   * single measured component (bpm, tempo_confidence ≥ 0.5 → no damping) reduces
   * intensity to the clamped (bpm − 60)/120 term, so ascending bpm ⇒ strictly
   * ascending measured intensity — the fixture order IS the intensity order.
   */
  fixture: Array<{ id: string; bpm: number }>;
  odd_counts: number[];
  even_counts: number[];
  /** Expected track-id order per count, exactly as observed post-H1 (documented interleave). */
  expect_orders: Record<string, string[]>;
  note?: string;
};

/** Scenario 08 (kind: "culture") — prompts from C2 E1 with pinned observed outputs. */
export type CulturePromptSpec = {
  /** The prompt exactly as probed in C2 §E1 (`.cluster/synamp-fast-brain/evidence/c2/probe-interpret.mts`). */
  text: string;
  slug: string;
  /**
   * Unparsed culture span that must be surfaced in ≥ 1 ask as user echo (culture
   * prompts only; controls omit it). The span must never appear outside quoted
   * echo in reading/ask/audit product text — no invented culture semantics.
   */
  span?: string;
  /** Outputs exactly as observed at the H4 capture — regression pins, not accuracy claims. */
  expect: {
    accuracy: string;
    chosen_index: number;
    labels: string[];
    asks: number;
  };
};

const ACCURACIES = ["specific", "partial", "vague", "contradictory", "impossible"];

export async function runScenario(scenario: Scenario, ctx: LabContext): Promise<ScenarioRun> {
  if (scenario.kind === "phrase") return runPhraseScenario(scenario, ctx);
  if (scenario.kind === "learning") return runLearningScenario(scenario, ctx);
  if (scenario.kind === "culture") return runCultureScenario(scenario, ctx);
  const run = new ScenarioRun(scenario.id, scenario.title, scenario.kind);
  run.fail("kind", "phrase | learning | culture", `unknown scenario kind "${scenario.kind}"`);
  return run;
}

// ---------------------------------------------------------------------------
// kind: phrase
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 4).join("-");
}

function phraseList(scenario: Scenario): PhraseSpec[] {
  if (Array.isArray(scenario.phrases)) return scenario.phrases;
  if (typeof scenario.phrase === "string") return [{ text: scenario.phrase, slug: scenario.slug, intent: scenario.intent, pipeline: scenario.pipeline }];
  return [];
}

async function runPhraseScenario(scenario: Scenario, ctx: LabContext): Promise<ScenarioRun> {
  const run = new ScenarioRun(scenario.id, scenario.title, scenario.kind);
  const phrases = phraseList(scenario);
  if (!phrases.length) run.fail("scenario-shape", "at least one phrase", "no phrase(s) in scenario");
  for (const phrase of phrases) await runOnePhrase(run, phrase, ctx);
  return run;
}

async function runOnePhrase(run: ScenarioRun, phrase: PhraseSpec, ctx: LabContext): Promise<void> {
  const slug = phrase.slug ?? slugify(phrase.text);
  run.note(`phrase "${phrase.text}"`);

  // --- draft → validate → evaluate (the existing P2 pipeline) ---------------
  const { fn: draftFn } = pickExport(ctx.modules.get("draft"), ["draftPlan"]);
  let draft: any = null;
  if (!draftFn) {
    run.pending(`${slug}/pipeline-draft`, "query/draft.ts not usable");
  } else {
    try {
      draft = draftFn(phrase.text, ctx.library);
      const shapeOk = !!draft && Array.isArray(draft.recognized) && Array.isArray(draft.unparsed) && !!draft.plan && typeof draft.plan === "object";
      run.check(`${slug}/pipeline-draft`, shapeOk, "draft with recognized[]/unparsed[]/plan{}", shapeOk ? `recognized ${draft.recognized.length}, unparsed ${draft.unparsed.length}` : j(draft));
      if (shapeOk) {
        run.note(`recognized: ${j(draft.recognized.map((r: any) => `${r.phrase} -> ${r.becomes}`))}`);
        run.note(`unparsed: ${j(draft.unparsed)}`);
      }
    } catch (error) {
      run.fail(`${slug}/pipeline-draft`, "no throw", errorMessage(error));
    }
  }

  const { fn: planFn } = pickExport(ctx.modules.get("plan"), ["validatePlan"]);
  let checked: any = null;
  if (!draft) {
    run.pending(`${slug}/pipeline-validates`, "draft step produced no plan to validate");
  } else if (!planFn) {
    run.pending(`${slug}/pipeline-validates`, "query/plan.ts not usable");
  } else {
    try {
      checked = planFn(draft.plan);
      const expect = phrase.pipeline?.expect_validation ?? "either";
      const detail = checked?.ok
        ? `ok (hash ${String(checked.hash).slice(0, 12)})`
        : `invalid (${checked?.errors?.length ?? 0} errors: ${j(checked?.errors)})`;
      if (expect === "ok") run.check(`${slug}/pipeline-validates`, checked?.ok === true, "valid plan", detail);
      else if (expect === "fail") run.check(`${slug}/pipeline-validates`, checked?.ok === false, "invalid plan (expected)", detail);
      else run.check(`${slug}/pipeline-validation-structure`, !!checked && typeof checked.ok === "boolean", "validatePlan result well-formed", detail);
      if (!checked?.ok) run.note(`validation errors: ${j(checked?.errors)}`);
    } catch (error) {
      run.fail(`${slug}/pipeline-validates`, "no throw", errorMessage(error));
    }
  }

  const { fn: evalFn } = pickExport(ctx.modules.get("evaluate"), ["evaluatePlan"]);
  if (!checked?.ok) {
    run.skip(`${slug}/pipeline-evaluate`, "legacy plan did not validate — evaluation not applicable (when a B1 chosen reading validates, its plan is evaluated by intent-chosen-evaluates)");
  } else if (!evalFn) {
    run.pending(`${slug}/pipeline-evaluate`, "query/evaluate.ts not usable");
  } else {
    try {
      const evaluation = evalFn(checked, ctx.library);
      const ids: string[] = evaluation.strict.map((track: any) => track.id);
      const unique = new Set(ids).size === ids.length;
      const allKnown = ids.every((id) => ctx.trackIds.has(id));
      const withinTarget = evaluation.strict.length <= checked.plan.target_size;
      const libraryCount = evaluation.counts?.library === ctx.library.tracks.length;
      run.check(
        `${slug}/pipeline-evaluate`,
        unique && allKnown && withinTarget && libraryCount,
        "evaluation invariants hold",
        `strict ${evaluation.strict.length}/${checked.plan.target_size}, near ${evaluation.near_miss.length}, library ${evaluation.counts?.library}, unique=${unique}, allInLibrary=${allKnown}, underfilled=${evaluation.underfilled}`,
      );
      run.note(`top strict: ${j(evaluation.strict.slice(0, 5).map((track: any) => track.id))}`);
      if (phrase.pipeline?.expect_underfilled !== undefined) {
        run.check(`${slug}/pipeline-underfilled`, evaluation.underfilled === phrase.pipeline.expect_underfilled, `underfilled=${phrase.pipeline.expect_underfilled}`, `underfilled=${evaluation.underfilled}`);
      }
      if (phrase.pipeline?.min_strict !== undefined) {
        run.check(`${slug}/pipeline-min-strict`, evaluation.strict.length >= phrase.pipeline.min_strict, `strict >= ${phrase.pipeline.min_strict}`, `strict ${evaluation.strict.length}`);
      }
    } catch (error) {
      run.fail(`${slug}/pipeline-evaluate`, "no throw", errorMessage(error));
    }
  }

  // --- interpretation (B1 module, when present) ------------------------------
  const { fn: intentFn, used: intentUsed } = pickExport(ctx.modules.get("intent"), ["interpretGoal"]);
  if (!intentFn) {
    run.pending(`${slug}/intent-interpret`, "apps/brain/src/intent/interpret.ts not present yet");
  } else {
    try {
      const interpretation = intentFn(phrase.text, { library: ctx.library, now: PINNED_NOW });
      const readings: any[] = Array.isArray(interpretation?.readings) ? interpretation.readings : [];
      const accuracyOk = ACCURACIES.includes(interpretation?.accuracy);
      const shapeOk = readings.every((reading) =>
        reading && typeof reading.label === "string" && typeof reading.confidence === "number"
        && reading.confidence >= 0 && reading.confidence <= 1 && !!reading.plan && typeof reading.plan === "object"
        && Array.isArray(reading.assumptions));
      const chosenIndex = interpretation?.chosen_index;
      const chosenOk = Number.isInteger(chosenIndex)
        && (readings.length === 0 ? chosenIndex === -1 : chosenIndex >= 0 && chosenIndex < readings.length);
      const parserOk = typeof interpretation?.parser === "string" && interpretation.parser.length > 0;
      const arraysOk = Array.isArray(interpretation?.asks) && Array.isArray(interpretation?.audit);
      // With no readings, the asks must carry the next step (never a dead end) — the fallback contract.
      const fallbackOk = readings.length > 0 || (arraysOk && interpretation.asks.length >= 1);
      run.check(
        `${slug}/intent-structural`,
        accuracyOk && shapeOk && chosenOk && parserOk && arraysOk && fallbackOk,
        `accuracy in [${ACCURACIES.join(", ")}], well-formed readings (any count; chosen_index -1 only when empty), parser string, asks[]+audit[], asks non-empty when no readings`,
        `accuracy=${interpretation?.accuracy}, readings=${readings.length}, chosen=${interpretation?.chosen_index}, parser=${j(interpretation?.parser)}, asks=${interpretation?.asks?.length}, audit=${interpretation?.audit?.length}`,
      );
      const { fn: planFnB } = pickExport(ctx.modules.get("plan"), ["validatePlan"]);
      if (planFnB && readings.length) {
        let okCount = 0;
        const invalid: string[] = [];
        for (const reading of readings) {
          try {
            const result = planFnB(reading.plan);
            if (result?.ok) okCount += 1;
            else invalid.push(`${reading.label}: ${result?.errors?.[0]?.message ?? "invalid"}`);
          } catch (error) {
            invalid.push(`${reading.label}: threw ${errorMessage(error)}`);
          }
        }
        run.note(`reading plans: ${okCount}/${readings.length} validate ok${invalid.length ? `; issues: ${j(invalid)}` : ""}`);
      }
      if (phrase.intent?.expect_accuracy) {
        run.check(`${slug}/intent-accuracy`, interpretation?.accuracy === phrase.intent.expect_accuracy, `accuracy=${phrase.intent.expect_accuracy}`, `accuracy=${interpretation?.accuracy}`);
      } else if (phrase.intent?.expect_accuracy_in?.length) {
        const allowed = phrase.intent.expect_accuracy_in;
        run.check(`${slug}/intent-accuracy`, allowed.includes(interpretation?.accuracy), `accuracy in [${allowed.join(", ")}]`, `accuracy=${interpretation?.accuracy}`);
      }
      if (phrase.intent?.min_readings !== undefined) {
        run.check(`${slug}/intent-min-readings`, readings.length >= phrase.intent.min_readings, `>= ${phrase.intent.min_readings} readings`, `${readings.length}`);
      }
      if (phrase.intent?.chosen_validates && planFnB) {
        const chosen = readings[interpretation?.chosen_index];
        let detail = "no chosen reading";
        let ok = false;
        let chosenChecked: any = null;
        if (chosen) {
          try {
            chosenChecked = planFnB(chosen.plan);
            ok = chosenChecked?.ok === true;
            detail = ok ? `ok (hash ${String(chosenChecked.hash).slice(0, 12)})` : `invalid: ${j(chosenChecked?.errors)}`;
          } catch (error) {
            detail = `threw ${errorMessage(error)}`;
          }
        }
        run.check(`${slug}/intent-chosen-validates`, ok, "chosen reading's plan validates", detail);
        // Converted not-applicable: when the legacy draft plan could not validate (so
        // pipeline-evaluate was skipped), evaluate the chosen reading's plan instead — the same
        // plan /plans/draft validates and previews — and assert the pipeline invariants.
        if (ok && chosenChecked && checked && checked.ok === false && evalFn) {
          try {
            const evaluation = evalFn(chosenChecked, ctx.library);
            const ids: string[] = evaluation.strict.map((track: any) => track.id);
            const unique = new Set(ids).size === ids.length;
            const allKnown = ids.every((id) => ctx.trackIds.has(id));
            const withinTarget = evaluation.strict.length <= chosenChecked.plan.target_size;
            const libraryCount = evaluation.counts?.library === ctx.library.tracks.length;
            run.check(
              `${slug}/intent-chosen-evaluates`,
              unique && allKnown && withinTarget && libraryCount,
              "chosen reading's plan evaluates with pipeline invariants (legacy plan did not validate)",
              `strict ${evaluation.strict.length}/${chosenChecked.plan.target_size}, near ${evaluation.near_miss.length}, unique=${unique}, allInLibrary=${allKnown}, underfilled=${evaluation.underfilled} (via B1 chosen reading)`,
            );
          } catch (error) {
            run.fail(`${slug}/intent-chosen-evaluates`, "no throw", errorMessage(error));
          }
        }
      }
      run.note(`interpretation (via ${intentUsed}): ${j({ accuracy: interpretation?.accuracy, readings: readings.map((r) => r.label), chosen: interpretation?.chosen_index })}`);
    } catch (error) {
      run.fail(`${slug}/intent-interpret`, "no throw", errorMessage(error));
    }
  }
}

// ---------------------------------------------------------------------------
// kind: learning
// ---------------------------------------------------------------------------

type Adj = { value: number; parts: Array<{ label: string; value: number }> };

function normalizeAdjustment(raw: unknown): Adj {
  if (typeof raw === "number") return { value: raw, parts: [] };
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const value = typeof record.value === "number" ? record.value : 0;
    const parts = Array.isArray(record.parts)
      ? record.parts.map((part: any) => ({ label: String(part?.label ?? "?"), value: typeof part?.value === "number" ? part.value : 0 }))
      : [];
    return { value, parts };
  }
  return { value: 0, parts: [] };
}

function formatAdj(adj: Adj): string {
  return `${adj.value >= 0 ? "+" : ""}${adj.value.toFixed(3)} [${adj.parts.map((part) => `${part.label} (${part.value.toFixed(2)})`).join("; ") || "no parts"}]`;
}

/** Epoch hides: prefer the module's explicit epochHides(); fall back to a `hides` set or removed(playlistId). */
function hidesOf(view: any, playlistId: string): ReadonlySet<string> | null {
  if (!view) return null;
  if (typeof view.epochHides === "function") {
    try {
      const h = view.epochHides();
      if (h && typeof h.has === "function") return h as ReadonlySet<string>;
      if (Array.isArray(h)) return new Set(h as string[]);
    } catch {
      // fall through to the other surfaces
    }
  }
  if (view.hides && typeof view.hides.has === "function") return view.hides as ReadonlySet<string>;
  if (Array.isArray(view.hides)) return new Set(view.hides as string[]);
  if (typeof view.removed === "function") {
    try {
      const removed = view.removed(playlistId);
      if (removed && typeof removed.has === "function") return removed as ReadonlySet<string>;
    } catch {
      return null;
    }
  }
  return null;
}

/** A3 §3.6 deltas 1–4: signals that moved from L1 (heuristic-v1) to L2 (epoch layer). */
const L2_ONLY_SIGNALS = new Set(["skip_early", "full_play", "repeat", "external_play"]);
function eventsForL1(events: readonly LabEvent[]): LabEvent[] {
  return events.filter((event) => !L2_ONLY_SIGNALS.has(event.signal)
    && !((event.signal === "thumb_down" || event.signal === "remove") && event.reason === "not_now"));
}

/**
 * Fallback composition, kept for module shapes that expose an adaptive view
 * (adjust/hides) but not the combined FeedbackView surface: blend the filtered
 * explicit-only v1 with the epoch view inside the single map that evaluate.ts
 * applies (`feedbackBonus(combined)`, A3 eq. 4). The shipped combined view
 * (learning/derive.ts) takes the direct path and never this one.
 */
function composeEpochView(base: any, adaptive: any, playlistId: string): any {
  const hides = hidesOf(adaptive, playlistId) ?? new Set<string>();
  return {
    policy_version: `${base.policy_version}+epoch (harness composition)`,
    events: base.events,
    removed: (pid: string) => new Set<string>([...base.removed(pid), ...hides]),
    adjust: (id: string, pid?: string) => {
      const b = normalizeAdjustment(base.adjust(id, pid));
      const a = normalizeAdjustment(adaptive.adjust(id, pid));
      return { value: b.value + a.value, parts: [...b.parts, ...a.parts] };
    },
  };
}

async function runLearningScenario(scenario: Scenario, ctx: LabContext): Promise<ScenarioRun> {
  const run = new ScenarioRun(scenario.id, scenario.title, scenario.kind);
  const checks = scenario.checks ?? {};

  // --- stream -----------------------------------------------------------------
  if (!scenario.stream) {
    run.fail("stream-built", "stream spec present", "scenario has no stream");
    return run;
  }
  let built: ReturnType<typeof buildStream> | null = null;
  try {
    built = buildStream(scenario.stream, ctx.trackIds, {
      playlistId: scenario.stream.playlist_id ?? "pl-lab",
      sessionId: scenario.stream.session_id ?? "sess-lab",
      planHash: scenario.stream.plan_hash ?? "c".repeat(64),
      idPrefix: `lab:${scenario.id}`,
    });
    const first = built.events[0]?.ts ?? built.baseTs;
    run.check("stream-built", built.events.length > 0, ">=1 event", `${built.events.length} events · signals ${j(built.bySignal)} · ${new Date(first).toISOString()} → ${new Date(built.endTs).toISOString()}`);
  } catch (error) {
    run.fail("stream-built", "stream builds", errorMessage(error));
    return run;
  }
  if (!scenario.now || !/^\+\d+[smh]$/.test(scenario.now)) {
    run.fail("stream-now", `now offset like "+29m"`, `now=${j(scenario.now)}`);
    return run;
  }
  const now = resolveNow(scenario.now, built.baseTs);
  run.note(`now = ${new Date(now).toISOString()} (${scenario.now} after base; stream ends ${new Date(built.endTs).toISOString()}, Δend→now ${((now - built.endTs) / 60_000).toFixed(1)} min)`);

  // --- learning module ----------------------------------------------------------
  const { fn: deriveFn, used: deriveUsed, reason: deriveReason } = pickExport(ctx.modules.get("learning"), ["deriveEpochPolicy", "deriveAdaptive"]);
  const wantsAdjust = !!(checks.adjust_positive || checks.adjust_negative || checks.adjust_zero || checks.negative_parts);
  const wantsHides = !!(checks.skip_hidden || checks.hides_empty);
  let view: any = null;

  if (!deriveFn) {
    if (wantsAdjust) run.pending("learning-adjust", deriveReason);
    if (wantsHides) run.pending("learning-hides", deriveReason);
  } else {
    try {
      view = deriveFn(built.events, {
        now,
        library: ctx.library,
        ...(scenario.stream.timezone ? { timezone: scenario.stream.timezone } : {}),
        context: {
          ...(checks.resolve?.playlist_id ? { playlist_id: checks.resolve.playlist_id } : {}),
          ...(scenario.stream.plan_hash ? { plan_hash: scenario.stream.plan_hash } : {}),
          ...(checks.resolve?.plan_phrase ? { goal: checks.resolve.plan_phrase } : {}),
        },
      });
      const structureOk = !!view && typeof view.adjust === "function" && (hidesOf(view, "pl-lab") !== null);
      run.check(
        "learning-view-structure",
        structureOk,
        "view with adjust() + hides (epochHides() / hides / removed())",
        `via ${deriveUsed} · policy=${j(view?.policy_version)} · epoch=${j(view?.epoch?.id ?? view?.epoch_id ?? null)} · epochHides=${typeof view?.epochHides === "function" ? "yes" : "no"} · removed=${typeof view?.removed === "function" ? "yes" : "no"} · proposals=${typeof view?.proposals === "function" ? "yes" : "no"} · reliabilityNotes=${typeof view?.reliabilityNotes === "function" ? "yes" : "no"}`,
      );
      if (typeof view?.reliabilityNotes === "function") {
        try {
          const notes = view.reliabilityNotes();
          if (Array.isArray(notes) && notes.length) run.note(`reliability notes: ${j(notes)}`);
        } catch { /* recording only */ }
      }
    } catch (error) {
      run.fail("learning-derive", "no throw", errorMessage(error));
    }
  }

  // --- adjustment probes --------------------------------------------------------
  const playlistId = checks.resolve?.playlist_id ?? "pl-lab";
  if (view && typeof view.adjust === "function") {
    const probe = (id: string): string => {
      try {
        return formatAdj(normalizeAdjustment(view.adjust(id, playlistId)));
      } catch (error) {
        return `threw ${errorMessage(error)}`;
      }
    };
    const valueOf = (id: string): number => {
      try {
        return normalizeAdjustment(view.adjust(id, playlistId)).value;
      } catch {
        return Number.NaN;
      }
    };
    if (checks.adjust_positive) {
      const rows = checks.adjust_positive.map((id) => `${id}: ${probe(id)}`);
      const ok = checks.adjust_positive.every((id) => valueOf(id) > 0);
      const partsOk = !checks.require_parts || checks.adjust_positive.every((id) => {
        try {
          return normalizeAdjustment(view.adjust(id, playlistId)).parts.length >= 1;
        } catch {
          return false;
        }
      });
      run.check("learning-adjust-positive", ok && partsOk, `value > 0${checks.require_parts ? " with visible parts" : ""} for ${checks.adjust_positive.join(", ")}`, rows.join(" | "));
    }
    if (checks.adjust_negative) {
      const rows = checks.adjust_negative.map((id) => `${id}: ${probe(id)}`);
      const ok = checks.adjust_negative.every((id) => valueOf(id) < 0);
      run.check("learning-adjust-negative", ok, `value < 0 for ${checks.adjust_negative.join(", ")}`, rows.join(" | "));
    }
    if (checks.negative_parts) {
      const rows: string[] = [];
      let ok = true;
      for (const id of checks.negative_parts) {
        try {
          const adj = normalizeAdjustment(view.adjust(id, playlistId));
          const negatives = adj.parts.filter((part) => part.value < 0);
          if (!negatives.length) ok = false;
          rows.push(`${id}: ${negatives.map((part) => `${part.label} (${part.value.toFixed(2)})`).join("; ") || "no negative parts"}`);
        } catch (error) {
          ok = false;
          rows.push(`${id}: threw ${errorMessage(error)}`);
        }
      }
      run.check("learning-negative-parts", ok, `each of [${checks.negative_parts.join(", ")}] shows >=1 negative part`, rows.join(" | "));
    }
    if (checks.adjust_zero) {
      const rows = checks.adjust_zero.map((id) => `${id}: ${probe(id)}`);
      const ok = checks.adjust_zero.every((id) => {
        try {
          const adj = normalizeAdjustment(view.adjust(id, playlistId));
          return adj.value === 0 && adj.parts.length === 0;
        } catch {
          return false;
        }
      });
      run.check("learning-adjust-zero", ok, `value === 0 and no parts for ${checks.adjust_zero.join(", ")}`, rows.join(" | "));
    }
    if (checks.skip_hidden || checks.hides_empty) {
      const hidden = hidesOf(view, playlistId);
      if (!hidden) {
        run.fail("learning-hides", "hides or removed() accessible", "view exposes no hide channel");
      } else {
        if (checks.skip_hidden) {
          const list = [...hidden];
          const ok = checks.skip_hidden.every((id) => hidden.has(id));
          run.check("learning-skip-hidden", ok, `hidden: ${checks.skip_hidden.join(", ")}`, `hidden=[${list.join(", ")}]`);
        }
        if (checks.hides_empty) {
          run.check("learning-hides-empty", hidden.size === 0, "hidden set empty", `hidden=[${[...hidden].join(", ")}]`);
        }
      }
    }
  } else if (deriveFn && wantsAdjust) {
    // deriveFn existed but produced no usable view; the structure check above already failed.
    run.skip("learning-adjust", "no usable view (see learning-view-structure)");
    if (wantsHides) run.skip("learning-hides", "no usable view (see learning-view-structure)");
  }

  // --- resolve composition ------------------------------------------------------
  if (checks.resolve) {
    await runResolve(run, checks.resolve, ctx, built, now, view, deriveReason);
  }

  // --- sequence wave probe (C1-F1 regression; declared by scenario 05) ----------
  if (checks.sequence_wave) {
    runSequenceWaveProbe(run, checks.sequence_wave, ctx);
  }

  return run;
}

async function runResolve(
  run: ScenarioRun,
  resolveSpec: NonNullable<LearningChecks["resolve"]>,
  ctx: LabContext,
  built: NonNullable<ReturnType<typeof buildStream>>,
  now: number,
  view: any,
  viewReason: string,
): Promise<void> {
  const { fn: draftFn } = pickExport(ctx.modules.get("draft"), ["draftPlan"]);
  const { fn: planFn } = pickExport(ctx.modules.get("plan"), ["validatePlan"]);
  const { fn: evalFn } = pickExport(ctx.modules.get("evaluate"), ["evaluatePlan"]);
  if (!draftFn || !planFn || !evalFn) {
    run.pending("learning-resolve", `pipeline modules missing (draft=${!!draftFn}, plan=${!!planFn}, evaluate=${!!evalFn})`);
    return;
  }

  let checked: any = null;
  try {
    const draft = draftFn(resolveSpec.plan_phrase, ctx.library);
    checked = planFn(draft.plan);
    if (!checked?.ok) {
      run.fail("learning-resolve-plan", "resolve plan validates", `invalid: ${j(checked?.errors)}`);
      return;
    }
    run.pass("learning-resolve-plan", `ok (hash ${String(checked.hash).slice(0, 12)})`);
  } catch (error) {
    run.fail("learning-resolve-plan", "no throw", errorMessage(error));
    return;
  }

  // Baseline: the request alone, no learning applied.
  let baseline: any = null;
  try {
    baseline = evalFn(checked, ctx.library);
  } catch (error) {
    run.fail("learning-resolve", "baseline evaluation runs", errorMessage(error));
    return;
  }

  run.note(`baseline resolve: strict ${baseline.strict.length}, hidden ${baseline.hidden.length}, top: ${j(baseline.strict.slice(0, 5).map((track: any) => track.id))}`);

  let adapted: any = null;
  const viewUsable = !!view && typeof view.adjust === "function";
  if (!viewUsable) {
    run.pending("learning-resolve", `no feedback-compatible view available yet (${viewReason})`);
  } else {
    // Effective view: mirror index.ts policyOptions() for the shipped epoch mode (B5 landed).
    // The same combined view is passed as BOTH `feedback` and `adaptive`, and evaluate.ts
    // applies the decision-3 hide union at its own resolve seam:
    //   feedback.removed(playlistId ?? "") ∪ adaptive.epochHides()
    // The harness no longer re-implements the union; the composeEpochView branch below is a
    // fallback only for module shapes without the combined view (never the shipped shape).
    let effective: any = null;
    let adaptiveView: any = null;
    let via = "";
    if (typeof view.removed === "function") {
      if (typeof view.epochHides === "function") {
        effective = view;
        adaptiveView = view;
        via = "combined view as feedback + adaptive (mirrors index.ts policyOptions in epoch mode; evaluate.ts applies the removed(playlistId) ∪ epochHides() union at the resolve seam)";
      } else {
        effective = view;
        via = "combined view (feedback surface; view has no epochHides())";
      }
    } else {
      const { fn: feedbackFn } = pickExport(ctx.modules.get("feedback"), ["deriveFeedback"]);
      if (!feedbackFn) {
        run.pending("learning-resolve", "adaptive view has no removed(); session/feedback.ts unusable for composition");
      } else {
        try {
          const base = feedbackFn(eventsForL1(built.events), now);
          effective = composeEpochView(base, view, resolveSpec.playlist_id);
          via = "harness composition (fallback for module shapes without removed(): filtered explicit-only v1 + epoch view under one tanh)";
        } catch (error) {
          run.fail("learning-resolve", "composition builds", errorMessage(error));
        }
      }
    }
    if (effective) {
      run.note(`resolve feedback view: ${via}`);
      try {
        adapted = evalFn(checked, ctx.library, {
          feedback: effective,
          playlistId: resolveSpec.playlist_id,
          ...(adaptiveView ? { adaptive: adaptiveView } : {}),
        });
      } catch (error) {
        run.fail("learning-resolve", "adapted evaluation runs", errorMessage(error));
      }
    }
  }

  if (adapted) {
    run.check("learning-resolve-runs", adapted?.strict?.length >= 0, "adapted evaluation returns strict[]", `adapted strict ${adapted.strict.length} · hidden ${adapted.hidden.length} · baseline strict ${baseline.strict.length}`);

    if (resolveSpec.hidden_by_session?.length) {
      const baselineIds: string[] = baseline.strict.map((track: any) => track.id);
      const sanity = resolveSpec.hidden_by_session.every((id) => baselineIds.includes(id));
      run.check("learning-resolve-baseline-has-hidden", sanity, "baseline contains the later-hidden tracks", `in baseline: [${resolveSpec.hidden_by_session.filter((id) => baselineIds.includes(id)).join(", ")}]`);

      // C2 F4 display contract (post H2): epoch hides leave `strict` via the decision-3
      // union (removed(playlistId) ∪ epochHides()), are counted in counts.hidden_by_session,
      // and must NOT appear in the persistent `hidden` list — that list feeds the
      // restorable "Removed by you" surface, and offering Restore for a session hide is
      // a dead button (the hide clears only when the session ends / via Forget session).
      const strictIds: string[] = adapted.strict.map((track: any) => track.id);
      const persistentIds: string[] = (Array.isArray(adapted.hidden) ? adapted.hidden : []).map((track: any) => track.id);
      const countSession = adapted.counts?.hidden_by_session;
      const countYou = adapted.counts?.hidden_by_you;
      const outOfStrict = resolveSpec.hidden_by_session.every((id) => !strictIds.includes(id));
      const notPersistent = resolveSpec.hidden_by_session.every((id) => !persistentIds.includes(id));
      const countOk = countSession === resolveSpec.hidden_by_session.length;
      // Every track that left strict is accounted for by the two hide counters
      // (persistent removes ∪ epoch hides; a track in both counts once, under hidden_by_you).
      const drop = baseline.strict.length - adapted.strict.length;
      const dropOk = typeof countSession === "number" && typeof countYou === "number" && drop === countSession + countYou;
      run.check(
        "learning-resolve-hidden-by-session",
        outOfStrict && notPersistent && countOk && dropOk,
        `session-hidden tracks out of strict; counts.hidden_by_session === ${resolveSpec.hidden_by_session.length}; not in persistent hidden[]; strict drop accounted by the hidden counters`,
        `out of strict: [${resolveSpec.hidden_by_session.filter((id) => !strictIds.includes(id)).join(", ")}] · strict ${baseline.strict.length}→${adapted.strict.length} · counts.hidden_by_session=${countSession}, hidden_by_you=${countYou} · persistent hidden=[${persistentIds.join(", ")}]`,
      );
    }

    if (resolveSpec.improves?.length) {
      const baselineIndex = new Map<string, number>(baseline.strict.map((track: any, index: number) => [track.id, index]));
      const adaptedIndex = new Map<string, number>(adapted.strict.map((track: any, index: number) => [track.id, index]));
      const rows: string[] = [];
      let ok = true;
      for (const id of resolveSpec.improves) {
        const before = baselineIndex.get(id);
        const after = adaptedIndex.get(id);
        if (after === undefined) { ok = false; rows.push(`${id}: gone from strict (unexpected)`); continue; }
        if (before === undefined) { rows.push(`${id}: was not in baseline (#${after} now)`); continue; }
        if (!(after < before)) ok = false;
        rows.push(`${id}: #${before} → #${after}${after < before ? " ↑" : ""}`);
      }
      run.check("learning-resolve-improves", ok, `every kept track moves up: ${resolveSpec.improves.join(", ")}`, rows.join(" | "));
    }

    if (resolveSpec.identical_to_baseline) {
      const sameStrict = j(adapted.strict) === j(baseline.strict);
      const sameHidden = j(adapted.hidden) === j(baseline.hidden);
      const diffNote = sameStrict ? "" : `first difference: ${JSON.stringify(adapted.strict[0] ?? null)} vs ${JSON.stringify(baseline.strict[0] ?? null)}`;
      run.check("learning-resolve-identical", sameStrict && sameHidden, "adapted resolve identical to baseline (epoch inactive: zero/empty adjustments)", `strict equal=${sameStrict}, hidden equal=${sameHidden} ${diffNote}`);
    }
  }

  // Sequence module (B1): when present, apply post-evaluate like index.ts will and check it preserves the set.
  const seqInput = adapted ?? baseline;
  const { fn: sequenceFn, reason: sequenceReason } = pickExport(ctx.modules.get("sequence"), ["sequenceTracks"]);
  if (!sequenceFn) {
    run.pending("learning-resolve-sequence", `query/sequence.ts: ${sequenceReason}`);
  } else {
    try {
      const sequenced = sequenceFn(seqInput.strict, checked.plan, { library: ctx.library });
      const beforeIds = seqInput.strict.map((track: any) => track.id).sort();
      const afterIds = (sequenced?.tracks ?? []).map((track: any) => track.id).sort();
      const sameSet = j(beforeIds) === j(afterIds);
      run.check("learning-resolve-sequence", sameSet, "sequenceTracks preserves the strict set", `${sameSet ? "same set" : `CHANGED SET: ${beforeIds.length} → ${afterIds.length}`} · applied=${j(sequenced?.applied)}`);
    } catch (error) {
      run.fail("learning-resolve-sequence", "no throw", errorMessage(error));
    }
  }
}

// ---------------------------------------------------------------------------
// kind: learning — sequence wave probe (C1-F1 regression)
// ---------------------------------------------------------------------------

/**
 * Regression harness for the fixed C1-F1 wave bug (H1 receipt §H1-1):
 *
 *  - ODD measured counts (1, 3, 5): pre-fix, `wave` dropped one measured track and
 *    emitted `undefined` into the last measured slot (→ `null` in JSON, `TypeError`
 *    in the queue mapping → route 500). Post-fix each count must be a FULL
 *    PERMUTATION of the input with no `undefined` / null at any surface.
 *  - EVEN measured counts (2, 4): must keep the pre-fix interleave BYTE-identical
 *    (n = 4 → [w3, w1, w4, w2], documented in the H1 receipt).
 *  - `applied[]` keeps the post-H1-2 wording (pace/energy proxy — not "measured
 *    intensity") with 100% coverage.
 *
 * The fixture and the expected orders are declared by the scenario; this probe only
 * executes `sequenceTracks` (plus `validatePlan` for the wave plan) and compares.
 */
function runSequenceWaveProbe(run: ScenarioRun, spec: SequenceWaveSpec, ctx: LabContext): void {
  const CHECK_IDS = ["sequence-wave-odd-f1", "sequence-wave-odd-order", "sequence-wave-even-bytes", "sequence-wave-applied-note"];
  const { fn: planFn } = pickExport(ctx.modules.get("plan"), ["validatePlan"]);
  const { fn: sequenceFn, reason: sequenceReason } = pickExport(ctx.modules.get("sequence"), ["sequenceTracks"]);
  if (!planFn || !sequenceFn) {
    const reason = `sequence_wave probe needs plan + sequence modules (plan=${planFn ? "ok" : "missing"}, sequence: ${sequenceReason})`;
    for (const id of CHECK_IDS) run.pending(id, reason);
    return;
  }
  if (spec.note) run.note(`sequence_wave probe: ${spec.note}`);

  // Synthetic mini-library: ascending bpm, one measured component → strictly ascending intensity.
  const fixtureLib = {
    version: "lab-wave-fixture",
    tracks: spec.fixture.map((item) => ({
      id: item.id, title: item.id, artist: "brain-lab",
      signals: { bpm: item.bpm, tempo_confidence: 0.9 },
    })),
  };

  // Wave plan: hand-built through the real validator (same shape as C1's p3 probe).
  const wavePlanSpec = {
    version: "2.0", intent: { query_type: "attribute" }, target_size: 30,
    constraints: [{ id: "c1", source_phrase: "anything audible", hard: false, weight: 0.5, unknown_policy: "include", confidence: 0.6,
      where: { field: "lufs_integrated", op: "gte", value: -70 } }],
    ranking: { signals: [] }, relaxation: { min_results: 1, tiers: "strict_plus_near_miss", ladder: [] },
    sequencing: { arc: "wave" },
  };
  const checkedWave = planFn(wavePlanSpec) as any;
  if (!checkedWave?.ok) {
    for (const id of CHECK_IDS) run.fail(id, "wave plan validates via validatePlan", `invalid plan: ${j(checkedWave?.errors)}`);
    return;
  }

  const runWave = (count: number): { out: any | null; error: string | null } => {
    try {
      const strict = spec.fixture.slice(0, count).map((item) => ({ id: item.id, title: item.id }));
      return { out: sequenceFn(strict, checkedWave.plan, { library: fixtureLib }), error: null };
    } catch (error) {
      return { out: null, error: errorMessage(error) };
    }
  };
  const idsOf = (out: any): Array<string | undefined> => (out?.tracks ?? []).map((track: any) => track?.id);

  // 1) C1-F1 regression: odd counts are full permutations, no undefined, JSON-clean.
  {
    const rows: string[] = [];
    let ok = true;
    for (const count of spec.odd_counts) {
      const { out, error } = runWave(count);
      if (error) { ok = false; rows.push(`n=${count}: threw ${error}`); continue; }
      const ids = idsOf(out);
      const expectedIds = spec.fixture.slice(0, count).map((item) => item.id).sort();
      const lengthOk = (out?.tracks ?? []).length === count;
      const noUndefined = (out?.tracks ?? []).every((track: any) => !!track && typeof track.id === "string");
      const permutation = j([...ids].sort()) === j(expectedIds) && ids.length === count;
      const roundTrip = JSON.parse(JSON.stringify(out?.tracks ?? [])) as unknown[];
      const jsonClean = roundTrip.every((item) => !!item && typeof (item as any).id === "string");
      const countOk = lengthOk && noUndefined && permutation && jsonClean;
      if (!countOk) ok = false;
      rows.push(`n=${count}: ${j(ids)}${countOk ? "" : ` !(length=${lengthOk}, noUndefined=${noUndefined}, permutation=${permutation}, jsonClean=${jsonClean})`}`);
    }
    run.check("sequence-wave-odd-f1", ok, `full permutation of the input with no undefined and JSON-clean output for odd measured counts [${spec.odd_counts.join(", ")}]`, rows.join(" | "));
  }

  // 2) odd counts: exact documented interleave order (as observed post-H1).
  {
    const rows: string[] = [];
    let ok = true;
    for (const count of spec.odd_counts) {
      const expected = spec.expect_orders[String(count)];
      const { out, error } = runWave(count);
      if (error) { ok = false; rows.push(`n=${count}: threw ${error}`); continue; }
      if (!expected) { ok = false; rows.push(`n=${count}: scenario has no expect_orders entry`); continue; }
      const ids = idsOf(out);
      const match = j(ids) === j(expected);
      if (!match) ok = false;
      rows.push(`n=${count}: ${j(ids)}${match ? "" : ` (expected ${j(expected)})`}`);
    }
    run.check("sequence-wave-odd-order", ok, `documented upper/lower interleave order for odd counts [${spec.odd_counts.join(", ")}]`, rows.join(" | "));
  }

  // 3) even counts: the pre-fix interleave stays byte-identical (H1 §H1-1).
  {
    const rows: string[] = [];
    let ok = true;
    for (const count of spec.even_counts) {
      const expected = spec.expect_orders[String(count)];
      const { out, error } = runWave(count);
      if (error) { ok = false; rows.push(`n=${count}: threw ${error}`); continue; }
      if (!expected) { ok = false; rows.push(`n=${count}: scenario has no expect_orders entry`); continue; }
      const ids = idsOf(out);
      const match = j(ids) === j(expected);
      if (!match) ok = false;
      rows.push(`n=${count}: ${j(ids)}${match ? " (byte path kept)" : ` (expected ${j(expected)})`}`);
    }
    run.check("sequence-wave-even-bytes", ok, `pre-fix interleave preserved byte-identically for even counts [${spec.even_counts.join(", ")}]`, rows.join(" | "));
  }

  // 4) applied[] wording (post-H1-2: pace/energy proxy, not "measured intensity").
  {
    const allCounts = [...spec.odd_counts, ...spec.even_counts].sort((a, b) => a - b);
    const NOTE_RE = /^arc wave: ordered by measured pace\/energy proxy \(bpm, onsets, percussion, loudness\) — 100% coverage$/;
    const rows: string[] = [];
    let ok = true;
    for (const count of allCounts) {
      const { out, error } = runWave(count);
      if (error) { ok = false; rows.push(`n=${count}: threw ${error}`); continue; }
      const applied = out?.applied ?? [];
      const noteOk = applied.length === 1 && NOTE_RE.test(String(applied[0]));
      if (!noteOk) ok = false;
      rows.push(`n=${count}: ${j(applied)}`);
    }
    run.check("sequence-wave-applied-note", ok, "applied[] uses the fixed pace/energy-proxy wording (no \"measured intensity\") at 100% coverage", rows.join(" | "));
  }
}

// ---------------------------------------------------------------------------
// kind: culture — culture-language prompts stay defensive (scenario 08)
// ---------------------------------------------------------------------------

function stripQuotedSpans(text: string): string {
  return text.replace(/“[^”]*”/g, "");
}
function quotedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /“[^”]*”/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) ranges.push([match.index, match.index + match[0].length]);
  return ranges;
}

/**
 * Split a reading into (a) product-authored text to scan for span/claim leakage and
 * (b) input-recap fields (`plan.intent.summary`, `plan.retrieval_text`) that quote the
 * user's raw request — the same category as `audit.phrase`; they are counted, never
 * treated as product copy and never hidden.
 */
function readingCorpus(reading: any): { scan: string[]; recaps: string[] } {
  const scan: string[] = [
    String(reading?.label ?? ""),
    ...(Array.isArray(reading?.assumptions) ? reading.assumptions.map((item: unknown) => String(item)) : []),
  ];
  const recaps: string[] = [];
  const plan = reading?.plan;
  if (plan && typeof plan === "object") {
    const planSans = { ...(plan as Record<string, unknown>) };
    if (planSans.intent && typeof planSans.intent === "object") {
      const intent = planSans.intent as Record<string, unknown>;
      if (typeof intent.summary === "string") recaps.push(intent.summary);
      const { summary: _summary, ...intentRest } = intent;
      planSans.intent = intentRest;
    }
    if (typeof planSans.retrieval_text === "string") {
      recaps.push(planSans.retrieval_text as string);
      delete planSans.retrieval_text;
    }
    scan.push(j(planSans));
  } else {
    scan.push(j(plan));
  }
  return { scan, recaps };
}

/**
 * Scenario 08 — culture guardrails (seed: C2-bias-review.md §E1).
 *
 * Runs `interpretGoal` on the 10 culture prompts + 2 controls from C2's E1 probe and
 * asserts defensive behaviour only:
 *
 *  - `{slug}/pinned` — accuracy / chosen_index / reading labels / ask count exactly
 *    as observed at this capture (regression pins; NOT classifier-accuracy claims);
 *  - `culture-banned-strings` — the scenario's banned words never appear in
 *    product-authored copy (reading text, ask reason/near, stripped ask text, audit
 *    `becomes`); user echo in quoted ask spans and audit input phrases is expected
 *    and counted, not hidden;
 *  - `culture-no-culture-claims` — each unparsed culture span never appears OUTSIDE
 *    quoted echo in readings/asks/audit product text (no invented semantics; the
 *    span may only surface inside the “not understood”/echo channels);
 *  - `culture-spans-surfaced` — each culture span appears in ≥ 1 ask (user words
 *    echoed honestly, nothing silently dropped);
 *  - `culture-no-dead-ends` — a prompt with no readings still gets ≥ 1 ask.
 */
async function runCultureScenario(scenario: Scenario, ctx: LabContext): Promise<ScenarioRun> {
  const run = new ScenarioRun(scenario.id, scenario.title, scenario.kind);
  const prompts = scenario.prompts ?? [];
  const banned = scenario.banned_words ?? [];
  if (!prompts.length) {
    run.fail("scenario-shape", "prompts[] present", "no prompts in scenario");
    return run;
  }

  const { fn: intentFn, reason } = pickExport(ctx.modules.get("intent"), ["interpretGoal"]);
  if (!intentFn) {
    for (const prompt of prompts) run.pending(`${prompt.slug}/pinned`, reason);
    for (const id of ["culture-banned-strings", "culture-no-culture-claims", "culture-spans-surfaced", "culture-no-dead-ends"]) run.pending(id, reason);
    return run;
  }

  type Observation = { prompt: CulturePromptSpec; out: any };
  const observations: Observation[] = [];
  for (const prompt of prompts) {
    try {
      const out = intentFn(prompt.text, { library: ctx.library, now: PINNED_NOW });
      observations.push({ prompt, out });
      const labels: string[] = Array.isArray(out?.readings) ? out.readings.map((reading: any) => String(reading?.label)) : [];
      const asks = Array.isArray(out?.asks) ? out.asks.length : -1;
      const accuracyOk = out?.accuracy === prompt.expect.accuracy;
      const chosenOk = out?.chosen_index === prompt.expect.chosen_index;
      const labelsOk = j(labels) === j(prompt.expect.labels);
      const asksOk = asks === prompt.expect.asks;
      run.check(
        `${prompt.slug}/pinned`,
        accuracyOk && chosenOk && labelsOk && asksOk,
        `accuracy=${prompt.expect.accuracy}, chosen=${prompt.expect.chosen_index}, readings=${j(prompt.expect.labels)}, asks=${prompt.expect.asks}`,
        `accuracy=${out?.accuracy}, chosen=${out?.chosen_index}, readings=${j(labels)}, asks=${asks}`,
      );
    } catch (error) {
      run.fail(`${prompt.slug}/pinned`, "no throw", errorMessage(error));
    }
  }
  if (!observations.length) return run;

  // --- banned words: absent from product copy; raw occurrences only as quoted echo / input phrases ---
  {
    const violations: string[] = [];
    const echoes: string[] = [];
    const readingsCorpus = (out: any): string[] => (Array.isArray(out?.readings) ? out.readings : []).flatMap((reading: any) => {
      const { scan, recaps } = readingCorpus(reading);
      for (const recap of recaps) if (banned.some((word) => recap.toLowerCase().includes(word))) echoes.push(`input recap “${recap}”`);
      return scan;
    });
    for (const { prompt, out } of observations) {
      for (const ask of Array.isArray(out?.asks) ? out.asks : []) {
        const text = String(ask?.ask ?? "");
        const ranges = quotedRanges(text);
        for (const word of banned) {
          const lower = text.toLowerCase();
          let index = lower.indexOf(word);
          while (index >= 0) {
            const inside = ranges.some(([start, end]) => index >= start && index + word.length <= end);
            if (inside) echoes.push(`${prompt.slug}: ask quotes “${text.slice(index, index + word.length)}”`);
            else violations.push(`${prompt.slug}: "${word}" in ask outside quotes: “${text}”`);
            index = lower.indexOf(word, index + 1);
          }
        }
        for (const field of [String(ask?.reason ?? ""), String(ask?.nearest_supported ?? "")]) {
          for (const word of banned) if (field.toLowerCase().includes(word)) violations.push(`${prompt.slug}: "${word}" in ask reason/near: “${field}”`);
        }
      }
      for (const entry of Array.isArray(out?.audit) ? out.audit : []) {
        const phrase = String(entry?.phrase ?? "");
        const becomes = String(entry?.becomes ?? "");
        for (const word of banned) {
          if (phrase.toLowerCase().includes(word)) echoes.push(`${prompt.slug}: audit input phrase “${phrase}”`);
          if (becomes.toLowerCase().includes(word)) violations.push(`${prompt.slug}: "${word}" in audit becomes: “${becomes}”`);
        }
      }
      for (const text of readingsCorpus(out)) {
        for (const word of banned) if (stripQuotedSpans(text).toLowerCase().includes(word)) violations.push(`${prompt.slug}: "${word}" in reading text: “${text.slice(0, 100)}”`);
      }
    }
    run.check(
      "culture-banned-strings",
      violations.length === 0,
      `banned words [${banned.join(", ")}] absent from product-authored copy (quoted user echo + audit input phrases excepted)`,
      violations.length
        ? `${violations.length} violation(s): ${violations.join(" | ")}`
        : `no violations · allowed echoes: ${echoes.length ? echoes.slice(0, 8).join(" · ") : "none"}`,
    );
  }

  // --- no invented culture semantics: spans never appear outside quoted echo ---
  {
    const rows: string[] = [];
    let ok = true;
    for (const { prompt, out } of observations) {
      if (!prompt.span) continue;
      const span = prompt.span.toLowerCase();
      const corpus: string[] = [];
      let recapEchoes = 0;
      for (const reading of Array.isArray(out?.readings) ? out.readings : []) {
        const { scan, recaps } = readingCorpus(reading);
        corpus.push(...scan);
        recapEchoes += recaps.filter((text) => text.toLowerCase().includes(span)).length;
      }
      for (const ask of Array.isArray(out?.asks) ? out.asks : []) {
        corpus.push(String(ask?.ask ?? ""), String(ask?.reason ?? ""), String(ask?.nearest_supported ?? ""));
      }
      for (const entry of Array.isArray(out?.audit) ? out.audit : []) corpus.push(String(entry?.becomes ?? ""));
      const hits = corpus.filter((text) => stripQuotedSpans(text).toLowerCase().includes(span));
      if (hits.length) ok = false;
      rows.push(`${prompt.slug}: ${hits.length ? `HIT — “${hits[0].slice(0, 90)}”` : `clean${recapEchoes ? ` (input-recap echo ×${recapEchoes})` : ""}`}`);
    }
    run.check("culture-no-culture-claims", ok && rows.length > 0, "culture spans never appear outside quoted user echo in reading/ask/audit product text", rows.join(" | "));
  }

  // --- the span is surfaced to the user (nothing silently dropped) ---
  {
    const rows: string[] = [];
    let ok = true;
    for (const { prompt, out } of observations) {
      if (!prompt.span) continue;
      const span = prompt.span.toLowerCase();
      const asksForPrompt: any[] = Array.isArray(out?.asks) ? out.asks : [];
      const surfaced = asksForPrompt.some((ask) => String(ask?.ask ?? "").toLowerCase().includes(span));
      if (!surfaced) ok = false;
      rows.push(`${prompt.slug}: ${surfaced ? `surfaced (asks ${asksForPrompt.length})` : `NOT surfaced (asks ${asksForPrompt.length})`}`);
    }
    run.check("culture-spans-surfaced", ok, "each unparsed culture span appears in >= 1 ask (user words echoed honestly)", rows.join(" | "));
  }

  // --- no dead ends: no readings ⇒ ≥ 1 ask ---
  {
    const rows: string[] = [];
    let ok = true;
    for (const { prompt, out } of observations) {
      const readingCount = Array.isArray(out?.readings) ? out.readings.length : 0;
      const askCount = Array.isArray(out?.asks) ? out.asks.length : 0;
      const good = readingCount > 0 || askCount >= 1;
      if (!good) ok = false;
      rows.push(`${prompt.slug}: readings=${readingCount}, asks=${askCount}`);
    }
    run.check("culture-no-dead-ends", ok, "every prompt with no readings still gets >= 1 ask (never a dead end)", rows.join(" | "));
  }

  return run;
}

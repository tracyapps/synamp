/**
 * Draft parser — a deterministic, rule-based stand-in for the LLM parse step.
 *
 * It recognises a small, tested vocabulary (the dossier's flagship phrases) and
 * emits an *untrusted* plan object. That object goes through validatePlan()
 * exactly as LLM output will, so swapping in a local model later changes the
 * producer, not the safety rails.
 *
 * What it cannot read is reported, never guessed: unrecognised text is kept as
 * `unparsed` and as affirmative retrieval text for a future text encoder, which
 * has no effect today.
 */

import { INSTRUMENTS } from "./signals.ts";
import { encoderText, PLAN_VERSION } from "./plan.ts";
import type { Library } from "./evaluate.ts";

type RawConstraint = Record<string, unknown> & { id: string; source_phrase: string };
type RawAsk = { ask: string; reason: string; nearest_supported?: string; unenforced?: boolean };

export type Draft = {
  plan: Record<string, unknown>;
  recognized: Array<{ phrase: string; becomes: string }>;
  unparsed: string[];
  encoder_text: string;
};

const INSTRUMENT_WORDS: Record<string, string> = {
  ...Object.fromEntries(INSTRUMENTS.map((name) => [name.replace(/_/g, " "), name])),
  pianos: "piano", keys: "piano", guitars: "guitar", "acoustic guitars": "acoustic_guitar", "electric guitars": "electric_guitar",
  drum: "drums", violins: "violin", cellos: "cello", horns: "brass", trumpets: "trumpet", sax: "saxophone",
  saxophones: "saxophone", synth: "synthesizer", synths: "synthesizer", synthesizers: "synthesizer", organs: "organ", flutes: "flute",
};
const GENRES = ["punk", "country", "metal", "jazz", "classical", "hip hop", "hip-hop", "rap", "rock", "pop", "folk", "blues",
  "reggae", "edm", "techno", "house", "r&b", "soul", "gospel", "christmas", "emo", "ska", "disco", "opera",
  "ambient", "electronic", "indie", "soundtrack", "lo-fi", "lofi", "funk", "grunge", "shoegaze", "trip hop", "dub"];
/** Words after "not" that are conversational, not musical ("I'm not sure"). */
const FILLER = ["sure", "certain", "really", "quite", "bad", "much", "that", "this", "it", "too"];
const CALM = ["relaxing", "relaxed", "chill", "sleepy", "mellow", "calm", "meditative", "soothing"];
const WORDS = ["words", "vocals", "vocal", "lyrics", "singing", "singer", "voices"];

function alt(words: string[]): string {
  return [...words].sort((a, b) => b.length - a.length).map((word) => word.replace(/[.*+?^${}()|[\]\\&-]/g, "\\$&")).join("|");
}

export function draftPlan(prompt: string, library?: Library): Draft {
  const text = prompt.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 500);
  const lower = text.toLowerCase();
  const consumed: Array<[number, number]> = [];
  const constraints: RawConstraint[] = [];
  const unsupported: RawAsk[] = [];
  const assumptions: string[] = [];
  const recognized: Draft["recognized"] = [];
  const confirm: string[] = [];
  const signals: Array<{ name: string; weight: number }> = [];
  const positive: string[] = [];
  let caps: Record<string, number> | undefined;
  let flat = false;
  let size = 25;
  let queryType = "mixed";

  const take = (match: RegExpExecArray) => consumed.push([match.index, match.index + match[0].length]);
  const add = (constraint: RawConstraint, becomes: string) => {
    if (constraints.some((item) => item.id === constraint.id)) return;
    constraints.push(constraint);
    recognized.push({ phrase: constraint.source_phrase, becomes });
  };
  const each = (pattern: RegExp, fn: (match: RegExpExecArray) => void) => {
    for (const match of lower.matchAll(pattern)) { fn(match as RegExpExecArray); take(match as RegExpExecArray); }
  };
  const phrase = (match: RegExpExecArray) => text.slice(match.index, match.index + match[0].length).trim();

  const noWords = (source: string) => add({
    id: "no_words", source_phrase: source, hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.8,
    where: { any: [{ field: "vocal_fraction", op: "lte", value: 0.1 }, { field: "instrumental", op: "gte", value: 0.8 }] },
  }, "vocal_fraction ≤ 0.10 or instrumental ≥ 0.80 (hard; unmeasured fails)");

  const calmRule = (source: string) => add({
    id: "not_relaxing", source_phrase: source, hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.6,
    proxy: "relaxing → arousal composite + pulse clarity; mood tag corroborates",
    where: { all: [
      { field: "arousal", op: "gte", value: 0.35 },
      { field: "pulse_clarity", op: "gte", value: 0.4 },
      { field: "mood", op: "nin", value: ["relaxing", "meditative", "sleepy"], unknown_policy: "neutral" },
    ] },
  }, "arousal ≥ 0.35 and pulse_clarity ≥ 0.40, mood not relaxing/meditative/sleepy (hard)");

  // --- negations: "no X", "nothing too X/Y", "exclude X or Y" -------------------
  const negHead = String.raw`\b(?:no|without|minus|exclude|excluding|not|nothing|avoid|skip)\b(?:\s+(?:any|too|more|of|the|real|really|very|so))*\s+`;
  each(new RegExp(negHead + String.raw`([a-z&'\- ]+?(?:\s*(?:\/|,|\bor\b|\band\b|\bnor\b)\s*[a-z&'\-]+)*)(?=[.,;!?]|\s+(?:but|please|though|for|while|thanks)\b|$)`, "g"), (match) => {
    const source = phrase(match);
    const parts = match[1]!.split(/\s*(?:\/|,|\bor\b|\band\b|\bnor\b)\s*/).map((part) => part.trim()).filter(Boolean);
    const genres: string[] = [];
    // "nothing too slow/relaxing" → two rules, each named for its own half.
    const head = source.slice(0, source.length - match[1]!.length).trim();
    const whole = source;
    for (const part of parts) {
      const word = part.replace(/^(?:any|too|more)\s+/, "");
      const source = parts.length > 1 ? `${head} ${part}` : whole;
      if (FILLER.includes(word) || FILLER.includes(word.split(" ")[0]!)) continue;
      if (WORDS.includes(word)) noWords(source);
      else if (INSTRUMENT_WORDS[word]) {
        const name = INSTRUMENT_WORDS[word]!;
        add({
          id: `no_${name}`, source_phrase: source, hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.75,
          where: { field: `instruments.${name}`, op: "lt", value: 0.2 },
        }, `instruments.${name} < 0.20 (hard; unmeasured fails)`);
      } else if (/^(?:slow|slower|sluggish|draggy)$/.test(word)) {
        add({ id: "not_slow", source_phrase: source, hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.7,
          where: { field: "bpm", op: "gte", value: 90 } }, "bpm ≥ 90 (hard)");
      } else if (/^(?:fast|faster|frantic|hectic)$/.test(word)) {
        add({ id: "not_fast", source_phrase: source, hard: true, explicit_exclusion: true, unknown_policy: "exclude", confidence: 0.6,
          where: { field: "bpm", op: "lte", value: 140 } }, "bpm ≤ 140 (hard)");
      } else if (CALM.includes(word)) calmRule(source);
      else if (GENRES.includes(word)) genres.push(word.replace("hip-hop", "hip hop"));
      else unsupported.push({ ask: `${source.split(/\s+/)[0]} ${word}`, reason: `“${word}” is not something SynAmp can detect yet.`, unenforced: true });
    }
    if (genres.length) {
      add({ id: `no_genre_${genres.map((g) => g.replace(/[^a-z]/g, "")).join("_")}`.slice(0, 32), source_phrase: whole, hard: true, explicit_exclusion: true,
        unknown_policy: "neutral", confidence: 0.5, where: { field: "genre", op: "nin", value: genres } },
      `genre tag not ${genres.join(" / ")} (hard; untagged tracks pass but are marked unverified)`);
      unsupported.push({ ask: `audio check for ${genres.join(" / ")}`, reason: "Only genre tags enforce this today — no audio texture proxy exists, so untagged tracks are unverified.", nearest_supported: "genre tags" });
    }
  });

  // --- affirmative asks ---------------------------------------------------------
  each(/\binstrumentals?(?:\s+only)?\b/g, (match) => noWords(phrase(match)));
  each(/\b(?:between\s+)?(\d{2,3})\s*(?:-|–|to|and)\s*(\d{2,3})\s*bpm\b/g, (match) => {
    const [low, high] = [Number(match[1]), Number(match[2])].sort((a, b) => a - b);
    const id = "bpm_range"; confirm.push(id);
    add({ id, source_phrase: phrase(match), hard: true, unknown_policy: "exclude", confidence: 0.9, where: { field: "bpm", op: "between", value: [low, high] } }, `bpm ${low}–${high} (hard)`);
  });
  each(/\b(?:over|above|faster than|at least|more than)\s+(\d{2,3})\s*bpm\b/g, (match) => {
    confirm.push("bpm_min");
    add({ id: "bpm_min", source_phrase: phrase(match), hard: true, unknown_policy: "exclude", confidence: 0.9, where: { field: "bpm", op: "gte", value: Number(match[1]) } }, `bpm ≥ ${match[1]} (hard)`);
  });
  each(/\b(?:under|below|slower than|at most|less than)\s+(\d{2,3})\s*bpm\b/g, (match) => {
    confirm.push("bpm_max");
    add({ id: "bpm_max", source_phrase: phrase(match), hard: true, unknown_policy: "exclude", confidence: 0.9, where: { field: "bpm", op: "lte", value: Number(match[1]) } }, `bpm ≤ ${match[1]} (hard)`);
  });
  each(/\b(?:i\s+(?:need|want)\s+to\s+)?(?:focus(?:ed|ing)?|concentrat\w*|study(?:ing)?|deep work)\b/g, (match) => {
    const source = phrase(match);
    queryType = "activity"; flat = true; caps = { max_per_artist: 3, max_per_album: 1 };
    add({ id: "focus_arousal", source_phrase: source, hard: false, weight: 0.5, unknown_policy: "neutral", confidence: 0.4,
      proxy: "focus → moderate arousal", where: { field: "arousal", op: "between", value: [0.4, 0.6] } }, "prefer arousal 0.40–0.60 (soft)");
    add({ id: "focus_pulse", source_phrase: source, hard: false, weight: 0.5, unknown_policy: "neutral", confidence: 0.5,
      proxy: "focus → clear, steady pulse", where: { field: "pulse_clarity", op: "gte", value: 0.45 } }, "prefer pulse_clarity ≥ 0.45 (soft)");
    assumptions.push("“Focus” is not measurable on its own. It became a proxy bundle: moderate arousal, a clear pulse, a flat arc and variety caps.");
  });
  each(/\b(?:more\s+|high[- ])?(?:energetic|energy|upbeat|pumped|hype|driving)\b/g, (match) => {
    if (consumed.some(([start, end]) => match.index >= start && match.index < end)) return;
    add({ id: "energetic", source_phrase: phrase(match), hard: false, weight: 0.6, unknown_policy: "neutral", confidence: 0.5,
      proxy: "energy → arousal (not BPM)", where: { field: "arousal", op: "gte", value: 0.6 } }, "prefer arousal ≥ 0.60 (soft)");
    assumptions.push("“Energy” was read as arousal, not tempo. Microtiming is the other candidate proxy once it is validated.");
  });
  each(new RegExp(String.raw`\b(?:${alt(CALM)})\b`, "g"), (match) => {
    if (consumed.some(([start, end]) => match.index >= start && match.index < end)) return;
    add({ id: "calm", source_phrase: phrase(match), hard: false, weight: 0.6, unknown_policy: "neutral", confidence: 0.5,
      proxy: "calm → low arousal", where: { field: "arousal", op: "lte", value: 0.4 } }, "prefer arousal ≤ 0.40 (soft)");
  });
  const liked: string[] = [];
  each(new RegExp(String.raw`\b(?:${alt(GENRES)})\b`, "g"), (match) => {
    if (consumed.some(([start, end]) => match.index >= start && match.index < end)) return;
    liked.push(match[0].replace("hip-hop", "hip hop").replace("lofi", "lo-fi"));
  });
  if (liked.length) {
    add({ id: "genre_hint", source_phrase: liked.join(", "), hard: false, weight: 0.3, unknown_policy: "neutral", confidence: 0.4,
      where: { field: "genre", op: "in", value: [...new Set(liked)] } }, `prefer genre tag ${liked.join(" / ")} (soft — tags are weak evidence)`);
  }
  each(/\b(\d{1,3})\s*(?:songs|tracks)\b/g, (match) => { size = Math.min(500, Math.max(1, Number(match[1]))); });

  // --- exemplars: titles are resolved against the library, never invented ------------
  each(/\b(?:sounds?|feels?)\s+like\s+(.+?)(?=[.;!?]|$)|\bsimilar\s+(?:feel\s+|vibe\s+|sound\s+)?to\s+(.+?)(?=[.;!?]|$)|\bmore\s+like\s+(.+?)(?=[.;!?]|$)/g, (match) => {
    const group = match[1] ?? match[2] ?? match[3] ?? "";
    const original = text.slice(match.index + match[0].length - group.length, match.index + match[0].length);
    const names = original.split(/\s*(?:\+|,|&|\band\b)\s*/).map((name) => name.trim().replace(/^["“']|["”']$/g, "")).filter(Boolean);
    queryType = "exemplar";
    for (const name of names) {
      const wanted = name.toLowerCase();
      const found = library?.tracks.filter((track) => track.title.toLowerCase() === wanted ||
        `${track.title} by ${track.artist ?? ""}`.toLowerCase() === wanted);
      if (found && found.length === 1) { positive.push(found[0]!.id); recognized.push({ phrase: name, becomes: `exemplar ${found[0]!.title} — ${found[0]!.artist ?? "unknown artist"}` }); }
      else unsupported.push({ ask: `sounds like “${name}”`, reason: found?.length ? `${found.length} tracks share that title; add “by <artist>”.` : "No track with that exact title is in the library." });
    }
  });

  // --- what is left over ---------------------------------------------------------------
  let rest = "";
  let cursor = 0;
  for (const [start, end] of [...consumed].sort((a, b) => a[0] - b[0])) {
    if (start > cursor) rest += text.slice(cursor, start) + " ";
    cursor = Math.max(cursor, end);
  }
  rest += text.slice(cursor);
  const unparsed = rest.split(/[.,;!?/]+/).map((part) => part.replace(/\b(?:and|or|but|please|i|me|a|an|the|some|with|need|want|give|make|playlist|music|songs|tracks)\b/gi, " ").replace(/\s+/g, " ").trim()).filter((part) => /[a-z]{2,}/i.test(part) && !/^'\w+$/.test(part));
  if (unparsed.length) assumptions.push(`Not understood yet, kept only as text for a future encoder: “${unparsed.join("”, “")}”.`);
  if (positive.length) signals.push({ name: "exemplar_pos", weight: 0.7 });
  if (constraints.some((item) => item.hard === false)) signals.push({ name: "feature_soft", weight: positive.length ? 0.3 : 1 });
  if (queryType === "mixed" && constraints.length && constraints.every((item) => item.explicit_exclusion)) queryType = "exclusion";

  const plan: Record<string, unknown> = {
    version: PLAN_VERSION,
    intent: { query_type: queryType, summary: text.slice(0, 200) || "empty prompt" },
    target_size: size,
    constraints,
    ranking: { signals, ...(positive.length ? { exemplars: { positive } } : {}), ...(caps ? { diversity: caps } : {}), ...(flat ? { mmr_lambda: 0.65 } : {}) },
    relaxation: { min_results: Math.min(10, size), tiers: "strict_plus_near_miss", ladder: [], require_confirmation_for: confirm },
    ...(flat ? { sequencing: { arc: "flat" } } : {}),
    ...(encoderText(text) ? { retrieval_text: encoderText(text).slice(0, 300) } : {}),
    ...(assumptions.length ? { assumptions } : {}),
    ...(unsupported.length ? { unsupported } : {}),
  };
  return { plan, recognized, unparsed, encoder_text: encoderText(text) };
}

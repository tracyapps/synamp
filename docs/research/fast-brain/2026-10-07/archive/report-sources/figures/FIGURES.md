# Figure set — SynAmp Fast-Brain dossier

Four standalone SVGs for the dark editorial dossier. Shared visual contract: transparent canvas; hairline strokes at `rgba(255,255,255,0.14)`; primary text `#E8E6E1`; muted `#98A2AD`; a single gold accent `#D4A757`, used sparingly (≤2 accent elements per figure). Sans labels (`ui-sans-serif, system-ui, sans-serif`), mono for technical identifiers (`ui-monospace, SFMono-Regular, Menlo, monospace`). No external references, no gradients, no shadows, no emoji — glyphs are drawn with strokes (circle = a session; crossed line = "does not cross"; shield = "needs a yes"). Every file includes `<title>` + `<desc>`, passes `xmllint --noout`, and was render-checked (layout + legibility at 50% scale).

Accent theme across the set: gold marks the learning loop and its boundaries / consent moments — the feedback loop and its boundary glyph (flow), the crossed "does not cross" glyph and the shield "needs a yes" glyph (epochs), the honesty line "unknown ≠ zero — never filled in" (reliability), and the `learning_reset` marker (modules).

## flow.svg — "From your words to your queue"

Left-to-right chain of six hairline boxes: **Your words** → **interpretGoal** (draft + goal lexicon) → **Validated plan** (hard rules = your words; soft = goal bundles) → **Evaluate** (strict tier / hard guard; near-miss tier) → **Sequence** (arc: build / peak / cooldown / wave) → **Queue snapshot**. Underneath, a gold feedback loop runs right-to-left: plays, skips, loves and removes append to an append-only event log; the epoch-v1 view covers this session only; the loop rises back into Evaluate, labelled "adjusts ranking (bounded, strict tier only)". Where it enters, a small crossed-line boundary glyph (gold) carries the note "a different day/session/hour does not leak in".

- Anchor: `[FIGURE: flow]`
- Alt text: "Pipeline from your words to the plan queue: interpretGoal derives a draft via the goal lexicon; the validated plan keeps hard rules as your words and soft parts as goal bundles; Evaluate runs a strict tier (hard guard) and a near-miss tier; Sequence shapes the arc — build, peak, cooldown, wave — into a queue snapshot. A gold feedback loop beneath returns plays, skips, loves and removes through an append-only event log and the this-session-only epoch-v1 view, adjusting ranking in the strict tier only — marked by a crossed boundary glyph reading 'a different day/session/hour does not leak in'."

## epochs.svg

Three day rows show epochs as hairline blocks of varying widths with gaps. Annotations mark the boundary makers: "30-min gap → new epoch", "midnight splits" (double tick at the start of a day), "session-id change splits" (double tick mid-stream). One Day-3 block is annotated "this session = the only learning scope". Below, three lanes: implicit signals (skips, repeats) stop at the epoch wall with a crossed glyph — "stays inside"; explicit signals (love, thumbs, remove) pass through day walls — "long-lived, declared"; cross-day patterns feed a small box, "proposal — applies only with your yes", marked by a shield glyph (gold).

- Anchor: `[FIGURE: epochs]`
- Alt text: "Timeline of three days: epoch blocks split by a 30-minute gap, midnight ticks, and a session-id change tick; one block is annotated 'this session = the only learning scope'. Below: implicit signals (skips, repeats) stop at a crossed epoch wall reading 'stays inside'; explicit signals (love, thumbs, remove) cross day walls, reading 'long-lived, declared'; cross-day patterns point to a proposal box, 'applies only with your yes', marked with a shield glyph."

## reliability.svg — "Measurement honesty"

Two stacked lists on the left: **Produced** (used with confidence) — bpm, tempo_confidence, pulse_clarity, onset_rate, percussiveness, loudness, beat/timing-gated fields; **Declared** (no producer yet — inert) — arousal, valence, danceability, instruments.*, vocal_fraction. The produced list feeds a **Reliability gates** block: "tempo_confidence < 0.5 → damped"; "timing fields need a measured grid"; "unknown ≠ zero — never filled in" (the figure's single gold line). Two arrows exit the gates to **Scoring** (ordering only) and **Learning** (feature hypotheses paused on suspect metrics; entity signals still learn).

- Anchor: `[FIGURE: reliability]`
- Alt text: "Two field lists: Produced — bpm, tempo_confidence, pulse_clarity, onset_rate, percussiveness, loudness, beat/timing-gated fields — used with confidence; Declared — arousal, valence, danceability, instruments.*, vocal_fraction — no producer yet, inert. The produced fields enter a Reliability gates block: tempo_confidence below 0.5 is damped; timing fields need a measured grid; 'unknown ≠ zero — never filled in' (gold). The gates output to Scoring (ordering only) and Learning (feature hypotheses paused on suspect metrics; entity signals still learn)."

## modules.svg

Nested file map. **apps/brain/src/** contains four module rows — `intent/` (lexicon.ts, interpret.ts), `learning/` (epochs.ts, derive.ts, reliability.ts, proposals.ts, explore.ts), `query/` (sequence.ts, plan.ts, evaluate.ts), `session/` (events.ts — `learning_reset` marker, the figure's single gold token) — plus a footer row for `index.ts`: routes /brain/session, /brain/forget, /brain/proposals; /plans/draft — interpretation. A muted note reads "tests live beside each module (*.test.ts)". On the right: **apps/web/src/** with BrainSession.tsx and Describe.tsx.

- Anchor: `[FIGURE: modules]`
- Alt text: "File map: apps/brain/src with intent (lexicon.ts, interpret.ts), learning (epochs.ts, derive.ts, reliability.ts, proposals.ts, explore.ts), query (sequence.ts, plan.ts, evaluate.ts) and session (events.ts — learning_reset marker); index.ts lists routes /brain/session, /brain/forget, /brain/proposals and /plans/draft for interpretation; a note says tests live beside each module (*.test.ts). apps/web/src contains BrainSession.tsx and Describe.tsx."

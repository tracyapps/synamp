# Executive summary

**What was asked, and what exists.** SynAmp's fast-learning brain was asked to do this: state a goal in plain words ("pump me up", "I need to focus") and get a smart playlist that learns fast from listening and forgets at the session boundary. That slice now exists: branch `feat/fast-learning-brain`, a single commit; new modules in `intent/` and `learning/`; the sequencing module `query/sequence.ts`; new `/api/v1/brain` routes (session readout, forget, proposals); and a web "This session" panel.

**The two halves.** The translation layer carries nine goal bundles (focus, pump_up, dance, calm, sleep, catharsis, nostalgia, drive, chores), whose research weights never outrank the user's own words; accuracy classes that include contradictions — resolved as two labelled readings plus a clarifying ask, never a silent choice; asks, never guesses for vague or impossible requests; and sequencing arcs that re-order the filtered list without ever betraying a hard constraint. The learning layer is epoch-v1: sessions split on a 30-minute silence gap, a day change, or a session-key change, with a 30-minute live window; evidence and hides compose through one bounded saturation that can re-order but never breaks a hard rule; reliability-weighted keep/skip centroids learn small attribute-level tastes; proposals are the only channel that crosses a session; exploration ships off.

**The guarantees that answer the original ask.** *Isolation*: a different day, session, or hour cannot bend this moment's ranking — proven by byte-equality when foreign events are appended. *Honesty*: null is never zero, and a method's rejection is not musical truth. *Consent*: nothing crosses a session without a yes, and forget is one button — append-only; the log is marked, never edited.

**Verification posture.** The suite stands at 218 tests / 216 pass, plus one pre-existing macOS red and one skip; both type-checks exit 0; a deterministic 8-scenario / 86-check harness re-runs byte-identically apart from its timestamp. Independent reviews (code, bias, psychology, production) closed with fixes landed, and every evidence path is carried in the delivery manifest. Honest limits: magnitudes and thresholds are candidate values — hypotheses, not tuned evidence; fixtures are synthetic, so no real-music evidence yet.

**Where to go next**

- Run one real-library session (read `GET /api/v1/brain/session`), then a tuning pass.
- Land the P4 producers before declared fields (voice, instruments, mood) become real.
- Revisit the conservative proposal thresholds once real data exists.

Chapter 1 explains how words become rules; Chapter 2 how learning stays in-session; Chapter 3 how measurement stays honest across cultures; Chapter 4 what was verified and how to roll back.

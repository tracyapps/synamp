# SynAmp analyzer

The offline analysis worker. It turns a folder of audio files into the signals
that make natural-language playlists possible.

## The one rule

**It does not run on the NAS.** The DS1825+ (Ryzen V1500B) has no GPU; embedding
or LLM inference there would take days and fight the file-serving workload. This
worker runs on the brain machine (an M4 Pro in the reference setup) or in the
cloud, and writes plain data into the brain database.

## Design constraints

- **Offline** — never on the serving path.
- **Resumable** — a long first pass must survive interruption.
- **Incremental** — new files are picked up without rebuilding the library.

See `docs/synamp/ARCHITECTURE.md` §6.

## Phase 0 scope

Skeleton only. Config, domain records, the queue interface, and a CLI that
resolves configuration. No models are wired up yet — that is Phase 3.

```bash
cd services/analyzer
python -m synamp_analyzer.cli scan
python -m synamp_analyzer.cli analyze
```

## Signals to be produced

| Signal | Answers |
|---|---|
| audio embedding | "sounds like these two tracks"; free-text vibe |
| bpm / key | DJ-mode harmonic mixing |
| energy / danceability / mood | "high energy, less meditative" |
| instrumental score | "no words" |
| instrument confidences | "no piano" |
| lyrics + lyric embedding | thematic prompts |

## Licensing note

Prefer permissively-licensed models and keep AGPL components out of any
network-offered serving path — the plan is to publish a Synology package
eventually. See `docs/synamp/DECISIONS.md` (D6).

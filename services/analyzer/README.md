# SynAmp analyzer

The offline analysis worker. It turns a folder of audio files into the signals
that make natural-language playlists possible.

## The one rule

**It does not run on the NAS.** The DS1825+ (Ryzen V1500B) has no GPU; embedding
or LLM inference there would take days and fight the file-serving workload. This
worker runs on the brain machine (an M4 Pro in the reference setup) or in the
cloud, and writes plain data that syncs into the brain.

## Design constraints

- **Offline** — never on the serving path.
- **Resumable** — a long first pass must survive interruption. Progress is
  recorded per track *and per stage*, so an interrupted run resumes at the next
  stage. An unclean shutdown returns in-flight jobs to the queue on the next run.
- **Incremental** — new files are picked up without rebuilding the library, and
  a file whose contents changed is analysed again from scratch.
- **One bad file never stops a run** — a corrupt or unreadable track is recorded
  as failed, with its error and attempt count, and the run continues.
- **Adding a stage back-fills automatically.** Every track that has not had the
  new stage is queued for it on the next `analyze`; no migration, no rebuild.

## Running it

Requires [`uv`](https://docs.astral.sh/uv/). The system Python is usually too
old; let uv supply a current one.

```bash
cd services/analyzer
uv venv --python 3.12          # first time only
uv pip install -e ".[dev]"     # first time only

export LIBRARY_PATH=/path/to/music
export ANALYZER_DB_PATH=/tmp/synamp/analyzer.sqlite3

uv run synamp-analyze sample --count 200       # random subset → a symlink folder
uv run synamp-analyze scan                     # walk the share, queue new/changed files
uv run synamp-analyze analyze [--limit N]      # process the queue
uv run synamp-analyze stats                    # catalog and queue state
uv run synamp-analyze inspect --limit 3        # dump stored metrics for a few tracks
```

Exit codes: `0` success, `1` at least one job failed, `2` usage error.

Run the tests with `uv run pytest -q`.

## Taking a sample instead of picking folders

A first pass should not be run blind over 45,000 files, and it should not be run
over hand-picked folders either — hand-picked folders are the tidy subset that
hides the problems a real library has.

```bash
uv run synamp-analyze sample --count 200 --seed 7 --out ~/synamp-sample
LIBRARY_PATH=~/synamp-sample ANALYZER_DB_PATH=~/synamp-sample/analyzer.sqlite3 \
  uv run synamp-analyze scan && uv run synamp-analyze analyze
```

- `--mode uniform` (default) — every file equally likely. **Representative**: if
  one artist is a tenth of the library, a tenth of the sample is that artist, and
  the timings you measure are the timings you will get.
- `--mode stratified` — round-robin across top-level folders. **Breadth**: range
  across the library's structure even when it is lopsided.
- `--seed` — fixes the selection. The choice is written to
  `sample-manifest.json` alongside the links, so any number can be traced back to
  the exact files that produced it.
- The sample is **symlinks**, not copies. A 274 GB library must not be duplicated
  to take a 200-file sample, and the worker only ever reads.

## What this worker currently produces

### Stage `dsp_core` — the model-free metric block

No machine learning, no model downloads, no network. Per track, measuring the
*whole* recording:

| Family | Fields | Why it matters |
|---|---|---|
| Loudness / dynamics | `lufs_integrated`, `loudness_range`, `true_peak_dbtp`, `crest_factor`, `dynamic_complexity`, `clipping_density` | Also the **era cue**: mastering practice encodes the decade better than a release year, which remasters and compilations poison |
| Timbre / spectrum | `spectral_centroid`, `spectral_rolloff`, `spectral_flatness`, `spectral_flux`, `spectral_tilt`, `zero_crossing_rate` | Brightness, noisiness, distortion |
| Rhythm | `onset_rate`, `percussiveness`, `bpm`, `tempo_confidence`, `pulse_clarity` | Busyness, transient character, and a provisional tempo |
| Derived | `production` (the era-cue vector) | Assembled from the mastering measures only |

`bpm` and `pulse_clarity` here are **provisional and labelled as such in code**:
autocorrelation of the onset envelope with a tempo prior, not a beat tracker. A
steady tone illustrates the hazard — it reports a confident nonsense tempo, and
only `pulse_clarity ≈ 0` reveals that the number means nothing. Trust the pair,
never `bpm` alone.

### Stage `beat` — the grid, and how the playing sits on it

This is the stage that makes the owner's own hypothesis testable: energy often
comes from the beat sitting slightly ahead of or behind the grid rather than from
BPM. You cannot measure deviation without a grid to deviate from.

| Field | Meaning |
|---|---|
| `beat_count` | Tracked beats, only usable when `beat_status` is `tracked` |
| `beat_grid_strength` | Local predicted-pulse contrast × supported fraction; heuristic, not a probability |
| `beat_interval_cv` | Tracked interval standard deviation / mean |
| `tempo_drift` | Fractional BPM change between the first and second halves |
| `microtiming_tightness` | Mean absolute eligible-onset residual from a stable fitted grid, ms |
| `microtiming_signed` | Mean signed residual, ms; **positive = early, negative = late** |
| `swing_ratio` | Offbeat position, 0.5 straight eighths, about 0.667 triplet swing |
| `beat_status`, `timing_status` | Distinguish accepted pulse evidence from eligibility for timing measurements |
| `beat_method`, `beat_diagnostics` | Algorithm identity, candidate tempo, contrast and reference-fit diagnostics |

The tracker uses dynamic programming. Pulse validation compares onset energy at
neighbour-predicted beats with shifted local control windows, rather than counting
all detected peaks equally. This lets a strong pulse survive dense accompaniment.
It remains a heuristic with tempo/phase ambiguity, not a validated real-music
beat detector. See the [findings](../../docs/research/beat-timing-findings-2026-09-29.md).

**Timing has a separate gate.** A whole-track line is used only when its RMS fit
error and tracker resolution are ≤15 ms and the onset population is concentrated. Otherwise timing and
swing remain null with a reason. These thresholds are engineering heuristics,
not perceptual calibration. Mixed-onset residuals do not identify a particular
instrument's displacement and do not establish perceived energy.

Synthetic checks cover steady clicks, ±30 ms secondary layers, straight/swung
eighths, accelerating tempo, dense accompaniment at three tempi, random controls
and decimation. The real-library smoke test accepted a grid on “Dreams” but
abstained from its timing; it rejected the candidate pulse on “Talk To Me Now.”
Neither outcome has independent beat annotations. The previous claim that 119
rejected live recordings “genuinely have no steady grid” was not established:
rejection by the earlier statistic is evidence about the method, not the music.

For a read-only JSON diagnostic report (no catalog or queue writes):

```sh
uv run python -m synamp_analyzer.evaluate_beat /path/to/track.flac > beat-report.json
```

Exit 1 means at least one extraction error; musical abstention is a successful
analysis with nullable values. Reports include method, parameters, dependency
versions, file size/mtime and per-track runtime; they contain no audio. File
size/mtime is change detection, not a content hash. Choose bounded inputs; the
command processes whole recordings and has no per-track timeout.

Fields the *query layer* will need but no stage fills yet — `mode`,
`chord_change_rate`, `dissonance`, `vocal_fraction`, `instruments`, `arousal`,
`valence`, `embedding`, `structure_*` — are declared in `models.py` and left
`None`, with the stage that will fill them named in a comment. `None` means not computed or insufficient evidence, never "computed as zero";
beat status fields distinguish those cases. A test enforces that every
field an extractor computes is actually declared, because a computed-but-
undeclared field is silently dropped on save.

## Storage

One SQLite file per worker (`ANALYZER_DB_PATH`), holding the catalog, the queue
and the results. SQLite rather than the brain's Postgres because this is a
single-machine, single-writer offline tool that must survive interruption with no
operational overhead; the schema mirrors the Postgres shape so the move is a
port, not a redesign. Edit a file and re-scan and it is re-analysed; delete a file
and it is marked missing, not removed, so history survives.

New beat results record their method; old rows may not. Algorithm changes do not
yet invalidate completed stages automatically. Recompute that stage explicitly:

```bash
uv run synamp-analyze analyze --redo-stage beat
```

## Licensing note

Only permissively-licensed dependencies are used: `numpy` (BSD-3), `scipy`
(BSD-3), `soundfile` (BSD-3, bundling libsndfile under the LGPL — used unmodified
as a library, which the LGPL permits) and `pyloudnorm` (MIT).

Anything AGPL or non-commercial is kept out: no Essentia (AGPL-3.0 plus a
non-commercial model family), no MERT/MuQ (non-commercial weights). Those may only
ever exist as a private, non-distributed accuracy option. See
`docs/synamp/DECISIONS.md` (D6) and the licensing chapter of the brain dossier in
`docs/research/`.

## Next stages

Model-backed stages slot into the same machinery, behind the same licence
triage: a validated local timing reference, tonal analysis, instrument and vocal
detection, audio embeddings, lyric retrieval. Each one back-fills the fields
already declared in `models.py`.

## Agent handoff

Start with the [execution roadmap](../../docs/synamp/plans/AGENT-ROADMAP.md) and
[detailed beat-timing plan](../../docs/synamp/plans/BEAT-TIMING.md). Stored old
beat results require explicit recomputation; automatic stage revision invalidation
is planned, not implemented.

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
| `beat_count` | beats found, not inferred from an onset rate |
| `beat_grid_strength` | how much better the best grid explains the onsets than a random phase. Near 0 = the grid is fiction |
| `microtiming_tightness` | mean absolute deviation from the grid, ms — tight/programmed vs loose/human |
| `microtiming_signed` | mean signed deviation, ms. **Positive = pushing ahead, negative = laid back** |
| `swing_ratio` | offbeat position within the beat: 0.5 straight eighths, ~0.667 triplet swing |

Verified against signals whose answer is known from construction: a metronome
reads tight and centred; a swung pattern reads 0.669; straight eighths read 0.500;
a second layer played 30 ms late reads **−14.9 ms**, and 30 ms early reads
**+15.1 ms**. Onset timing carries a measured bias under 4 ms.

**When it declines.** The stage returns nothing when there is no grid to find —
no usable tempo, or a grid indistinguishable from chance. That is a deliberate
answer, not a failure, and `beat_grid_strength` is the field that says so. It is
also what happened on the first real test set (119 live acoustic recordings): the
best achievable onset alignment across *every* tempo from 60 to 200 BPM was
0.51–0.54 against a chance level of 0.50, so the material genuinely has no steady
grid — live performance with drift, speech and applause. A tempo-varying beat
tracker is the next increment; a fixed-tempo grid cannot represent that material
and should not pretend to.

Fields the *query layer* will need but no stage fills yet — `mode`,
`chord_change_rate`, `dissonance`, `vocal_fraction`, `instruments`, `arousal`,
`valence`, `embedding`, `structure_*` — are declared in `models.py` and left
`None`, with the stage that will fill them named in a comment. `None` always
means "not computed yet", never "computed as zero". A test enforces that every
field an extractor computes is actually declared, because a computed-but-
undeclared field is silently dropped on save.

## Storage

One SQLite file per worker (`ANALYZER_DB_PATH`), holding the catalog, the queue
and the results. SQLite rather than the brain's Postgres because this is a
single-machine, single-writer offline tool that must survive interruption with no
operational overhead; the schema mirrors the Postgres shape so the move is a
port, not a redesign. Edit a file and re-scan and it is re-analysed; delete a file
and it is marked missing, not removed, so history survives.

When an extractor changes, the numbers already stored came from the old code and
nothing about them reveals it. Recompute that stage explicitly:

```bash
uv run synamp-analyze analyze --redo-stage dsp_core
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
triage: a tempo-varying beat tracker, tonal analysis, instrument and vocal
detection, audio embeddings, lyric retrieval. Each one back-fills the fields
already declared in `models.py`.

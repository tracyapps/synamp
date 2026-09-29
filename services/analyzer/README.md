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
  stage rather than restarting the track. An unclean shutdown returns in-flight
  jobs to the queue on the next run.
- **Incremental** — new files are picked up without rebuilding the library, and
  a file whose contents changed is analysed again from scratch (its old
  measurements describe audio that is no longer on disk).
- **One bad file never stops a run** — a corrupt or unreadable track is recorded
  as failed, with its error and attempt count, and the run continues.

## Running it

Requires [`uv`](https://docs.astral.sh/uv/). The system Python is usually too
old; let uv supply a current one.

```bash
cd services/analyzer
uv venv --python 3.12          # first time only
uv pip install -e ".[dev]"     # first time only

export LIBRARY_PATH=/path/to/music
export ANALYZER_DB_PATH=/tmp/synamp/analyzer.sqlite3

uv run synamp-analyze scan                  # walk the share, queue new/changed files
uv run synamp-analyze analyze [--limit N]   # process the queue
uv run synamp-analyze stats                 # catalog and queue state
uv run synamp-analyze inspect --limit 3     # dump stored metrics for a few tracks
```

Exit codes: `0` success, `1` at least one job failed, `2` usage error.

Run the tests with:

```bash
uv run pytest -q
```

## What this worker currently produces

**Stage `dsp_core` — the model-free metric block.** No machine learning, no
model downloads, no network. Per track, measuring the *whole* recording:

| Family | Fields | Why it matters |
|---|---|---|
| Loudness / dynamics | `lufs_integrated`, `loudness_range`, `true_peak_dbtp`, `crest_factor`, `dynamic_complexity`, `clipping_density` | Also the **era cue**: mastering practice encodes the decade better than a release year, which remasters and compilations poison |
| Timbre / spectrum | `spectral_centroid`, `spectral_rolloff`, `spectral_flatness`, `spectral_flux`, `zero_crossing_rate`, `spectral_tilt` | Brightness, noisiness, distortion |
| Rhythm | `onset_rate`, `percussiveness`, `bpm`, `tempo_confidence`, `pulse_clarity`, `beat_count` | Busyness, transient character, and a provisional tempo |
| Derived | `production` (the era-cue vector) | Assembled from the mastering measures only |

Two of these are **provisional and labelled as such in the code**: `bpm` is
autocorrelation of the onset envelope with a tempo prior, not a beat tracker,
and `pulse_clarity` is a cheaper relative of the published descriptor. They are
for ranking and for catching obvious cases. A steady tone illustrates the
hazard — it reports a confident nonsense tempo, and only `pulse_clarity ≈ 0`
reveals that the number means nothing. Trust the pair, never `bpm` alone.

Fields the *query layer* will need but this stage cannot fill — `microtiming_*`,
`swing_ratio`, `mode`, `chord_change_rate`, `dissonance`, `vocal_fraction`,
`instruments`, `arousal`, `valence`, `embedding`, `structure_*` — are declared
in `models.py` and left `None`, with the stage that will fill them named in a
comment. `None` always means "not computed yet", never "computed as zero".

## Storage

One SQLite file per worker (`ANALYZER_DB_PATH`), holding the catalog, the queue
and the results. SQLite rather than the brain's Postgres because this is a
single-machine, single-writer offline tool that must survive interruption with
no operational overhead; the schema mirrors the Postgres shape so the move is a
port, not a redesign. Edit a file and re-scan and it is re-analysed; delete a
file and it is marked missing, not removed, so history survives.

## Licensing note

Only permissively-licensed dependencies are used: `numpy` (BSD-3), `scipy`
(BSD-3), `soundfile` (BSD-3, bundling libsndfile under the LGPL — used
unmodified as a library, which the LGPL permits) and `pyloudnorm` (MIT).

Anything AGPL or non-commercial is kept out: no Essentia (AGPL-3.0 plus a
non-commercial model family), no MERT/MuQ (non-commercial weights). Those may
only ever exist as a private, non-distributed accuracy option, and their outputs
are what would ship — see `docs/synamp/DECISIONS.md` (D6) and the licensing
chapter of the brain dossier for the trade.

## Next stages

Model-backed stages slot into the same machinery, behind the same licence
triage, and each one back-fills the fields already declared in `models.py`:
beat grid and microtiming; tonal analysis; instrument and vocal detection;
audio embeddings; lyric retrieval. `uv run synamp-analyze analyze` will pick up
a new stage for any track that has not had it yet — no migration, no rebuild.

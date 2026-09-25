"""SynAmp analysis worker.

Runs **off the NAS** (on the brain machine — an M4 Pro in the reference setup)
because the NAS has no GPU and cannot host audio-embedding or LLM inference.
Results are plain data, so they sync into the brain database cheaply.

Design constraints this package must honour:

* **Offline** — never on the serving path. The library answers requests; this
  worker fills in knowledge in the background.
* **Resumable** — a first pass over a large library is long. Every unit of work
  must be individually idempotent and restartable.
* **Incremental** — new files are picked up and analysed without a full rebuild,
  so playlists can reflect them without a restart.
"""

__version__ = "0.0.0"

"""Resumable job queue.

A first pass over a large library is hours of work that will be interrupted
(laptop sleeps, model crashes, files appear mid-run). The contract here is:

* **Idempotent** — re-running a completed job is a no-op.
* **Resumable** — a killed run loses at most the in-flight jobs.
* **Incremental** — a scan enqueues only files whose (size, mtime) changed, so
  a new album dropped into the share is analysed without touching the rest.

Phase 0 defines the interface only; the backing store (Postgres table, or a
durable local file for the single-machine case) is chosen in Phase 3.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from pathlib import Path


class JobState(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


@dataclass
class Job:
    track_path: Path
    state: JobState = JobState.PENDING
    attempts: int = 0
    error: str | None = None
    stages_done: set[str] = field(default_factory=set)
    """Fine-grained progress, so a long track can resume mid-way."""


class JobQueue:
    """Interface. Implementations must persist across process restarts."""

    def enqueue_missing(self, tracks: list[Path]) -> int:
        """Enqueue tracks with no completed analysis. Returns the count added."""
        raise NotImplementedError

    def claim(self) -> Job | None:
        """Atomically claim the next pending job for this worker, or None."""
        raise NotImplementedError

    def complete(self, job: Job) -> None:
        """Mark a job done (idempotent)."""
        raise NotImplementedError

    def fail(self, job: Job, error: str) -> None:
        """Record a failure and increment the attempt counter."""
        raise NotImplementedError

    def stats(self) -> dict[str, int]:
        """Counts per state, for progress reporting."""
        raise NotImplementedError

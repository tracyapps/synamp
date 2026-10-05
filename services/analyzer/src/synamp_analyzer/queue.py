"""Resumable job queue.

A first pass over a large library is hours of work that will be interrupted
(laptop sleeps, model crashes, files appear mid-run). The contract here is:

* **Idempotent** — re-running a completed job is a no-op.
* **Resumable** — a killed run loses at most the in-flight jobs.
* **Incremental** — a scan enqueues only files whose (size, mtime) changed, so
  a new album dropped into the share is analysed without touching the rest.

Backed by the same SQLite file as the catalog. The queue is deliberately dumb:
it tracks *which stages of which track* are outstanding, and a failed job
carries its error and its attempt count so a poisoned file can be recognised
rather than retried forever.
"""

from __future__ import annotations

import enum
import json
import time
from dataclasses import dataclass, field
from pathlib import Path

from .store import Database


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


DEFAULT_MAX_ATTEMPTS = 3


class JobQueue:
    """SQLite-backed queue. Survives process restarts by construction."""

    def __init__(self, db: Database, max_attempts: int = DEFAULT_MAX_ATTEMPTS):
        self.db = db
        self.max_attempts = max_attempts

    # -- producers ---------------------------------------------------------

    def enqueue_missing(self, tracks: list[Path]) -> int:
        """Enqueue tracks with no completed analysis. Returns the count added.

        A track is "missing analysis" unless it has a DONE job. A previously
        failed job is left alone here on purpose: `analyze` decides whether to
        retry it, so a scan never silently resurrects a poisoned file.
        """
        now = time.time()
        added = 0
        for track in tracks:
            key = str(track)
            row = self.db.conn.execute(
                "SELECT state FROM jobs WHERE track_path = ?", (key,)
            ).fetchone()
            if row is not None and row["state"] == JobState.DONE.value:
                continue
            if row is not None:
                continue
            self.db.conn.execute(
                """
                INSERT INTO jobs (track_path, state, attempts, error, stages_done, updated_at)
                VALUES (?, ?, 0, NULL, '[]', ?)
                """,
                (key, JobState.PENDING.value, now),
            )
            added += 1
        self.db.conn.commit()
        return added

    def requeue_incomplete(self, stages: tuple[str, ...]) -> int:
        """Re-open finished jobs that lack a stage added since they ran.

        This is what makes "adding a stage back-fills automatically" true for
        tracks that were already DONE: they go back to the queue with their
        completed stages intact, so only the new stage runs.
        """
        rows = self.db.conn.execute(
            "SELECT track_path, stages_done FROM jobs WHERE state = ?", (JobState.DONE.value,)
        ).fetchall()
        now = time.time()
        reopened = 0
        for row in rows:
            done = set(json.loads(row["stages_done"] or "[]"))
            if set(stages) - done:
                self.db.conn.execute(
                    "UPDATE jobs SET state = ?, updated_at = ? WHERE track_path = ?",
                    (JobState.PENDING.value, now, row["track_path"]),
                )
                reopened += 1
        self.db.conn.commit()
        return reopened

    # -- workers -----------------------------------------------------------

    def claim(self) -> Job | None:
        """Atomically claim the next pending job for this worker, or None.

        BEGIN IMMEDIATE takes the write lock before the SELECT, so two workers
        cannot read the same row and both decide it is theirs.
        """
        now = time.time()
        self.db.conn.execute("BEGIN IMMEDIATE")
        try:
            row = self.db.conn.execute(
                "SELECT * FROM jobs WHERE state = ? ORDER BY updated_at LIMIT 1",
                (JobState.PENDING.value,),
            ).fetchone()
            if row is None:
                self.db.conn.execute("COMMIT")
                return None
            self.db.conn.execute(
                "UPDATE jobs SET state = ?, updated_at = ? WHERE track_path = ?",
                (JobState.RUNNING.value, now, row["track_path"]),
            )
            self.db.conn.execute("COMMIT")
        except Exception:
            self.db.conn.execute("ROLLBACK")
            raise

        return Job(
            track_path=Path(row["track_path"]),
            state=JobState.RUNNING,
            attempts=row["attempts"],
            error=row["error"],
            stages_done=set(json.loads(row["stages_done"] or "[]")),
        )

    def record_stage(self, job: Job, stage: str) -> None:
        """Mark one stage complete for a job, so an interrupted run resumes here."""
        job.stages_done.add(stage)
        self.db.conn.execute(
            "UPDATE jobs SET stages_done = ?, updated_at = ? WHERE track_path = ?",
            (json.dumps(sorted(job.stages_done)), time.time(), str(job.track_path)),
        )
        self.db.conn.commit()

    def complete(self, job: Job) -> None:
        """Mark a job done (idempotent)."""
        self.db.conn.execute(
            "UPDATE jobs SET state = ?, error = NULL, updated_at = ? WHERE track_path = ?",
            (JobState.DONE.value, time.time(), str(job.track_path)),
        )
        self.db.conn.commit()

    def fail(self, job: Job, error: str) -> None:
        """Record a failure and increment the attempt counter.

        Attempts past the ceiling stay FAILED rather than returning to PENDING:
        an unreadable file should be visible, not spin.
        """
        attempts = job.attempts + 1
        state = JobState.FAILED
        self.db.conn.execute(
            """
            UPDATE jobs
               SET state = ?, attempts = ?, error = ?, updated_at = ?
             WHERE track_path = ?
            """,
            (state.value, attempts, error[:2000], time.time(), str(job.track_path)),
        )
        job.attempts = attempts
        job.state = state
        job.error = error
        self.db.conn.commit()

    def reset(self, paths: list[Path]) -> int:
        """Re-queue the given tracks from scratch, discarding stage progress.

        Used when a file's content changed: its old measurements describe audio
        that is no longer on disk, so resuming from a partial stage record would
        mix two different recordings into one row.
        """
        if not paths:
            return 0
        now = time.time()
        rows = 0
        for path in paths:
            cur = self.db.conn.execute(
                """
                UPDATE jobs
                   SET state = ?, attempts = 0, error = NULL,
                       stages_done = '[]', updated_at = ?
                 WHERE track_path = ?
                """,
                (JobState.PENDING.value, now, str(path)),
            )
            rows += cur.rowcount or 0
        self.db.conn.commit()
        return rows

    def clear_stage(self, stage: str) -> int:
        """Mark one stage as not-done for every track, so it is recomputed.

        Needed when an extractor changes rather than when a stage is added: the
        stored numbers came from the old code and nothing about them reveals
        that, so they would otherwise be served forever. The other stages' values
        are left alone.
        """
        rows = self.db.conn.execute(
            "SELECT track_path, stages_done FROM jobs"
        ).fetchall()
        cleared = 0
        now = time.time()
        for row in rows:
            done = set(json.loads(row["stages_done"] or "[]"))
            if stage not in done:
                continue
            done.discard(stage)
            self.db.conn.execute(
                """
                UPDATE jobs SET stages_done = ?, state = ?, updated_at = ?
                 WHERE track_path = ?
                """,
                (json.dumps(sorted(done)), JobState.PENDING.value, now, row["track_path"]),
            )
            cleared += 1
        self.db.conn.commit()
        return cleared

    def requeue_failed(self, max_attempts: int | None = None) -> int:
        """Put failed jobs with attempts left back in the queue. Returns count."""
        limit = self.max_attempts if max_attempts is None else max_attempts
        cur = self.db.conn.execute(
            """
            UPDATE jobs
               SET state = ?, updated_at = ?
             WHERE state = ? AND attempts < ?
            """,
            (JobState.PENDING.value, time.time(), JobState.FAILED.value, limit),
        )
        self.db.conn.commit()
        return cur.rowcount or 0

    def requeue_running(self) -> int:
        """Return in-flight jobs to the queue after an unclean shutdown."""
        cur = self.db.conn.execute(
            "UPDATE jobs SET state = ?, updated_at = ? WHERE state = ?",
            (JobState.PENDING.value, time.time(), JobState.RUNNING.value),
        )
        self.db.conn.commit()
        return cur.rowcount or 0

    # -- reporting ---------------------------------------------------------

    def stats(self) -> dict[str, int]:
        """Counts per state, for progress reporting."""
        counts = {state.value: 0 for state in JobState}
        for row in self.db.conn.execute(
            "SELECT state, COUNT(*) AS n FROM jobs GROUP BY state"
        ):
            counts[row["state"]] = row["n"]
        counts["total"] = sum(counts[s.value] for s in JobState)
        return counts

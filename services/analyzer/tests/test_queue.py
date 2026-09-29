"""Queue behaviour: exclusivity, idempotency, resumption, failure accounting."""

from __future__ import annotations

from pathlib import Path

from synamp_analyzer.queue import JobQueue, JobState
from synamp_analyzer.store import Database


def make_queue(tmp_path: Path, max_attempts: int = 3) -> tuple[Database, JobQueue]:
    db = Database(tmp_path / "q.sqlite3")
    return db, JobQueue(db, max_attempts=max_attempts)


def test_claim_is_exclusive(tmp_path: Path) -> None:
    db, queue = make_queue(tmp_path)
    queue.enqueue_missing([Path("/a/1.flac"), Path("/a/2.flac")])

    first = queue.claim()
    second = queue.claim()
    assert first is not None and second is not None
    assert first.track_path != second.track_path
    assert queue.claim() is None, "an empty queue must not hand out jobs"
    db.close()


def test_complete_is_idempotent(tmp_path: Path) -> None:
    db, queue = make_queue(tmp_path)
    queue.enqueue_missing([Path("/a/1.flac")])
    job = queue.claim()
    assert job is not None

    queue.complete(job)
    queue.complete(job)
    assert queue.stats()["done"] == 1
    assert queue.claim() is None
    db.close()


def test_failed_job_records_error_and_attempt(tmp_path: Path) -> None:
    db, queue = make_queue(tmp_path)
    queue.enqueue_missing([Path("/a/1.flac")])
    job = queue.claim()
    assert job is not None

    queue.fail(job, "ValueError: unreadable")
    stats = queue.stats()
    assert stats["failed"] == 1
    row = db.conn.execute("SELECT attempts, error FROM jobs").fetchone()
    assert row["attempts"] == 1
    assert "unreadable" in row["error"]

    # Past the attempt ceiling a failed job must not be silently retried.
    requeued = 0
    for _ in range(5):
        requeued += queue.requeue_failed()
        job = queue.claim()
        if job is None:
            break
        queue.fail(job, "again")
    assert queue.stats()["failed"] == 1
    assert requeued < 5
    db.close()


def test_stage_progress_survives_interruption(tmp_path: Path) -> None:
    """A job abandoned mid-track must come back with its finished stages intact."""
    db, queue = make_queue(tmp_path)
    queue.enqueue_missing([Path("/a/1.flac")])
    job = queue.claim()
    assert job is not None
    queue.record_stage(job, "dsp_core")

    # Simulate an unclean shutdown: the job is left RUNNING.
    recovered = queue.requeue_running()
    assert recovered == 1

    resumed = queue.claim()
    assert resumed is not None
    assert "dsp_core" in resumed.stages_done, "finished stages must not be redone"
    db.close()


def test_enqueue_missing_skips_finished_work(tmp_path: Path) -> None:
    db, queue = make_queue(tmp_path)
    paths = [Path("/a/1.flac"), Path("/a/2.flac")]
    assert queue.enqueue_missing(paths) == 2
    assert queue.enqueue_missing(paths) == 0, "re-enqueueing must add nothing"

    job = queue.claim()
    assert job is not None
    queue.complete(job)
    assert queue.enqueue_missing(paths) == 0, "completed work must stay completed"
    db.close()


def test_reset_requeues_changed_file(tmp_path: Path) -> None:
    """A file whose bytes changed must be analysed again from stage zero."""
    db, queue = make_queue(tmp_path)
    track = Path("/a/1.flac")
    queue.enqueue_missing([track])
    job = queue.claim()
    assert job is not None
    queue.record_stage(job, "dsp_core")
    queue.complete(job)

    assert queue.reset([track]) == 1
    again = queue.claim()
    assert again is not None
    assert again.stages_done == set(), "a changed file restarts from scratch"
    assert again.state is JobState.RUNNING
    db.close()


def test_stats_counts_every_state(tmp_path: Path) -> None:
    db, queue = make_queue(tmp_path)
    queue.enqueue_missing([Path(f"/a/{i}.flac") for i in range(3)])
    running = queue.claim()
    assert running is not None
    queue.fail(running, "boom")
    stats = queue.stats()
    assert stats["total"] == 3
    assert stats["failed"] == 1
    assert stats["pending"] == 2
    db.close()

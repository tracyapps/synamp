"""Scanning and stage execution.

The two commands the worker offers, and the only place that knows the order
things happen in:

* `run_scan` walks the share and decides what needs (re-)analysis.
* `run_analyze` drains the queue, running each track's outstanding stages.

Both are deliberately boring: all the state lives in SQLite, so killing either
one at any moment loses at most the track in flight.
"""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import __version__
from .config import AnalyzerConfig
from .metrics import extract_dsp_core
from .models import STAGE_REVISIONS, STAGES, AnalysisResult, Track
from .queue import Job, JobQueue
import json
from dataclasses import fields as dataclass_fields

from .identity import chromaprint, extract_identity, find_fpcalc
from .status import ProgressReporter, RunClock
from .store import (
    Database, _deserialise, apply_rename, find_donor, link_identity, load_result, record_audio, record_scan, save_result,
)

# Fields that describe the file itself, never copied from another path's analysis.
_NOT_COPIED = {"track_path", "stages_done", "analyzer_version", "computed_at",
               "audio_hash", "audio_hash_method", "audio_duration_s", "fingerprint", "fingerprint_status"}

# Walking a network share is latency-bound, not CPU-bound: every directory
# listing is a round trip, so listing several at once is worth far more than any
# micro-optimisation. Over SMB this is the difference between minutes and hours.
WALK_WORKERS = 8


def _scan_directory(directory: str, allowed: set[str]) -> tuple[list[Track], list[str]]:
    """One directory's audio files and subdirectories.

    Uses `os.scandir` rather than `Path.rglob` on purpose. `rglob` stats every
    entry it yields — and over SMB each stat is a network round trip, so a
    recursive glob costs hundreds of thousands of round trips on a real library.
    `scandir` reuses the metadata the directory listing already returned, so the
    same walk costs one round trip per directory instead of one per file.

    Symlinked *files* are followed; symlinked *directories* are not. That
    asymmetry is deliberate: the `sample` command materialises a selection as a
    tree of symlinks, so refusing to follow file links would make a sample
    invisible to the scanner, while following directory links risks a library
    that links back to its own root walking forever.
    """
    found: list[Track] = []
    subdirectories: list[str] = []
    try:
        with os.scandir(directory) as entries:
            for entry in entries:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        subdirectories.append(entry.path)
                    elif entry.is_file(follow_symlinks=True):
                        if os.path.splitext(entry.name)[1].lower() in allowed:
                            stat = entry.stat()
                            found.append(
                                Track(
                                    path=Path(entry.path),
                                    size_bytes=stat.st_size,
                                    mtime=stat.st_mtime,
                                )
                            )
                except OSError:
                    # A file that vanished or is unreadable mid-walk is not an
                    # error; it simply is not part of this scan.
                    continue
    except OSError:
        return found, subdirectories
    return found, subdirectories


def iter_audio_files(
    root: Path,
    extensions: tuple[str, ...],
    workers: int = WALK_WORKERS,
    progress=None,
) -> list[Track]:
    """Every audio file under `root`, with the stat data change-detection needs.

    Directory listings run concurrently because the walk is latency-bound. Order
    is deliberately not preserved — callers that care about order sort what they
    keep, and sorting a hundred thousand paths costs more than it is worth.
    """
    allowed = {ext.lower() for ext in extensions}
    if not root.exists():
        raise FileNotFoundError(f"library path does not exist: {root}")

    tracks: list[Track] = []
    pending = [str(root)]
    directories_seen = 0
    started = time.time()

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        while pending:
            batch = pending
            pending = []
            for found, subdirectories in pool.map(
                lambda directory: _scan_directory(directory, allowed), batch
            ):
                tracks.extend(found)
                pending.extend(subdirectories)
            directories_seen += len(batch)
            if progress is not None:
                progress(directories_seen, len(tracks), time.time() - started)

    return tracks


def apply_rename_journal(db: Database, cfg: AnalyzerConfig) -> int:
    """Carry tracks SynAmp itself renamed to their new paths, without decoding.

    The journal is JSON Lines written by the librarian, one rename per line:
    {"from": "<library-relative>", "to": "<library-relative>", "reason": "..."}.
    Re-reading it is harmless: an entry already applied finds nothing to move.
    """
    journal = cfg.rename_journal
    if journal is None or not journal.exists():
        return 0
    applied = 0
    for line in journal.read_text(encoding="utf-8").splitlines():
        try:
            entry = json.loads(line)
            old = cfg.library_path / entry["from"]
            new = cfg.library_path / entry["to"]
        except (ValueError, KeyError, TypeError):
            continue  # a torn or foreign line is skipped, not fatal
        if apply_rename(db, old, new, str(entry.get("reason") or "renamed by SynAmp")):
            applied += 1
    return applied


def run_scan(cfg: AnalyzerConfig, progress=print) -> dict[str, int]:
    """Walk the library and queue what is new or changed."""
    last_reported = [0.0]

    def report(directories: int, files: int, elapsed: float) -> None:
        # Hundreds of directories go by quickly on a local disk and slowly over a
        # share; report on a time interval so both get useful feedback without
        # flooding the terminal on the fast path.
        if elapsed - last_reported[0] < 2.0 and elapsed > 2.0:
            return
        last_reported[0] = elapsed
        progress(f"scan: {directories} folders, {files} audio files, {elapsed:.0f}s")

    tracks = iter_audio_files(
        cfg.library_path, cfg.audio_extensions, workers=cfg.walk_workers, progress=report
    )
    db = Database(cfg.db_path)
    try:
        # Renames SynAmp made go first, so those files are recognised, not re-analysed.
        renamed = apply_rename_journal(db, cfg)
        counts, stale = record_scan(db, tracks)
        counts["renamed"] = renamed
        queue = JobQueue(db, cfg.max_attempts)
        counts["scanned"] = len(tracks)
        counts["enqueued"] = queue.enqueue_missing([track.path for track in tracks])
        # Files whose size or mtime moved are re-analysed, because their old
        # measurements describe audio that is no longer on disk.
        counts["requeued"] = queue.reset([Path(p) for p in stale])
        # Tracks finished before a new stage existed get just that stage.
        counts["backfilled"] = queue.requeue_incomplete(STAGES)
        ProgressReporter(cfg.brain_url, cfg.brain_token, cfg.library_path).report(
            db, "idle", {"last_scan": {key: int(value) for key, value in counts.items()}, "scanned_at": time.time()}, force=True)
        return counts
    finally:
        db.close()


def run_stages(
    result: AnalysisResult, persist, progress=print, after_stage=None
) -> AnalysisResult:
    """Run every outstanding stage for one track, persisting after each one.

    `persist(stage)` is called after a stage's outputs have been written and
    before the next stage starts. Ordering matters: the queue may only record a
    stage as finished once its results are durable. An interruption between the
    two costs one recomputed stage, which is the cheap direction to fail in.
    """
    for stage in STAGES:
        if stage in result.stages_done:
            continue
        started = time.time()
        if stage == "identity":
            for key, value in extract_identity(result.track_path).items():
                setattr(result, key, value)
        elif stage == "dsp_core":
            fields = extract_dsp_core(result.track_path)
            for key, value in fields.items():
                setattr(result, key, value)
        elif stage == "beat":
            from .beat import extract_beat

            fields = extract_beat(result.track_path)
            for key, value in fields.items():
                setattr(result, key, value)
        else:  # pragma: no cover - guards against a stage being added without a runner
            raise NotImplementedError(f"no runner for stage {stage!r}")
        result.stages_done.add(stage)
        result.stage_revisions[stage] = STAGE_REVISIONS.get(stage, 1)
        persist(stage)
        if after_stage is not None:
            after_stage(stage)
        progress(
            f"    {stage} in {time.time() - started:.1f}s "
            f"({len(result.stages_done)}/{len(STAGES)} stages)"
        )
    return result


def _payload_result(payload: str) -> AnalysisResult | None:
    try:
        return _deserialise(payload)
    except (ValueError, TypeError):
        return None


def backfill_fingerprints(db: Database, should_stop=None, progress=print, on_track=None) -> int:
    """Fill in fingerprints for tracks analysed before Chromaprint was installed.

    Only the fingerprint runs (fpcalc reads the first two minutes); nothing else
    is re-analysed. Does nothing while fpcalc still isn't installed.
    """
    tool = find_fpcalc()
    if not tool:
        return 0
    rows = db.conn.execute(
        "SELECT track_path, payload FROM results WHERE payload LIKE '%\"fingerprint_status\": \"tool_missing\"%'"
    ).fetchall()
    filled = 0
    for done, row in enumerate(rows):
        if should_stop is not None and should_stop():
            break
        if on_track is not None:
            on_track(done, len(rows))  # keeps the web app's progress alive meanwhile
        result = _payload_result(row["payload"])
        if result is None or result.fingerprint_status != "tool_missing" or not result.track_path.is_file():
            continue
        result.fingerprint, result.fingerprint_status = chromaprint(result.track_path, tool)
        save_result(db, result, __version__)
        filled += 1
        if filled % 100 == 0:
            progress(f"  fingerprints filled in for {filled:,} earlier tracks")
    return filled


def analysis_processes(configured: int) -> int:
    """How many tracks to analyse at once: what's configured, within what the machine can take.

    Each process holds one decoded track and its spectrogram (up to ~2.5 GB for a
    long recording), so memory sets the ceiling as much as cores do. Two cores
    stay free for the rest of the Mac.
    """
    cores = os.cpu_count() or 1
    try:
        memory_gb = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1024**3
    except (ValueError, OSError, AttributeError):
        memory_gb = 8.0
    return max(1, min(configured, cores - 2, int(memory_gb // 12) or 1))


LONG_RECORDING_SECONDS = 15 * 60


def is_long_recording(path: Path) -> bool:
    """Long enough that analysing it beside others could run the Mac out of memory."""
    try:
        from tinytag import TinyTag
        duration = TinyTag.get(str(path)).duration
        if duration:
            return duration > LONG_RECORDING_SECONDS
    except Exception:
        pass
    try:
        return path.stat().st_size > 150 * 1024 * 1024
    except OSError:
        return False


def analyze_job(db: Database, queue: JobQueue, job: Job, progress=print) -> str | None:
    """Run one claimed job's outstanding stages and mark it done.

    Returns which kind of reuse happened ("kept_after_retag", "moved",
    "duplicate_reused") or None. Raises on failure; the caller records it.
    """
    existing = load_result(db, job.track_path)
    previous_hash = existing.audio_hash if existing else None
    previous_stages = set(existing.stages_done) if existing else set()
    result = existing or AnalysisResult(track_path=job.track_path)
    # The queue is authoritative about which stages are finished, and it is
    # *replaced* rather than merged: a job that was reset for re-analysis reports
    # no stages, and that has to invalidate the stored result's stage record too.
    # Merging here is how a re-analysed file keeps serving its previous measurements.
    result.stages_done = set(job.stages_done)
    reused_kind: list[str] = []

    def persist(stage: str, result=result) -> None:
        save_result(db, result, __version__)
        queue.record_stage(job, stage)

    def after_stage(stage: str, result=result, persist=persist) -> None:
        if stage != "identity" or not result.audio_hash:
            return
        record_audio(db, result.track_path, result.audio_hash)
        reused = reuse_analysis(db, result, previous_hash, previous_stages)
        if reused:
            reused_kind.append(reused)
            for done in sorted(result.stages_done - {"identity"}):
                persist(done)
            progress(f"    same audio as before ({reused.replace('_', ' ')}): kept existing analysis")

    run_stages(result, persist, progress=progress, after_stage=after_stage)
    save_result(db, result, __version__)
    queue.complete(job)
    return reused_kind[0] if reused_kind else None


def _analyze_in_process(db_path: str, max_attempts: int, track_path: str, stages_done: list[str]) -> dict:
    """One job in a separate process (parallel analysis). Opens its own database connection."""
    lines: list[str] = []
    db = Database(Path(db_path))
    try:
        queue = JobQueue(db, max_attempts)
        job = Job(track_path=Path(track_path), stages_done=set(stages_done))
        try:
            reused = analyze_job(db, queue, job, progress=lines.append)
            return {"ok": True, "reused": reused, "lines": lines}
        except Exception as exc:  # one bad file must not stop the run
            error = f"{type(exc).__name__}: {exc}"
            queue.fail(job, error)
            return {"ok": False, "error": error, "lines": lines}
    finally:
        db.close()


def run_analyze(
    cfg: AnalyzerConfig,
    limit: int | None = None,
    requeue_failed: bool = False,
    redo_stage: str | None = None,
    progress=print,
    reporter: ProgressReporter | None = None,
    should_stop=None,
) -> dict[str, int]:
    """Drain the queue. Returns a summary of what happened.

    `should_stop` (optional) is asked before each track; returning True ends the
    run cleanly, as if the queue were empty (the worker's Pause button). With
    more than one process (cfg.workers), tracks already started finish first.
    """
    db = Database(cfg.db_path)
    queue = JobQueue(db, cfg.max_attempts)
    summary = {
        "claimed": 0,
        "completed": 0,
        "failed": 0,
        "requeued_running": queue.requeue_running(),
        "requeued_failed": 0,
        "stage_cleared": 0,
        "kept_after_retag": 0,
        "moved": 0,
        "duplicate_reused": 0,
    }
    if redo_stage:
        summary["stage_cleared"] = queue.clear_stage(redo_stage)
    if requeue_failed:
        summary["requeued_failed"] = queue.requeue_failed()
    summary["outdated"] = requeue_outdated(db, queue)

    reporter = reporter or ProgressReporter(cfg.brain_url, cfg.brain_token, cfg.library_path)
    clock = RunClock()
    in_flight: dict[object, tuple[Job, bool]] = {}
    held: Job | None = None
    current = {"name": ""}
    processes = analysis_processes(cfg.workers)
    summary["processes"] = processes

    def run_state() -> dict:
        remaining = db.conn.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('pending', 'running')").fetchone()[0]
        return {
            "started_at": clock.started, "claimed": summary["claimed"], "completed": summary["completed"],
            "failed": summary["failed"],
            "reused": summary["kept_after_retag"] + summary["moved"] + summary["duplicate_reused"],
            "current": current["name"], "remaining": remaining,
            "rate_per_minute": clock.rate_per_minute(), "eta_seconds": clock.eta_seconds(remaining),
        }

    def finished(job: Job, outcome: dict) -> None:
        for line in outcome.get("lines", []):
            progress(line)
        if outcome["ok"]:
            summary["completed"] += 1
            if outcome.get("reused"):
                summary[outcome["reused"]] += 1
        else:
            summary["failed"] += 1
            progress(f"    ! failed ({job.track_path.name}): {outcome['error']}")
        clock.tick()

    reporter.report(db, "analyzing", run_state(), force=True)
    fingerprints_filled = False
    pool = None

    def new_pool():
        import multiprocessing
        from concurrent.futures import ProcessPoolExecutor
        return ProcessPoolExecutor(max_workers=processes, mp_context=multiprocessing.get_context("spawn"))

    if processes > 1:
        pool = new_pool()
        progress(f"  analysing {processes} tracks at a time")

    try:
        while True:
            stopping = should_stop is not None and should_stop()
            if stopping:
                summary["stopped"] = 1
            # Chromaprint installed (now or mid-run): catch up the tracks done without it.
            if not stopping and not in_flight and not fingerprints_filled and summary["claimed"] % 50 == 0 and find_fpcalc():
                fingerprints_filled = True
                def on_track(done: int, total: int) -> None:
                    current["name"] = f"filling in fingerprints for earlier tracks ({done:,} of {total:,})"
                    reporter.report(db, "analyzing", run_state())
                summary["fingerprints_filled"] = backfill_fingerprints(db, should_stop, progress, on_track)
                current["name"] = ""
            # Start tracks until every process is busy (one at a time without a pool).
            # A very long recording (a 60-minute ambient piece) can need ~10 GB on
            # its own, so it runs alone: nothing else starts while it's going.
            room = processes if pool else 1
            while not stopping and (limit is None or summary["claimed"] < limit or held is not None):
                if any(long for _job, long in in_flight.values()):
                    break
                if held is None:
                    if len(in_flight) >= room:
                        break
                    job = queue.claim()
                    if job is None:
                        break
                    summary["claimed"] += 1
                    progress(f"  {job.track_path.name}")
                    if pool is not None and in_flight and is_long_recording(job.track_path):
                        held = job
                        progress(f"    long recording: waiting to analyse it on its own")
                        break
                else:
                    if in_flight:
                        break
                    job, held = held, None
                if pool is None:
                    current["name"] = job.track_path.name
                    try:
                        reused = analyze_job(db, queue, job, progress)
                        finished(job, {"ok": True, "reused": reused})
                    except Exception as exc:  # one bad file must not stop the run
                        queue.fail(job, f"{type(exc).__name__}: {exc}")
                        finished(job, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
                    reporter.report(db, "analyzing", run_state())
                    break
                args = (_analyze_in_process, str(cfg.db_path), cfg.max_attempts, str(job.track_path), sorted(job.stages_done))
                try:
                    future = pool.submit(*args)
                except Exception:  # the pool broke (a process was killed): start a fresh one
                    pool.shutdown(wait=False, cancel_futures=True)
                    pool = new_pool()
                    future = pool.submit(*args)
                in_flight[future] = (job, is_long_recording(job.track_path))
                current["name"] = ", ".join(item.track_path.name for item, _long in in_flight.values())
                reporter.report(db, "analyzing", run_state())
            if stopping and held is not None:
                queue.reset_stages(held.track_path, [])  # back in the queue, untouched
                held = None
            if pool is None:
                if stopping or queue_empty(db) or (limit is not None and summary["claimed"] >= limit):
                    break
                continue
            if not in_flight and held is None:
                break
            if not in_flight:
                continue
            from concurrent.futures import FIRST_COMPLETED, wait
            done, _ = wait(list(in_flight), timeout=5.0, return_when=FIRST_COMPLETED)
            for future in done:
                job, _long = in_flight.pop(future)
                try:
                    finished(job, future.result())
                except Exception as exc:  # the process itself died (out of memory?)
                    queue.fail(job, f"analysis process stopped: {type(exc).__name__}")
                    finished(job, {"ok": False, "error": f"analysis process stopped: {type(exc).__name__}"})
            current["name"] = ", ".join(item.track_path.name for item, _long in in_flight.values())
            reporter.report(db, "analyzing", run_state())
        current["name"] = ""
        reporter.report(db, "idle", run_state(), force=True)
    finally:
        if pool is not None:
            pool.shutdown(wait=True, cancel_futures=True)
        db.close()
    return summary


def queue_empty(db: Database) -> bool:
    return db.conn.execute("SELECT 1 FROM jobs WHERE state = 'pending' LIMIT 1").fetchone() is None


def requeue_outdated(db: Database, queue: JobQueue) -> int:
    """Send tracks back for any stage whose method changed since they were analysed.

    Each stage has a revision (models.STAGE_REVISIONS). A stored result records
    the revision each stage ran at (missing = 1). When the code moves a stage
    on, only that stage is redone; the others keep their values.
    """
    newer = {stage: rev for stage, rev in STAGE_REVISIONS.items() if rev > 1}
    if not newer:
        return 0
    reopened = 0
    rows = db.conn.execute(
        "SELECT j.track_path, j.stages_done, r.payload FROM jobs j LEFT JOIN results r ON r.track_path = j.track_path"
    ).fetchall()
    for row in rows:
        done = set(json.loads(row["stages_done"] or "[]"))
        stale = [stage for stage in newer if stage in done]
        if not stale:
            continue
        try:
            revisions = json.loads(row["payload"] or "{}").get("stage_revisions") or {}
        except ValueError:
            revisions = {}
        outdated = [stage for stage in stale if int(revisions.get(stage, 1)) < newer[stage]]
        if outdated:
            reopened += queue.reset_stages(Path(row["track_path"]), outdated)
    return reopened


def reuse_analysis(db: Database, result: AnalysisResult, previous_hash: str | None, previous_stages: set[str]) -> str | None:
    """After `identity`, reuse earlier analysis of the same audio. Returns what happened.

    - kept_after_retag: this path's own earlier results describe the same audio
      (only tags or bytes outside the audio changed), so they still hold.
    - moved: a vanished path held this audio; this is that track, moved. It
      inherits the track's identity (and so its plays and feedback).
    - duplicate_reused: another present path holds identical audio. Its
      measurements are valid here too, but this is a separate track.
    """
    if previous_hash and previous_hash == result.audio_hash and previous_stages - {"identity"}:
        result.stages_done |= previous_stages
        return "kept_after_retag"
    if result.stages_done - {"identity"}:
        return None  # already analysed here (e.g. identity back-filled onto a finished track)
    donor = find_donor(db, result.audio_hash or "", result.track_path)
    if donor is None:
        return None
    donor_path, missing = donor
    source = load_result(db, donor_path)
    if source is None or not (source.stages_done - {"identity"}):
        return None
    for field in dataclass_fields(AnalysisResult):
        if field.name not in _NOT_COPIED:
            setattr(result, field.name, getattr(source, field.name))
    result.stages_done |= source.stages_done
    if missing:
        link_identity(db, result.track_path, donor_path, "moved (same audio)")
        return "moved"
    return "duplicate_reused"


def catalog_and_queue(cfg: AnalyzerConfig) -> tuple[dict[str, int], dict[str, int]]:
    """Read-only snapshot for `stats`."""
    from .store import catalog_stats

    db = Database(cfg.db_path)
    try:
        return catalog_stats(db), JobQueue(db, cfg.max_attempts).stats()
    finally:
        db.close()

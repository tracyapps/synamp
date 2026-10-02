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
from .models import STAGES, AnalysisResult, Track
from .queue import Job, JobQueue
import json
from dataclasses import fields as dataclass_fields

from .identity import extract_identity
from .store import (
    Database, apply_rename, find_donor, link_identity, load_result, record_audio, record_scan, save_result,
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
        persist(stage)
        if after_stage is not None:
            after_stage(stage)
        progress(
            f"    {stage} in {time.time() - started:.1f}s "
            f"({len(result.stages_done)}/{len(STAGES)} stages)"
        )
    return result


def run_analyze(
    cfg: AnalyzerConfig,
    limit: int | None = None,
    requeue_failed: bool = False,
    redo_stage: str | None = None,
    progress=print,
) -> dict[str, int]:
    """Drain the queue. Returns a summary of what happened."""
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

    try:
        while limit is None or summary["claimed"] < limit:
            job = queue.claim()
            if job is None:
                break
            summary["claimed"] += 1
            progress(f"  {job.track_path.name}")
            try:
                existing = load_result(db, job.track_path)
                previous_hash = existing.audio_hash if existing else None
                previous_stages = set(existing.stages_done) if existing else set()
                result = existing or AnalysisResult(track_path=job.track_path)
                # The queue is authoritative about which stages are finished,
                # and it is *replaced* rather than merged: a job that was reset
                # for re-analysis reports no stages, and that has to invalidate
                # the stored result's stage record too. Merging here is how a
                # re-analysed file keeps serving its previous measurements.
                result.stages_done = set(job.stages_done)

                def persist(stage: str, result=result) -> None:
                    save_result(db, result, __version__)
                    queue.record_stage(job, stage)

                def after_stage(stage: str, result=result, persist=persist) -> None:
                    if stage != "identity" or not result.audio_hash:
                        return
                    record_audio(db, result.track_path, result.audio_hash)
                    reused = reuse_analysis(db, result, previous_hash, previous_stages)
                    if reused:
                        summary[reused] += 1
                        for done in sorted(result.stages_done - {"identity"}):
                            persist(done)
                        progress(f"    same audio as before ({reused.replace('_', ' ')}): kept existing analysis")

                run_stages(result, persist, progress=progress, after_stage=after_stage)
                save_result(db, result, __version__)
                queue.complete(job)
                summary["completed"] += 1
            except Exception as exc:  # one bad file must not stop the run
                queue.fail(job, f"{type(exc).__name__}: {exc}")
                summary["failed"] += 1
                progress(f"    ! failed: {type(exc).__name__}: {exc}")
    finally:
        db.close()
    return summary


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

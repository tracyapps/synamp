"""SQLite storage for the catalog, the job queue and analysis results.

Why SQLite here, when the brain's serving database is Postgres? Because the
worker is a single-machine, single-writer offline tool: it needs something
durable that survives a laptop sleeping mid-run, with zero operational
overhead. The results it produces are plain data and sync to the brain later.
The schema deliberately mirrors the Postgres shape so the move is a port, not a
redesign.

Concurrency note: workers > 1 means several processes writing one file. WAL mode
plus a busy timeout makes that safe for our access pattern (short transactions,
no long reads).
"""

from __future__ import annotations

import json
import sqlite3
import time
from dataclasses import asdict
from pathlib import Path

from .models import AnalysisResult, STAGES, Track

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracks (
    path        TEXT PRIMARY KEY,
    size_bytes  INTEGER NOT NULL,
    mtime       REAL    NOT NULL,
    first_seen  REAL    NOT NULL,
    last_seen   REAL    NOT NULL,
    missing     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jobs (
    track_path  TEXT PRIMARY KEY,
    state       TEXT    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    error       TEXT,
    stages_done TEXT    NOT NULL DEFAULT '[]',
    updated_at  REAL    NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state);

CREATE TABLE IF NOT EXISTS results (
    track_path  TEXT PRIMARY KEY,
    payload     TEXT    NOT NULL,
    analyzer_version TEXT,
    computed_at REAL    NOT NULL
);
"""


class Database:
    """Owns the SQLite file and its schema."""

    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.path), timeout=30.0, isolation_level=None)
        """isolation_level=None: autocommit, so the queue can take an explicit
        BEGIN IMMEDIATE lock for claiming. Implicit transactions would make the
        claim non-atomic under concurrent workers."""
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.conn.execute("PRAGMA busy_timeout=30000")
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Database":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()


# --------------------------------------------------------------------------
# Catalog
# --------------------------------------------------------------------------


def record_scan(db: Database, seen: list[Track]) -> tuple[dict[str, int], list[str]]:
    """Upsert the scan result and mark anything unseen as missing.

    Returns counts of new / changed / unchanged / missing, plus the paths that
    are new or changed — the set that needs (re-)analysis, so `scan` can report
    something meaningful instead of a bare number.
    """
    now = time.time()
    counts = {"new": 0, "changed": 0, "unchanged": 0, "missing": 0}
    stale: list[str] = []
    known = {
        row["path"]: row
        for row in db.conn.execute("SELECT path, size_bytes, mtime, missing FROM tracks")
    }
    seen_paths = set()

    for track in seen:
        key = str(track.path)
        seen_paths.add(key)
        row = known.get(key)
        if row is None:
            counts["new"] += 1
        elif row["size_bytes"] != track.size_bytes or row["mtime"] != track.mtime:
            counts["changed"] += 1
            # Only files that already exist and whose bytes moved need their
            # analysis thrown away. New files are queued by `enqueue_missing`,
            # and mixing the two here would report re-queues that never happened.
            stale.append(key)
        else:
            counts["unchanged"] += 1

        db.conn.execute(
            """
            INSERT INTO tracks (path, size_bytes, mtime, first_seen, last_seen, missing)
            VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(path) DO UPDATE SET
                size_bytes = excluded.size_bytes,
                mtime      = excluded.mtime,
                last_seen  = excluded.last_seen,
                missing    = 0
            """,
            (key, track.size_bytes, track.mtime, now, now),
        )

    for key, row in known.items():
        if key not in seen_paths and not row["missing"]:
            counts["missing"] += 1
        db.conn.execute(
            "UPDATE tracks SET missing = ? WHERE path = ?",
            (0 if key in seen_paths else 1, key),
        )

    db.conn.commit()
    return counts, stale


def catalog_stats(db: Database) -> dict[str, int]:
    row = db.conn.execute(
        "SELECT COUNT(*) AS total, SUM(missing) AS missing FROM tracks"
    ).fetchone()
    total = row["total"] or 0
    missing = row["missing"] or 0
    return {"tracks": total, "present": total - missing, "missing": missing}


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------


def _serialise(result: AnalysisResult) -> str:
    data = asdict(result)
    data["track_path"] = str(result.track_path)
    data["stages_done"] = sorted(result.stages_done)
    return json.dumps(data, sort_keys=True)


def _deserialise(payload: str) -> AnalysisResult:
    data = json.loads(payload)
    data["track_path"] = Path(data["track_path"])
    data["stages_done"] = set(data.get("stages_done") or [])
    return AnalysisResult(**data)


def save_result(db: Database, result: AnalysisResult, version: str) -> None:
    """Persist a whole AnalysisResult, replacing any previous one.

    Whole-record writes rather than field merges: the record is tiny, and a
    partial update is how you end up with a row nobody can reason about.
    """
    now = time.time()
    result.computed_at = now
    result.analyzer_version = version
    db.conn.execute(
        """
        INSERT INTO results (track_path, payload, analyzer_version, computed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(track_path) DO UPDATE SET
            payload          = excluded.payload,
            analyzer_version = excluded.analyzer_version,
            computed_at      = excluded.computed_at
        """,
        (str(result.track_path), _serialise(result), version, now),
    )
    db.conn.commit()


def load_result(db: Database, path: Path) -> AnalysisResult | None:
    row = db.conn.execute(
        "SELECT payload FROM results WHERE track_path = ?", (str(path),)
    ).fetchone()
    if row is None:
        return None
    return _deserialise(row["payload"])


def load_result_row(db: Database, path: Path) -> str | None:
    """Raw payload, for the CLI's inspection output."""
    row = db.conn.execute(
        "SELECT payload FROM results WHERE track_path = ?", (str(path),)
    ).fetchone()
    return None if row is None else row["payload"]


def load_rows(db_path: Path | str, limit: int) -> list[sqlite3.Row]:
    """Recent stored results, for the CLI's `inspect` command."""
    db = Database(db_path)
    try:
        return list(
            db.conn.execute(
                "SELECT track_path, payload, computed_at FROM results "
                "ORDER BY computed_at DESC LIMIT ?",
                (limit,),
            )
        )
    finally:
        db.close()


def missing_stages(result: AnalysisResult) -> list[str]:
    """Stages still to run for this track, in order."""
    return [s for s in STAGES if s not in result.stages_done]

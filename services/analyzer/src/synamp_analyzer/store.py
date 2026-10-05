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

-- Which audio each path holds (stage `identity`), for spotting moves and retags.
CREATE TABLE IF NOT EXISTS track_audio (
    path        TEXT PRIMARY KEY,
    audio_hash  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS track_audio_hash ON track_audio(audio_hash);

-- A path that is the same track as an earlier one (moved or renamed). `origin`
-- is the first path the track was known by; exported IDs are minted from it, so
-- IDs survive moves.
CREATE TABLE IF NOT EXISTS identity_links (
    path       TEXT PRIMARY KEY,
    origin     TEXT NOT NULL,
    reason     TEXT NOT NULL,
    linked_at  REAL NOT NULL
);

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


# --------------------------------------------------------------------------
# Identity (stage `identity`, rename journal)
# --------------------------------------------------------------------------


def record_audio(db: Database, path: Path, audio_hash: str) -> None:
    db.conn.execute(
        "INSERT INTO track_audio (path, audio_hash) VALUES (?, ?) "
        "ON CONFLICT(path) DO UPDATE SET audio_hash = excluded.audio_hash",
        (str(path), audio_hash),
    )
    db.conn.commit()


def origin_of(db: Database, path: Path | str) -> str:
    row = db.conn.execute("SELECT origin FROM identity_links WHERE path = ?", (str(path),)).fetchone()
    return row["origin"] if row else str(path)


def link_identity(db: Database, path: Path | str, previous: Path | str, reason: str) -> str:
    """Declare that `path` is the same track as `previous`. Returns the origin."""
    origin = origin_of(db, previous)
    if origin == str(path):
        return origin  # moved back to where it started: no link needed
    db.conn.execute(
        "INSERT INTO identity_links (path, origin, reason, linked_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(path) DO UPDATE SET origin = excluded.origin, reason = excluded.reason, linked_at = excluded.linked_at",
        (str(path), origin, reason, time.time()),
    )
    db.conn.commit()
    return origin


def find_donor(db: Database, audio_hash: str, exclude: Path) -> tuple[Path, bool] | None:
    """Another path holding the same audio with analysis to reuse.

    Returns (path, missing). A missing donor means the file moved; a present one
    is a duplicate copy (its measurements are still valid for identical audio).
    Prefers missing donors, then the earliest-seen path, so the choice is stable.
    """
    row = db.conn.execute(
        """
        SELECT a.path, t.missing FROM track_audio a
          JOIN tracks t  ON t.path = a.path
          JOIN results r ON r.track_path = a.path
         WHERE a.audio_hash = ? AND a.path != ?
         ORDER BY t.missing DESC, t.first_seen ASC, a.path ASC
         LIMIT 1
        """,
        (audio_hash, str(exclude)),
    ).fetchone()
    return (Path(row["path"]), bool(row["missing"])) if row else None


def apply_rename(db: Database, old: Path, new: Path, reason: str) -> bool:
    """Carry a known track to its new path without re-reading the file.

    Used for renames SynAmp itself made (the rename journal). Only applies when
    the old path is catalogued and the new one is not, so it is idempotent.
    """
    if old == new:
        return False
    known = db.conn.execute("SELECT 1 FROM tracks WHERE path = ?", (str(old),)).fetchone()
    taken = db.conn.execute("SELECT 1 FROM tracks WHERE path = ?", (str(new),)).fetchone()
    if not known or taken:
        return False
    origin = origin_of(db, old)
    db.conn.execute("BEGIN IMMEDIATE")
    try:
        for table, column in (("tracks", "path"), ("jobs", "track_path"), ("results", "track_path"), ("track_audio", "path")):
            db.conn.execute(f"UPDATE {table} SET {column} = ? WHERE {column} = ?", (str(new), str(old)))
        row = db.conn.execute("SELECT payload FROM results WHERE track_path = ?", (str(new),)).fetchone()
        if row is not None:
            payload = json.loads(row["payload"])
            payload["track_path"] = str(new)
            db.conn.execute("UPDATE results SET payload = ? WHERE track_path = ?", (json.dumps(payload, sort_keys=True), str(new)))
        db.conn.execute("DELETE FROM identity_links WHERE path = ?", (str(old),))
        if origin != str(new):
            db.conn.execute(
                "INSERT OR REPLACE INTO identity_links (path, origin, reason, linked_at) VALUES (?, ?, ?, ?)",
                (str(new), origin, reason, time.time()),
            )
        db.conn.execute("COMMIT")
    except BaseException:
        db.conn.execute("ROLLBACK")
        raise
    return True

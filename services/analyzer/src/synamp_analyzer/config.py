"""Worker configuration.

Everything is overridable by environment so the same code runs on a laptop
during development and on the brain machine for real passes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if not value else value


def _default_cache() -> Path:
    return Path.home() / ".cache" / "synamp"


@dataclass(frozen=True)
class AnalyzerConfig:
    """Runtime settings for a scan/analyse pass."""

    library_path: Path
    """Root of the music share to walk."""

    database_url: str
    """Where results eventually go for the brain (Postgres + pgvector).

    Not used by this worker yet: the local SQLite store below is authoritative
    until the brain's Postgres schema is finalised.
    """

    cache_dir: Path
    """Scratch space for decoded/derived audio; safe to delete at any time."""

    db_path: Path
    """Catalog, queue and results for this worker.

    SQLite rather than Postgres because the worker is a single-machine,
    single-writer offline tool that has to survive interruption with no
    operational overhead. The schema mirrors the Postgres shape so the move is
    a port, not a redesign.
    """

    sample_seconds: float = 60.0
    """Audio sampled per track for *model* stages. Full-track analysis is usually
    unnecessary there and multiplies the first-pass cost for no playlist
    benefit. Note the model-free block deliberately ignores this: loudness
    range, crest factor and clipping density are whole-recording properties."""

    workers: int = 4
    """Parallel decode/analyse processes. Keep below the CPU core count."""

    walk_workers: int = 8
    """Concurrent directory listings while scanning.

    The walk is latency-bound, not CPU-bound: over a network share every listing
    is a round trip, so listing several directories at once is the difference
    between minutes and hours. Set below the share's connection limit.
    """

    rename_journal: Path | None = None
    """JSON Lines of renames SynAmp's librarian made (library-relative from/to).
    Read on every scan so renamed files keep their identity without decoding."""

    brain_url: str | None = None
    """Where to report progress (e.g. http://nas:8080). Unset = no reporting."""

    brain_token: str | None = None
    """The brain's API token (PLAYLIST_API_TOKEN on the server)."""

    max_attempts: int = 3
    """Failures before a track is left failed rather than retried. An unreadable
    file should be visible, not spin."""

    audio_extensions: tuple[str, ...] = (
        ".flac",
        ".mp3",
        ".m4a",
        ".aac",
        ".ogg",
        ".opus",
        ".wav",
        ".aiff",
        ".wma",
    )

    @classmethod
    def from_env(cls) -> "AnalyzerConfig":
        cache_dir = Path(_env("ANALYZER_CACHE", str(_default_cache())))
        return cls(
            library_path=Path(_env("LIBRARY_PATH", "/music")),
            database_url=_env(
                "DATABASE_URL", "postgres://synamp:***@localhost:5432/synamp"
            ),
            cache_dir=cache_dir,
            db_path=Path(_env("ANALYZER_DB_PATH", str(cache_dir / "analyzer.sqlite3"))),
            sample_seconds=float(_env("ANALYZER_SAMPLE_SECONDS", "60")),
            workers=int(_env("ANALYZER_WORKERS", "4")),
            walk_workers=int(_env("ANALYZER_WALK_WORKERS", "8")),
            max_attempts=int(_env("ANALYZER_MAX_ATTEMPTS", "3")),
            rename_journal=Path(os.environ["RENAME_JOURNAL_PATH"]) if os.environ.get("RENAME_JOURNAL_PATH") else None,
            brain_url=os.environ.get("SYNAMP_BRAIN_URL") or None,
            brain_token=os.environ.get("SYNAMP_BRAIN_TOKEN") or None,
        )

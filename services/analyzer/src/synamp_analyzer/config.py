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


@dataclass(frozen=True)
class AnalyzerConfig:
    """Runtime settings for a scan/analyse pass."""

    library_path: Path
    """Root of the music share to walk."""

    database_url: str
    """Where results are written (the brain database, Postgres + pgvector)."""

    cache_dir: Path
    """Scratch space for decoded/derived audio; safe to delete at any time."""

    sample_seconds: float = 60.0
    """Audio sampled per track for embedding. Full-track analysis is usually
    unnecessary and multiplies the first-pass cost for no playlist benefit."""

    workers: int = 4
    """Parallel decode/analyse processes. Keep below the CPU core count."""

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
        return cls(
            library_path=Path(_env("LIBRARY_PATH", "/music")),
            database_url=_env(
                "DATABASE_URL", "postgres://synamp:synamp@localhost:5432/synamp"
            ),
            cache_dir=Path(_env("ANALYZER_CACHE", str(Path.home() / ".cache" / "synamp"))),
            sample_seconds=float(_env("ANALYZER_SAMPLE_SECONDS", "60")),
            workers=int(_env("ANALYZER_WORKERS", "4")),
        )

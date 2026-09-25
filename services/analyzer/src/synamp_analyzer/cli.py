"""Command-line entry point.

    synamp-analyze scan      # walk the share, enqueue changed files
    synamp-analyze analyze   # run pending jobs until the queue drains

Both subcommands are Phase 0 stubs: they parse arguments and report the resolved
configuration so the wiring is testable before the models land.
"""

from __future__ import annotations

import argparse
import sys

from . import __version__
from .config import AnalyzerConfig
from .queue import JobQueue


def _cmd_scan(cfg: AnalyzerConfig) -> int:
    print(f"scan: library={cfg.library_path}")
    print(f"scan: extensions={', '.join(cfg.audio_extensions)}")
    print("scan: walking is not implemented yet (Phase 3)")
    return 0


def _cmd_analyze(cfg: AnalyzerConfig) -> int:
    print(f"analyze: workers={cfg.workers} sample={cfg.sample_seconds}s")
    print(f"analyze: cache={cfg.cache_dir}")
    print(f"analyze: queue backend not implemented yet ({JobQueue.__name__})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="synamp-analyze",
        description="SynAmp offline analysis worker (runs on the brain machine, not the NAS).",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("scan", help="discover tracks and enqueue changed files")
    sub.add_parser("analyze", help="process queued tracks")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = AnalyzerConfig.from_env()
    if args.command == "scan":
        return _cmd_scan(cfg)
    if args.command == "analyze":
        return _cmd_analyze(cfg)
    return 2


if __name__ == "__main__":
    sys.exit(main())

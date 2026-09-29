"""Command-line entry point.

    synamp-analyze scan                  # walk the share, enqueue new/changed files
    synamp-analyze analyze [--limit N]   # run queued jobs until the queue drains
    synamp-analyze stats                 # catalog and queue state
    synamp-analyze inspect [--limit N]   # dump stored metrics for analysed tracks

Exit codes: 0 success, 1 something failed, 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import __version__
from .config import AnalyzerConfig
from .store import load_rows
from .pipeline import catalog_and_queue, run_analyze, run_scan


def _cmd_scan(cfg: AnalyzerConfig) -> int:
    print(f"scan: library={cfg.library_path}")
    print(f"scan: db={cfg.db_path}")
    counts = run_scan(cfg)
    print(
        f"scan: {counts['scanned']} audio files "
        f"(new {counts['new']}, changed {counts['changed']}, "
        f"unchanged {counts['unchanged']}, missing {counts['missing']})"
    )
    print(
        f"scan: queued {counts['enqueued']} new, "
        f"re-queued {counts['requeued']} changed"
    )
    return 0


def _cmd_analyze(cfg: AnalyzerConfig, limit: int | None, requeue_failed: bool) -> int:
    print(f"analyze: db={cfg.db_path}")
    summary = run_analyze(cfg, limit=limit, requeue_failed=requeue_failed)
    print(
        f"analyze: completed {summary['completed']}, failed {summary['failed']} "
        f"(claimed {summary['claimed']}, "
        f"recovered {summary['requeued_running']} in-flight, "
        f"re-queued {summary['requeued_failed']} failed)"
    )
    return 1 if summary["failed"] else 0


def _cmd_stats(cfg: AnalyzerConfig) -> int:
    catalog, queue = catalog_and_queue(cfg)
    print(f"stats: db={cfg.db_path}")
    print(
        f"stats: catalog {catalog['tracks']} tracks "
        f"({catalog['present']} present, {catalog['missing']} missing)"
    )
    print(
        "stats: queue "
        + ", ".join(f"{state} {count}" for state, count in sorted(queue.items()))
    )
    return 0


def _cmd_inspect(cfg: AnalyzerConfig, limit: int) -> int:
    rows = load_rows(cfg.db_path, limit)
    if not rows:
        print("inspect: no stored results yet")
        return 0
    for row in rows:
        payload = json.loads(row["payload"])
        print(f"inspect: {row['track_path']}")
        for key in (
            "lufs_integrated",
            "loudness_range",
            "true_peak_dbtp",
            "crest_factor",
            "dynamic_complexity",
            "spectral_centroid",
            "spectral_flatness",
            "spectral_tilt",
            "onset_rate",
            "percussiveness",
            "bpm",
            "tempo_confidence",
            "pulse_clarity",
            "clipping_density",
            "stages_done",
        ):
            if key in payload and payload[key] is not None:
                value = payload[key]
                print(f"  {key}: {value:.4f}" if isinstance(value, float) else f"  {key}: {value}")
        production = payload.get("production") or {}
        if production:
            print(f"  production: {json.dumps(production, sort_keys=True)}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="synamp-analyze",
        description="SynAmp offline analysis worker (runs on the brain machine, not the NAS).",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("scan", help="discover tracks and enqueue changed files")

    analyze = sub.add_parser("analyze", help="process queued tracks")
    analyze.add_argument("--limit", type=int, default=None, help="stop after N jobs")
    analyze.add_argument(
        "--requeue-failed",
        action="store_true",
        help="retry failed jobs that still have attempts left",
    )

    sub.add_parser("stats", help="show catalog and queue state")

    inspect = sub.add_parser("inspect", help="dump stored metrics for analysed tracks")
    inspect.add_argument("--limit", type=int, default=3, help="how many tracks to show")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = AnalyzerConfig.from_env()
    if args.command == "scan":
        return _cmd_scan(cfg)
    if args.command == "analyze":
        return _cmd_analyze(cfg, args.limit, args.requeue_failed)
    if args.command == "stats":
        return _cmd_stats(cfg)
    if args.command == "inspect":
        return _cmd_inspect(cfg, args.limit)
    return 2


if __name__ == "__main__":
    sys.exit(main())

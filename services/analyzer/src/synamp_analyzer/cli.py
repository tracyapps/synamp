"""Command-line entry point.

    synamp-analyze scan                  # walk the share, enqueue new/changed files
    synamp-analyze analyze [--limit N]   # run queued jobs until the queue drains
    synamp-analyze stats                 # catalog and queue state
    synamp-analyze inspect [--limit N]   # dump stored metrics for analysed tracks
    synamp-analyze export [--out FILE]   # write the brain's library-signals JSON

Exit codes: 0 success, 1 something failed, 2 usage error.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .config import AnalyzerConfig
from .export import write_export
from .pipeline import catalog_and_queue, run_analyze, run_scan
from .sampling import materialise, plan_sample
from .store import load_rows


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
        f"re-queued {counts['requeued']} changed, "
        f"{counts.get('backfilled', 0)} need a newly added stage"
    )
    if counts.get("renamed"):
        print(f"scan: carried {counts['renamed']} renamed tracks over from the rename journal")
    return 0


def _cmd_analyze(
    cfg: AnalyzerConfig, limit: int | None, requeue_failed: bool, redo_stage: str | None
) -> int:
    print(f"analyze: db={cfg.db_path}")
    summary = run_analyze(
        cfg, limit=limit, requeue_failed=requeue_failed, redo_stage=redo_stage
    )
    if summary["stage_cleared"]:
        print(f"analyze: cleared stage from {summary['stage_cleared']} tracks")
    reused = summary.get("kept_after_retag", 0) + summary.get("moved", 0) + summary.get("duplicate_reused", 0)
    if reused:
        print(
            f"analyze: recognised {reused} by their audio and kept the existing analysis "
            f"({summary.get('kept_after_retag', 0)} retagged, {summary.get('moved', 0)} moved, "
            f"{summary.get('duplicate_reused', 0)} duplicate copies)"
        )
    print(
        f"analyze: completed {summary['completed']}, failed {summary['failed']} "
        f"(claimed {summary['claimed']}, "
        f"recovered {summary['requeued_running']} in-flight, "
        f"re-queued {summary['requeued_failed']} failed)"
    )
    return 1 if summary["failed"] else 0


def _cmd_sample(
    cfg: AnalyzerConfig,
    count: int,
    seed: int | None,
    mode: str,
    out: str | None,
    dry_run: bool,
) -> int:
    plan = plan_sample(
        cfg.library_path, cfg.audio_extensions, count, seed=seed, mode=mode
    )
    print(
        f"sample: chose {len(plan.tracks)} of the library "
        f"(mode {plan.mode}, seed {plan.seed})"
    )
    top = sorted(plan.groups.items(), key=lambda item: (-item[1], item[0]))
    print(f"sample: spread across {len(top)} top-level folders")
    for name, n in top[:10]:
        print(f"  {n:4d}  {name}")
    if len(top) > 10:
        print(f"  ... and {len(top) - 10} more")

    if dry_run:
        print("sample: dry run, nothing written")
        return 0

    out_dir = Path(out) if out else cfg.cache_dir / "sample"
    written = materialise(plan, out_dir)
    print(f"sample: {written} symlinks written to {out_dir}")
    print(f"sample: manifest {out_dir / 'sample-manifest.json'}")
    print("sample: to analyse it")
    print(f"  LIBRARY_PATH={out_dir} ANALYZER_DB_PATH={out_dir}/analyzer.sqlite3 \\")
    print("    synamp-analyze scan && synamp-analyze analyze")
    return 0


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


def _cmd_export(cfg: AnalyzerConfig, out: str | None, read_tags: bool = True) -> int:
    from .store import Database

    destination = Path(out) if out else cfg.cache_dir / "library-signals.json"
    if not cfg.db_path.exists():
        print(f"export: no analyzer database at {cfg.db_path}")
        return 1
    with Database(cfg.db_path) as db:
        counts = write_export(db, cfg.library_path, destination, read_tags)
    print(f"export: library={cfg.library_path}")
    print(f"export: wrote {counts['exported']} tracks to {destination} ({counts['tagged']} named from tags, the rest from folders)")
    print(
        f"export: skipped {counts['missing_on_disk']} missing, {counts['outside_root']} outside the library root; "
        f"{counts['no_results']} not analysed yet, {counts['withheld_stale']} with stale values withheld, "
        f"{counts['failed']} failed"
    )
    print(f"export: point the brain at it with LIBRARY_SIGNALS_PATH={destination}")
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
    analyze.add_argument(
        "--redo-stage",
        default=None,
        metavar="STAGE",
        help="recompute one stage for every track (after changing an extractor)",
    )

    sub.add_parser("stats", help="show catalog and queue state")

    sample = sub.add_parser(
        "sample",
        help="pick a random subset of the library into a symlink folder",
    )
    sample.add_argument("--count", type=int, default=200, help="how many tracks")
    sample.add_argument(
        "--seed",
        type=int,
        default=None,
        help="fix the selection for reproducibility (default: random, recorded)",
    )
    sample.add_argument(
        "--mode",
        choices=("uniform", "stratified"),
        default="uniform",
        help="uniform = representative of the library as it is; "
        "stratified = round-robin across top-level folders for breadth",
    )
    sample.add_argument("--out", default=None, help="destination folder")
    sample.add_argument(
        "--dry-run", action="store_true", help="report the selection without writing"
    )

    inspect = sub.add_parser("inspect", help="dump stored metrics for analysed tracks")
    inspect.add_argument("--limit", type=int, default=3, help="how many tracks to show")

    export = sub.add_parser("export", help="write analysed signals as JSON for the brain")
    export.add_argument("--out", default=None, help="destination file (default: cache dir)")
    export.add_argument("--no-tags", action="store_true", help="skip reading file tags (names come from folders)")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = AnalyzerConfig.from_env()
    if args.command == "scan":
        return _cmd_scan(cfg)
    if args.command == "analyze":
        return _cmd_analyze(cfg, args.limit, args.requeue_failed, args.redo_stage)
    if args.command == "stats":
        return _cmd_stats(cfg)
    if args.command == "sample":
        return _cmd_sample(cfg, args.count, args.seed, args.mode, args.out, args.dry_run)
    if args.command == "inspect":
        return _cmd_inspect(cfg, args.limit)
    if args.command == "export":
        return _cmd_export(cfg, args.out, not args.no_tags)
    return 2


if __name__ == "__main__":
    sys.exit(main())

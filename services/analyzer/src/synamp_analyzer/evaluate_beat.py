"""Read-only beat evaluation; JSON reports, no queue or library writes.

Run: uv run python -m synamp_analyzer.evaluate_beat track.flac [track2.mp3 ...]
These are coverage/diagnostic reports, not accuracy measurements without labels.
"""
from __future__ import annotations

import argparse
from importlib.metadata import version
import json
from pathlib import Path
import platform
import time

from .beat import (
    BEAT_METHOD, DP_TIGHTNESS, MAX_REFERENCE_RMS_MS,
    MIN_PREDICTIVE_STRENGTH, MIN_TEMPO_CONFIDENCE, MIN_TIMING_CONCENTRATION,
    extract_beat,
)


def evaluate(paths: list[Path]) -> dict[str, object]:
    rows = []
    for path in paths:
        started = time.perf_counter()
        row: dict[str, object] = {"path": str(path)}
        try:
            stat = path.stat()
            # Change detection only, not a content hash or recording identity.
            row.update(size_bytes=stat.st_size, mtime_ns=stat.st_mtime_ns)
            row["result"] = extract_beat(path)
        except Exception as exc:
            row["error"] = f"{type(exc).__name__}: {exc}"
        row["elapsed_seconds"] = round(time.perf_counter() - started, 6)
        rows.append(row)
    return {
        "method": BEAT_METHOD,
        "evidence": "unannotated diagnostic run; not an accuracy benchmark",
        "python": platform.python_version(),
        "platform": platform.platform(),
        "dependencies": {name: version(name) for name in ("numpy", "scipy", "soundfile")},
        "parameters": {
            "dp_tightness": DP_TIGHTNESS,
            "min_tempo_confidence": MIN_TEMPO_CONFIDENCE,
            "min_predictive_strength": MIN_PREDICTIVE_STRENGTH,
            "max_reference_rms_ms": MAX_REFERENCE_RMS_MS,
            "min_timing_concentration": MIN_TIMING_CONCENTRATION,
        },
        "tracks": rows,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", type=Path, nargs="+")
    args = parser.parse_args()
    report = evaluate(args.paths)
    print(json.dumps(report, indent=2, allow_nan=False))
    return int(any("error" in row for row in report["tracks"]))


if __name__ == "__main__":
    raise SystemExit(main())

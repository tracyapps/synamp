"""Export analysed signals for the brain (AGENT-ROADMAP P1, deliverable 5).

The brain's smart playlists read a versioned JSON document of per-track
signals. This module writes it from the local SQLite store. It is deliberately
separate from the queue: the queue is a private worker detail, the export is a
contract.

Rules the export enforces, because the brain trusts what it receives:

* **Only current values.** A field is exported only when the job record says its
  stage is done. A file whose bytes changed is reset to no stages, so its old
  measurements are withheld rather than served as if they described the new
  audio.
* **Null is absence.** Unmeasured values are left out, never written as zero.
* **Only declared signals.** `EXPORTED_SIGNALS` names every field and the stage
  that owns it. A stage that starts producing a field nobody declared here is
  caught by a test, not silently shipped (or silently dropped).
* **Stable identity.** A track's ID is a hash of its path *relative to the
  library root*, so a sample (a symlink tree mirroring the library) and the full
  library give the same track the same ID.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import time
from pathlib import Path, PurePosixPath

from . import __version__
from .store import Database

EXPORT_FORMAT = "synamp.library-signals/1"

EXPORTED_SIGNALS: dict[str, tuple[str, ...]] = {
    # stage -> fields it owns. Keep in step with apps/brain/src/query/signals.ts;
    # a brain test reads this mapping and fails if a name is not registered there.
    "dsp_core": (
        "bpm", "tempo_confidence", "pulse_clarity", "onset_rate", "percussiveness",
        "lufs_integrated", "loudness_range", "crest_factor", "dynamic_complexity",
        "clipping_density", "spectral_centroid", "spectral_flatness", "spectral_tilt",
    ),
    "beat": (
        "beat_grid_strength", "beat_interval_cv", "tempo_drift",
        "microtiming_tightness", "microtiming_signed", "swing_ratio",
    ),
}

STATUS_FIELDS: dict[str, tuple[str, ...]] = {
    # Status strings the brain uses to gate eligibility (not signals themselves).
    "beat": ("beat_status", "timing_status", "beat_method"),
}

# Top-level folders whose children are not one artist.
_NOT_AN_ARTIST = {"compilations", "various artists", "soundtracks", "va"}
_TRACK_NUMBER = re.compile(r"^\s*(?:\d{1,2}[-.])?\d{1,3}\s*(?:[-._]\s*|\s+)")


def track_id(relative: PurePosixPath) -> str:
    """Stable ID from the library-relative path (case preserved, POSIX separators)."""
    return "p:" + hashlib.sha256(str(relative).encode("utf-8")).hexdigest()[:20]


def describe_from_path(relative: PurePosixPath) -> dict[str, str]:
    """Best-effort title/artist/album from an Artist/Album/NN Title.ext layout.

    Tags are not read yet, so this is labelled `metadata_source: "path"` and the
    brain should prefer the library core's tags once the two are joined by path.
    """
    stem = relative.stem
    title = _TRACK_NUMBER.sub("", stem).strip() or stem
    out = {"title": title, "metadata_source": "path"}
    parts = relative.parts
    if len(parts) >= 3:
        if parts[0].lower() not in _NOT_AN_ARTIST:
            out["artist"] = parts[0]
        out["album"] = parts[-2]
    elif len(parts) == 2 and parts[0].lower() not in _NOT_AN_ARTIST:
        out["artist"] = parts[0]
    return out


def _finite(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value \
        and value not in (float("inf"), float("-inf"))


def build_export(db: Database, library_root: Path) -> dict:
    """The export document, as a plain dict."""
    root = library_root.expanduser()
    rows = db.conn.execute(
        """
        SELECT t.path, t.missing, j.state, j.stages_done, r.payload, r.analyzer_version, r.computed_at
          FROM tracks t
          LEFT JOIN jobs j    ON j.track_path = t.path
          LEFT JOIN results r ON r.track_path = t.path
         ORDER BY t.path
        """
    ).fetchall()

    tracks: list[dict] = []
    counts = {"catalog": len(rows), "exported": 0, "missing_on_disk": 0, "outside_root": 0,
              "no_results": 0, "withheld_stale": 0, "failed": 0}
    seen_ids: dict[str, str] = {}
    for row in rows:
        if row["missing"]:
            counts["missing_on_disk"] += 1
            continue
        path = Path(row["path"])
        try:
            relative = PurePosixPath(path.relative_to(root).as_posix())
        except ValueError:
            counts["outside_root"] += 1
            continue
        if row["state"] == "failed":
            counts["failed"] += 1
        current = set(json.loads(row["stages_done"] or "[]")) if row["state"] else set()
        payload = json.loads(row["payload"]) if row["payload"] else {}
        if not payload:
            counts["no_results"] += 1
        stored = set(payload.get("stages_done") or [])
        if stored - current:
            # Results exist for stages the queue no longer counts as done
            # (file changed, or --redo-stage). Withhold them.
            counts["withheld_stale"] += 1

        signals: dict[str, float] = {}
        status: dict[str, str] = {}
        for stage in sorted(current & stored):
            for name in EXPORTED_SIGNALS.get(stage, ()):
                value = payload.get(name)
                if _finite(value):
                    signals[name] = float(value)
            for name in STATUS_FIELDS.get(stage, ()):
                value = payload.get(name)
                if isinstance(value, str) and value:
                    status[name] = value

        identifier = track_id(relative)
        if identifier in seen_ids:  # astronomically unlikely; never merge two files
            raise RuntimeError(f"track id collision: {seen_ids[identifier]} vs {relative}")
        seen_ids[identifier] = str(relative)
        entry: dict = {
            "id": identifier,
            "path": str(relative),
            **describe_from_path(relative),
            **status,
            "stages_done": sorted(current & stored),
            "signals": signals,
        }
        if payload.get("analyzer_version") or row["analyzer_version"]:
            entry["analyzer_version"] = payload.get("analyzer_version") or row["analyzer_version"]
        if row["computed_at"]:
            entry["computed_at"] = row["computed_at"]
        tracks.append(entry)
        counts["exported"] += 1

    return {
        "format": EXPORT_FORMAT,
        "exported_at": time.time(),
        "exporter_version": __version__,
        "library_root": str(root),
        "signals": {stage: list(names) for stage, names in EXPORTED_SIGNALS.items()},
        "counts": counts,
        "tracks": tracks,
    }


def write_export(db: Database, library_root: Path, out: Path) -> dict:
    """Write atomically (temp file + rename) so the brain never reads half a file."""
    document = build_export(db, library_root)
    out = out.expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix=f".{out.name}.", suffix=".tmp", dir=out.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
        os.replace(temp, out)
    except BaseException:
        Path(temp).unlink(missing_ok=True)
        raise
    return document["counts"]

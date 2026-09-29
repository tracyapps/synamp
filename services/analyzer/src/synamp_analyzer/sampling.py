"""Random sampling from a large library.

Why this exists: a first pass should not be run blind over 45,000 files, and it
should not be run over a hand-picked folder either — hand-picked folders are
exactly the tidy subset that hides the problems a real library has. A random
sample is the honest preview.

Two selection modes, because they answer different questions:

* `uniform` — every file equally likely. This is the *representative* sample: if
  one artist contributed a tenth of the library, a tenth of the sample is that
  artist, and the timings you measure are the timings you will get.
* `stratified` — round-robin across top-level folders. This is the *breadth*
  sample: it guarantees range across the library's structure even when the
  library is lopsided, at the cost of over-representing folders with only a
  couple of files.

The selection is seeded and the result is written to a manifest, so a run is
reproducible and auditable: given the seed and the manifest you can prove which
files produced a number.

Selection produces a directory of **symlinks**, not copies. A 274 GB library
must not be duplicated to take a 200-file sample, and the worker only reads.
"""

from __future__ import annotations

import json
import random
import time
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from .models import Track
from .pipeline import iter_audio_files


@dataclass
class SamplePlan:
    """The chosen files, plus enough provenance to reproduce the choice."""

    tracks: list[Track]
    seed: int
    mode: str
    library_root: Path
    groups: dict[str, int]
    """Which top-level folder each selected track came from, and how many."""


def plan_sample(
    library_root: Path,
    extensions: tuple[str, ...],
    count: int,
    seed: int | None = None,
    mode: str = "uniform",
) -> SamplePlan:
    """Choose `count` files from the library. Deterministic for a given seed."""
    everything = iter_audio_files(library_root, extensions)
    if not everything:
        raise ValueError(f"no audio files found under {library_root}")

    resolved_seed = random.SystemRandom().randrange(1, 2**31) if seed is None else seed
    rng = random.Random(resolved_seed)
    wanted = min(count, len(everything))

    if mode == "uniform":
        chosen = rng.sample(everything, wanted)
    elif mode == "stratified":
        chosen = _stratified(everything, wanted, library_root, rng)
    else:
        raise ValueError(f"unknown sampling mode {mode!r}")

    groups: dict[str, int] = defaultdict(int)
    for track in chosen:
        groups[_group_of(track.path, library_root)] += 1

    return SamplePlan(
        tracks=sorted(chosen, key=lambda t: str(t.path)),
        seed=resolved_seed,
        mode=mode,
        library_root=library_root,
        groups=dict(sorted(groups.items())),
    )


def _group_of(path: Path, library_root: Path) -> str:
    """Top-level folder a track lives under — in practice, usually the artist."""
    try:
        relative = path.relative_to(library_root)
    except ValueError:
        return "(outside library)"
    return relative.parts[0] if len(relative.parts) > 1 else "(loose files)"


def _stratified(
    everything: list[Track], wanted: int, library_root: Path, rng: random.Random
) -> list[Track]:
    """Round-robin across top-level folders until `wanted` files are chosen.

    Folders run out at different rates; when only one is left it supplies the
    remainder, so the sample always reaches the requested size.
    """
    buckets: dict[str, list[Track]] = defaultdict(list)
    for track in everything:
        buckets[_group_of(track.path, library_root)].append(track)
    for bucket in buckets.values():
        rng.shuffle(bucket)

    order = sorted(buckets)
    chosen: list[Track] = []
    while len(chosen) < wanted and any(buckets[name] for name in order):
        for name in order:
            if len(chosen) >= wanted:
                break
            if buckets[name]:
                chosen.append(buckets[name].pop())
    return chosen


def materialise(plan: SamplePlan, out_dir: Path) -> int:
    """Write the sample to `out_dir` as symlinks plus a manifest.

    Returns the number of links written. Existing files are overwritten, so
    re-running with the same seed and directory is idempotent; re-running with a
    *different* seed into the same directory leaves the union of both, which is
    why the manifest carries the whole selection rather than a diff.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for track in plan.tracks:
        try:
            relative = track.path.relative_to(plan.library_root)
        except ValueError:
            relative = Path(track.path.name)
        destination = out_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_symlink() or destination.exists():
            destination.unlink()
        destination.symlink_to(track.path.resolve())
        written += 1

    manifest = {
        "created_at": time.time(),
        "library_root": str(plan.library_root),
        "seed": plan.seed,
        "mode": plan.mode,
        "count": len(plan.tracks),
        "groups": plan.groups,
        "tracks": [
            {
                "path": str(track.path),
                "size_bytes": track.size_bytes,
                "mtime": track.mtime,
            }
            for track in plan.tracks
        ],
    }
    (out_dir / "sample-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
    )
    return written

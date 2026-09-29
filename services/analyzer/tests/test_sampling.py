"""Random sampling: reproducible, representative when asked, breadth when asked."""

from __future__ import annotations

import json
from pathlib import Path

from synamp_analyzer.sampling import materialise, plan_sample

from synth import sine

EXTENSIONS = (".flac",)


def build_library(root: Path, layout: dict[str, int]) -> int:
    """Create `layout` of {folder: file count} under `root`."""
    total = 0
    for folder, count in layout.items():
        target = root / folder
        target.mkdir(parents=True, exist_ok=True)
        for index in range(count):
            sine(target / f"track{index:02d}.flac", seconds=0.5)
            total += 1
    return total


def test_uniform_sample_is_reproducible_for_a_seed(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist-a": 20, "artist-b": 20, "artist-c": 20})

    first = plan_sample(library, EXTENSIONS, count=15, seed=42)
    second = plan_sample(library, EXTENSIONS, count=15, seed=42)
    third = plan_sample(library, EXTENSIONS, count=15, seed=43)

    assert [str(t.path) for t in first.tracks] == [str(t.path) for t in second.tracks]
    assert [str(t.path) for t in first.tracks] != [str(t.path) for t in third.tracks]


def test_uniform_sample_follows_the_library_shape(tmp_path: Path) -> None:
    """Representative means lopsided input gives lopsided output — that is the
    point, it is the honest preview."""
    library = tmp_path / "library"
    build_library(library, {"huge": 90, "small": 10})

    plan = plan_sample(library, EXTENSIONS, count=50, seed=1)
    assert plan.groups["huge"] > plan.groups["small"]
    assert sum(plan.groups.values()) == 50


def test_stratified_sample_spreads_across_folders(tmp_path: Path) -> None:
    """Breadth mode must not let one giant folder swamp the sample."""
    library = tmp_path / "library"
    build_library(library, {f"artist-{i}": 30 for i in range(8)})

    plan = plan_sample(library, EXTENSIONS, count=16, seed=7, mode="stratified")
    assert len(plan.groups) == 8, "every folder should be represented"
    assert all(count == 2 for count in plan.groups.values())


def test_sample_clamps_to_what_exists(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"only": 3})
    plan = plan_sample(library, EXTENSIONS, count=50, seed=None)
    assert len(plan.tracks) == 3


def test_materialise_writes_symlinks_and_a_manifest(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist-a": 6, "artist-b": 6})
    plan = plan_sample(library, EXTENSIONS, count=6, seed=99)

    out = tmp_path / "sample"
    written = materialise(plan, out)

    assert written == 6
    links = [p for p in out.rglob("*.flac")]
    assert len(links) == 6
    for link in links:
        assert link.is_symlink(), "the sample must not duplicate the library"
        assert link.resolve().is_file(), "every link must point at real audio"

    manifest = json.loads((out / "sample-manifest.json").read_text())
    assert manifest["seed"] == 99
    assert manifest["count"] == 6
    assert manifest["mode"] == "uniform"
    assert len(manifest["tracks"]) == 6
    # The manifest is what makes a measurement traceable back to its files.
    assert {t["path"] for t in manifest["tracks"]} == {str(t.path) for t in plan.tracks}

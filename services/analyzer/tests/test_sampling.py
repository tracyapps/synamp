"""Random sampling: reproducible, representative when asked, breadth when asked."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
import pytest

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


def test_materialise_refuses_the_source_tree_before_touching_audio(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist": 2})
    plan = plan_sample(library, EXTENSIONS, count=2, seed=1)
    before = {t.path: t.path.read_bytes() for t in plan.tracks}
    destinations = [library, library / "subset", tmp_path]
    alias = library.with_name("LIBRARY")
    if alias.exists() and alias.samefile(library):
        destinations.append(alias / "subset")
    for destination in destinations:
        with pytest.raises(ValueError, match="separate"):
            materialise(plan, destination)
        assert all(path.read_bytes() == data and not path.is_symlink() for path, data in before.items())


def test_materialise_never_overwrites_unrelated_files_or_symlink_targets(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist": 2})
    plan = plan_sample(library, EXTENSIONS, count=2, seed=1)
    out = tmp_path / "sample"
    out.mkdir()
    sentinel = out / "keep.txt"
    sentinel.write_text("keep me")
    with pytest.raises(ValueError, match="empty|existing"):
        materialise(plan, out)
    assert sentinel.read_text() == "keep me"
    assert list(out.iterdir()) == [sentinel]
    alias = tmp_path / "alias"
    alias.symlink_to(library, target_is_directory=True)
    with pytest.raises(ValueError):
        materialise(plan, alias)
    assert all(t.path.is_file() and not t.path.is_symlink() for t in plan.tracks)


def test_materialise_same_selection_is_idempotent_but_different_selection_refuses(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist": 6})
    first = plan_sample(library, EXTENSIONS, count=2, seed=1)
    out = tmp_path / "sample"
    assert materialise(first, out) == 2
    before = (out / "sample-manifest.json").read_bytes()
    assert materialise(first, out) == 2
    assert (out / "sample-manifest.json").read_bytes() == before
    second = plan_sample(library, EXTENSIONS, count=4, seed=2)
    with pytest.raises(ValueError, match="existing|selection"):
        materialise(second, out)
    assert len(list(out.rglob("*.flac"))) == 2, "never leave a union that the manifest misrepresents"
    assert (out / "sample-manifest.json").read_bytes() == before


def test_materialise_refuses_a_tampered_existing_sample(tmp_path: Path) -> None:
    library = tmp_path / "library"
    build_library(library, {"artist": 2})
    plan = plan_sample(library, EXTENSIONS, count=2, seed=1)
    out = tmp_path / "sample"
    materialise(plan, out)
    link = next(out.rglob("*.flac"))
    link.unlink()
    link.write_bytes(b"unrelated audio")
    with pytest.raises(ValueError, match="existing|sample"):
        materialise(plan, out)
    assert link.read_bytes() == b"unrelated audio"


def test_sample_cli_refusal_returns_nonzero_without_touching_source(tmp_path: Path, monkeypatch, capsys) -> None:
    from synamp_analyzer.cli import main
    library = tmp_path / "library"
    build_library(library, {"artist": 1})
    audio = next(library.rglob("*.flac"))
    before = audio.read_bytes()
    monkeypatch.setenv("LIBRARY_PATH", str(library))
    assert main(["sample", "--count", "1", "--seed", "7", "--out", str(library)]) == 1
    assert "refused" in capsys.readouterr().err
    assert audio.read_bytes() == before and not audio.is_symlink()


def test_printed_sample_commands_scope_both_steps_and_quote_paths(tmp_path: Path, monkeypatch, capsys) -> None:
    from synamp_analyzer.cli import main
    library = tmp_path / "library"
    build_library(library, {"artist": 1})
    monkeypatch.setenv("LIBRARY_PATH", str(library))
    out = tmp_path / "sample ' $(touch UNEXPECTED)"
    assert main(["sample", "--count", "1", "--seed", "7", "--out", str(out)]) == 0
    lines = capsys.readouterr().out.splitlines()
    command = "\n".join(lines[lines.index("  ("):])
    tools = tmp_path / "bin"
    tools.mkdir()
    fake = tools / "synamp-analyze"
    fake.write_text('#!/bin/sh\nprintf "%s|%s|%s|%s|%s\\n" "$1" "$LIBRARY_PATH" "$ANALYZER_DB_PATH" "$SYNAMP_BRAIN_URL" "$RENAME_JOURNAL_PATH" >> "$SYNAMP_TEST_LOG"\n')
    fake.chmod(0o700)
    log = tmp_path / "commands.log"
    env = {**os.environ, "PATH": f"{tools}{os.pathsep}{os.environ['PATH']}", "SYNAMP_TEST_LOG": str(log),
           "ANALYZER_DB_PATH": "/owner/state.sqlite3", "SYNAMP_BRAIN_URL": "http://owner", "RENAME_JOURNAL_PATH": "/owner/renames.jsonl"}
    result = subprocess.run(["/bin/sh", "-c", command], env=env, cwd=tmp_path, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert log.read_text().splitlines() == [f"{step}|{out}|{out / 'analyzer.sqlite3'}||" for step in ["scan", "analyze"]]
    assert not (tmp_path / "UNEXPECTED").exists(), "sample path must not become shell code"

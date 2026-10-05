"""Track identity: retags, moves, copies and journaled renames (LIBRARY-CARE step 1)."""

from __future__ import annotations

import json
import os
import stat
import time
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from synamp_analyzer import identity, pipeline
from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.export import build_export, track_id
from synamp_analyzer.pipeline import run_analyze, run_scan
from synamp_analyzer.store import Database, load_result


def tone(path: Path, title: str = "", seconds: float = 2.0, freq: float = 440.0) -> None:
    """A FLAC whose audio depends only on `freq`/`seconds`; `title` changes only the tags (and bytes)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    t = np.linspace(0.0, seconds, int(44100 * seconds), endpoint=False)
    with sf.SoundFile(str(path), "w", 44100, 1, format="FLAC") as handle:
        if title:
            handle.title = title
            handle.artist = "Someone"
        handle.write((0.4 * np.sin(2 * np.pi * freq * t)).astype(np.float32))


def config_for(library: Path, tmp_path: Path, journal: Path | None = None) -> AnalyzerConfig:
    return AnalyzerConfig(library_path=library, database_url="postgres://unused", cache_dir=tmp_path / "cache",
                          db_path=tmp_path / "analyzer.sqlite3", workers=1, rename_journal=journal)


def quiet(*_args: object, **_kwargs: object) -> None:
    """Swallow progress output."""


def forbid_analysis(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make any real dsp/beat analysis fail the test: identity alone must be enough."""
    def boom(*_args: object, **_kwargs: object) -> dict:
        raise AssertionError("re-analysed audio that should have been recognised")
    monkeypatch.setattr(pipeline, "extract_dsp_core", boom)
    import synamp_analyzer.beat as beat
    monkeypatch.setattr(beat, "extract_beat", boom)


def touch_later(path: Path) -> None:
    later = time.time() + 5
    os.utime(path, (later, later))


def by_path(document: dict) -> dict[str, dict]:
    return {track["path"]: track for track in document["tracks"]}


def test_audio_hash_ignores_tags_but_not_audio(tmp_path: Path) -> None:
    tone(tmp_path / "a.flac", title="One")
    tone(tmp_path / "b.flac", title="Two")
    tone(tmp_path / "c.flac", freq=441.0)
    a, b, c = (identity.extract_identity(tmp_path / f"{n}.flac") for n in "abc")
    assert (tmp_path / "a.flac").read_bytes() != (tmp_path / "b.flac").read_bytes()
    assert a["audio_hash"] == b["audio_hash"], "tags must not change identity"
    assert a["audio_hash"] != c["audio_hash"], "different audio must"
    assert a["audio_hash_method"] == identity.AUDIO_HASH_METHOD
    assert abs(a["audio_duration_s"] - 2.0) < 0.01


def test_fingerprint_is_null_without_the_tool_and_read_from_it_when_present(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    tone(tmp_path / "a.flac")
    monkeypatch.setattr(identity.shutil, "which", lambda _name: None)
    assert identity.chromaprint(tmp_path / "a.flac") == (None, "tool_missing")
    fake = tmp_path / "fpcalc"
    fake.write_text('#!/bin/sh\necho \'{"duration": 2.0, "fingerprint": "AQAAfake"}\'\n')
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    assert identity.chromaprint(tmp_path / "a.flac", fpcalc=str(fake)) == ("AQAAfake", "measured")
    broken = tmp_path / "broken"
    broken.write_text("#!/bin/sh\necho nope\n")
    broken.chmod(broken.stat().st_mode | stat.S_IEXEC)
    assert identity.chromaprint(tmp_path / "a.flac", fpcalc=str(broken)) == (None, "failed")


def test_a_retag_keeps_the_analysis(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    library = tmp_path / "music"
    song = library / "Artist" / "Album" / "01 - Song.flac"
    tone(song, title="Old Title")
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    with Database(config.db_path) as db:
        before = load_result(db, song)
    tone(song, title="Fixed Title")  # new bytes, same audio
    touch_later(song)
    scan = run_scan(config, progress=quiet)
    assert scan["requeued"] == 1
    forbid_analysis(monkeypatch)
    summary = run_analyze(config, progress=quiet)
    assert summary["kept_after_retag"] == 1 and summary["failed"] == 0
    with Database(config.db_path) as db:
        after = load_result(db, song)
    assert after.stages_done == {"identity", "dsp_core", "beat"}
    assert after.lufs_integrated == before.lufs_integrated


def test_a_moved_file_keeps_its_id_and_analysis(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    library = tmp_path / "music"
    old = library / "ani difranco" / "Album" / "song.flac"
    tone(old)
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    with Database(config.db_path) as db:
        original_id = by_path(build_export(db, library, read_file_tags=False))["ani difranco/Album/song.flac"]["id"]
    new = library / "Ani DiFranco" / "Album" / "01 - Song.flac"
    new.parent.mkdir(parents=True)
    old.rename(new)
    forbid_analysis(monkeypatch)
    run_scan(config, progress=quiet)
    summary = run_analyze(config, progress=quiet)
    assert summary["moved"] == 1
    with Database(config.db_path) as db:
        document = build_export(db, library, read_file_tags=False)
    moved = by_path(document)["Ani DiFranco/Album/01 - Song.flac"]
    assert moved["id"] == original_id, "the track keeps its identity, so plays and feedback follow it"
    assert moved["aliases"] == [track_id(Path("Ani DiFranco/Album/01 - Song.flac"))]
    assert moved["signals"]["lufs_integrated"] < 0
    assert moved["audio_hash"]
    assert "ani difranco/Album/song.flac" not in by_path(document)


def test_a_copy_reuses_measurements_but_is_its_own_track(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    library = tmp_path / "music"
    tone(library / "A" / "song.flac")
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    tone(library / "B" / "song copy.flac", title="tagged differently")
    forbid_analysis(monkeypatch)
    run_scan(config, progress=quiet)
    summary = run_analyze(config, progress=quiet)
    assert summary["duplicate_reused"] == 1
    with Database(config.db_path) as db:
        tracks = by_path(build_export(db, library, read_file_tags=False))
    assert tracks["A/song.flac"]["id"] != tracks["B/song copy.flac"]["id"]
    assert tracks["A/song.flac"]["audio_hash"] == tracks["B/song copy.flac"]["audio_hash"], "duplicates are findable by hash"
    assert "aliases" not in tracks["B/song copy.flac"]


def test_journaled_renames_carry_identity_without_decoding(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    library = tmp_path / "music"
    old = library / "Misc" / "track.flac"
    tone(old)
    journal = tmp_path / "renames.jsonl"
    config = config_for(library, tmp_path, journal)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    with Database(config.db_path) as db:
        original_id = by_path(build_export(db, library, read_file_tags=False))["Misc/track.flac"]["id"]
    new = library / "Someone" / "Album (2001)" / "03 - Track.flac"
    new.parent.mkdir(parents=True)
    old.rename(new)
    journal.write_text(json.dumps({"from": "Misc/track.flac", "to": "Someone/Album (2001)/03 - Track.flac", "reason": "organise"}) + "\n{torn")
    scan = run_scan(config, progress=quiet)
    assert scan["renamed"] == 1 and scan["new"] == 0 and scan["missing"] == 0
    assert run_scan(config, progress=quiet)["renamed"] == 0, "re-reading the journal is harmless"
    forbid_analysis(monkeypatch)
    monkeypatch.setattr(pipeline, "extract_identity", lambda *_: (_ for _ in ()).throw(AssertionError("decoded")))
    assert run_analyze(config, progress=quiet)["claimed"] == 0, "nothing to do: the track was recognised from the journal"
    with Database(config.db_path) as db:
        moved = by_path(build_export(db, library, read_file_tags=False))["Someone/Album (2001)/03 - Track.flac"]
    assert moved["id"] == original_id
    assert moved["stages_done"] == ["beat", "dsp_core", "identity"]


def test_tracks_finished_before_identity_existed_get_only_that_stage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    library = tmp_path / "music"
    tone(library / "old.flac")
    config = config_for(library, tmp_path)
    run_scan(config, progress=quiet)
    run_analyze(config, progress=quiet)
    with Database(config.db_path) as db:  # pretend it was analysed by the previous version
        db.conn.execute("UPDATE jobs SET stages_done = '[\"beat\", \"dsp_core\"]'")
        db.conn.execute("DELETE FROM track_audio")
        db.conn.commit()
    scan = run_scan(config, progress=quiet)
    assert scan["backfilled"] == 1
    forbid_analysis(monkeypatch)
    summary = run_analyze(config, progress=quiet)
    assert summary["completed"] == 1
    with Database(config.db_path) as db:
        assert load_result(db, library / "old.flac").audio_hash
        assert db.conn.execute("SELECT COUNT(*) FROM track_audio").fetchone()[0] == 1


def test_librarian_import_lines_are_not_mistaken_for_renames(tmp_path: Path) -> None:
    """New music filed from incoming/ is journaled without from/to; scan must skip it, not choke."""
    library = tmp_path / "music"
    tone(library / "Someone" / "Album (2001)" / "01 - Track.flac")
    journal = tmp_path / "renames.jsonl"
    journal.write_text(
        json.dumps({"source": "x/track.flac", "source_area": "incoming", "target": "Someone/Album (2001)/01 - Track.flac",
                    "target_area": "library", "reason": "import: New", "batch": "b", "decision": "import:1", "at": 1}) + "\n"
        + json.dumps({"source": "a.flac", "source_area": "incoming", "target": "_duplicates/a.flac", "target_area": "incoming",
                      "reason": "import", "batch": "b", "decision": "import:1", "at": 1}) + "\n",
        encoding="utf-8",
    )
    counts = run_scan(config_for(library, tmp_path, journal), progress=quiet)
    assert counts["renamed"] == 0
    assert counts["new"] == 1

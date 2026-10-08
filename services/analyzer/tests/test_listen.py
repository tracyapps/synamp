"""The voice stage's bookkeeping. The model itself was checked on the owner's Mac
against the reference PANNs code (identical outputs) and on ~40 of the owner's
songs; here a stand-in model makes the rules testable without the weights."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from synamp_analyzer import listen, pipeline
from synamp_analyzer.config import AnalyzerConfig
from synamp_analyzer.export import build_export
from synamp_analyzer.pipeline import run_analyze, run_scan
from synamp_analyzer.store import Database, load_result

from synth import sine


def probs(windows: int, **classes: list[float]) -> np.ndarray:
    out = np.zeros((windows, 527), dtype=np.float32)
    for index, values in classes.items():
        out[:, int(index.lstrip("c"))] = values
    return out


def test_singing_in_a_third_of_the_windows() -> None:
    clip = probs(6, c27=[0.0, 0.3, 0.0, 0.25, 0.0, 0.05], c153=[0.5] * 6)  # Singing; Piano throughout
    fields = listen.summarise(clip)
    assert fields["vocal_fraction"] == 2 / 6 and fields["instrumental"] == 1 - 2 / 6
    assert fields["instruments"]["piano"] == 1.0 and fields["instruments"]["guitar"] == 0.0
    assert fields["voice_peak"] == np.float32(0.3)


def test_speech_counts_as_words_and_quiet_traces_do_not() -> None:
    assert listen.summarise(probs(4, c0=[0.6, 0.0, 0.0, 0.0]))["vocal_fraction"] == 0.25, "spoken word is words"
    assert listen.summarise(probs(4, c27=[0.05] * 4))["vocal_fraction"] == 0.0, "instrumental Eno sat at or below 0.05"


def test_windows_cover_the_song_but_at_most_thirty() -> None:
    sr = listen.MODEL_SAMPLE_RATE
    assert listen.windows(np.zeros(sr * 25, dtype=np.float32)).shape == (3, sr * 10), "25 s → 10 + 10 + a padded half"
    assert listen.windows(np.zeros(sr * 12, dtype=np.float32)).shape == (1, sr * 10), "a 2-second tail isn't a window"
    assert listen.windows(np.zeros(sr * 3600, dtype=np.float32)).shape[0] == listen.MAX_WINDOWS
    assert listen.windows(np.zeros(0, dtype=np.float32)).shape[0] == 0


def test_the_stage_runs_and_exports_flat_instruments(tmp_path: Path, monkeypatch) -> None:
    library = tmp_path / "music"
    library.mkdir()
    sine(library / "song.flac", seconds=25.0)
    config = AnalyzerConfig(library_path=library, database_url="postgres://unused", cache_dir=tmp_path / "cache",
                            db_path=tmp_path / "analyzer.sqlite3", workers=1)
    monkeypatch.setattr(listen, "available", lambda: False)
    run_scan(config, progress=lambda *_: None)
    first = run_analyze(config, progress=lambda *_: None)
    assert first["completed"] == 1
    db = Database(config.db_path)
    assert "voice" not in load_result(db, library / "song.flac").stages_done, "no model here yet: voice waits"
    db.close()

    # The model arrives: the next run listens to the song that was already done, and only that stage runs.
    monkeypatch.setattr(listen, "available", lambda: True)
    monkeypatch.setattr(listen, "_infer", lambda batch: (probs(len(batch), c33=[0.4] + [0.0] * (len(batch) - 1), c141=[0.3] * len(batch)),
                                                         np.ones((len(batch), 2048), dtype=np.float32)))
    monkeypatch.setattr(pipeline, "extract_dsp_core", lambda *_: (_ for _ in ()).throw(AssertionError("dsp_core re-ran")))
    second = run_analyze(config, progress=lambda *_: None)
    assert second["backfilled"] == 1 and second["completed"] == 1
    db = Database(config.db_path)
    result = load_result(db, library / "song.flac")
    assert result.vocal_fraction == 1 / 3 and result.instruments["electric_guitar"] == 1.0
    assert result.stage_revisions["voice"] == 2 and result.voice_method == listen.METHOD
    assert result.sound_vector and len(__import__("base64").b64decode(result.sound_vector)) == 128
    document = build_export(db, config.library_path, progress=lambda *_: None, workers=1)
    db.close()
    signals = document["tracks"][0]["signals"]
    assert signals["vocal_fraction"] == 1 / 3 and signals["instruments.electric_guitar"] == 1.0
    assert document["tracks"][0]["voice_method"] == listen.METHOD
    assert document["tracks"][0]["sound_vector"] == result.sound_vector
    json.dumps(document)


def test_sound_vectors_keep_alike_songs_close() -> None:
    import base64
    rng = np.random.default_rng(1)
    calm = rng.random(2048).astype(np.float32)
    loud = rng.random(2048).astype(np.float32)
    def vec(base, noise):
        windows = np.stack([base + noise * rng.random(2048).astype(np.float32) for _ in range(6)])
        return np.frombuffer(base64.b64decode(listen.sound_vector(windows)), dtype=np.int8).astype(float)
    a, b, c = vec(calm, 0.05), vec(calm, 0.05), vec(loud, 0.05)
    cos = lambda x, y: float(x @ y / np.linalg.norm(x) / np.linalg.norm(y))
    assert cos(a, b) > cos(a, c), "two takes of the same sound are closer than a different sound"
    assert listen.sound_vector(np.zeros((0, 2048), dtype=np.float32)) is None
    assert listen.sound_vector(np.zeros((3, 2048), dtype=np.float32)) is None, "silence has no direction"
    assert listen.sound_vector(np.ones((2, 2048), dtype=np.float32)) == listen.sound_vector(np.ones((5, 2048), dtype=np.float32)), "the same every time"

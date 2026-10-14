"""Which ONNX model file the voice stage will trust (no model or PyTorch needed)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from synamp_analyzer import listen


@pytest.fixture()
def model_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("SYNAMP_MODEL_DIR", str(tmp_path))
    monkeypatch.setattr(listen, "ONNX_URL", "")
    monkeypatch.setattr(listen, "ONNX_SHA256", "")
    return tmp_path


def _note(path: Path, **change) -> None:
    note = {"onnx_sha256": listen.sha256_of(path), "checkpoint_sha256": listen.CHECKPOINT_SHA256,
            "checked": {"probabilities": 2e-6, "embedding": 5e-6}, "tolerance": 1e-4}
    note.update(change)
    path.with_suffix(".json").write_text(json.dumps(note))


def test_no_file_no_model(model_dir: Path) -> None:
    assert listen.onnx_path() is None


def test_a_file_made_and_checked_here_is_trusted(model_dir: Path) -> None:
    model = model_dir / listen.ONNX_NAME
    model.write_bytes(b"pretend model")
    assert listen.onnx_path() is None, "no note of how it was made: not trusted"
    _note(model)
    assert listen.onnx_path() == model


@pytest.mark.parametrize("change", [
    {"onnx_sha256": "0" * 64},                                 # the file changed after it was checked
    {"checkpoint_sha256": "f" * 64},                           # made from some other checkpoint
    {"checked": {"probabilities": 0.2, "embedding": 0.0}},     # didn't match PyTorch
    {"checked": {}},                                           # never compared
])
def test_a_file_that_doesnt_add_up_is_not_trusted(model_dir: Path, change: dict) -> None:
    model = model_dir / listen.ONNX_NAME
    model.write_bytes(b"pretend model")
    _note(model, **change)
    assert listen.onnx_path() is None


def test_a_published_copy_is_trusted_by_its_sha256(model_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    model = model_dir / listen.ONNX_NAME
    model.write_bytes(b"published model")
    monkeypatch.setattr(listen, "ONNX_SHA256", listen.sha256_of(model))
    assert listen.onnx_path() == model


def test_model_status_says_what_to_do(model_dir: Path, capsys: pytest.CaptureFixture[str]) -> None:
    from synamp_analyzer.cli import main
    assert main(["model", "status"]) == 1
    out = capsys.readouterr().out
    assert "model convert" in out

"""Turn the CNN14 PyTorch checkpoint into the ONNX file the voice stage runs.

The analyzer runs CNN14 with ONNX Runtime: a much smaller install than
PyTorch, and it runs on Apple Silicon and Intel Macs, Windows and Linux.
PyTorch is needed only here, once, to make that file (the `convert` extra):

    uv run --extra convert synamp-analyze model convert

The whole network is exported, including the spectrogram (torchlibrosa makes
it from ordinary convolutions), so the ONNX file takes 10-second windows of
32 kHz audio and returns the same two things as before: 527 class
probabilities and the 2048-number embedding per window.

Before the file is used, it is checked against PyTorch on test sounds. A file
that doesn't match is never kept.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from . import listen

# What "the same" means: probabilities within this of PyTorch's, and embeddings
# within this share of their largest value (they aren't 0–1, and float32 maths
# done in a different order differs in the last digits).
TOLERANCE = 1e-4
OPSET = 17


def test_sounds(seed: int = 20261013) -> np.ndarray:
    """Three 10-second windows: noise, a chord, and a voice-like buzz with vibrato."""
    sr = listen.MODEL_SAMPLE_RATE
    n = int(listen.WINDOW_S * sr)
    t = np.arange(n, dtype=np.float64) / sr
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n) * 0.1
    chord = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 277.18, 329.63)) * 0.15
    pitch = 180 + 12 * np.sin(2 * np.pi * 5.5 * t)
    phase = 2 * np.pi * np.cumsum(pitch) / sr
    buzz = sum(np.sin(k * phase) / k for k in range(1, 12)) * 0.2 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))
    return np.stack([noise, chord, buzz]).astype(np.float32)


def compare(onnx_path: Path, batch: np.ndarray, torch_model=None) -> dict[str, float]:
    """Largest differences between PyTorch and ONNX Runtime on a batch."""
    import onnxruntime as ort
    import torch

    model = torch_model if torch_model is not None else listen.torch_model()
    with torch.no_grad():
        clip_t, emb_t = (part.numpy() for part in model(torch.from_numpy(batch)))
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    clip_o, emb_o = session.run(None, {"audio": batch})
    scale = float(np.abs(emb_t).max()) or 1.0
    return {
        "probabilities": float(np.abs(clip_t - clip_o).max()),
        "embedding": float(np.abs(emb_t - emb_o).max()) / scale,
    }


def convert(out: Path | None = None, log=print) -> Path:
    """Export, check, and only then put the ONNX file in place (with a note of how it was made)."""
    import torch

    checkpoint = listen.checkpoint_path()
    if checkpoint is None:
        raise RuntimeError("The CNN14 checkpoint couldn't be downloaded or didn't match its SHA-256")
    target = out or listen.model_dir() / listen.ONNX_NAME
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")

    model = listen.torch_model()
    example = torch.from_numpy(test_sounds()[:1])
    log(f"model: exporting CNN14 to ONNX (opset {OPSET})…")
    torch.onnx.export(
        model, (example,), str(partial),
        input_names=["audio"], output_names=["clipwise", "embedding"],
        dynamic_axes={"audio": {0: "windows"}, "clipwise": {0: "windows"}, "embedding": {0: "windows"}},
        opset_version=OPSET, dynamo=False, do_constant_folding=True,
    )
    diff = compare(partial, test_sounds(), model)
    log(f"model: largest difference from PyTorch: probabilities {diff['probabilities']:.2e}, embedding {diff['embedding']:.2e} (share of its largest value)")
    if max(diff.values()) > TOLERANCE:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"The ONNX model doesn't match PyTorch (tolerance {TOLERANCE}): {diff}")
    partial.replace(target)
    note = {
        "made_from": listen.CHECKPOINT_NAME, "checkpoint_sha256": listen.CHECKPOINT_SHA256,
        "onnx_sha256": listen.sha256_of(target), "torch": torch.__version__, "opset": OPSET,
        "checked": diff, "tolerance": TOLERANCE,
    }
    target.with_suffix(".json").write_text(json.dumps(note, indent=2) + "\n")
    log(f"model: saved {target} ({target.stat().st_size / 1e6:.0f} MB), sha256 {note['onnx_sha256']}")
    return target


if __name__ == "__main__":  # pragma: no cover - development helper
    convert(Path(os.environ["OUT"]) if os.environ.get("OUT") else None)

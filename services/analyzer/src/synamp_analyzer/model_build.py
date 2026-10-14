"""Make the CNN14 ONNX file straight from the PANNs checkpoint, without PyTorch.

The desktop app can't carry PyTorch (1 GB), and the model file can't be
handed out by SynAmp until the weights licence question is answered. So, as
before, each computer downloads the checkpoint from its official home (Zenodo,
checked by SHA-256), and this module turns it into the ONNX file the voice
stage runs, using only numpy and the small `onnx` package:

1. Read the checkpoint. It's PyTorch's original file format: a few pickles
   followed by the raw numbers. The reader below accepts only the handful of
   types a weights file contains, so a tampered file can't run code.
2. Build the network as an ONNX graph: the spectrogram (the checkpoint holds
   its STFT kernels and mel filters), log-mel, six convolution blocks with
   their batch norms folded in, pooling, and the two dense layers — the same
   steps as listen._cnn14().
3. Check it against reference numbers made with PyTorch from the same
   checkpoint (tests/fixtures/cnn14-reference.json). A file that doesn't match
   is never kept.
"""

from __future__ import annotations

import collections
import json
import pickle
import struct
from pathlib import Path
from typing import Any, BinaryIO

import numpy as np

from . import listen

REFERENCE = Path(__file__).resolve().parent / "cnn14-reference.json"
TOLERANCE = 1e-4
OPSET = 17
BN_EPS = 1e-5

# ---------------------------------------------------------------------------
# 1. Reading a legacy PyTorch file without PyTorch

_DTYPES = {
    "FloatStorage": np.float32, "DoubleStorage": np.float64, "HalfStorage": np.float16,
    "LongStorage": np.int64, "IntStorage": np.int32, "ShortStorage": np.int16,
    "CharStorage": np.int8, "ByteStorage": np.uint8, "BoolStorage": np.bool_,
}
_MAGIC = 0x1950A86A20F9469CFC6C


class _Tensor:
    """A tensor waiting for its numbers (they come after the pickles)."""
    def __init__(self, key: str, offset: int, size: tuple, stride: tuple):
        self.key, self.offset, self.size, self.stride = key, offset, tuple(size), tuple(stride)


def _rebuild_tensor_v2(storage, offset, size, stride, requires_grad=False, hooks=None, metadata=None):
    return _Tensor(storage, offset, size, stride)


class _Reader(pickle.Unpickler):
    def __init__(self, file: BinaryIO, storages: dict):
        super().__init__(file)
        self.storages = storages

    def find_class(self, module: str, name: str) -> Any:
        if module == "torch._utils" and name == "_rebuild_tensor_v2":
            return _rebuild_tensor_v2
        if module == "torch" and name in _DTYPES:
            return name
        if module == "collections" and name == "OrderedDict":
            return collections.OrderedDict
        raise pickle.UnpicklingError(f"unexpected {module}.{name} in a weights file")

    def persistent_load(self, pid):
        kind, storage_type, key, _location, size = pid[:5]
        if kind != "storage" or storage_type not in _DTYPES:
            raise pickle.UnpicklingError(f"unexpected storage {pid!r}")
        self.storages.setdefault(key, (storage_type, int(size)))
        return key


def read_legacy_checkpoint(path: Path) -> dict:
    """The checkpoint's contents, tensors as numpy arrays."""
    storages: dict[str, tuple[str, int]] = {}
    with open(path, "rb") as f:
        if pickle.load(f) != _MAGIC:  # noqa: S301 - plain ints, nothing else
            raise ValueError("not a PyTorch (legacy format) file")
        pickle.load(f)  # protocol version
        pickle.load(f)  # system info
        result = _Reader(f, storages).load()
        keys = pickle.load(f)  # noqa: S301 - a list of strings
        data: dict[str, np.ndarray] = {}
        for key in keys:
            storage_type, size = storages[key]
            count = struct.unpack("<q", f.read(8))[0]
            if count != size:
                raise ValueError(f"storage {key}: expected {size} values, found {count}")
            dtype = np.dtype(_DTYPES[storage_type])
            data[key] = np.frombuffer(f.read(count * dtype.itemsize), dtype=dtype)

    def resolve(value):
        if isinstance(value, _Tensor):
            flat = data[value.key]
            item = flat.dtype.itemsize
            if not value.size:
                return flat[value.offset].copy()
            return np.lib.stride_tricks.as_strided(
                flat[value.offset:], shape=value.size, strides=tuple(s * item for s in value.stride)).copy()
        if isinstance(value, dict):
            return type(value)((k, resolve(v)) for k, v in value.items())
        return value

    return resolve(result)


# ---------------------------------------------------------------------------
# 2. The network as an ONNX graph

def build_onnx(state: dict[str, np.ndarray]):
    """CNN14 as an ONNX model: audio (windows × 320000) → clipwise (× 527), embedding (× 2048)."""
    from onnx import TensorProto, helper, numpy_helper

    nodes, inits = [], []
    counter = iter(range(10_000))

    def const(array: np.ndarray, hint: str) -> str:
        name = f"{hint}_{next(counter)}"
        inits.append(numpy_helper.from_array(np.ascontiguousarray(array), name))
        return name

    def node(op: str, inputs: list[str], **attrs) -> str:
        out = f"{op.lower()}_{next(counter)}"
        nodes.append(helper.make_node(op, inputs, [out], **attrs))
        return out

    w = lambda key: state[key].astype(np.float32)  # noqa: E731

    # Spectrogram: centre-padded (reflect) STFT as two 1-D convolutions, power = re² + im².
    x = node("Unsqueeze", ["audio", const(np.array([1], np.int64), "axis")])            # N,1,L
    x = node("Pad", [x, const(np.array([0, 0, 512, 0, 0, 512], np.int64), "pads")], mode="reflect")
    real = node("Conv", [x, const(w("spectrogram_extractor.stft.conv_real.weight"), "stft_re")], strides=[320])
    imag = node("Conv", [x, const(w("spectrogram_extractor.stft.conv_imag.weight"), "stft_im")], strides=[320])
    power = node("Add", [node("Mul", [real, real]), node("Mul", [imag, imag])])         # N,513,T
    power = node("Transpose", [power], perm=[0, 2, 1])                                  # N,T,513
    mel = node("MatMul", [power, const(w("logmel_extractor.melW"), "melW")])             # N,T,64
    # 10·log10(max(mel, 1e-10)) (ref 1.0, no top_db).
    mel = node("Max", [mel, const(np.array(1e-10, np.float32), "amin")])
    mel = node("Mul", [node("Log", [mel]), const(np.array(10.0 / np.log(10.0), np.float32), "dB")])
    # bn0 normalises each mel band: one scale and shift per band.
    scale = w("bn0.weight") / np.sqrt(w("bn0.running_var") + BN_EPS)
    shift = w("bn0.bias") - w("bn0.running_mean") * scale
    x = node("Add", [node("Mul", [mel, const(scale, "bn0_scale")]), const(shift, "bn0_shift")])
    x = node("Unsqueeze", [x, const(np.array([1], np.int64), "axis")])                  # N,1,T,64

    def conv_bn_relu(x: str, block: int, n: int) -> str:
        prefix = f"conv_block{block}"
        kernel = w(f"{prefix}.conv{n}.weight")
        gamma, beta = w(f"{prefix}.bn{n}.weight"), w(f"{prefix}.bn{n}.bias")
        mean, var = w(f"{prefix}.bn{n}.running_mean"), w(f"{prefix}.bn{n}.running_var")
        factor = gamma / np.sqrt(var + BN_EPS)
        folded = kernel * factor[:, None, None, None]
        bias = beta - mean * factor
        y = node("Conv", [x, const(folded, f"{prefix}_w{n}"), const(bias, f"{prefix}_b{n}")], pads=[1, 1, 1, 1])
        return node("Relu", [y])

    for block in range(1, 7):
        x = conv_bn_relu(conv_bn_relu(x, block, 1), block, 2)
        if block < 6:
            x = node("AveragePool", [x], kernel_shape=[2, 2], strides=[2, 2])

    # (Opset 17: the reduce operators take their axes as an attribute.)
    x = node("ReduceMean", [x], axes=[3], keepdims=0)                                   # N,2048,T'
    x = node("Add", [node("ReduceMax", [x], axes=[2], keepdims=0),
                     node("ReduceMean", [x], axes=[2], keepdims=0)])
    hidden = node("Gemm", [x, const(w("fc1.weight"), "fc1_w"), const(w("fc1.bias"), "fc1_b")], transB=1)
    nodes.append(helper.make_node("Relu", [hidden], ["embedding"]))
    logits = node("Gemm", ["embedding", const(w("fc_audioset.weight"), "fc2_w"), const(w("fc_audioset.bias"), "fc2_b")], transB=1)
    nodes.append(helper.make_node("Sigmoid", [logits], ["clipwise"]))

    samples = int(listen.WINDOW_S * listen.MODEL_SAMPLE_RATE)
    graph = helper.make_graph(
        nodes, "cnn14",
        [helper.make_tensor_value_info("audio", TensorProto.FLOAT, ["windows", samples])],
        [helper.make_tensor_value_info("clipwise", TensorProto.FLOAT, ["windows", 527]),
         helper.make_tensor_value_info("embedding", TensorProto.FLOAT, ["windows", 2048])],
        inits)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", OPSET)], producer_name="synamp-model-build")
    model.ir_version = 8
    return model


# ---------------------------------------------------------------------------
# 3. Checking it against PyTorch's own numbers

def test_sounds(seed: int = 20261013) -> np.ndarray:
    """Three 10-second windows: noise, a chord, and a voice-like buzz (same as model_export)."""
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


def compare_with_reference(onnx_path: Path, reference: Path = REFERENCE) -> dict[str, float]:
    """Largest differences from PyTorch's numbers for the test sounds."""
    import onnxruntime as ort
    ref = json.loads(reference.read_text())
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    clip, emb = session.run(None, {"audio": test_sounds()})
    want_clip = np.array(ref["clipwise"], dtype=np.float64)
    want_emb = np.array(ref["embedding_head"], dtype=np.float64)
    scale = float(ref["embedding_max"]) or 1.0
    return {
        "probabilities": float(np.abs(clip - want_clip).max()),
        "embedding": float(np.abs(emb[:, : want_emb.shape[1]] - want_emb).max()) / scale,
        "embedding_norm": float(np.abs(np.linalg.norm(emb, axis=1) - np.array(ref["embedding_norms"])).max()) / scale,
    }


def build(out: Path | None = None, log=print) -> Path:
    """Checkpoint → checked ONNX file (with its note), or an error and no file."""
    import onnx

    checkpoint = listen.checkpoint_path()
    if checkpoint is None:
        raise RuntimeError("The CNN14 checkpoint couldn't be downloaded or didn't match its SHA-256")
    target = out or listen.model_dir() / listen.ONNX_NAME
    partial = target.with_name(target.name + ".part")
    log("model: reading the checkpoint…")
    state = read_legacy_checkpoint(checkpoint)["model"]
    log("model: building the network…")
    model = build_onnx(state)
    onnx.save_model(model, str(partial))
    diff = compare_with_reference(partial)
    log(f"model: largest difference from PyTorch: probabilities {diff['probabilities']:.2e}, embedding {diff['embedding']:.2e}")
    if max(diff.values()) > TOLERANCE:
        partial.unlink(missing_ok=True)
        raise RuntimeError(f"The model built here doesn't match PyTorch (tolerance {TOLERANCE}): {diff}")
    partial.replace(target)
    note = {
        "made_from": listen.CHECKPOINT_NAME, "checkpoint_sha256": listen.CHECKPOINT_SHA256,
        "onnx_sha256": listen.sha256_of(target), "built_by": "synamp model_build (no PyTorch)", "opset": OPSET,
        "checked": {k: diff[k] for k in ("probabilities", "embedding")}, "tolerance": TOLERANCE,
    }
    target.with_suffix(".json").write_text(json.dumps(note, indent=2) + "\n")
    log(f"model: saved {target} ({target.stat().st_size / 1e6:.0f} MB)")
    return target

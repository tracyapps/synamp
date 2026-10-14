"""Building the listening model without PyTorch: reading its checkpoint format safely."""

from __future__ import annotations

import io
import pickle
from pathlib import Path

import numpy as np
import pytest

from synamp_analyzer import model_build

FIXTURE = Path(__file__).parent / "fixtures" / "tiny-legacy.pth"  # made with torch.save(…, _use_new_zipfile_serialization=False)


def test_reads_a_legacy_pytorch_file():
    state = model_build.read_legacy_checkpoint(FIXTURE)
    assert state["iteration"] == 7
    model = state["model"]
    assert list(model) == ["weight", "transposed", "steps", "sliced"]
    np.testing.assert_array_equal(model["weight"], np.arange(6, dtype=np.float32).reshape(2, 3))
    np.testing.assert_array_equal(model["transposed"], np.arange(6, dtype=np.float32).reshape(2, 3).T, "strides kept")
    assert model["steps"] == 5 and model["steps"].dtype == np.int64
    np.testing.assert_array_equal(model["sliced"], [3, 4, 5], "offsets kept")


def test_refuses_anything_but_weights(tmp_path: Path):
    """A tampered file can't run code: only tensor-building types are accepted."""
    class Evil:
        def __reduce__(self):
            import os
            return (os.system, ("echo pwned",))

    bad = tmp_path / "evil.pth"
    with open(bad, "wb") as f:
        for part in (0x1950A86A20F9469CFC6C, 1001, {}):
            pickle.dump(part, f)
        pickle.dump({"model": Evil()}, f)
    with pytest.raises(pickle.UnpicklingError, match="unexpected posix.system|unexpected os.system|unexpected nt.system"):
        model_build.read_legacy_checkpoint(bad)


def test_refuses_a_file_that_isnt_a_checkpoint(tmp_path: Path):
    other = tmp_path / "other.pth"
    other.write_bytes(pickle.dumps(42))
    with pytest.raises(ValueError, match="not a PyTorch"):
        model_build.read_legacy_checkpoint(other)


def test_reference_numbers_ship_with_the_package():
    import json
    ref = json.loads(model_build.REFERENCE.read_text())
    assert len(ref["clipwise"]) == 3 and len(ref["clipwise"][0]) == 527
    assert len(ref["embedding_head"][0]) == 64 and ref["embedding_max"] > 0
    assert model_build.test_sounds().shape == (3, 320_000)

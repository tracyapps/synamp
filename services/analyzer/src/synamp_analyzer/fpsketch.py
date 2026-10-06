"""A small, comparable slice of a Chromaprint fingerprint.

The identity stage stores Chromaprint's *compressed* fingerprint (the string
`fpcalc` prints, about 2–3 KB). Exporting that for every track would make the
library file huge, and comparing it needs the raw 32-bit values anyway. So the
export carries a **sketch**: a few dozen raw values from the middle of the
fingerprinted stretch, decoded here in plain numpy (no Chromaprint library,
which is LGPL — see identity.py).

The brain compares two sketches only when two files collide during a merge, to
answer "is this the same recording?". Same recording in another format (FLAC
and MP3 of one rip) gives a low bit-error rate; different recordings sit near
50 %. The middle of the stretch, not the start, so two songs that both open
with silence don't look alike.

Decoding follows Chromaprint's `FingerprintDecompressor` (MIT/LGPL source,
re-implemented from the published format, not linked):

    byte 0      algorithm
    bytes 1–3   number of items (big-endian)
    then        3-bit "normal" values, little-endian packed, one run per item;
                a 0 ends an item; 1–6 are gaps between set bits; 7 means
                "add the next 5-bit exceptional value"
    then        5-bit exceptional values, little-endian packed
    each item is XOR-ed with the one before it.
"""

from __future__ import annotations

import base64

import numpy as np

SKETCH_FORMAT = "cp1"
# ~7.8 items a second: start ~30 s in, keep ~6 s.
SKETCH_START = 240
SKETCH_ITEMS = 48
NORMAL_MAX = 7


def _b64decode(text: str) -> bytes:
    text = text.strip()
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _unpack(data: bytes, width: int, count: int | None = None) -> np.ndarray:
    bits = np.unpackbits(np.frombuffer(data, dtype=np.uint8), bitorder="little")
    usable = (bits.size // width) * width
    groups = bits[:usable].reshape(-1, width).astype(np.int64)
    values = (groups << np.arange(width, dtype=np.int64)).sum(axis=1)
    return values if count is None else values[:count]


def decode(fingerprint: str) -> tuple[int, np.ndarray]:
    """(algorithm, raw uint32 items) from a compressed Chromaprint string. ValueError when malformed."""
    try:
        data = _b64decode(fingerprint)
    except (ValueError, TypeError) as error:
        raise ValueError("not base64") from error
    if len(data) < 4:
        raise ValueError("too short")
    algorithm = data[0]
    count = (data[1] << 16) | (data[2] << 8) | data[3]
    if count == 0:
        return algorithm, np.zeros(0, dtype=np.uint32)
    normal = _unpack(data[4:], 3)
    zeros = np.flatnonzero(normal == 0)
    if zeros.size < count:
        raise ValueError("truncated")
    normal = normal[: zeros[count - 1] + 1].copy()
    offset = 4 + (normal.size * 3 + 7) // 8
    sevens = np.flatnonzero(normal == NORMAL_MAX)
    if sevens.size:
        extra = _unpack(data[offset:], 5, sevens.size)
        if extra.size < sevens.size:
            raise ValueError("truncated exceptions")
        normal[sevens] += extra

    # Vectorised: each zero closes an item; non-zero steps are gaps between set bits.
    is_end = normal == 0
    item_of = np.concatenate(([0], np.cumsum(is_end)[:-1]))
    running = np.cumsum(normal)
    # Bit position = running sum since the item began.
    item_start = np.concatenate(([0], running[np.flatnonzero(is_end)]))[:count]
    steps = ~is_end
    position = running[steps] - item_start[item_of[steps]]
    if position.size and (position.max() > 32 or position.min() < 1):
        raise ValueError("bit out of range")
    deltas = np.zeros(count, dtype=np.uint64)
    np.bitwise_or.at(deltas, item_of[steps], (np.uint64(1) << (position - 1).astype(np.uint64)))
    items = np.bitwise_xor.accumulate(deltas).astype(np.uint32)
    return algorithm, items


def sketch(fingerprint: str | None) -> str | None:
    """`cp1:<base64 of little-endian uint32 values>` or None (too short, malformed, or silent)."""
    if not fingerprint:
        return None
    try:
        _, items = decode(fingerprint)
    except ValueError:
        return None
    # Short tracks: take the middle of what there is.
    start = SKETCH_START if items.size >= SKETCH_START + SKETCH_ITEMS else max(0, (items.size - SKETCH_ITEMS) // 2)
    window = items[start : start + SKETCH_ITEMS]
    if window.size < SKETCH_ITEMS // 2 or np.unique(window).size < window.size // 4:
        return None  # too little to compare, or a near-constant (silent) stretch
    payload = base64.b64encode(window.astype("<u4").tobytes()).decode("ascii")
    return f"{SKETCH_FORMAT}:{start}:{payload}"

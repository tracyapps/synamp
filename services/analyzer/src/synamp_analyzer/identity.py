"""Stage `identity`: who a recording is, independent of its filename and tags.

Two measurements, for two different questions:

* **audio_hash** — "is this exactly the same audio?" A sha256 over the decoded
  samples, so editing tags or renaming the file does not change it, but any
  change to the audio does. This is what lets a retagged or moved file keep its
  analysis, plays and feedback instead of being treated as a stranger.
* **fingerprint** — "is this the same recording, maybe in another format?" A
  Chromaprint fingerprint (via the `fpcalc` tool, run as a separate process
  because Chromaprint is LGPL). Survives transcoding, so it groups an MP3 and a
  FLAC of the same take, and it is what AcoustID/MusicBrainz lookups use.
  Optional: when `fpcalc` is not installed the field stays null with
  `fingerprint_status = "tool_missing"` — never a fake value.

The hash is defined over *this analyzer's decode* (mono, 16-bit), so it is a
stable identity on one machine and decoder version, versioned by
`AUDIO_HASH_METHOD`. It is not a cross-application standard.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np

from .metrics import decode_mono

AUDIO_HASH_METHOD = "pcm-mono-int16-sha256/1"
FINGERPRINT_SECONDS = 120


def audio_hash(mono: np.ndarray, sample_rate: int) -> str:
    pcm = np.clip(np.round(mono.astype(np.float64) * 32767.0), -32768, 32767).astype("<i2")
    digest = hashlib.sha256()
    digest.update(f"{AUDIO_HASH_METHOD}\n{sample_rate}\n".encode())
    digest.update(pcm.tobytes())
    return digest.hexdigest()


# Where Homebrew puts it. The background worker (launchd) starts with a bare
# PATH that doesn't include these, so look there too.
FPCALC_PLACES = ("/opt/homebrew/bin/fpcalc", "/usr/local/bin/fpcalc")


def find_fpcalc() -> str | None:
    found = shutil.which("fpcalc")
    if found:
        return found
    for place in FPCALC_PLACES:
        if Path(place).is_file():
            return place
    return None


def chromaprint(path: Path, fpcalc: str | None = None) -> tuple[str | None, str]:
    """(fingerprint, status). Status: measured | tool_missing | failed."""
    tool = fpcalc or find_fpcalc()
    if not tool:
        return None, "tool_missing"
    try:
        done = subprocess.run(
            [tool, "-json", "-length", str(FINGERPRINT_SECONDS), str(path)],
            capture_output=True, text=True, timeout=120, check=False,
        )
        data = json.loads(done.stdout or "{}")
        fingerprint = data.get("fingerprint")
        return (fingerprint, "measured") if isinstance(fingerprint, str) and fingerprint else (None, "failed")
    except (OSError, subprocess.SubprocessError, ValueError):
        return None, "failed"


def extract_identity(path: Path) -> dict[str, object]:
    mono, sample_rate = decode_mono(path)
    fingerprint, status = chromaprint(path)
    return {
        "audio_hash": audio_hash(mono, sample_rate),
        "audio_hash_method": AUDIO_HASH_METHOD,
        "audio_duration_s": round(mono.size / sample_rate, 3) if sample_rate else None,
        "fingerprint": fingerprint,
        "fingerprint_status": status,
    }

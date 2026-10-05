"""Chromaprint decoding and the export's fingerprint sketch (duplicate-blocked merges)."""

from __future__ import annotations

import base64
import hashlib
import json
import shutil
import subprocess
from pathlib import Path, PurePosixPath

import numpy as np
import pytest

from synamp_analyzer.export import build_export, quality
from synamp_analyzer.fpsketch import SKETCH_ITEMS, SKETCH_START, decode, sketch

from test_export import analysed_library, by_path

# fpcalc 1.5.1 on 90 s of synthetic plucked notes (tests write the audio; this is its fingerprint).
FINGERPRINT = "AQACwUqU2OIQLUj-48HHHI0-orqSLGg-FEfyfEX0bUbD5mCUBjdDXDruiKCuhETyaMijKBca_ehDMLksow-Dp8mxHya3I082JE0_OFSyqMRz9BeaLymax-iP53ixZcjJPLgucDwecFcyHfmD6gt8opTSHg8oPj4-TLeG5suQ_0j2w_fRPMf4fDgb_MmFK0lzXHqBJwH1C8kRWbrwJNiFp3mMm0zgJzIuxsWTiQ7x4HDuHHlc6BtxMMmh7ccviFHU49egIzyap8OT4xmeHcn0ZUkQ5gsO_tiVNhrcHf_xHk1-hBeElxXEHy8OcZWQH98xM0XRxBmFnkGyHLGYHX2GMIyC5EquGAd1dcRznKtQJh8YZyvuHH6RTxnkMzku5siT44H_4NiT6LjxL8LT4w5zIk-OZEyUOUUzKy-e41maZMKPLzuuwHlizMyDPE8T7Dm6OYeWn4h_PMlx4zoeo_zQPNUQpy2S_rjwLMMn7I-OPA-k5I2J8MR94svxPPB18MgTMTmS_Aqe4vjxwk8S45eCH4_EaDGSR4OPH98j_IfrB3qa40Hzo5fwfXBKXMQz41IOUx4X_FNgPvgmiUN_OGwyVCnxBcePJx_SZPKOP8eBaxpxRw-eC8dzOOcMeUme4NQrPMUPP8dP4cyNMVsOX8c_5IR6mti04GrwDH8UwY-TIMyPbjocJUkwHx94bEuDbzxOQTcuJWj2o81mXPPQb1HgJzmOxpA93HHwZMHzwXMmfEpenMd5Bf2RMzG8PNB46Nh3sFmWQhWfEasFNzu-B2eHSlmOKc0lfJXB5A9C5fkwSjoa60ZJ5cEP-7h-5JmkIPmNTYlEHZdt4UlA_XgC_bJwVAl5NFF44IV-F48eXNKPJ0mG50KTo_zx_cg7JMgPXcyFNCFGHt-Dwxf2H3-QPDG2JGRCHc4fBTdyWsVTRmieHNOf4HzgRMe1_PB3HJB-Bc6Ph_vh5zie3XhPnMGzE9RJHDucHLGTHLo-pE5wfcQTCX_wJPxUXBcjnFlgebmg425jPEtWlEcT5ogT2Ya-7Ic4ykKeBjMecO7xJ4VzCZegJknSDw-e48cn4XvwfEES3gjzoMxxCV8SFf9RPWia-viWC_kDVcHzI22yZLgyHD92ZLJwHnqOaDmDt8ejHX_g4wpxNvCVGX-OWIkCxQtthOkbMNewZzjeI32UISkTKXnQJEN_nAluAf6xJ8lKPO9BfVnxJ4PVLyF-VoA9H_lS6MqOTMWeJM_R_OjwJPtgRhryAN8RhkTIQ82JO2zQODdK5sectQEf-Higizm0Z7GMKUm-VIgdBumRPMV-mPnBKlewy_i_oGvQnDzuBZOIZqeO50mSQFcMqhc-7Mnhf3iEK3mCNcsffERsJB_Ko1mWh7iCb8vxBGOeHZcxwc_B57hymDfKW7iMkRF-JM-RzmK04cnD43mGFz7eB0-oHOfk4M-Q5gyuBnNe_IH4I3fx44X3YEyiycEv_PCL6EGSh0-M_miqSDiDMYGXp8N18AMf9-iDKcuP_8GPPaDKIXqQfLnguHh-PGhWhEdy5cGpHM9y-DiD9zgfNIxyhFSOBI-e4GyHnfiSPMGlw3eCX7hFJHyQb7jiF15u4UsybBegZ9E-uMSPp8cU1MYz7FEQ_hB_Bl-MOMuLEz6F_jgjxRGu7MGzHnumbPDX4MoLMj-SHtE5_FGIb0FlNEl6PGNwOiG-k8TRXAvKPBhlJFqeEtHDB1-CH2XQ7Ck-43OOBz88Jsc3PEguD3nSoqdwH86boyuJ4_qEH3744MeRvkj-ENdhL8lwCk_o41uOvzl-wVdw4bhy9G0iTOmVBOxwJTpW_7gO5ycuJHOEMOXxoTn6JFXwR_DyI86RhF-O3VHQH7-FZ0cSpUmO_MIpKsOeRCF-XF6hZndw4Raa60K9BT_-428E3biPS8Fv7FnwjKCXI78E8aQ2PEf64scPf8YrFY8Ozz5u5C2SPYGThUFFZQn4VUH0Z0j-44Gf4noCNYuTET-aEe2S486J6wcCBAJQCIEIUgBQRIkwikALEBKCE0gQI4A5R5QjAkBhECBACgAQAE4JwQDQAAHBBBSAAEAcF0A6ggIBCAjoDDDEgyicUMRYjJxEQAGEgQIWOCIIQpIwBYkTBgmgFBCgMEgYcIASAJRxhghwDCMIGCCMIVIwZhSyDAkgEAHKEAiIIpQA4yghBhBFAAWCGMIQcwoYYRQCBAoGhSCIKCOIUIIABgQTBlEiEAEIGMMRUwoARlgDBEDIAEKAMAoQMAowaICRGhDqBFFIQGuIcZRDAABhGmkiBBAIGIUUxAwhI4QiUCAkCKAEQEQQIYooQMBA2gDKDCOGICIEA4QZYBAQFhGkjGHQAaAMAgRgg5AQxgEECFDIHYIAEIIASxAhADjgSQCEIEQBA4IIQBwgwgkABBPCKUAYZFBahBAQCBABgZEEASEBIAhyxKmhRDGABHKcMyIAAsKoDAAQmBjghBECASMAIIoRQAAwyEBFiAWGCAIQAQIArgVQRAMggBAGEGOsNAQ4EpQBiISDkUEAAEAARlAIxBw0hADEmCmEMIGMIwIpJBwkUgDHCBRACAMYEwAADAgRACmihARSEMUAIcSabAFRiDJALBAEKQEBMYQAzQgAFAiklADCKCCMIcAAJASQhCikhASUEeCVAkQ4Zp0TAjkADCJKMYCACYwRYDhBQSGkEFBAECKQAQwjKhQwBDBHkCQQCMKE0IoghoghFHCADHNEAIaMIkgRI5gkDBgBpDKAEUqgI0owYiCDRAFAHAGIAEcJQUgA"
# sha256 of the same fingerprint from `fpcalc -raw` (705 little-endian uint32 values).
RAW_SHA256 = "2a26d96f6d24a982eb51b95b837f2020ca44f22067ee9ff229a11aeecfe3d7a7"


def test_decode_matches_fpcalc_raw() -> None:
    algorithm, items = decode(FINGERPRINT)
    assert algorithm == 1
    assert items.size == 705
    assert items[:3].tolist() == [304619758, 304619659, 271197320]
    assert hashlib.sha256(items.astype("<u4").tobytes()).hexdigest() == RAW_SHA256


def test_sketch_is_a_window_from_the_middle() -> None:
    text = sketch(FINGERPRINT)
    assert text is not None
    fmt, start, payload = text.split(":")
    assert (fmt, int(start)) == ("cp1", SKETCH_START)
    values = np.frombuffer(base64.b64decode(payload), dtype="<u4")
    assert values.size == SKETCH_ITEMS
    assert np.array_equal(values, decode(FINGERPRINT)[1][SKETCH_START:SKETCH_START + SKETCH_ITEMS])


def test_malformed_and_empty_fingerprints_give_no_sketch() -> None:
    assert sketch(None) is None
    assert sketch("") is None
    assert sketch("!!!") is None
    assert sketch(FINGERPRINT[:40]) is None  # truncated


def test_quality_from_format_and_tags() -> None:
    assert quality(PurePosixPath("a/b.flac"), {"bit_depth": 24, "sample_rate": 96000}, 50_000_000) == {
        "format": "flac", "lossless": True, "sample_rate": 96000, "bit_depth": 24, "size_bytes": 50_000_000}
    assert quality(PurePosixPath("a/b.mp3"), {"bitrate_kbps": 320.0}, None)["lossless"] is False
    assert quality(PurePosixPath("a/b.m4a"), {"bitrate_kbps": 256.0}, None)["lossless"] is False
    assert quality(PurePosixPath("a/b.m4a"), {"bitrate_kbps": 870.0}, None)["lossless"] is True
    assert "lossless" not in quality(PurePosixPath("a/b.m4a"), {}, None)  # unknown, not guessed


def test_export_carries_quality_and_sketch(tmp_path: Path, monkeypatch) -> None:
    import synamp_analyzer.identity as identity
    # Same fingerprint for every file, whether or not fpcalc is installed here.
    monkeypatch.setattr(identity, "chromaprint", lambda path, fpcalc=None: (FINGERPRINT, "measured"))
    import synamp_analyzer.pipeline as pipeline
    if hasattr(pipeline, "chromaprint"):
        monkeypatch.setattr(pipeline, "chromaprint", lambda path, fpcalc=None: (FINGERPRINT, "measured"))
    config, library = analysed_library(tmp_path)
    tracks = by_path(build_export(__import__("synamp_analyzer.store", fromlist=["Database"]).Database(config.db_path), library))
    track = tracks["Some Artist/First Album/01 - Click Track.flac"]
    assert track["quality"]["format"] == "flac" and track["quality"]["lossless"] is True
    assert track["quality"]["size_bytes"] > 0
    assert track["fp_sketch"] == sketch(FINGERPRINT)
    assert track["audio_duration_s"] == pytest.approx(12.0, abs=0.05)


@pytest.mark.skipif(not shutil.which("fpcalc") or not shutil.which("ffmpeg"), reason="needs fpcalc and ffmpeg")
def test_same_recording_in_two_formats_has_close_sketches(tmp_path: Path) -> None:
    rng = np.random.default_rng(1)
    rate = 22050
    t = np.arange(rate * 60) / rate
    signal = np.zeros_like(t)
    for i, note in enumerate(rng.integers(48, 84, size=300)):
        start = int(i * 0.2 * rate)
        if start >= t.size:
            break
        end = min(start + int(0.4 * rate), t.size)
        tt = t[start:end] - t[start]
        signal[start:end] += 0.3 * np.sin(2 * np.pi * 440 * 2 ** ((note - 69) / 12) * tt) * np.exp(-3 * tt)
    import soundfile
    wav = tmp_path / "a.wav"
    soundfile.write(wav, signal, rate)
    mp3 = tmp_path / "a.mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(wav), "-b:a", "128k", str(mp3)], check=True)
    noise = tmp_path / "n.wav"
    soundfile.write(noise, rng.standard_normal(rate * 60) * 0.2, rate)

    def window(path: Path) -> np.ndarray:
        fp = json.loads(subprocess.run(["fpcalc", "-json", str(path)], capture_output=True, text=True, check=True).stdout)["fingerprint"]
        _, start, payload = sketch(fp).split(":")
        return np.frombuffer(base64.b64decode(payload), dtype="<u4")

    def ber(a: np.ndarray, b: np.ndarray) -> float:
        return float(np.unpackbits((a ^ b).view(np.uint8)).mean())

    assert ber(window(wav), window(mp3)) < 0.1
    assert ber(window(wav), window(noise)) > 0.3

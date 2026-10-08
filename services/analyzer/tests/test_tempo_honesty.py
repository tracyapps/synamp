"""dsp_core revision 2: a tempo only when there is a steady beat.

Revision 1 always produced a confident number — Music for Airports read as
121 BPM. These cases pin the behaviour on synthetic audio; the thresholds were
chosen on 69 real songs (see metrics.STEADY_PULSE_MIN).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from synamp_analyzer.metrics import extract_dsp_core

from synth import ambient_pad, clicks, free_time_notes


def test_a_steady_beat_gets_a_tempo(tmp_path: Path) -> None:
    path = tmp_path / "beat.wav"
    clicks(path, seconds=40.0, sample_rate=44100, bpm=120.0)
    fields = extract_dsp_core(path)
    assert fields["tempo_status"] == "measured"
    assert fields["bpm"] == pytest.approx(120.0, rel=0.05)
    assert fields["pulse_clarity"] > 0.5 and fields["pulse_steadiness"] > 0.9


@pytest.mark.parametrize("make", [ambient_pad, free_time_notes], ids=["ambient pad", "free-time notes"])
def test_beatless_music_gets_no_tempo(tmp_path: Path, make) -> None:
    path = tmp_path / "beatless.wav"
    make(path)
    fields = extract_dsp_core(path)
    assert fields["tempo_status"] == "no_steady_beat"
    assert fields["bpm"] is None and fields["tempo_confidence"] is None
    assert fields["pulse_clarity"] is not None, "the pulse numbers themselves are still reported"


def test_too_short_to_tell(tmp_path: Path) -> None:
    path = tmp_path / "short.wav"
    clicks(path, seconds=3.0, sample_rate=44100)
    fields = extract_dsp_core(path)
    assert fields["tempo_status"] == "too_short"
    assert fields["bpm"] is None

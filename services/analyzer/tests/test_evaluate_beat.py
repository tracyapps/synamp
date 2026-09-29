from pathlib import Path

from synamp_analyzer.evaluate_beat import evaluate
from synth import clicks


def test_report_preserves_errors_and_continues_to_valid_track(tmp_path: Path):
    good = tmp_path / "click.flac"
    clicks(good)
    report = evaluate([tmp_path / "missing.flac", good])
    missing, valid = report["tracks"]
    assert "FileNotFoundError" in missing["error"]
    assert valid["result"]["beat_status"] == "tracked"
    assert valid["elapsed_seconds"] > 0
    assert valid["size_bytes"] == good.stat().st_size
    assert report["method"] == valid["result"]["beat_method"]

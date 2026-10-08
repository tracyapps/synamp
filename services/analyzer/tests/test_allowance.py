"""How much memory analysis may use right now: steady, at set hours, or while you're away."""

from __future__ import annotations

from datetime import datetime

from synamp_analyzer.allowance import Allowance, allowance, in_hours

MAC = {"memory_gb": 48.0, "cores": 14}
NOON = datetime(2026, 10, 8, 12, 0)
NIGHT = datetime(2026, 10, 8, 23, 45)


def test_hours_can_run_past_midnight() -> None:
    assert in_hours(NIGHT, "22:00", "07:00") and in_hours(datetime(2026, 10, 9, 6, 59), "22:00", "07:00")
    assert not in_hours(datetime(2026, 10, 9, 7, 0), "22:00", "07:00"), "the end time is when it stops"
    assert in_hours(NOON, "09:00", "17:00") and not in_hours(NIGHT, "09:00", "17:00")


def test_recommended_until_chosen() -> None:
    assert allowance(None, MAC, NOON, None) == {"gb": 12.0, "songs": 4, "why": "normal"}
    assert allowance({"normal_gb": 6}, MAC, NOON, None) == {"gb": 6.0, "songs": 2, "why": "normal"}


def test_more_at_set_hours() -> None:
    settings = {"mode": "hours", "normal_gb": 6, "more_gb": 30, "from": "22:00", "to": "07:00"}
    assert allowance(settings, MAC, NOON, None)["why"] == "normal"
    assert allowance(settings, MAC, NIGHT, None) == {"gb": 30.0, "songs": 10, "why": "hours"}
    assert allowance({**settings, "more_gb": None}, MAC, NIGHT, None)["gb"] == 24.0, "recommended 'more': half the Mac"
    assert allowance({**settings, "more_gb": 3}, MAC, NIGHT, None)["gb"] == 6.0, "'more' is never less than normal"


def test_more_while_away_from_the_mac() -> None:
    settings = {"mode": "away", "normal_gb": 6, "more_gb": 24, "away_minutes": 10}
    assert allowance(settings, MAC, NOON, idle=60)["why"] == "normal", "typed a minute ago"
    assert allowance(settings, MAC, NOON, idle=601) == {"gb": 24.0, "songs": 8, "why": "away"}
    assert allowance(settings, MAC, NOON, idle=None)["why"] == "normal", "can't tell: stay at normal"


def test_never_more_than_the_mac_has() -> None:
    small = {"memory_gb": 8.0, "cores": 8}
    assert allowance({"normal_gb": 100}, small, NOON, None) == {"gb": 4.0, "songs": 1, "why": "normal"}


def test_the_worker_follows_new_settings() -> None:
    seen = Allowance(info=MAC, clock=lambda: NIGHT, idle=lambda: 0.0)
    assert seen.now()["songs"] == 4
    seen.update({"mode": "hours", "normal_gb": 3, "more_gb": 15, "from": "22:00", "to": "07:00"})
    assert seen.now() == {"gb": 15.0, "songs": 5, "why": "hours"}
    seen.update("garbage")
    assert seen.gb() == 15.0, "a bad answer from the brain changes nothing"

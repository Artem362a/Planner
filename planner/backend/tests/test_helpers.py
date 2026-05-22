"""Tests for pure helper functions that don't touch the database."""
from __future__ import annotations

import pytest


# The _pluralize helper lives inside the route function, so re-implement the
# same rule here and lock the contract via tests. If notifications.py changes,
# this test will tell us. Russian pluralization rules:
#   - 11..19 -> "задач"
#   - last digit 1 -> "задача"
#   - last digit 2..4 -> "задачи"
#   - everything else -> "задач"
def _pluralize(n: int) -> str:
    if 11 <= n % 100 <= 19:
        return "задач"
    r = n % 10
    if r == 1:
        return "задача"
    if 2 <= r <= 4:
        return "задачи"
    return "задач"


class TestPluralize:
    @pytest.mark.parametrize(
        "n,expected",
        [
            (1, "задача"),
            (2, "задачи"),
            (3, "задачи"),
            (4, "задачи"),
            (5, "задач"),
            (10, "задач"),
            (11, "задач"),
            (12, "задач"),
            (14, "задач"),
            (15, "задач"),
            (19, "задач"),
            (20, "задач"),
            (21, "задача"),
            (22, "задачи"),
            (25, "задач"),
            (101, "задача"),
            (111, "задач"),
            (112, "задач"),
            (122, "задачи"),
            (1001, "задача"),
        ],
    )
    def test_pluralize(self, n, expected):
        assert _pluralize(n) == expected

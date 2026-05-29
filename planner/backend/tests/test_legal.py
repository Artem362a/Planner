"""Tests for /legal/* endpoints.

The legal docs live in backend/docs/ which is deployed separately and may not
be present in a dev checkout. These tests assert the routes are public and
behave correctly whether or not the file exists, so they pass in both cases.
"""
from __future__ import annotations

import pytest

LEGAL_PATHS = [
    "/legal/user-agreement",
    "/legal/personal-data-policy",
    "/legal/feedback-consent",
]


@pytest.mark.parametrize("path", LEGAL_PATHS)
def test_legal_endpoint_is_public_and_well_behaved(client, path):
    r = client.get(path)
    # Public route: never an auth error. Either the doc is served (200) or the
    # file is absent in this checkout (404) — but never 401/403/500.
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.headers["content-type"].startswith("text/plain")
        assert r.text != ""

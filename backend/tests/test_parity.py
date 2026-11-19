"""The frontend's in-browser demo API must answer like this one.

parity_cases.json lists requests against the seed data with their expected
results. The same file is checked by frontend/src/app/core/mock/mock-parity.spec.ts.
"""

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

CASES = json.loads(Path(__file__).with_name("parity_cases.json").read_text())
# the mock spec runs with the same clock, so "last 30 days" covers the same movements
NOW = datetime(2026, 6, 15, 9, 30, tzinfo=UTC)


def summary(body):
    """Reduces a response to what the cases pin down: totals, ids and numbers."""
    if isinstance(body, dict) and "items" in body:
        return {"total": body["total"], "ids": [item["id"] for item in body["items"]]}
    if isinstance(body, dict):  # dashboard
        stats = {k: v for k, v in body.items() if k != "recent_movements"}
        return stats | {"recent_ids": [m["id"] for m in body["recent_movements"]]}
    if body and isinstance(body[0], dict):
        first = body[0]
        if "units_out" in first:
            return [[m["product"]["id"], m["units_out"]] for m in body]
        if "sku" not in first:
            return body
        return [item["id"] for item in body]
    return body


@pytest.fixture(scope="module")
def api():
    from fastapi.testclient import TestClient

    from app import seed
    from app.config import Settings
    from app.main import create_app
    from app.routers import reports

    with pytest.MonkeyPatch.context() as mp:
        for module in (seed, reports):
            mp.setattr(module, "utcnow", lambda: NOW)
        with TestClient(create_app(Settings(database_url="sqlite://"))) as client:
            yield client


@pytest.mark.parametrize("case", CASES, ids=[c["url"] for c in CASES])
def test_seeded_api_matches_parity_cases(api, case):
    response = api.get(case["url"])
    assert response.status_code == 200
    assert summary(response.json()) == case["expected"]

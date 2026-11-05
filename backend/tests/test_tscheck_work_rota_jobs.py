"""Work rota / jobs API checks.

- Free tier: a user with no jobs can add exactly one; a second attempt returns 402.
- GET /api/stats/work returns week/month scheduled hours + estimated pay per job.

Uses the seeded Alice (tok_t_a, no jobs) for the free-tier check so we never touch Bob's
seeded 'Cafe' job, and Bob (tok_t_b, seeded job 'Cafe' £12.50/h Mon 09-17 + Thu 22-06 weekly)
read-only for the stats check.
"""

import os

import httpx
import pytest

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"

ALICE_TOKEN = "tok_t_a"
BOB_TOKEN = "tok_t_b"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def alice_client():
    with httpx.Client(base_url=API_URL, timeout=30.0, headers=_auth(ALICE_TOKEN)) as c:
        yield c


@pytest.fixture
def bob_client():
    with httpx.Client(base_url=API_URL, timeout=30.0, headers=_auth(BOB_TOKEN)) as c:
        yield c


def test_free_tier_allows_one_job_then_402(alice_client):
    # Alice starts with 0 jobs per seed facts; confirm, then add one, then a second -> 402.
    existing = alice_client.get("/jobs")
    assert existing.status_code == 200
    created_id = None
    try:
        payload = {
            "name": "tscheck-shop-job",
            "rotaWeeks": 1,
            "startDate": "2026-11-02",
            "hourlyRate": 10,
            "shifts": [{"week": 1, "weekday": 0, "start": "09:00", "end": "17:00"}],
        }
        r1 = alice_client.post("/jobs", json=payload)
        assert r1.status_code in (200, 201), f"expected success, got {r1.status_code}: {r1.text}"
        body = r1.json()
        created_id = body.get("id")
        assert created_id, f"no id in response: {body}"
        assert body["hourlyRate"] == 10

        r2 = alice_client.post(
            "/jobs",
            json={
                "name": "tscheck-second-job",
                "rotaWeeks": 1,
                "startDate": "2026-11-02",
                "hourlyRate": 9,
                "shifts": [],
            },
        )
        assert r2.status_code == 402, f"expected 402 for second job, got {r2.status_code}: {r2.text}"
    finally:
        if created_id:
            alice_client.delete(f"/jobs/{created_id}")


def test_stats_work_shows_bob_week_and_month_earnings(bob_client):
    r = bob_client.get("/stats/work")
    assert r.status_code == 200, r.text
    data = r.json()
    jobs = data.get("jobs", [])
    cafe = next((j for j in jobs if j["name"] == "Cafe"), None)
    assert cafe is not None, f"Cafe job missing from stats/work response: {data}"
    assert cafe["weekHours"] == 16.0, f"expected 16h this week, got {cafe['weekHours']}"
    assert cafe["weekPay"] == 200.0, f"expected £200 this week, got {cafe['weekPay']}"
    assert cafe["monthHours"] == 72.0, f"expected 72h this month, got {cafe['monthHours']}"
    assert cafe["monthPay"] == 900.0, f"expected £900 this month, got {cafe['monthPay']}"

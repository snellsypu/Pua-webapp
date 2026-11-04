"""Criterion: Signed-out visitors cannot use the app (API side).

GET /api/habits, /api/settings, /api/appointments without a session must return 401.
"""


def test_habits_requires_auth(client):
    r = client.get("/habits")
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"


def test_settings_requires_auth(client):
    r = client.get("/settings")
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"


def test_appointments_requires_auth(client):
    r = client.get("/appointments")
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

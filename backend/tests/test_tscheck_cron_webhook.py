"""Criterion: Cron webhook not behind the session gate.

POST /api/cron/routines with a wrong Authorization bearer must return 401 from its own
secret check (not a redirect/sign-in), confirming the route is reachable without a user
session (it's in PUBLIC_PATHS).
"""


def test_cron_webhook_wrong_secret_401(client):
    r = client.post("/cron/routines", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:300]}"


def test_cron_webhook_no_auth_header_also_rejected(client):
    r = client.post("/cron/routines")
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:300]}"

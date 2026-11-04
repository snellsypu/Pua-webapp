"""Criterion: Owner manages access.

- Owner can add a valid email, then remove it.
- Invalid email -> 422.
- Owner row (self) has no remove button (UI) / server rejects removing the owner (400).
- Non-owner user sees list (GET 200) but POST/DELETE /api/auth/access return 403.
"""
import time
import uuid

NEW_EMAIL = f"tscheck-access-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}@example.com"


def test_owner_can_add_and_remove_access_email(client, owner_session):
    token, owner_email = owner_session
    headers = {"Authorization": f"Bearer {token}"}

    r = client.post("/auth/access", json={"email": NEW_EMAIL}, headers=headers)
    assert r.status_code == 200, f"add failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert NEW_EMAIL in body["emails"], f"email not in list after add: {body}"

    r2 = client.delete(f"/auth/access/{NEW_EMAIL}", headers=headers)
    assert r2.status_code == 200, f"remove failed: {r2.status_code} {r2.text[:300]}"
    body2 = r2.json()
    assert NEW_EMAIL not in body2["emails"], f"email still in list after remove: {body2}"


def test_owner_invalid_email_returns_422(client, owner_session):
    token, _ = owner_session
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post("/auth/access", json={"email": "not-an-email"}, headers=headers)
    assert r.status_code == 422, f"expected 422 for invalid email, got {r.status_code}: {r.text[:300]}"


def test_owner_cannot_remove_self(client, owner_session):
    token, owner_email = owner_session
    headers = {"Authorization": f"Bearer {token}"}
    r = client.delete(f"/auth/access/{owner_email}", headers=headers)
    assert r.status_code == 400, f"expected 400 removing owner, got {r.status_code}: {r.text[:300]}"


def test_nonowner_sees_list_but_cannot_modify(client, nonowner_session):
    token, _ = nonowner_session
    headers = {"Authorization": f"Bearer {token}"}

    r = client.get("/auth/access", headers=headers)
    assert r.status_code == 200, f"non-owner GET list failed: {r.status_code} {r.text[:300]}"

    r2 = client.post("/auth/access", json={"email": "someone@example.com"}, headers=headers)
    assert r2.status_code == 403, f"expected 403 on add by non-owner, got {r2.status_code}: {r2.text[:300]}"

    r3 = client.delete("/auth/access/someone@example.com", headers=headers)
    assert r3.status_code == 403, f"expected 403 on delete by non-owner, got {r3.status_code}: {r3.text[:300]}"

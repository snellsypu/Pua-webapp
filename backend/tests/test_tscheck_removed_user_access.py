"""Criterion: Removed users lose access.

After the owner removes an email, that user's existing session gets 401 on
/api/auth/me and other /api routes — enforced server-side (current_user re-checks
the allow-list on every call), not just by deleting the session.
"""


def test_removed_user_session_401_after_removal(client, owner_session, nonowner_session):
    owner_token, _ = owner_session
    user_token, user_email = nonowner_session
    owner_headers = {"Authorization": f"Bearer {owner_token}"}
    user_headers = {"Authorization": f"Bearer {user_token}"}

    # sanity: user currently has access
    r0 = client.get("/auth/me", headers=user_headers)
    assert r0.status_code == 200, f"expected 200 before removal, got {r0.status_code}: {r0.text[:300]}"

    # owner removes the user's email
    r1 = client.delete(f"/auth/access/{user_email}", headers=owner_headers)
    assert r1.status_code == 200, f"owner remove failed: {r1.status_code} {r1.text[:300]}"
    assert user_email not in r1.json()["emails"]

    # user's still-valid session token now gets 401 on /auth/me and other routes
    r2 = client.get("/auth/me", headers=user_headers)
    assert r2.status_code == 401, f"expected 401 after removal, got {r2.status_code}: {r2.text[:300]}"

    r3 = client.get("/habits", headers=user_headers)
    assert r3.status_code == 401, f"expected 401 on /habits after removal, got {r3.status_code}: {r3.text[:300]}"

    # re-add so the nonowner_session fixture's own teardown $pull is a no-op/clean
    client.post("/auth/access", json={"email": user_email}, headers=owner_headers)

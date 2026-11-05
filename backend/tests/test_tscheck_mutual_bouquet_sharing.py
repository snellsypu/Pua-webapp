"""API coverage for 'Mutual bouquet sharing' acceptance criteria (see /app/memory/SPEC.md).

Uses the seeded test accounts (tok_t_a = Alice, owner of bouquet "Family"; tok_t_b = Bob,
member sharing appointments+shopping, has open appt "Bob gig" 2026-11-05 21:00; tok_t_c =
Cara, member). These are fixed seed accounts (see /app/memory/test_credentials.md) — tests
only read them or write to their own scoped sub-resources (friend_gifts), and any gift list
mutation is restored to its original value at the end of the test.
"""

import httpx
import pytest

ALICE = {"Authorization": "Bearer tok_t_a"}
BOB = {"Authorization": "Bearer tok_t_b"}
CARA = {"Authorization": "Bearer tok_t_c"}


@pytest.mark.asyncio
async def test_friends_calendar_overlay_includes_bob_appointment(aclient: httpx.AsyncClient):
    """Alice (owner) and Cara (fellow member) both get Bob's shared appointment via the overlay."""
    for headers, who in [(ALICE, "alice"), (CARA, "cara")]:
        r = await aclient.get("/sharing/calendar", params={"from": "2026-11-01", "to": "2026-11-10"}, headers=headers)
        assert r.status_code == 200, f"{who}: {r.status_code} {r.text[:300]}"
        body = r.json()
        bob_entry = next((e for e in body if e["owner"]["user_id"] == "t_b"), None)
        assert bob_entry is not None, f"{who}: no Bob entry in {body}"
        titles = [a["title"] for a in bob_entry["appointments"]]
        assert "Bob gig" in titles, f"{who}: Bob gig missing from {titles}"
        gig = next(a for a in bob_entry["appointments"] if a["title"] == "Bob gig")
        assert gig["date"] == "2026-11-05"


@pytest.mark.asyncio
async def test_shared_planner_shows_bob_appointment_for_alice_and_cara(aclient: httpx.AsyncClient):
    for headers, who in [(ALICE, "alice"), (CARA, "cara")]:
        r = await aclient.get("/sharing/planner/t_b", headers=headers)
        assert r.status_code == 200, f"{who}: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body["appointments"] is not None
        titles = [a["title"] for a in body["appointments"]]
        assert "Bob gig" in titles, f"{who}: Bob gig missing from {titles}"


@pytest.mark.asyncio
async def test_friend_gift_list_is_private_per_viewer(aclient: httpx.AsyncClient):
    """Bob's private gift ideas for Alice's shared birthday aren't visible to Cara (or anyone else)."""
    # capture Bob's current list so we can restore it exactly
    r = await aclient.get("/anniversaries", headers=BOB)
    assert r.status_code == 200
    bob_entry = next(e for e in r.json() if e.get("friend") == "t_a")
    original_gifts = bob_entry["gifts"]

    try:
        marker = "tscheck-private-gift-marker"
        new_gifts = original_gifts + [{"text": marker, "bought": False}]
        r = await aclient.put("/anniversaries/friends/t_a/gifts", headers=BOB, json={"gifts": new_gifts})
        assert r.status_code == 200, r.text[:300]
        assert any(g["text"] == marker for g in r.json())

        # Cara's own (separate) gift list for Alice must NOT contain Bob's marker
        r = await aclient.get("/anniversaries", headers=CARA)
        assert r.status_code == 200
        cara_entry = next((e for e in r.json() if e.get("friend") == "t_a"), None)
        assert cara_entry is not None
        cara_texts = [g["text"] for g in cara_entry["gifts"]]
        assert marker not in cara_texts, f"Cara should not see Bob's private gift: {cara_texts}"
    finally:
        # restore Bob's original list exactly (seeded Candle unbought, Book bought)
        restore = [{"text": g["text"], "bought": g["bought"]} for g in original_gifts]
        r = await aclient.put("/anniversaries/friends/t_a/gifts", headers=BOB, json={"gifts": restore})
        assert r.status_code == 200, r.text[:300]
        texts = sorted(g["text"] for g in r.json())
        assert texts == sorted(g["text"] for g in original_gifts)

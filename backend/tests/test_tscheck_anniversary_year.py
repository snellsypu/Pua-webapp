"""Acceptance: saving/editing birthdays & anniversaries with a `year` field.

Covers:
- Creating a birthday with year=1990 -> GET /anniversaries entry has years computed from it.
- Creating an anniversary with year=2015 -> entry has years computed from it.
- Editing an entry's year (change it, then clear it) persists correctly.
"""

import time
import uuid as _uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import pytest_asyncio

from .conftest import api_url, MONGO_URL, DB_NAME

import pymongo


@pytest.fixture
def tscheck_session():
    cli = pymongo.MongoClient(MONGO_URL)
    db = cli[DB_NAME]
    suffix = f"{int(time.time() * 1000)}-{_uuid.uuid4().hex[:6]}"
    user_id = f"tscheck-user-{suffix}"
    token = f"tscheck-session-{suffix}"
    now = datetime.now(timezone.utc)
    db.users.insert_one({
        "user_id": user_id, "email": f"tscheck-{suffix}@example.com", "name": "TSCheck Year",
        "picture": "", "created_at": now, "onboarded": True,
        "friendCode": f"TSY{suffix[-4:]}", "shareCategories": [],
    })
    db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": now + timedelta(days=1), "created_at": now,
    })
    created_ids = []
    yield token, created_ids
    # cleanup: anniversaries this test created, the session, the user
    if created_ids:
        db.anniversaries.delete_many({"id": {"$in": created_ids}})
    db.user_sessions.delete_one({"session_token": token})
    db.users.delete_one({"user_id": user_id})
    cli.close()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_birthday_with_year_shows_turns_badge(tscheck_session):
    token, created_ids = tscheck_session
    with httpx.Client(base_url=api_url(), timeout=30.0) as c:
        payload = {"title": "Test Mum", "kind": "birthday", "date": "06-15", "year": 1990, "emoji": "🎂", "gifts": []}
        r = c.post("/anniversaries", json=payload, headers=_headers(token))
        assert r.status_code == 201, r.text
        created = r.json()
        created_ids.append(created["id"])
        assert created["year"] == 1990

        r2 = c.get("/anniversaries", headers=_headers(token))
        assert r2.status_code == 200
        entries = r2.json()
        entry = next(e for e in entries if e.get("custom") and e["custom"]["id"] == created["id"])
        assert entry["years"] is not None and entry["years"] >= 35
        assert entry["custom"]["year"] == 1990


def test_anniversary_with_year_shows_years(tscheck_session):
    token, created_ids = tscheck_session
    with httpx.Client(base_url=api_url(), timeout=30.0) as c:
        payload = {"title": "Our Wedding", "kind": "anniversary", "date": "03-20", "year": 2015, "emoji": "💞", "gifts": []}
        r = c.post("/anniversaries", json=payload, headers=_headers(token))
        assert r.status_code == 201, r.text
        created = r.json()
        created_ids.append(created["id"])
        assert created["year"] == 2015

        r2 = c.get("/anniversaries", headers=_headers(token))
        entries = r2.json()
        entry = next(e for e in entries if e.get("custom") and e["custom"]["id"] == created["id"])
        assert entry["years"] is not None and entry["years"] >= 9


def test_editing_entry_changes_and_clears_year(tscheck_session):
    token, created_ids = tscheck_session
    with httpx.Client(base_url=api_url(), timeout=30.0) as c:
        payload = {"title": "Test Edit Bday", "kind": "birthday", "date": "07-01", "year": 2000, "emoji": "🎂", "gifts": []}
        r = c.post("/anniversaries", json=payload, headers=_headers(token))
        assert r.status_code == 201, r.text
        created = r.json()
        aid = created["id"]
        created_ids.append(aid)
        assert created["year"] == 2000

        # change the year
        payload2 = {**payload, "year": 2001}
        r2 = c.put(f"/anniversaries/{aid}", json=payload2, headers=_headers(token))
        assert r2.status_code == 200, r2.text
        assert r2.json()["year"] == 2001

        # clear the year (partial/absent year -> None)
        payload3 = {**payload, "year": None}
        r3 = c.put(f"/anniversaries/{aid}", json=payload3, headers=_headers(token))
        assert r3.status_code == 200, r3.text
        assert r3.json()["year"] is None

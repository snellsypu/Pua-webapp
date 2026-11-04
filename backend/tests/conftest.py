"""Pre-scaffolded pytest fixtures for the FastAPI backend.

Tests hit the live uvicorn process managed by supervisor (not an in-process ASGI app), so
the app under test is the same one the frontend and Playwright see. Do NOT re-create this
file — add app-specific fixtures below the marker at the bottom.
"""

import os

import httpx
import pytest
import pytest_asyncio

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"


def api_url(path: str = "") -> str:
    """Absolute URL for an /api route: api_url("/status") -> http://localhost:8001/api/status."""
    return f"{API_URL}{path}"


@pytest.fixture(scope="session")
def backend_url() -> str:
    return BACKEND_URL


@pytest.fixture
def client():
    """Sync httpx client rooted at /api — the default for endpoint tests.

    Example:
        def test_status(client):
            assert client.get("/status").status_code == 200
    """
    with httpx.Client(base_url=API_URL, timeout=30.0) as c:
        yield c


@pytest_asyncio.fixture
async def aclient():
    """Async variant, for tests that also await motor/backend helpers directly."""
    async with httpx.AsyncClient(base_url=API_URL, timeout=30.0) as c:
        yield c


# --- app-specific fixtures below this line ---

import time
import uuid as _uuid

import pymongo

DB_NAME = os.environ.get("DB_NAME", "app")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")


@pytest.fixture(scope="session")
def mongo_db():
    cli = pymongo.MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture
def owner_session(mongo_db):
    """Returns (token, email) for the existing allow-listed owner (test.user.*)."""
    acc = mongo_db.access.find_one({"id": "access"})
    owner_email = acc["owner"]
    user = mongo_db.users.find_one({"email": owner_email})
    token = f"tscheck-owner-session-{int(time.time() * 1000)}-{_uuid.uuid4().hex[:6]}"
    mongo_db.user_sessions.insert_one({
        "user_id": user["user_id"], "session_token": token,
        "expires_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
        + __import__("datetime").timedelta(days=1),
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc),
    })
    yield token, owner_email
    mongo_db.user_sessions.delete_one({"session_token": token})


@pytest.fixture
def nonowner_session(mongo_db):
    """Creates a fresh tscheck- non-owner user on the allow-list, returns (token, email)."""
    suffix = f"{int(time.time() * 1000)}-{_uuid.uuid4().hex[:6]}"
    email = f"tscheck-nonowner-{suffix}@example.com"
    user_id = f"tscheck-user-{suffix}"
    token = f"tscheck-nonowner-session-{suffix}"
    now = __import__("datetime").datetime.now(__import__("datetime").timezone.utc)
    mongo_db.users.insert_one({"user_id": user_id, "email": email, "name": "TSCheck NonOwner", "picture": "", "created_at": now})
    mongo_db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": now + __import__("datetime").timedelta(days=1), "created_at": now,
    })
    mongo_db.access.update_one({"id": "access"}, {"$addToSet": {"emails": email}})
    yield token, email
    mongo_db.user_sessions.delete_one({"session_token": token})
    mongo_db.users.delete_one({"user_id": user_id})
    mongo_db.access.update_one({"id": "access"}, {"$pull": {"emails": email}})

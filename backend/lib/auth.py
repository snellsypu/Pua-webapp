"""Emergent-managed Google sign-in: sessions, the allow-list and the API gate.

Access model (single shared planner): `access` doc {id: "access", owner, emails[]}.
The first Google account to sign in becomes the owner; after that only listed emails
may sign in. Every /api route requires a valid session except PUBLIC_PATHS.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request

from lib.db import db

SESSION_COOKIE = "session_token"
SESSION_DAYS = 7
SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Signed-out endpoints: the sign-in exchange itself, the who-am-I probe (answers 401),
# logout, and the platform cron webhook (guarded by its own CRON_SECRET).
PUBLIC_PATHS = {"/api/auth/session", "/api/auth/me", "/api/auth/logout", "/api/cron/routines"}


def _aware(dt: datetime | str) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def session_token_from(request: Request) -> str | None:
    """Cookie first, then `Authorization: Bearer` (tests / tooling)."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    return auth[7:].strip() if auth.lower().startswith("bearer ") else None


async def get_access() -> dict:
    return await db.access.find_one({"id": "access"}, {"_id": 0}) or {"id": "access", "owner": None, "emails": []}


async def may_sign_in(email: str) -> bool:
    """True if allowed; claims ownership atomically when nobody owns PUA yet."""
    email = email.strip().lower()
    acc = await get_access()
    if acc.get("owner"):
        return email in acc.get("emails", [])
    claimed = await db.access.update_one(
        {"id": "access", "owner": None},
        {"$set": {"owner": email, "emails": [email], "claimedAt": datetime.now(timezone.utc)}},
        upsert=False,
    )
    if claimed.modified_count:
        return True
    try:  # no access doc yet → create it with this owner (unique id index guards the race)
        await db.access.insert_one({"id": "access", "owner": email, "emails": [email],
                                    "claimedAt": datetime.now(timezone.utc)})
        return True
    except Exception:
        acc = await get_access()
        return email in acc.get("emails", [])


async def create_session(user: dict, session_token: str) -> None:
    now = datetime.now(timezone.utc)
    email = user["email"].strip().lower()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    user_id = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"
    await db.users.update_one(
        {"email": email},
        {"$set": {"name": user.get("name") or email, "picture": user.get("picture") or "", "lastLoginAt": now},
         "$setOnInsert": {"user_id": user_id, "email": email, "created_at": now}},
        upsert=True,
    )
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": now + timedelta(days=SESSION_DAYS), "created_at": now,
    })


async def current_user(request: Request) -> dict | None:
    """The signed-in user (still on the allow-list), or None."""
    token = session_token_from(request)
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess or _aware(sess["expires_at"]) < datetime.now(timezone.utc):
        return None
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        return None
    acc = await get_access()
    if user["email"] not in acc.get("emails", []):
        return None  # removed from the allow-list → signed out everywhere
    user["isOwner"] = user["email"] == acc.get("owner")
    return user


async def require_user(request: Request) -> None:
    """api_router-wide gate (server.py)."""
    if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
        return
    if not await current_user(request):
        raise HTTPException(status_code=401, detail="Please sign in")

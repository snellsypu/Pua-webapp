"""Emergent-managed Google sign-in: sessions + the API gate.

Any Google account may sign in and gets its own private planner (lib/db scopes every
planner collection by ownerId = user_id). Sessions last until you sign out — the cookie
is refreshed on every /auth/me (browsers cap cookies at ~400 days, so it slides).
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response

from lib.db import current_owner, raw_db

SESSION_COOKIE = "session_token"
COOKIE_MAX_AGE = 400 * 86400  # browser maximum; refreshed on every app open
SESSION_LIFETIME = timedelta(days=3650)  # effectively "until you sign out"
SESSION_DATA_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

# Signed-out endpoints: the sign-in exchange, the who-am-I probe (answers 401), logout,
# and the platform cron webhook (guarded by its own WEBHOOK_CRON_SECRET).
PUBLIC_PATHS = {"/api/auth/session", "/api/auth/me", "/api/auth/logout", "/api/cron/routines", "/api/stripe/webhook"}

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_friend_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))


def _aware(dt: datetime | str) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(SESSION_COOKIE, token, max_age=COOKIE_MAX_AGE, path="/",
                        httponly=True, secure=True, samesite="none")


def session_token_from(request: Request) -> str | None:
    """Cookie first, then `Authorization: Bearer` (tests / tooling)."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        return token
    auth = request.headers.get("authorization", "")
    return auth[7:].strip() if auth.lower().startswith("bearer ") else None


async def create_session(user: dict, session_token: str) -> dict:
    now = datetime.now(timezone.utc)
    email = user["email"].strip().lower()
    await raw_db.users.update_one(
        {"email": email},
        {"$set": {"name": user.get("name") or email, "picture": user.get("picture") or "", "lastLoginAt": now},
         "$setOnInsert": {"user_id": f"user_{uuid.uuid4().hex[:12]}", "email": email, "created_at": now,
                          "onboarded": False}},
        upsert=True,
    )
    doc = await raw_db.users.find_one({"email": email}, {"_id": 0})
    await raw_db.user_sessions.insert_one({
        "user_id": doc["user_id"], "session_token": session_token,
        "expires_at": now + SESSION_LIFETIME, "created_at": now,
    })
    return doc


async def current_user(request: Request) -> dict | None:
    token = session_token_from(request)
    if not token:
        return None
    sess = await raw_db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess or _aware(sess["expires_at"]) < datetime.now(timezone.utc):
        return None
    return await raw_db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


async def require_user(request: Request) -> None:
    """api_router-wide gate (server.py): signs the request into the user's own planner."""
    if request.url.path in PUBLIC_PATHS or request.method == "OPTIONS":
        return
    user = await current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in")
    request.state.user = user
    current_owner.set(user["user_id"])

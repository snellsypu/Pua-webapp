"""Sign-in endpoints (Emergent-managed Google auth) + first-run planner choice."""

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from lib.auth import (
    SESSION_COOKIE, SESSION_DATA_URL, create_session, current_user, session_token_from, set_session_cookie,
)
from lib.db import current_owner, raw_db
from models.auth import AuthUser, OnboardIn, SessionIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/session", response_model=AuthUser)
async def exchange_session(input: SessionIn, response: Response):
    """Swap the one-time session_id from the auth redirect for the session cookie."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(SESSION_DATA_URL, headers={"X-Session-ID": input.session_id})
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Sign-in link expired — please try again")
    data = res.json()
    email = (data.get("email") or "").strip().lower()
    if not email or not data.get("session_token"):
        raise HTTPException(status_code=401, detail="Sign-in failed — please try again")
    user = await create_session({**data, "email": email}, data["session_token"])
    set_session_cookie(response, data["session_token"])
    return AuthUser(**user)


@router.get("/me", response_model=AuthUser)
async def me(request: Request, response: Response):
    user = await current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    token = session_token_from(request)
    if token and request.cookies.get(SESSION_COOKIE):
        set_session_cookie(response, token)  # slide the cookie so you stay signed in
    return AuthUser(**user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = session_token_from(request)
    if token:
        await raw_db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, samesite="none")
    return {"ok": True}


@router.post("/onboard", response_model=AuthUser)
async def onboard(input: OnboardIn, request: Request):
    """First sign-in: fill the new planner with sample data, or start clear."""
    user = request.state.user
    if user.get("onboarded"):
        return AuthUser(**user)
    assert current_owner.get() == user["user_id"]
    if input.sample:
        import seed

        await seed.run_all()
    else:
        from routers.routines import DEFAULTS, ROUTINE_KINDS

        for kind in ROUTINE_KINDS:  # routines exist but start with no steps
            from lib.db import db

            if not await db.routines.find_one({"kind": kind}):
                d = DEFAULTS[kind]
                await db.routines.insert_one({"kind": kind, "title": d["title"], "time": d["time"],
                                              "notify": False, "steps": [], "lastNotifiedDate": None})
    await raw_db.users.update_one({"user_id": user["user_id"]}, {"$set": {"onboarded": True}})
    return AuthUser(**{**user, "onboarded": True})

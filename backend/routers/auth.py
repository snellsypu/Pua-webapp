"""Sign-in endpoints (Emergent-managed Google auth) + the owner's allow-list."""

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

from lib.auth import (
    SESSION_COOKIE, SESSION_DATA_URL, SESSION_DAYS, create_session, current_user, get_access,
    may_sign_in, session_token_from,
)
from lib.db import db
from models.auth import AccessAdd, AccessList, AuthUser, SessionIn

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400, path="/",
        httponly=True, secure=True, samesite="none",
    )


@router.post("/session", response_model=AuthUser)
async def exchange_session(input: SessionIn, response: Response):
    """Swap the one-time session_id from the auth redirect for a 7-day session cookie."""
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(SESSION_DATA_URL, headers={"X-Session-ID": input.session_id})
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Sign-in link expired — please try again")
    data = res.json()
    email = (data.get("email") or "").strip().lower()
    if not email or not data.get("session_token"):
        raise HTTPException(status_code=401, detail="Sign-in failed — please try again")
    if not await may_sign_in(email):
        raise HTTPException(status_code=403, detail=f"{email} isn't allowed to use this PUA. Ask the owner to add you.")
    await create_session({**data, "email": email}, data["session_token"])
    _set_cookie(response, data["session_token"])
    user = await db.users.find_one({"email": email}, {"_id": 0})
    acc = await get_access()
    return AuthUser(**user, isOwner=email == acc.get("owner"))


@router.get("/me", response_model=AuthUser)
async def me(request: Request):
    user = await current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return AuthUser(**user)


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = session_token_from(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE, path="/", secure=True, samesite="none")
    return {"ok": True}


async def _owner(request: Request) -> dict:
    user = await current_user(request)
    if not user or not user.get("isOwner"):
        raise HTTPException(status_code=403, detail="Only the owner can change who has access")
    return user


@router.get("/access", response_model=AccessList)
async def get_access_list():
    acc = await get_access()
    return AccessList(owner=acc.get("owner"), emails=acc.get("emails", []))


@router.post("/access", response_model=AccessList)
async def add_access(input: AccessAdd, request: Request):
    await _owner(request)
    email = input.email.strip().lower()
    await db.access.update_one({"id": "access"}, {"$addToSet": {"emails": email}})
    return await get_access_list()


@router.delete("/access/{email}", response_model=AccessList)
async def remove_access(email: str, request: Request):
    owner = await _owner(request)
    email = email.strip().lower()
    if email == owner["email"]:
        raise HTTPException(status_code=400, detail="The owner can't be removed")
    await db.access.update_one({"id": "access"}, {"$pull": {"emails": email}})
    # their sessions stop working at once (current_user re-checks the list)
    return await get_access_list()

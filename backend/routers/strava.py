"""Strava link — OAuth2 (activity:read). Runs from Strava tick the linked habit for that
day (and log the km when the habit tracks distance). Synced from the 5-minute cron at most
every 30 minutes per user, after connecting, and on demand. Tokens never reach the browser.

Needs STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET in backend/.env, and the app's host set as the
"Authorization Callback Domain" at strava.com/settings/api."""

import logging
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from lib.db import current_owner, db, raw_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/strava", tags=["strava"])

AUTH_URL = "https://www.strava.com/oauth/authorize"
TOKEN_URL = "https://www.strava.com/oauth/token"
API = "https://www.strava.com/api/v3"
RUN_TYPES = {"Run", "TrailRun", "VirtualRun"}
EVERY = timedelta(minutes=30)
LOOKBACK_DAYS = 7


class StravaStatus(BaseModel):
    configured: bool  # app credentials present on the server
    connected: bool
    athleteName: str | None = None
    habitId: str | None = None  # habit that Strava runs tick
    lastSync: datetime | None = None
    lastResult: str | None = None  # "2 runs ticked" / error text


class ConnectIn(BaseModel):
    origin_url: str = Field(min_length=8, max_length=300)


class ConnectOut(BaseModel):
    url: str


class LinkIn(BaseModel):
    habitId: str | None


def _creds() -> tuple[str, str]:
    return os.environ.get("STRAVA_CLIENT_ID", ""), os.environ.get("STRAVA_CLIENT_SECRET", "")


def _uid(request: Request) -> str:
    return request.state.user["user_id"]


async def _status(uid: str) -> StravaStatus:
    cid, secret = _creds()
    c = await raw_db.strava_connections.find_one({"user_id": uid}, {"_id": 0})
    if not c:
        return StravaStatus(configured=bool(cid and secret), connected=False)
    return StravaStatus(configured=bool(cid and secret), connected=True, athleteName=c.get("athleteName"),
                        habitId=c.get("habitId"), lastSync=c.get("lastSync"), lastResult=c.get("lastResult"))


@router.get("/status", response_model=StravaStatus)
async def status(request: Request):
    return await _status(_uid(request))


@router.post("/connect", response_model=ConnectOut)
async def connect(input: ConnectIn, request: Request):
    cid, secret = _creds()
    if not (cid and secret):
        raise HTTPException(status_code=503, detail="Strava isn't set up on this server yet")
    origin = input.origin_url.rstrip("/")
    state = secrets.token_urlsafe(32)
    await raw_db.oauth_states.insert_one({"state": state, "user_id": _uid(request), "origin": origin,
                                          "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)})
    q = urlencode({"client_id": cid, "redirect_uri": f"{origin}/api/strava/callback", "response_type": "code",
                   "approval_prompt": "auto", "scope": "activity:read", "state": state})
    return ConnectOut(url=f"{AUTH_URL}?{q}")


async def _token(form: dict) -> dict:
    cid, secret = _creds()
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(TOKEN_URL, data={"client_id": cid, "client_secret": secret, **form})
    r.raise_for_status()
    return r.json()


@router.get("/callback")  # public (lib/auth.PUBLIC_PATHS): Strava redirects the browser here
async def callback(code: str | None = None, state: str | None = None, error: str | None = None, scope: str = ""):
    pending = await raw_db.oauth_states.find_one_and_delete({"state": state}) if state else None
    if not pending or pending["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This Strava link expired — try connecting again")
    back = f"{pending['origin']}/habits"
    if error or not code:
        return RedirectResponse(f"{back}?strava=denied")
    if "activity:read" not in scope:
        return RedirectResponse(f"{back}?strava=scope")
    try:
        t = await _token({"code": code, "grant_type": "authorization_code"})
    except httpx.HTTPError as exc:
        logger.warning("strava exchange: %s", exc)
        return RedirectResponse(f"{back}?strava=error")
    a = t.get("athlete") or {}
    uid = pending["user_id"]
    # Default link: the user's first distance-tracking habit, if any.
    habit = await raw_db.habits.find_one({"ownerId": uid, "tracksDistance": True}, sort=[("createdAt", 1)])
    await raw_db.strava_connections.update_one({"user_id": uid}, {"$set": {
        "user_id": uid, "athleteId": a.get("id"), "athleteName": " ".join(filter(None, [a.get("firstname"), a.get("lastname")])) or None,
        "accessToken": t["access_token"], "refreshToken": t["refresh_token"], "expiresAt": int(t["expires_at"]),
        "scope": scope, "connectedAt": datetime.now(timezone.utc), "lastSync": None,
    }, "$setOnInsert": {"habitId": habit["id"] if habit else None}}, upsert=True)
    token = current_owner.set(uid)
    try:
        await sync_strava(force=True)
    except Exception:
        logger.exception("first strava sync")
    finally:
        current_owner.reset(token)
    return RedirectResponse(f"{back}?strava=connected")


@router.put("/habit", response_model=StravaStatus)
async def link_habit(input: LinkIn, request: Request):
    uid = _uid(request)
    if input.habitId and not await db.habits.find_one({"id": input.habitId}):
        raise HTTPException(status_code=404, detail="Habit not found")
    res = await raw_db.strava_connections.update_one({"user_id": uid}, {"$set": {"habitId": input.habitId, "lastSync": None}})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Connect Strava first")
    await sync_strava(force=True)
    return await _status(uid)


@router.post("/sync", response_model=StravaStatus)
async def sync_now(request: Request):
    uid = _uid(request)
    if not await raw_db.strava_connections.find_one({"user_id": uid}):
        raise HTTPException(status_code=404, detail="Connect Strava first")
    await sync_strava(force=True)
    return await _status(uid)


@router.delete("", response_model=StravaStatus)
async def disconnect(request: Request):
    uid = _uid(request)
    c = await raw_db.strava_connections.find_one_and_delete({"user_id": uid})
    if c:
        try:
            async with httpx.AsyncClient(timeout=10) as h:
                await h.post("https://www.strava.com/oauth/deauthorize", data={"access_token": c["accessToken"]})
        except httpx.HTTPError:
            pass
    return await _status(uid)


async def _access(c: dict) -> str:
    if c["expiresAt"] > time.time() + 300:
        return c["accessToken"]
    t = await _token({"grant_type": "refresh_token", "refresh_token": c["refreshToken"]})
    await raw_db.strava_connections.update_one({"user_id": c["user_id"]}, {"$set": {
        "accessToken": t["access_token"], "refreshToken": t["refresh_token"], "expiresAt": int(t["expires_at"])}})
    return t["access_token"]


async def sync_strava(force: bool = False) -> None:
    """Current owner's scope: tick the linked habit for each day with a Strava run."""
    uid = current_owner.get()
    c = await raw_db.strava_connections.find_one({"user_id": uid})
    if not c or not c.get("habitId") or not all(_creds()):
        return
    now = datetime.now(timezone.utc)
    last = c.get("lastSync")
    if not force and last and last.replace(tzinfo=timezone.utc) + EVERY > now:
        return
    habit = await db.habits.find_one({"id": c["habitId"]})
    if not habit:
        return
    try:
        access = await _access(c)
        async with httpx.AsyncClient(timeout=15) as h:
            r = await h.get(f"{API}/athlete/activities", headers={"Authorization": f"Bearer {access}"},
                            params={"after": int((now - timedelta(days=LOOKBACK_DAYS)).timestamp()), "per_page": 50})
        if r.status_code == 401:
            raise RuntimeError("Strava access was revoked — reconnect Strava")
        r.raise_for_status()
    except Exception as exc:
        await raw_db.strava_connections.update_one({"user_id": uid}, {"$set": {"lastSync": now, "lastResult": str(exc)[:160]}})
        logger.warning("strava sync %s: %s", uid, exc)
        return
    km_by_day: dict[str, float] = {}
    for a in r.json():
        if a.get("sport_type", a.get("type")) in RUN_TYPES:
            day = a["start_date_local"][:10]
            km_by_day[day] = round(km_by_day.get(day, 0) + float(a.get("distance") or 0) / 1000, 2)
    ticked = 0
    for day, km in km_by_day.items():
        existing = await db.habit_completions.find_one({"habitId": habit["id"], "date": day})
        dist = {"distanceKm": km} if habit.get("tracksDistance") else {}
        if not existing:
            await db.habit_completions.insert_one({"id": str(uuid.uuid4()), "habitId": habit["id"], "date": day,
                                                   "source": "strava", **dist})
            ticked += 1
        elif existing.get("source") == "strava" and dist:
            await db.habit_completions.update_one({"_id": existing["_id"]}, {"$set": dist})
    msg = f"{len(km_by_day)} run day{'s' if len(km_by_day) != 1 else ''} in the last week · {ticked} newly ticked"
    await raw_db.strava_connections.update_one({"user_id": uid}, {"$set": {"lastSync": now, "lastResult": msg}})

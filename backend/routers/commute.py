"""Commute helpers for the UI: the Today "leave in N min" countdown and one-tap map
matches for appointments whose location is only free text."""

import math
from datetime import date, timedelta

from fastapi import APIRouter, Query

from lib import travel
from lib.briefing import _local_now, plan_commute
from lib.db import db
from lib.dates import today_iso
from models.planner import CommuteNext, LocationSuggestion

router = APIRouter(prefix="/commute", tags=["commute"])

MAX_SUGGESTIONS = 8  # Nominatim allows 1 req/s — keep a lookup round short
MAX_KM = 80  # a "match" further than this from home is the wrong place


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def _mins(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


@router.get("/next", response_model=CommuteNext | None)
async def next_commute(lat: float | None = Query(default=None, ge=-90, le=90),
                       lon: float | None = Query(default=None, ge=-180, le=180)):
    """Next appointment today (within 6 h) that has a place and a travel time; null if none."""
    settings = await db.settings.find_one({"id": "app"}) or {}
    now = _local_now(settings).strftime("%H:%M")
    live = (lat, lon) if lat is not None and lon is not None else None
    appts = await db.appointments.find({
        "date": today_iso(), "startTime": {"$gt": now}, "location": {"$nin": ["", None]},
    }).sort("startTime", 1).to_list(5)
    for a in appts:
        if _mins(a["startTime"]) - _mins(now) > 360:
            break
        plan = await plan_commute(settings, a, live)
        if not isinstance(plan, dict):
            continue
        rain = plan.get("rain")
        return CommuteNext(
            appointmentId=a["id"], title=a["title"], startTime=a["startTime"], location=a["location"],
            mode=plan["mode"], minutes=plan["minutes"], leaveBy=plan["leaveBy"],
            leaveInMin=_mins(plan["leaveBy"]) - _mins(now),
            rainMinutes=rain["minutes"] if rain else None, rainLeaveBy=rain["leaveBy"] if rain else None,
        )
    return None


@router.get("/unpinned", response_model=list[LocationSuggestion])
async def unpinned():
    """Upcoming appointments (next 60 days) with a text-only location, each with its best
    map match near home. Explicit "Find matches" tap only (Nominatim policy)."""
    settings = await db.settings.find_one({"id": "app"}) or {}
    near = settings.get("homeAddress") or settings.get("home")
    origin = (near["latitude"], near["longitude"]) if near else None
    today = today_iso()
    until = (date.fromisoformat(today) + timedelta(days=60)).isoformat()
    docs = await db.appointments.find({
        "date": {"$gte": today, "$lte": until}, "location": {"$nin": ["", None]},
        "$or": [{"locationLat": None}, {"locationLat": {"$exists": False}}],
    }).sort([("date", 1), ("startTime", 1)]).to_list(50)
    out: list[LocationSuggestion] = []
    seen: dict[str, dict | None] = {}
    for a in docs:
        place = a["location"].strip()
        if place.lower() not in seen and len(seen) >= MAX_SUGGESTIONS:
            continue
        if place.lower() not in seen:
            try:
                found = await travel.search(place, near=origin, limit=1)
            except Exception:
                found = []
            hit = found[0] if found else None
            if hit and origin and _km(origin, (hit["latitude"], hit["longitude"])) > MAX_KM:
                hit = None
            seen[place.lower()] = hit
        m = seen[place.lower()]
        out.append(LocationSuggestion(
            appointmentId=a["id"], title=a["title"], date=a["date"], startTime=a["startTime"], location=place,
            matchName=m["name"] if m else None, matchLat=m["latitude"] if m else None, matchLon=m["longitude"] if m else None,
        ))
    return out

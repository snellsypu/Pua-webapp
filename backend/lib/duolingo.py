"""Duolingo link — Duolingo has no official API, so this reads the public profile
(unofficial endpoint; may break if Duolingo changes it). When the profile's current
streak ends today, the linked habit is ticked for today. Runs from the 5-minute cron,
checking each linked habit at most every 30 minutes until it's done for the day."""

import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from lib.db import db

logger = logging.getLogger(__name__)
URL = "https://www.duolingo.com/2017-06-30/users"
FIELDS = "users{streak,streakData{currentStreak},username}"
EVERY = timedelta(minutes=30)


async def fetch_profile(username: str) -> dict | None:
    """{username, streak, practisedOn (YYYY-MM-DD of the streak's last day) | None}; None = not found."""
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "Mozilla/5.0 (PUA planner)"}) as c:
        r = await c.get(URL, params={"username": username, "fields": FIELDS})
    r.raise_for_status()
    users = r.json().get("users") or []
    if not users:
        return None
    u = users[0]
    cur = (u.get("streakData") or {}).get("currentStreak") or {}
    return {"username": u.get("username", username), "streak": int(u.get("streak") or 0), "practisedOn": cur.get("endDate")}


async def sync_duolingo(local_date: str) -> None:
    """Current owner's scope: tick linked habits whose Duolingo streak includes today."""
    now = datetime.now(timezone.utc)
    async for h in db.habits.find({"duolingoUsername": {"$nin": [None, ""]}}):
        if await db.habit_completions.find_one({"habitId": h["id"], "date": local_date}):
            continue
        last = h.get("duolingoCheckedAt")
        if last and (last.replace(tzinfo=last.tzinfo or timezone.utc) + EVERY) > now:
            continue
        await db.habits.update_one({"id": h["id"]}, {"$set": {"duolingoCheckedAt": now}})
        try:
            prof = await fetch_profile(h["duolingoUsername"])
        except Exception as exc:
            logger.warning("duolingo %s: %s", h["duolingoUsername"], exc)
            continue
        if prof and prof["practisedOn"] == local_date:
            await db.habit_completions.update_one(
                {"habitId": h["id"], "date": local_date},
                {"$setOnInsert": {"id": str(uuid.uuid4()), "habitId": h["id"], "date": local_date, "source": "duolingo"}},
                upsert=True,
            )
            logger.info("duolingo ticked %s for %s", h["name"], local_date)

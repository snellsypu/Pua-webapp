"""Anniversaries: birthdays, anniversaries and your own yearly events, plus holiday sets
(UK, religious, cultural) chosen in Settings. Each event gets a countdown; the morning
briefing mentions events 7 days and 1 day ahead (and on the day)."""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from lib.dates import today_iso
from lib.db import db, raw_db
from lib.holidays import DEFAULT_SETS, HOLIDAY_SETS, holidays_between

router = APIRouter(prefix="/anniversaries", tags=["anniversaries"])

Kind = Literal["birthday", "anniversary", "event"]
HEADS_UP = (7, 1, 0)


class GiftIdea(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = Field(min_length=1, max_length=80)
    bought: bool = False


class AnniversaryIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    kind: Kind = "birthday"
    date: str  # MM-DD (repeats yearly)
    year: int | None = Field(default=None, ge=1900, le=2100)  # birth / wedding year → "turns 30"
    emoji: str = Field(default="", max_length=8)
    gifts: list[GiftIdea] = Field(default_factory=list, max_length=20)  # gift ideas (birthdays)

    @field_validator("date")
    @classmethod
    def _md(cls, v: str) -> str:
        try:
            date.fromisoformat(f"2024-{v}")  # leap year so 02-29 is allowed
        except ValueError:
            raise ValueError("date must be MM-DD")
        return v


class Anniversary(AnniversaryIn):
    id: str


class UpcomingEvent(BaseModel):
    id: str  # custom id, or "holiday:<set>:<date>:<title>"
    title: str
    emoji: str
    kind: Literal["birthday", "anniversary", "event", "holiday"]
    holidaySet: str | None = None
    next: str  # YYYY-MM-DD of the next occurrence
    daysUntil: int
    years: int | None = None  # "turns N" / "N years" on the next occurrence
    custom: Anniversary | None = None  # editable fields (custom events only)
    friend: str | None = None  # user_id when it's a bouquet friend's shared birthday


class HolidaySetState(BaseModel):
    id: str
    label: str
    group: str
    enabled: bool


class MyBirthday(BaseModel):
    date: str | None = None  # MM-DD; null = not set
    share: bool = False  # bouquet friends see it in their Anniversaries

    @field_validator("date")
    @classmethod
    def _md(cls, v: str | None) -> str | None:
        if v:
            date.fromisoformat(f"2024-{v}")
        return v or None


class HolidaySetsIn(BaseModel):
    sets: list[str] = Field(max_length=20)


EMOJI = {"birthday": "🎂", "anniversary": "💞", "event": "📅"}


def _next(md: str, today: date) -> date:
    for y in (today.year, today.year + 1, today.year + 2):
        try:
            d = date.fromisoformat(f"{y}-{md}")
        except ValueError:  # 29 Feb in a non-leap year → 28 Feb
            d = date.fromisoformat(f"{y}-02-28")
        if d >= today:
            return d
    return today


async def _sets() -> list[str]:
    doc = await db.anniversary_prefs.find_one({"id": "prefs"})
    return doc.get("sets", DEFAULT_SETS) if doc else DEFAULT_SETS


async def _friend_birthdays(uid: str) -> list[dict]:
    """Shared birthdays of everyone you share a bouquet with (either direction)."""
    mine = [b["id"] async for b in raw_db.bouquets.find({"ownerId": uid}, {"id": 1})]
    ids = {m["viewerId"] async for m in raw_db.bouquet_members.find({"bouquetId": {"$in": mine}})}
    joined = [m async for m in raw_db.bouquet_members.find({"viewerId": uid})]
    ids |= {m["ownerId"] for m in joined}
    ids |= {m["viewerId"] async for m in raw_db.bouquet_members.find({"bouquetId": {"$in": [j["bouquetId"] for j in joined]}})}
    ids.discard(uid)
    return [u async for u in raw_db.users.find(
        {"user_id": {"$in": list(ids)}, "birthday.share": True, "birthday.date": {"$ne": None}}, {"_id": 0})]


async def upcoming(days: int = 366) -> list[UpcomingEvent]:
    from lib.db import current_owner

    today = date.fromisoformat(today_iso())
    out: list[UpcomingEvent] = []
    for u in await _friend_birthdays(current_owner.get()):
        nxt = _next(u["birthday"]["date"], today)
        out.append(UpcomingEvent(
            id=f"friend:{u['user_id']}", title=u.get("name", "Friend").split(" ")[0], emoji="🎈", kind="birthday",
            next=nxt.isoformat(), daysUntil=(nxt - today).days, friend=u["user_id"]))
    async for a in db.anniversaries.find({}, {"_id": 0}):
        ann = Anniversary(**a)
        nxt = _next(ann.date, today)
        out.append(UpcomingEvent(
            id=ann.id, title=ann.title, emoji=ann.emoji or EMOJI[ann.kind], kind=ann.kind, next=nxt.isoformat(),
            daysUntil=(nxt - today).days, years=(nxt.year - ann.year) if ann.year else None, custom=ann))
    for h in holidays_between(await _sets(), today, today + timedelta(days=days)):
        out.append(UpcomingEvent(
            id=f"holiday:{h['set']}:{h['date'].isoformat()}:{h['title']}", title=h["title"], emoji=h["emoji"],
            kind="holiday", holidaySet=h["set"], next=h["date"].isoformat(), daysUntil=(h["date"] - today).days))
    out.sort(key=lambda e: (e.daysUntil, e.kind == "holiday", e.title))
    return [e for e in out if e.daysUntil <= days]


def heads_up_line(events: list[UpcomingEvent]) -> str:
    """Briefing sentence for events today, tomorrow and in a week ("" if none)."""
    def name(e: UpcomingEvent) -> str:
        if e.kind == "birthday":
            return f"{e.title}'s birthday" + (f" (turning {e.years})" if e.years else "")
        if e.kind == "anniversary":
            return e.title + (f" ({e.years} years)" if e.years else "")
        return e.title
    def gifts(e: UpcomingEvent) -> str:
        todo = [g.text for g in (e.custom.gifts if e.custom else []) if not g.bought]
        return f" — gift ideas: {', '.join(todo[:4])}" if todo else ""
    groups = {d: [name(e) + (gifts(e) if d in (7, 1) else "") for e in events if e.daysUntil == d] for d in HEADS_UP}
    bits = []
    if groups[0]:
        bits.append(f"Today is {' and '.join(groups[0])}.")
    if groups[1]:
        bits.append(f"Tomorrow: {' and '.join(groups[1])}.")
    if groups[7]:
        bits.append(f"In one week: {' and '.join(groups[7])}.")
    return " ".join(bits)


@router.get("", response_model=list[UpcomingEvent])
async def list_upcoming():
    return await upcoming()


@router.get("/heads-up", response_model=list[UpcomingEvent])
async def heads_up():
    """Events today, tomorrow and in exactly one week (for the morning briefing card)."""
    return [e for e in await upcoming(8) if e.daysUntil in HEADS_UP]


@router.get("/my-birthday", response_model=MyBirthday)
async def get_my_birthday(request: Request):
    u = await raw_db.users.find_one({"user_id": request.state.user["user_id"]}, {"birthday": 1}) or {}
    return MyBirthday(**(u.get("birthday") or {}))


@router.put("/my-birthday", response_model=MyBirthday)
async def put_my_birthday(input: MyBirthday, request: Request):
    await raw_db.users.update_one({"user_id": request.state.user["user_id"]}, {"$set": {"birthday": input.model_dump()}})
    return input


@router.get("/holiday-sets", response_model=list[HolidaySetState])
async def get_sets():
    on = set(await _sets())
    return [HolidaySetState(id=k, label=v["label"], group=v["group"], enabled=k in on) for k, v in HOLIDAY_SETS.items()]


@router.put("/holiday-sets", response_model=list[HolidaySetState])
async def put_sets(input: HolidaySetsIn):
    sets = [s for s in dict.fromkeys(input.sets) if s in HOLIDAY_SETS]
    await db.anniversary_prefs.update_one({"id": "prefs"}, {"$set": {"sets": sets}}, upsert=True)
    return await get_sets()


@router.post("", response_model=Anniversary, status_code=201)
async def create(input: AnniversaryIn):
    doc = {"id": str(uuid.uuid4()), **input.model_dump(), "createdAt": datetime.now(timezone.utc)}
    await db.anniversaries.insert_one(doc)
    return Anniversary(**doc)


@router.put("/{aid}", response_model=Anniversary)
async def update(aid: str, input: AnniversaryIn):
    res = await db.anniversaries.update_one({"id": aid}, {"$set": input.model_dump()})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Event not found")
    return Anniversary(id=aid, **input.model_dump())


@router.delete("/{aid}")
async def delete(aid: str):
    res = await db.anniversaries.delete_one({"id": aid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}

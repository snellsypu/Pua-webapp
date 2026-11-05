"""Anniversaries: birthdays, anniversaries and your own yearly events, plus holiday sets
(UK, religious, cultural) chosen in Settings. Each event gets a countdown; the morning
briefing mentions events 7 days and 1 day ahead (and on the day)."""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from lib.dates import today_iso
from lib.db import db
from lib.holidays import DEFAULT_SETS, HOLIDAY_SETS, holidays_between

router = APIRouter(prefix="/anniversaries", tags=["anniversaries"])

Kind = Literal["birthday", "anniversary", "event"]
HEADS_UP = (7, 1, 0)


class AnniversaryIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    kind: Kind = "birthday"
    date: str  # MM-DD (repeats yearly)
    year: int | None = Field(default=None, ge=1900, le=2100)  # birth / wedding year → "turns 30"
    emoji: str = Field(default="", max_length=8)

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


class HolidaySetState(BaseModel):
    id: str
    label: str
    group: str
    enabled: bool


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
    return doc["sets"] if doc else DEFAULT_SETS


async def upcoming(days: int = 366) -> list[UpcomingEvent]:
    today = date.fromisoformat(today_iso())
    out: list[UpcomingEvent] = []
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
    groups = {d: [name(e) for e in events if e.daysUntil == d] for d in HEADS_UP}
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

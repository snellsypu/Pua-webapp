"""Server-anchored day bundles: /overview (one day, today + offset) and
/range (everything between two dates). The frontend never computes "today" —
it reads the date back from these responses."""

import asyncio
from datetime import date, timedelta

from pymongo import ASCENDING
from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from lib.dates import today_iso
from models.planner import (
    MEAL_SLOTS,
    Appointment,
    DayContext,
    HabitCompletion,
    Meal,
    RangeBundle,
    Reminder,
)

router = APIRouter(tags=["overview"])

_SLOT_ORDER = {slot: i for i, slot in enumerate(MEAL_SLOTS)}


def _offset_date(offset: int) -> str:
    base = date.fromisoformat(today_iso())
    return (base + timedelta(days=offset)).isoformat()


async def _appointments(date_from: str, date_to: str) -> list[Appointment]:
    docs = (
        await db.appointments.find({"date": {"$gte": date_from, "$lte": date_to}})
        .sort([("date", ASCENDING), ("startTime", ASCENDING)])
        .to_list(500)
    )
    return [Appointment(**d) for d in docs]


async def _meals(date_from: str, date_to: str) -> list[Meal]:
    docs = await db.meals.find({"date": {"$gte": date_from, "$lte": date_to}}).to_list(1000)
    docs.sort(key=lambda d: (d["date"], _SLOT_ORDER.get(d.get("slot", "snack"), 9)))
    return [Meal(**d) for d in docs]


async def _reminders(date_from: str, date_to: str) -> list[Reminder]:
    docs = (
        await db.reminders.find({"date": {"$gte": date_from, "$lte": date_to}})
        .sort([("date", ASCENDING), ("time", ASCENDING)])
        .to_list(500)
    )
    return [Reminder(**d) for d in docs]


@router.get("/overview", response_model=DayContext)
async def get_overview(offset: int = Query(default=0, ge=-31, le=366)):
    target = _offset_date(offset)
    appointments, meals, reminders = await asyncio.gather(
        _appointments(target, target), _meals(target, target), _reminders(target, target)
    )
    return DayContext(date=target, appointments=appointments, meals=meals, reminders=reminders)


@router.get("/range", response_model=RangeBundle)
async def get_range(
    from_: str = Query(alias="from"),
    to: str = Query(alias="to"),
):
    try:
        d_from = date.fromisoformat(from_)
        d_to = date.fromisoformat(to)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD") from exc
    if d_from > d_to:
        raise HTTPException(status_code=422, detail="from must be before to")
    if (d_to - d_from).days > 200:
        raise HTTPException(status_code=422, detail="Range too long (max 200 days)")
    appointments, meals, reminders, comps = await asyncio.gather(
        _appointments(from_, to),
        _meals(from_, to),
        _reminders(from_, to),
        db.habit_completions.find({"date": {"$gte": from_, "$lte": to}}).to_list(10000),
    )
    completions = [HabitCompletion(habitId=c["habitId"], date=c["date"]) for c in comps]
    return RangeBundle(
        fromDate=from_,
        toDate=to,
        appointments=appointments,
        meals=meals,
        reminders=reminders,
        completions=completions,
    )

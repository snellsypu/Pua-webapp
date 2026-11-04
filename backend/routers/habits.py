"""Habits with two tracking modes: daily streaks and monthly counters."""

from datetime import datetime, timedelta

from pymongo import ASCENDING
from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from lib.dates import today_iso
from models.planner import (
    Habit,
    HabitCompletion,
    HabitCreate,
    HabitStats,
    HabitToggleOut,
    HabitUpdate,
)

router = APIRouter(prefix="/habits", tags=["habits"])


def _prev_iso(d: str) -> str:
    y, m, dd = (int(p) for p in d.split("-"))
    return (datetime(y, m, dd) - timedelta(days=1)).strftime("%Y-%m-%d")


def _streaks(dates: set[str], today: str) -> tuple[int, int]:
    """Returns (current streak, best streak) for a set of completed ISO dates."""
    best = cur = 0
    prev: str | None = None
    for d in sorted(dates):
        cur = cur + 1 if (prev is not None and _prev_iso(d) == prev) else 1
        best = max(best, cur)
        prev = d
    # A streak survives "not yet done today" if yesterday was done.
    start = today if today in dates else _prev_iso(today)
    current = 0
    d = start
    while d in dates:
        current += 1
        d = _prev_iso(d)
    return current, best


async def _habit_dates() -> dict[str, set[str]]:
    comps = await db.habit_completions.find().to_list(10000)
    out: dict[str, set[str]] = {}
    for c in comps:
        out.setdefault(c["habitId"], set()).add(c["date"])
    return out


@router.get("/completions", response_model=list[HabitCompletion])
async def list_completions(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
):
    query: dict = {}
    if from_ or to:
        query["date"] = {"$gte": from_ or "0000-01-01", "$lte": to or "9999-12-31"}
    docs = await db.habit_completions.find(query).to_list(10000)
    return [HabitCompletion(habitId=d["habitId"], date=d["date"]) for d in docs]


@router.get("", response_model=list[HabitStats])
async def list_habits():
    today = today_iso()
    month_prefix = today[:7]
    dates_by_habit = await _habit_dates()
    habits = await db.habits.find().sort([("createdAt", ASCENDING)]).to_list(500)
    out: list[HabitStats] = []
    for h in habits:
        dates = dates_by_habit.get(h["id"], set())
        streak, best = _streaks(dates, today)
        out.append(
            HabitStats(
                id=h["id"],
                name=h["name"],
                emoji=h.get("emoji", "🎯"),
                mode=h.get("mode", "streak"),
                monthlyTarget=h.get("monthlyTarget", 12),
                doneToday=today in dates,
                streak=streak,
                bestStreak=best,
                monthCount=sum(1 for d in dates if d.startswith(month_prefix)),
            )
        )
    return out


@router.post("", response_model=Habit, status_code=201)
async def create_habit(input: HabitCreate):
    obj = Habit(**input.model_dump())
    await db.habits.insert_one(obj.model_dump())
    return obj


@router.put("/{id}", response_model=Habit)
async def update_habit(id: str, input: HabitUpdate):
    updates = input.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    from pymongo import ReturnDocument

    doc = await db.habits.find_one_and_update(
        {"id": id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Habit not found")
    return Habit(**doc)


@router.delete("/{id}")
async def delete_habit(id: str):
    res = await db.habits.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Habit not found")
    await db.habit_completions.delete_many({"habitId": id})
    return {"ok": True}


@router.post("/{id}/toggle", response_model=HabitToggleOut)
async def toggle_habit(id: str, date: str | None = None):
    habit = await db.habits.find_one({"id": id})
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found")
    target = date or today_iso()
    existing = await db.habit_completions.find_one({"habitId": id, "date": target})
    if existing:
        await db.habit_completions.delete_one({"habitId": id, "date": target})
        done = False
    else:
        comp = HabitCompletion(habitId=id, date=target)
        await db.habit_completions.insert_one(comp.model_dump())
        done = True
    return HabitToggleOut(habitId=id, date=target, done=done)

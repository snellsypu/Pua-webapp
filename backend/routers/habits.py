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
    HabitLog,
    HabitStats,
    HabitToggleOut,
    HabitUpdate,
)

RUN_PATTERN = {"$regex": "run", "$options": "i"}

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


async def _habit_dates() -> tuple[dict[str, set[str]], dict[str, dict[str, float]]]:
    """(dates done per habit, typed distance km per habit per date)."""
    comps = await db.habit_completions.find().to_list(10000)
    dates: dict[str, set[str]] = {}
    dist: dict[str, dict[str, float]] = {}
    for c in comps:
        dates.setdefault(c["habitId"], set()).add(c["date"])
        if c.get("distanceKm") is not None:
            dist.setdefault(c["habitId"], {})[c["date"]] = float(c["distanceKm"])
    return dates, dist


async def _samsung_run_km_by_date() -> dict[str, float]:
    """Running distance per day from imported Samsung Health exercise sessions."""
    docs = await db.health_events.find(
        {"type": "exercise", "title": RUN_PATTERN, "distanceKm": {"$gt": 0}}
    ).to_list(10000)
    out: dict[str, float] = {}
    for d in docs:
        out[d["date"]] = out.get(d["date"], 0.0) + float(d["distanceKm"])
    return out


def _distance_totals(typed: dict[str, float], samsung: dict[str, float], today: str) -> dict[str, float]:
    # Per day: a distance typed at check-off wins over Samsung's figure for that
    # day (same run logged twice must not double-count); Samsung fills other days.
    per_day = {**samsung, **typed}
    y, m, d = (int(p) for p in today.split("-"))
    monday = (datetime(y, m, d) - timedelta(days=datetime(y, m, d).weekday())).strftime("%Y-%m-%d")
    days = [(k, v) for k, v in per_day.items() if k <= today]
    r = lambda x: round(x, 2)  # noqa: E731
    return {
        "todayKm": r(per_day.get(today, 0.0)),
        "weekKm": r(sum(v for k, v in days if k >= monday)),
        "monthKm": r(sum(v for k, v in days if k.startswith(today[:7]))),
        "totalKm": r(sum(v for _, v in days)),
    }


@router.get("/completions", response_model=list[HabitCompletion])
async def list_completions(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
):
    query: dict = {}
    if from_ or to:
        query["date"] = {"$gte": from_ or "0000-01-01", "$lte": to or "9999-12-31"}
    docs = await db.habit_completions.find(query).to_list(10000)
    return [
        HabitCompletion(habitId=d["habitId"], date=d["date"], distanceKm=d.get("distanceKm"))
        for d in docs
    ]


@router.get("", response_model=list[HabitStats])
async def list_habits():
    today = today_iso()
    month_prefix = today[:7]
    dates_by_habit, dist_by_habit = await _habit_dates()
    habits = await db.habits.find().sort([("createdAt", ASCENDING)]).to_list(500)
    samsung = await _samsung_run_km_by_date() if any(h.get("tracksDistance") for h in habits) else {}
    out: list[HabitStats] = []
    for h in habits:
        dates = dates_by_habit.get(h["id"], set())
        streak, best = _streaks(dates, today)
        totals = (
            _distance_totals(dist_by_habit.get(h["id"], {}), samsung, today)
            if h.get("tracksDistance")
            else {}
        )
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
                tracksDistance=bool(h.get("tracksDistance", False)),
                **totals,
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


@router.post("/{id}/log", response_model=HabitToggleOut)
async def log_habit(id: str, input: HabitLog):
    """Mark done for a date and record the distance (creates or updates the check-off)."""
    if not await db.habits.find_one({"id": id}):
        raise HTTPException(status_code=404, detail="Habit not found")
    target = input.date or today_iso()
    await db.habit_completions.update_one(
        {"habitId": id, "date": target},
        {"$set": {"habitId": id, "date": target, "distanceKm": input.distanceKm}},
        upsert=True,
    )
    return HabitToggleOut(habitId=id, date=target, done=True, distanceKm=input.distanceKm)

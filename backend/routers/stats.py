"""Stats: leis completed, how long you've used PUA, and lifetime totals.
Mirrored by Stats in frontend/src/lib/types.ts."""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Request
from pydantic import BaseModel

from lib.dates import today_iso
from lib.db import db, raw_db
from routers.habits import _streaks

router = APIRouter(prefix="/stats", tags=["stats"])


class RoutineLeis(BaseModel):
    kind: str
    title: str
    leis: int  # completed rounds of 7 days in a row (all time)
    completeDays: int
    streak: int
    bestStreak: int


class Stats(BaseModel):
    memberSince: str  # YYYY-MM-DD
    daysUsing: int  # days since you first signed in (1 on the first day)
    activeDays: int  # days you ticked or added something
    leisTotal: int
    routines: list[RoutineLeis]
    habitCheckOffs: int
    habits: int
    bestHabitStreak: int
    appointments: int
    remindersDone: int
    bouquets: int
    notesWritten: int


def _leis(dates: set[str]) -> int:
    """Count completed 7-day rounds across every run of consecutive complete days."""
    total, run, prev = 0, 0, None
    for d in sorted(date.fromisoformat(x) for x in dates):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        if run % 7 == 0:
            total += 1
        prev = d
    return total


@router.get("", response_model=Stats)
async def get_stats(request: Request):
    user = request.state.user
    uid = user["user_id"]
    today = today_iso()
    created = user.get("created_at") or datetime.now(timezone.utc)
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    since = created.date().isoformat()
    days_using = (date.fromisoformat(today) - created.date()).days + 1

    routines: list[RoutineLeis] = []
    active: set[str] = set()
    titles = {d["kind"]: d.get("title") for d in await db.routines.find().to_list(10)}
    for kind in ("morning", "bedtime"):
        doc = {"kind": kind, "title": titles.get(kind) or f"{kind.title()} routine"}
        dates = {c["date"] for c in await db.routine_checks.find({"kind": doc["kind"], "complete": True}).to_list(10000)}
        active |= {c["date"] async for c in db.routine_checks.find({"kind": doc["kind"]}, {"date": 1})}
        streak, best = _streaks(dates, today)
        routines.append(RoutineLeis(kind=doc["kind"], title=doc.get("title", doc["kind"].title()),
                                    leis=_leis(dates), completeDays=len(dates), streak=streak, bestStreak=best))

    completions = await db.habit_completions.find({}, {"habitId": 1, "date": 1}).to_list(100000)
    active |= {c["date"] for c in completions}
    by_habit: dict[str, set[str]] = {}
    for c in completions:
        by_habit.setdefault(c["habitId"], set()).add(c["date"])
    best_habit = max((_streaks(ds, today)[1] for ds in by_habit.values()), default=0)

    return Stats(
        memberSince=since, daysUsing=max(1, days_using), activeDays=len(active),
        leisTotal=sum(r.leis for r in routines), routines=routines,
        habitCheckOffs=len(completions), habits=await db.habits.count_documents({}), bestHabitStreak=best_habit,
        appointments=await db.appointments.count_documents({}),
        remindersDone=await db.reminders.count_documents({"done": True}),
        bouquets=await raw_db.bouquets.count_documents({"ownerId": uid}),
        notesWritten=await raw_db.appointment_notes.count_documents({"authorId": uid}),
    )


# ---------------------------------------------------------------- work rota hours


class JobHours(BaseModel):
    jobId: str
    name: str
    weekHours: float
    weekShifts: int
    monthHours: float
    monthShifts: int


class WorkHours(BaseModel):
    weekStart: str  # Monday of this week
    weekEnd: str
    month: str  # YYYY-MM
    jobs: list[JobHours]


def _hours(b) -> float:
    s = int(b.startTime[:2]) * 60 + int(b.startTime[3:])
    e = int(b.endTime[:2]) * 60 + int(b.endTime[3:])
    return ((e - s) % 1440 or 1440) / 60  # overnight shifts wrap; equal times = 24h


@router.get("/work", response_model=WorkHours)
async def work_hours():
    """Scheduled hours per job this week (Mon–Sun) and this calendar month, from the rota."""
    from datetime import timedelta

    from lib.work import my_blocks

    today = date.fromisoformat(today_iso())
    ws = today - timedelta(days=today.weekday())
    we = ws + timedelta(days=6)
    ms = today.replace(day=1)
    me = (ms.replace(year=ms.year + 1, month=1) if ms.month == 12 else ms.replace(month=ms.month + 1)) - timedelta(days=1)
    blocks = await my_blocks(min(ws, ms).isoformat(), max(we, me).isoformat())
    jobs = await db.jobs.find({}, {"_id": 0, "id": 1, "name": 1}).sort("createdAt", 1).to_list(100)
    out = []
    for j in jobs:
        mine = [b for b in blocks if b.jobId == j["id"]]
        wk = [b for b in mine if ws.isoformat() <= b.date <= we.isoformat()]
        mo = [b for b in mine if ms.isoformat() <= b.date <= me.isoformat()]
        out.append(JobHours(jobId=j["id"], name=j["name"], weekHours=round(sum(map(_hours, wk)), 2), weekShifts=len(wk),
                            monthHours=round(sum(map(_hours, mo)), 2), monthShifts=len(mo)))
    return WorkHours(weekStart=ws.isoformat(), weekEnd=we.isoformat(), month=ms.strftime("%Y-%m"), jobs=out)

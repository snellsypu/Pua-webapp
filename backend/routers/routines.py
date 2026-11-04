"""Morning & bedtime routines: editable checklists that reset daily (checks are
stored per date) with a completion streak (days where every step was ticked)."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from lib.db import db
from lib.dates import today_iso
from models.routines import ROUTINE_KINDS, RoutineState, RoutineStep, RoutineUpdate
from routers.habits import _streaks

router = APIRouter(prefix="/routines", tags=["routines"])

DEFAULTS: dict[str, dict] = {
    "morning": {
        "title": "Morning routine",
        "time": "07:00",
        "steps": ["Make the bed", "Drink a glass of water", "Stretch for 5 minutes", "Check today's plan"],
    },
    "bedtime": {
        "title": "Bedtime routine",
        "time": "22:00",
        "steps": ["Lay out tomorrow's clothes", "Screens off", "Brush teeth", "Read for 10 minutes"],
    },
}


async def ensure_routines() -> list[dict]:
    """Both routines always exist; create missing ones from DEFAULTS."""
    for kind in ROUTINE_KINDS:
        if not await db.routines.find_one({"kind": kind}):
            d = DEFAULTS[kind]
            await db.routines.insert_one(
                {
                    "kind": kind,
                    "title": d["title"],
                    "time": d["time"],
                    "notify": False,
                    "steps": [RoutineStep(text=t).model_dump() for t in d["steps"]],
                    "lastNotifiedDate": None,
                    "updatedAt": datetime.now(timezone.utc),
                }
            )
    docs = await db.routines.find().to_list(10)
    return sorted(docs, key=lambda d: ROUTINE_KINDS.index(d["kind"]))


async def routine_state(doc: dict, today: str) -> RoutineState:
    check = await db.routine_checks.find_one({"kind": doc["kind"], "date": today}) or {}
    step_ids = {s["id"] for s in doc.get("steps", [])}
    done = [sid for sid in check.get("doneStepIds", []) if sid in step_ids]
    complete_dates = {
        c["date"]
        for c in await db.routine_checks.find({"kind": doc["kind"], "complete": True}).to_list(5000)
    }
    streak, best = _streaks(complete_dates, today)
    return RoutineState(
        kind=doc["kind"],
        title=doc.get("title", DEFAULTS[doc["kind"]]["title"]),
        time=doc.get("time", "07:00"),
        notify=bool(doc.get("notify", False)),
        steps=[RoutineStep(**s) for s in doc.get("steps", [])],
        date=today,
        doneStepIds=done,
        complete=bool(step_ids) and set(done) == step_ids,
        streak=streak,
        bestStreak=best,
    )


async def _recompute_complete(kind: str, date: str, step_ids: set[str]) -> None:
    check = await db.routine_checks.find_one({"kind": kind, "date": date})
    if check:
        done = set(check.get("doneStepIds", [])) & step_ids
        await db.routine_checks.update_one(
            {"kind": kind, "date": date},
            {"$set": {"doneStepIds": list(done), "complete": bool(step_ids) and done == step_ids}},
        )


def _check_kind(kind: str) -> None:
    if kind not in ROUTINE_KINDS:
        raise HTTPException(status_code=404, detail="Routine not found")


@router.get("", response_model=list[RoutineState])
async def list_routines():
    today = today_iso()
    return [await routine_state(d, today) for d in await ensure_routines()]


@router.put("/{kind}", response_model=RoutineState)
async def update_routine(kind: str, input: RoutineUpdate):
    _check_kind(kind)
    await ensure_routines()
    updates = input.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    if input.steps is not None:
        # Full dump: exclude_unset would drop the default-generated id of new steps.
        updates["steps"] = [s.model_dump() for s in input.steps]
    updates["updatedAt"] = datetime.now(timezone.utc)
    await db.routines.update_one({"kind": kind}, {"$set": updates})
    doc = await db.routines.find_one({"kind": kind})
    today = today_iso()
    if "steps" in updates:  # adding a step re-opens today's routine
        await _recompute_complete(kind, today, {s["id"] for s in doc["steps"]})
    return await routine_state(doc, today)


@router.post("/{kind}/steps/{step_id}/toggle", response_model=RoutineState)
async def toggle_step(kind: str, step_id: str):
    _check_kind(kind)
    await ensure_routines()
    doc = await db.routines.find_one({"kind": kind})
    step_ids = {s["id"] for s in doc.get("steps", [])}
    if step_id not in step_ids:
        raise HTTPException(status_code=404, detail="Step not found")
    today = today_iso()
    check = await db.routine_checks.find_one({"kind": kind, "date": today}) or {}
    done = set(check.get("doneStepIds", [])) & step_ids
    done.symmetric_difference_update({step_id})
    await db.routine_checks.update_one(
        {"kind": kind, "date": today},
        {"$set": {"doneStepIds": list(done), "complete": done == step_ids}},
        upsert=True,
    )
    return await routine_state(doc, today)

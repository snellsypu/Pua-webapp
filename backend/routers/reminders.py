"""Reminders — dated, timed nudges shown in morning/evening reviews."""

from pymongo import ASCENDING, ReturnDocument
from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from models.planner import Reminder, ReminderCreate, ReminderUpdate

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=list[Reminder])
async def list_reminders(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
):
    query: dict = {}
    if from_ or to:
        query["date"] = {"$gte": from_ or "0000-01-01", "$lte": to or "9999-12-31"}
    docs = (
        await db.reminders.find(query)
        .sort([("date", ASCENDING), ("time", ASCENDING)])
        .to_list(500)
    )
    return [Reminder(**d) for d in docs]


@router.post("", response_model=Reminder, status_code=201)
async def create_reminder(input: ReminderCreate):
    obj = Reminder(**input.model_dump())
    await db.reminders.insert_one(obj.model_dump())
    return obj


@router.patch("/{id}", response_model=Reminder)
async def update_reminder(id: str, input: ReminderUpdate):
    updates = input.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    doc = await db.reminders.find_one_and_update(
        {"id": id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return Reminder(**doc)


@router.delete("/{id}")
async def delete_reminder(id: str):
    res = await db.reminders.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"ok": True}

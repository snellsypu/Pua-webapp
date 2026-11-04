"""Appointments CRUD — the calendar's time-blocked events."""

from pymongo import ASCENDING, ReturnDocument
from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from models.planner import Appointment, AppointmentCreate, AppointmentUpdate

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[Appointment])
async def list_appointments(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
):
    query: dict = {}
    if from_ or to:
        query["date"] = {"$gte": from_ or "0000-01-01", "$lte": to or "9999-12-31"}
    docs = (
        await db.appointments.find(query)
        .sort([("date", ASCENDING), ("startTime", ASCENDING)])
        .to_list(500)
    )
    return [Appointment(**d) for d in docs]


@router.post("", response_model=Appointment, status_code=201)
async def create_appointment(input: AppointmentCreate):
    obj = Appointment(**input.model_dump())
    await db.appointments.insert_one(obj.model_dump())
    return obj


@router.put("/{id}", response_model=Appointment)
async def update_appointment(id: str, input: AppointmentUpdate):
    updates = input.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    doc = await db.appointments.find_one_and_update(
        {"id": id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return Appointment(**doc)


@router.delete("/{id}")
async def delete_appointment(id: str):
    res = await db.appointments.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"ok": True}

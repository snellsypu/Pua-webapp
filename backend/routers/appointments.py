"""Appointments CRUD — the calendar's time-blocked events. Bouquet friends can join one
(straight away if it's open to join, otherwise the owner approves); joining copies it into
their calendar as a linked appointment that follows the owner's changes."""

from pymongo import ASCENDING, ReturnDocument
from fastapi import APIRouter, HTTPException, Query

from lib.db import current_owner, db, raw_db
from models.planner import Appointment, AppointmentCreate, AppointmentUpdate, JoinedFrom

router = APIRouter(prefix="/appointments", tags=["appointments"])

SYNCED = ("title", "date", "startTime", "endTime", "location", "locationLat", "locationLon")


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
    for k in ("private", "openToJoin"):
        if k in updates and updates[k] is None:
            updates.pop(k)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    doc = await db.appointments.find_one_and_update(
        {"id": id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Appointment not found")
    synced = {k: v for k, v in updates.items() if k in SYNCED}
    if synced:  # joined friends' copies follow the owner's changes
        await raw_db.appointments.update_many(
            {"joinedFrom.ownerId": current_owner.get(), "joinedFrom.appointmentId": id}, {"$set": synced})
    return Appointment(**doc)


@router.delete("/{id}")
async def delete_appointment(id: str):
    doc = await db.appointments.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Appointment not found")
    await db.appointments.delete_one({"id": id})
    me = current_owner.get()
    if jf := doc.get("joinedFrom"):  # deleting your copy = leaving their appointment
        await raw_db.appointments.update_one(
            {"ownerId": jf["ownerId"], "id": jf["appointmentId"]}, {"$pull": {"attendees": {"user_id": me}}})
    else:  # the owner cancelled — remove everyone's copies
        await raw_db.appointments.delete_many({"joinedFrom.ownerId": me, "joinedFrom.appointmentId": id})
    return {"ok": True}


# ---------------------------------------------------------------- joining (helpers + owner side)


async def add_copy(owner_doc: dict, owner_name: str, viewer_id: str) -> None:
    """Put a linked copy of the owner's appointment in the viewer's calendar (idempotent)."""
    jf = {"joinedFrom.ownerId": owner_doc["ownerId"], "joinedFrom.appointmentId": owner_doc["id"]}
    if await raw_db.appointments.find_one({"ownerId": viewer_id, **jf}):
        return
    copy = Appointment(**{k: owner_doc.get(k) for k in SYNCED if owner_doc.get(k) is not None},
                       notes=owner_doc.get("notes", ""),
                       joinedFrom=JoinedFrom(ownerId=owner_doc["ownerId"], ownerName=owner_name, appointmentId=owner_doc["id"]))
    await raw_db.appointments.insert_one({**copy.model_dump(), "ownerId": viewer_id})


async def remove_copy(owner_id: str, appointment_id: str, viewer_id: str) -> None:
    await raw_db.appointments.delete_many(
        {"ownerId": viewer_id, "joinedFrom.ownerId": owner_id, "joinedFrom.appointmentId": appointment_id})


async def _mine(id: str) -> dict:
    doc = await db.appointments.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return doc


@router.post("/{id}/attendees/{user_id}/approve", response_model=Appointment)
async def approve_attendee(id: str, user_id: str):
    doc = await _mine(id)
    if not any(a["user_id"] == user_id for a in doc.get("attendees", [])):
        raise HTTPException(status_code=404, detail="No request from that person")
    doc = await db.appointments.find_one_and_update(
        {"id": id, "attendees.user_id": user_id}, {"$set": {"attendees.$.status": "going"}},
        return_document=ReturnDocument.AFTER)
    owner = await raw_db.users.find_one({"user_id": current_owner.get()}, {"name": 1}) or {}
    await add_copy(doc, owner.get("name", "Friend"), user_id)
    from lib import push as push_lib
    token = current_owner.set(user_id)
    try:
        await push_lib.send_to_all("You're in ✅", f"{owner.get('name', 'Your friend').split(' ')[0]} added you to {doc['title']}",
                                   url="/calendar", tag="appt-join")
    finally:
        current_owner.reset(token)
    return Appointment(**doc)


@router.delete("/{id}/attendees/{user_id}", response_model=Appointment)
async def remove_attendee(id: str, user_id: str):
    """Decline a request or take someone off the appointment (their copy goes too)."""
    await _mine(id)
    doc = await db.appointments.find_one_and_update(
        {"id": id}, {"$pull": {"attendees": {"user_id": user_id}}}, return_document=ReturnDocument.AFTER)
    await remove_copy(current_owner.get(), id, user_id)
    return Appointment(**doc)

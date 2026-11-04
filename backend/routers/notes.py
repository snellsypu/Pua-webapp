"""Bouquet notes on shared appointments ("I'll bring the poke").

A note belongs to one bouquet: only that bouquet's members and the planner owner see it.
Viewers write in a bouquet of the owner's that they're in, that shares appointments and
isn't paused. Private appointments take no notes (and hide any they had).
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from lib.db import current_owner, db, raw_db
from models.notes import AppointmentNote, BouquetRef, MyAppointmentNotes, NoteIn
from routers.sharing import paused_ids

router = APIRouter(prefix="/sharing", tags=["notes"])


def _uid(request: Request) -> str:
    return request.state.user["user_id"]


def _out(n: dict, me: str, owner_id: str) -> AppointmentNote:
    return AppointmentNote(**{k: n[k] for k in AppointmentNote.model_fields if k in n},
                           mine=n["authorId"] == me, canDelete=me in (n["authorId"], owner_id))


async def _note_bouquets(owner_id: str, viewer_id: str | None) -> list[dict]:
    """Owner's active bouquets that share appointments (only the viewer's, if given)."""
    q: dict = {"ownerId": owner_id, "categories": "appointments"}
    if viewer_id:
        q["id"] = {"$in": [m["bouquetId"] async for m in
                           raw_db.bouquet_members.find({"ownerId": owner_id, "viewerId": viewer_id})]}
    paused = await paused_ids(owner_id)
    return [b async for b in raw_db.bouquets.find(q).sort("createdAt", 1) if b["id"] not in paused]


async def viewer_notes(owner_id: str, viewer_id: str, appt_ids: list[str]) -> tuple[list[AppointmentNote], list[BouquetRef]]:
    bqs = await _note_bouquets(owner_id, viewer_id)
    refs = [BouquetRef(id=b["id"], name=b["name"]) for b in bqs]
    docs = await raw_db.appointment_notes.find(
        {"ownerId": owner_id, "appointmentId": {"$in": appt_ids}, "bouquetId": {"$in": [b.id for b in refs]}},
        {"_id": 0},
    ).sort("createdAt", 1).to_list(1000)
    return [_out(n, viewer_id, owner_id) for n in docs], refs


async def _appointment(owner_id: str, appt_id: str) -> dict:
    token = current_owner.set(owner_id)
    try:
        a = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    finally:
        current_owner.reset(token)
    if not a:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if a.get("private"):
        raise HTTPException(status_code=403, detail="Private appointments don't take notes")
    return a


async def _insert(owner_id: str, appt_id: str, b: dict, user: dict, text: str) -> AppointmentNote:
    doc = {
        "id": str(uuid.uuid4()), "ownerId": owner_id, "appointmentId": appt_id, "bouquetId": b["id"],
        "bouquetName": b["name"], "authorId": user["user_id"], "authorName": user.get("name", ""),
        "authorPicture": user.get("picture", ""), "text": text.strip(), "createdAt": datetime.now(timezone.utc),
    }
    await raw_db.appointment_notes.insert_one(doc)
    return _out(doc, user["user_id"], owner_id)


@router.post("/planner/{owner_id}/appointments/{appt_id}/notes", response_model=AppointmentNote, status_code=201)
async def friend_note(owner_id: str, appt_id: str, input: NoteIn, request: Request):
    """A bouquet member leaves a note on a shared appointment."""
    uid = _uid(request)
    b = next((b for b in await _note_bouquets(owner_id, uid) if b["id"] == input.bouquetId), None)
    if not b:
        raise HTTPException(status_code=404, detail="You can't post notes in that bouquet")
    await _appointment(owner_id, appt_id)
    return await _insert(owner_id, appt_id, b, request.state.user, input.text)


@router.get("/my-notes/{appt_id}", response_model=MyAppointmentNotes)
async def my_notes(appt_id: str, request: Request):
    """Owner: all bouquets' notes on one of your appointments."""
    uid = _uid(request)
    a = await db.appointments.find_one({"id": appt_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Appointment not found")
    docs = await raw_db.appointment_notes.find({"ownerId": uid, "appointmentId": appt_id}, {"_id": 0}) \
        .sort("createdAt", 1).to_list(1000)
    bqs = await _note_bouquets(uid, None)
    return MyAppointmentNotes(notes=[_out(n, uid, uid) for n in docs],
                              bouquets=[BouquetRef(id=b["id"], name=b["name"]) for b in bqs],
                              private=bool(a.get("private")))


@router.post("/my-notes/{appt_id}", response_model=AppointmentNote, status_code=201)
async def my_note(appt_id: str, input: NoteIn, request: Request):
    """Owner replies in one of their bouquets."""
    uid = _uid(request)
    b = next((b for b in await _note_bouquets(uid, None) if b["id"] == input.bouquetId), None)
    if not b:
        raise HTTPException(status_code=404, detail="That bouquet doesn't share appointments")
    await _appointment(uid, appt_id)
    return await _insert(uid, appt_id, b, request.state.user, input.text)


@router.get("/note-counts", response_model=dict[str, int])
async def note_counts(request: Request):
    """Owner: number of bouquet notes per appointment (for the little note badges)."""
    out: dict[str, int] = {}
    async for n in raw_db.appointment_notes.find({"ownerId": _uid(request)}, {"appointmentId": 1}):
        out[n["appointmentId"]] = out.get(n["appointmentId"], 0) + 1
    return out


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, request: Request):
    uid = _uid(request)
    res = await raw_db.appointment_notes.delete_one(
        {"id": note_id, "$or": [{"authorId": uid}, {"ownerId": uid}]})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}

"""Bouquet notes on shared appointments — mirrored in frontend/src/lib/types.ts."""

from datetime import datetime

from pydantic import BaseModel, Field


class BouquetRef(BaseModel):
    id: str
    name: str


class AppointmentNote(BaseModel):
    id: str
    appointmentId: str
    bouquetId: str
    bouquetName: str
    authorId: str
    authorName: str
    authorPicture: str = ""
    text: str
    createdAt: datetime
    mine: bool = False  # written by the person asking
    canDelete: bool = False  # author or planner owner


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=280)
    bouquetId: str


class MyAppointmentNotes(BaseModel):
    """Owner view: every bouquet's notes on one of your appointments + where you can reply."""
    notes: list[AppointmentNote]
    bouquets: list[BouquetRef]  # your active bouquets that share appointments
    private: bool  # private appointments take no notes

"""Work rota: jobs with a 1–4 week repeating pattern of shifts, shown as calendar blocks."""

import re
import uuid
from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel, Field, field_validator, model_validator

_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class Shift(BaseModel):
    week: int = Field(ge=1, le=4)  # which week of the rota
    weekday: int = Field(ge=0, le=6)  # Mon=0 … Sun=6
    start: str
    end: str  # earlier than start = finishes the next morning

    @field_validator("start", "end")
    @classmethod
    def _hhmm(cls, v: str) -> str:
        if not _HHMM.match(v):
            raise ValueError("Times must be HH:MM")
        return v


class JobIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    rotaWeeks: int = Field(default=1, ge=1, le=4)
    startDate: str  # any day in week 1 of the rota (snapped to its Monday)
    shifts: list[Shift] = Field(default_factory=list, max_length=28)

    @field_validator("startDate")
    @classmethod
    def _monday(cls, v: str) -> str:
        try:
            d = date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("startDate must be YYYY-MM-DD") from exc
        return (d - timedelta(days=d.weekday())).isoformat()

    @model_validator(mode="after")
    def _weeks(self):
        self.shifts = [s for s in self.shifts if s.week <= self.rotaWeeks]
        seen = {(s.week, s.weekday) for s in self.shifts}
        if len(seen) != len(self.shifts):
            raise ValueError("One shift per day of the rota")
        return self


class Job(JobIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WorkBlock(BaseModel):
    """One shift on one date (expanded from a job's rota)."""
    jobId: str
    name: str
    date: str
    startTime: str
    endTime: str
    overnight: bool = False  # ends the next day

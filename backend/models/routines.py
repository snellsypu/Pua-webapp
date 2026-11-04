"""Morning & bedtime routines — daily-reset checklists with completion streaks
and optional push notifications. Mirrored by hand in frontend/src/lib/types.ts."""

import uuid

from pydantic import BaseModel, Field, field_validator

from models.planner import TIME_RE

ROUTINE_KINDS = ("morning", "bedtime")


class RoutineStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = Field(min_length=1, max_length=120)


class RoutineState(BaseModel):
    kind: str  # morning | bedtime
    title: str
    time: str  # HH:MM in the user's timezone (settings.timezone)
    notify: bool
    steps: list[RoutineStep]
    date: str  # the server-anchored day the checks below belong to
    doneStepIds: list[str]
    complete: bool
    streak: int
    bestStreak: int


class RoutineUpdate(BaseModel):
    time: str | None = None
    notify: bool | None = None
    # Full replacement list; keep an existing step's id to preserve its check state.
    steps: list[RoutineStep] | None = None

    @field_validator("time")
    @classmethod
    def _check_time(cls, v: str | None) -> str | None:
        if v is not None and not TIME_RE.match(v):
            raise ValueError("time must be HH:MM")
        return v

    @field_validator("steps")
    @classmethod
    def _check_steps(cls, v: list[RoutineStep] | None) -> list[RoutineStep] | None:
        if v is not None and len(v) > 25:
            raise ValueError("at most 25 steps")
        return v

"""Voice command models — mirrored by hand in frontend/src/lib/types.ts."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from models.planner import DATE_RE, TIME_RE

VoiceKind = Literal["appointment", "habit", "reminder", "shopping", "checkoff"]


class VoiceDraft(BaseModel):
    """What PUA understood — shown as a preview; nothing is saved until confirmed."""

    kind: VoiceKind
    title: str = Field(min_length=1, max_length=200)
    # appointment / reminder
    date: str | None = None
    startTime: str | None = None  # appointment
    endTime: str | None = None  # appointment
    location: str = ""  # appointment
    private: bool = False  # appointment — friends see "Unavailable"
    time: str | None = None  # reminder
    # habit
    emoji: str = "🎯"
    habitMode: Literal["streak", "monthly"] = "streak"
    monthlyTarget: int = Field(default=12, ge=1, le=99)
    tracksDistance: bool = False
    # shopping — one list entry per item
    items: list[str] = Field(default_factory=list, max_length=20)
    # checkoff — tick an existing habit or routine step (title = its name)
    targetType: Literal["habit", "routine"] | None = None
    targetId: str | None = None  # habit id, or routine step id
    routineKind: Literal["morning", "bedtime"] | None = None
    distanceKm: float | None = Field(default=None, ge=0, le=500)

    @field_validator("date")
    @classmethod
    def _date(cls, v: str | None) -> str | None:
        return v if v is None or DATE_RE.match(v) else None

    @field_validator("startTime", "endTime", "time")
    @classmethod
    def _time(cls, v: str | None) -> str | None:
        return v if v is None or TIME_RE.match(v) else None


class VoiceParseIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    mode: Literal["simple", "ai"] = "simple"


class VoiceParseOut(BaseModel):
    transcript: str
    mode: Literal["simple", "ai"]
    draft: VoiceDraft | None = None
    message: str | None = None  # why nothing could be understood, with examples
    briefing: str | None = None  # "what's my day?" — text to show and read aloud


class VoiceTranscript(BaseModel):
    text: str

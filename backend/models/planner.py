"""Day-planner domain models (Pydantic v2).

Field names are camelCase on purpose: they are mirrored 1:1 by the hand-written
TS interfaces in frontend/src/lib/types.ts — keep the two in sync in one edit.
"""

import re
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, field_validator

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
MEAL_SLOTS = ("breakfast", "lunch", "dinner", "snack")
HABIT_MODES = ("streak", "monthly")
UNITS = ("celsius", "fahrenheit")
DISTANCE_UNITS = ("km", "mi")


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _valid_date(v: str) -> str:
    if not DATE_RE.match(v or ""):
        raise ValueError("date must be YYYY-MM-DD")
    return v


def _valid_time(v: str | None) -> str | None:
    if v is not None and not TIME_RE.match(v or ""):
        raise ValueError("time must be HH:MM")
    return v


# ---------------------------------------------------------------- settings


class Location(BaseModel):
    name: str
    latitude: float
    longitude: float
    country: str | None = None


class AppSettings(BaseModel):
    id: str = "app"
    home: Location | None = None
    units: str = "celsius"
    distanceUnit: str = "km"
    timezone: str = "UTC"  # IANA zone from the browser; drives routine notification times


class SettingsUpdate(BaseModel):
    # Partial PUT: only fields that are sent change (exclude_unset); an explicit
    # home=null clears the home location.
    home: Location | None = None
    units: str | None = None
    distanceUnit: str | None = None
    timezone: str | None = None

    @field_validator("units")
    @classmethod
    def _check_units(cls, v: str | None) -> str | None:
        if v is not None and v not in UNITS:
            raise ValueError("units must be celsius or fahrenheit")
        return v

    @field_validator("distanceUnit")
    @classmethod
    def _check_distance_unit(cls, v: str | None) -> str | None:
        if v is not None and v not in DISTANCE_UNITS:
            raise ValueError("distanceUnit must be km or mi")
        return v

    @field_validator("timezone")
    @classmethod
    def _check_tz(cls, v: str | None) -> str | None:
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except Exception as exc:  # unknown zone name
            raise ValueError("unknown timezone") from exc
        return v


# ---------------------------------------------------------------- appointments


class Appointment(BaseModel):
    id: str = Field(default_factory=_uuid)
    title: str
    date: str
    startTime: str
    endTime: str | None = None
    location: str = ""
    notes: str = ""
    createdAt: datetime = Field(default_factory=_now)

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("startTime", "endTime")
    @classmethod
    def _check_times(cls, v: str | None) -> str | None:
        return _valid_time(v)


class AppointmentCreate(BaseModel):
    title: str = Field(min_length=1)
    date: str
    startTime: str = "09:00"
    endTime: str | None = None
    location: str = ""
    notes: str = ""

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("startTime", "endTime")
    @classmethod
    def _check_times(cls, v: str | None) -> str | None:
        return _valid_time(v)


class AppointmentUpdate(BaseModel):
    title: str | None = None
    date: str | None = None
    startTime: str | None = None
    endTime: str | None = None
    location: str | None = None
    notes: str | None = None

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str | None) -> str | None:
        return _valid_date(v) if v is not None else None

    @field_validator("startTime", "endTime")
    @classmethod
    def _check_times(cls, v: str | None) -> str | None:
        return _valid_time(v)


# ---------------------------------------------------------------- habits


class Habit(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    emoji: str = "🎯"
    mode: str = "streak"  # streak | monthly
    monthlyTarget: int = 12  # only used by monthly mode
    tracksDistance: bool = False  # running habit: log km per check-off + Samsung runs
    createdAt: datetime = Field(default_factory=_now)


class HabitCreate(BaseModel):
    name: str = Field(min_length=1)
    emoji: str = "🎯"
    mode: str = "streak"
    monthlyTarget: int = 12
    tracksDistance: bool = False

    @field_validator("mode")
    @classmethod
    def _check_mode(cls, v: str) -> str:
        if v not in HABIT_MODES:
            raise ValueError("mode must be streak or monthly")
        return v

    @field_validator("monthlyTarget")
    @classmethod
    def _check_target(cls, v: int) -> int:
        return max(1, min(99, v))


class HabitUpdate(BaseModel):
    name: str | None = None
    emoji: str | None = None
    mode: str | None = None
    monthlyTarget: int | None = None
    tracksDistance: bool | None = None

    @field_validator("mode")
    @classmethod
    def _check_mode(cls, v: str | None) -> str | None:
        if v is not None and v not in HABIT_MODES:
            raise ValueError("mode must be streak or monthly")
        return v

    @field_validator("monthlyTarget")
    @classmethod
    def _check_target(cls, v: int | None) -> int | None:
        return max(1, min(99, v)) if v is not None else None


class HabitStats(BaseModel):
    id: str
    name: str
    emoji: str
    mode: str
    monthlyTarget: int
    doneToday: bool
    streak: int
    bestStreak: int
    monthCount: int
    tracksDistance: bool = False
    # Distance totals (always stored in km; the UI converts to the user's unit).
    # Per day: the distance typed at check-off wins; otherwise Samsung Health runs.
    todayKm: float = 0
    weekKm: float = 0  # Monday → today
    monthKm: float = 0
    totalKm: float = 0


class HabitCompletion(BaseModel):
    habitId: str
    date: str
    distanceKm: float | None = None


class HabitToggleOut(BaseModel):
    habitId: str
    date: str
    done: bool
    distanceKm: float | None = None


class HabitLog(BaseModel):
    """Check a habit off for a date with a distance (upserts the completion)."""

    date: str | None = None
    distanceKm: float | None = Field(default=None, ge=0, le=500)

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str | None) -> str | None:
        return _valid_date(v) if v is not None else None


# ---------------------------------------------------------------- meals


class Meal(BaseModel):
    id: str = Field(default_factory=_uuid)
    date: str
    slot: str
    title: str
    notes: str = ""

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("slot")
    @classmethod
    def _check_slot(cls, v: str) -> str:
        if v not in MEAL_SLOTS:
            raise ValueError(f"slot must be one of {MEAL_SLOTS}")
        return v


class MealUpsert(BaseModel):
    date: str
    slot: str
    title: str = Field(min_length=1)
    notes: str = ""

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("slot")
    @classmethod
    def _check_slot(cls, v: str) -> str:
        if v not in MEAL_SLOTS:
            raise ValueError(f"slot must be one of {MEAL_SLOTS}")
        return v


# ---------------------------------------------------------------- shopping


class ShoppingItem(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    checked: bool = False
    createdAt: datetime = Field(default_factory=_now)


class ShoppingCreate(BaseModel):
    name: str = Field(min_length=1)


class ShoppingUpdate(BaseModel):
    name: str | None = None
    checked: bool | None = None


# ---------------------------------------------------------------- reminders


class Reminder(BaseModel):
    id: str = Field(default_factory=_uuid)
    title: str
    date: str
    time: str = "08:00"
    done: bool = False
    createdAt: datetime = Field(default_factory=_now)

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("time")
    @classmethod
    def _check_time(cls, v: str) -> str:
        return _valid_time(v) or "08:00"


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1)
    date: str
    time: str = "08:00"

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str) -> str:
        return _valid_date(v)

    @field_validator("time")
    @classmethod
    def _check_time(cls, v: str) -> str:
        return _valid_time(v) or "08:00"


class ReminderUpdate(BaseModel):
    title: str | None = None
    date: str | None = None
    time: str | None = None
    done: bool | None = None

    @field_validator("date")
    @classmethod
    def _check_date(cls, v: str | None) -> str | None:
        return _valid_date(v) if v is not None else None

    @field_validator("time")
    @classmethod
    def _check_time(cls, v: str | None) -> str | None:
        return _valid_time(v)


# ---------------------------------------------------------------- bundles


class DayContext(BaseModel):
    """Everything scheduled for one day (server-anchored date)."""

    date: str
    appointments: list[Appointment]
    meals: list[Meal]
    reminders: list[Reminder]


class RangeBundle(BaseModel):
    """All planner data between two dates — powers the calendar month view."""

    fromDate: str
    toDate: str
    appointments: list[Appointment]
    meals: list[Meal]
    reminders: list[Reminder]
    completions: list[HabitCompletion]

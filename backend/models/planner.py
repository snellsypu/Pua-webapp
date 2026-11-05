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


TRAVEL_MODES = ("car", "foot", "bike", "transit")  # transit needs GOOGLE_MAPS_API_KEY
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _travel_mode(v: str | None) -> str | None:
    if v is not None and v not in TRAVEL_MODES:
        raise ValueError("travelMode must be car, foot, bike or transit")
    return v


class AppSettings(BaseModel):
    id: str = "app"
    home: Location | None = None
    units: str = "celsius"
    distanceUnit: str = "km"
    timezone: str = "UTC"  # IANA zone from the browser; drives routine notification times
    premiumVoice: bool = False  # AI transcription + natural-language voice (Emergent LLM key)
    reviewTime: str = "18:00"  # overview switches from today's briefing to tomorrow's review
    wakeTime: str = "07:00"  # wake-up notification time (settings.timezone)
    wakeNotify: bool = False
    weekendWakeTime: str | None = None  # Sat/Sun wake-up time; None = same as weekdays
    homeAddress: Location | None = None  # street address — start point for commute times
    travelMode: str = "car"  # default for commute times: car | foot | bike
    liveLocation: bool = False  # Premium: commute from where the phone is, not home
    leaveAlerts: bool = False  # push "time to leave" before appointments (needs homeAddress)
    transitAvailable: bool = False  # read-only: a Google Maps key is configured
    runReminders: bool = False  # push 15 min before the planned best run time
    mealPlanSource: str | None = None  # user_id of a bouquet's shared meal plan for Today/briefing; None = mine


class RunPlan(BaseModel):
    """Best hour today for the running habit — weather + free time between appointments."""

    habitId: str
    habitName: str
    time: str  # HH:MM start
    temperature: float
    precipProb: float
    windSpeed: float  # km/h
    isDay: bool
    reason: str  # e.g. "dry, light wind, free until your 2 PM appointment"
    remindAt: str  # HH:MM (time − 15 min)


class CommuteNext(BaseModel):
    """Next appointment today with a travel time — powers the Today countdown."""

    appointmentId: str
    title: str
    startTime: str
    location: str
    mode: str
    minutes: int
    leaveBy: str  # HH:MM (start − travel − 10 min)
    leaveInMin: int  # minutes from now until leaveBy (negative = late)
    rainMinutes: int | None = None  # heavy rain on a walk/ride → driving time
    rainLeaveBy: str | None = None


class LocationSuggestion(BaseModel):
    """An upcoming appointment with a free-text location and its best map match."""

    appointmentId: str
    title: str
    date: str
    startTime: str
    location: str
    matchName: str | None = None
    matchLat: float | None = None
    matchLon: float | None = None


class DayPart(BaseModel):
    """Which overview to show right now, decided on the server in settings.timezone."""

    part: str  # morning (today's briefing) | evening (tomorrow's review)
    localTime: str  # HH:MM now
    date: str  # server-anchored today
    reviewTime: str
    wakeTime: str  # today's effective wake-up time (weekend time on Sat/Sun when set)
    bedtimeTime: str  # bedtime routine time


class SettingsUpdate(BaseModel):
    # Partial PUT: only fields that are sent change (exclude_unset); an explicit
    # home=null clears the home location.
    home: Location | None = None
    units: str | None = None
    distanceUnit: str | None = None
    timezone: str | None = None
    premiumVoice: bool | None = None
    reviewTime: str | None = None
    wakeTime: str | None = None
    wakeNotify: bool | None = None
    weekendWakeTime: str | None = None  # explicit null = same as weekdays
    homeAddress: Location | None = None  # explicit null clears
    travelMode: str | None = None
    liveLocation: bool | None = None
    leaveAlerts: bool | None = None
    runReminders: bool | None = None
    mealPlanSource: str | None = None  # explicit null = my own plan

    @field_validator("reviewTime", "wakeTime", "weekendWakeTime")
    @classmethod
    def _check_hhmm(cls, v: str | None) -> str | None:
        if v is not None and not _HHMM.match(v):
            raise ValueError("time must be HH:MM")
        return v

    @field_validator("travelMode")
    @classmethod
    def _check_mode(cls, v: str | None) -> str | None:
        return _travel_mode(v)

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
    travelMode: str | None = None  # Premium: per-appointment commute mode (None = default)
    # Picked from address search — exact destination, no geocoding needed (None = free text)
    locationLat: float | None = Field(default=None, ge=-90, le=90)
    locationLon: float | None = Field(default=None, ge=-180, le=180)
    private: bool = False  # friends see a blank "Unavailable" block instead
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
    travelMode: str | None = None
    locationLat: float | None = Field(default=None, ge=-90, le=90)
    locationLon: float | None = Field(default=None, ge=-180, le=180)
    private: bool = False

    @field_validator("travelMode")
    @classmethod
    def _check_mode(cls, v: str | None) -> str | None:
        return _travel_mode(v)

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
    travelMode: str | None = None  # explicit null = back to the default mode
    locationLat: float | None = Field(default=None, ge=-90, le=90)  # explicit null = free text
    locationLon: float | None = Field(default=None, ge=-180, le=180)
    private: bool | None = None

    @field_validator("travelMode")
    @classmethod
    def _check_mode(cls, v: str | None) -> str | None:
        return _travel_mode(v)

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
    duolingoUsername: str | None = None  # linked Duolingo profile — auto-ticks after practice
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
    duolingoUsername: str | None = Field(default=None, max_length=60)  # "" unlinks
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
    duolingoUsername: str | None = None  # linked Duolingo profile
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
    ingredients: list[str] = Field(default_factory=list)

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
    # None = keep what the meal already has, or fill in from the remembered recipe
    ingredients: list[str] | None = Field(default=None, max_length=30)

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


def clean_ingredients(items: list[str]) -> list[str]:
    seen: dict[str, str] = {}
    for i in items:
        t = " ".join(i.split())[:40]
        if t and t.lower() not in seen:
            seen[t.lower()] = t
    return list(seen.values())[:30]


class Recipe(BaseModel):
    """Remembered ingredients for a meal name (reused whenever the meal is planned again)."""
    title: str
    ingredients: list[str] = Field(default_factory=list)


class RecipeGuessIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class FavouriteMeal(BaseModel):
    title: str
    count: int  # times planned
    ingredients: list[str] = Field(default_factory=list)


class ShoppingSuggestion(BaseModel):
    name: str
    meals: list[str]  # the planned meals that need it


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

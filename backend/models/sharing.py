"""Shared-planner models — mirrored in frontend/src/lib/types.ts."""

from pydantic import BaseModel

from models.auth import Person
from models.planner import Appointment, HabitStats, Meal, Reminder, ShoppingItem
from models.routines import RoutineState


class SharedPlanner(BaseModel):
    owner: Person
    categories: list[str]
    today: str
    shoppingEdit: bool = False  # viewer may tick off / add shopping items
    appointments: list[Appointment] | None = None  # today + 13 days; private ones masked
    reminders: list[Reminder] | None = None  # today + 13 days
    habits: list[HabitStats] | None = None
    routines: list[RoutineState] | None = None
    meals: list[Meal] | None = None  # this week
    shopping: list[ShoppingItem] | None = None


class FriendCalendar(BaseModel):
    """One friend's shared appointments for the calendar overlay (private ones masked)."""
    owner: Person
    appointments: list[Appointment]
    bouquetId: str | None = None  # first of their bouquets you joined (default colour)
    color: str | None = None  # your pick (a flower kind), overrides the bouquet colour

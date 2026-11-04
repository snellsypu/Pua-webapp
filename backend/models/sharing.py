"""Shared-planner snapshot — mirrored by SharedPlanner in frontend/src/lib/types.ts."""

from pydantic import BaseModel

from models.auth import Person
from models.planner import Appointment, HabitStats, Meal, Reminder, ShoppingItem
from models.routines import RoutineState


class SharedPlanner(BaseModel):
    owner: Person
    categories: list[str]
    today: str
    appointments: list[Appointment] | None = None  # today + 13 days
    reminders: list[Reminder] | None = None  # today + 13 days
    habits: list[HabitStats] | None = None
    routines: list[RoutineState] | None = None
    meals: list[Meal] | None = None  # this week
    shopping: list[ShoppingItem] | None = None

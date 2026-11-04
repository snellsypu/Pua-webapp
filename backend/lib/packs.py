"""Ready-made starter packs offered on first sign-in (clear planner + picked packs).
Mirrored as STARTER_PACKS in frontend/src/pages/Onboarding.tsx (labels only)."""

from models.planner import Habit
from models.routines import RoutineStep
from lib.db import db

HABIT_PACKS: dict[str, list[dict]] = {
    "fitness": [
        {"name": "Morning run", "emoji": "🏃", "mode": "streak", "tracksDistance": True},
        {"name": "Gym", "emoji": "🏋️", "mode": "monthly", "monthlyTarget": 12},
        {"name": "10k steps", "emoji": "👟", "mode": "streak"},
    ],
    "mindful": [
        {"name": "Meditate", "emoji": "🧘", "mode": "streak"},
        {"name": "Read 20 pages", "emoji": "📚", "mode": "streak"},
        {"name": "Journal", "emoji": "✍️", "mode": "streak"},
    ],
    "home": [
        {"name": "Drink 8 glasses of water", "emoji": "💧", "mode": "streak"},
        {"name": "Cook at home", "emoji": "🍳", "mode": "monthly", "monthlyTarget": 16},
        {"name": "Tidy for 10 minutes", "emoji": "🧹", "mode": "streak"},
    ],
}

ROUTINE_PACKS: dict[str, list[str]] = {
    "morning": ["Make the bed", "Drink a glass of water", "Stretch for 5 minutes", "Check today's plan"],
    "bedtime": ["Lay out tomorrow's clothes", "Screens off", "Brush teeth", "Read for 10 minutes"],
}


async def apply_packs(packs: list[str]) -> None:
    """Add the picked packs to the current owner's planner (skips habits that exist)."""
    for pack in dict.fromkeys(packs):
        for h in HABIT_PACKS.get(pack, []):
            if not await db.habits.find_one({"name": h["name"]}):
                await db.habits.insert_one(Habit(**h).model_dump())
        if pack in ROUTINE_PACKS:
            await db.routines.update_one(
                {"kind": pack},
                {"$set": {"steps": [RoutineStep(text=t).model_dump() for t in ROUTINE_PACKS[pack]]}},
            )

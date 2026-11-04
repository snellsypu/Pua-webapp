"""Idempotent seed data for Daily Loop. Run: cd /app/backend && python seed.py"""

import asyncio
import uuid
from datetime import date, datetime, timedelta, timezone

from lib.db import db, ensure_indexes
from lib.dates import today_iso


def d(offset: int) -> str:
    return (date.fromisoformat(today_iso()) + timedelta(days=offset)).isoformat()


def now() -> datetime:
    return datetime.now(timezone.utc)


async def main() -> None:
    await ensure_indexes()
    if await db.habits.count_documents({}) > 0:
        print("seed: data already present — skipping")
        return

    await db.settings.update_one(
        {"id": "app"},
        {
            "$set": {
                "home": {
                    "name": "New York",
                    "latitude": 40.7128,
                    "longitude": -74.006,
                    "country": "United States",
                },
                "units": "celsius",
                "updatedAt": now(),
            }
        },
        upsert=True,
    )

    habits = [
        {"id": str(uuid.uuid4()), "name": "Read 20 pages", "emoji": "📚", "mode": "streak", "monthlyTarget": 12, "createdAt": now()},
        {"id": str(uuid.uuid4()), "name": "Morning run", "emoji": "🏃", "mode": "streak", "monthlyTarget": 12, "createdAt": now()},
        {"id": str(uuid.uuid4()), "name": "Meditate", "emoji": "🧘", "mode": "streak", "monthlyTarget": 12, "createdAt": now()},
        {"id": str(uuid.uuid4()), "name": "Gym", "emoji": "🏋️", "mode": "monthly", "monthlyTarget": 12, "createdAt": now()},
    ]
    await db.habits.insert_many(habits)
    by_name = {h["name"]: h["id"] for h in habits}

    # Streaks alive from yesterday (so today is still checkable), gym mid-month.
    completions: list[dict] = []
    for name, offsets in {
        "Read 20 pages": [-3, -1],
        "Morning run": [-3, -2, -1],
        "Meditate": [-1],
    }.items():
        for off in offsets:
            completions.append({"id": str(uuid.uuid4()), "habitId": by_name[name], "date": d(off)})
    month_base = date.fromisoformat(today_iso()).replace(day=1)
    today = date.fromisoformat(today_iso())
    for k in (0, 2, 5, 8):
        day = month_base + timedelta(days=k)
        if day < today:
            completions.append({"id": str(uuid.uuid4()), "habitId": by_name["Gym"], "date": day.isoformat()})
    await db.habit_completions.insert_many(completions)

    await db.appointments.insert_many(
        [
            {"id": str(uuid.uuid4()), "title": "Team standup", "date": d(0), "startTime": "09:30", "endTime": "09:45", "location": "Office", "notes": "", "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Dentist", "date": d(0), "startTime": "14:00", "endTime": "15:00", "location": "Dr. Lee, Maple St", "notes": "Bring insurance card", "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Project review", "date": d(1), "startTime": "10:00", "endTime": "11:30", "location": "Conference room B", "notes": "Slides due tonight", "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Dinner with Maya", "date": d(1), "startTime": "19:00", "endTime": None, "location": "Trattoria Rossi", "notes": "", "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Weekend trip — train", "date": d(3), "startTime": "08:40", "endTime": "11:10", "location": "Central Station", "notes": "Platform 6", "createdAt": now()},
        ]
    )

    meals = [
        {"id": str(uuid.uuid4()), "date": d(0), "slot": "breakfast", "title": "Overnight oats", "notes": ""},
        {"id": str(uuid.uuid4()), "date": d(0), "slot": "lunch", "title": "Chicken wrap", "notes": ""},
        {"id": str(uuid.uuid4()), "date": d(0), "slot": "dinner", "title": "Pasta primavera", "notes": "Use the zucchini"},
        {"id": str(uuid.uuid4()), "date": d(1), "slot": "breakfast", "title": "Avocado toast", "notes": ""},
        {"id": str(uuid.uuid4()), "date": d(1), "slot": "lunch", "title": "Sushi bowl", "notes": ""},
        {"id": str(uuid.uuid4()), "date": d(1), "slot": "dinner", "title": "Salmon traybake", "notes": ""},
    ]
    await db.meals.insert_many(meals)

    await db.reminders.insert_many(
        [
            {"id": str(uuid.uuid4()), "title": "Call the plumber", "date": d(0), "time": "16:00", "done": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Pack gym bag", "date": d(1), "time": "07:30", "done": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "title": "Book train tickets", "date": d(2), "time": "18:00", "done": False, "createdAt": now()},
        ]
    )

    await db.shopping_items.insert_many(
        [
            {"id": str(uuid.uuid4()), "name": "Coffee beans", "checked": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "name": "Oat milk", "checked": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "name": "Baby spinach", "checked": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "name": "Eggs", "checked": False, "createdAt": now()},
            {"id": str(uuid.uuid4()), "name": "Dark chocolate", "checked": True, "createdAt": now()},
        ]
    )

    print(f"seed: planted habits={len(habits)} completions={len(completions)} "
          f"appointments=5 meals={len(meals)} reminders=3 shopping=5 (today={today_iso()})")


if __name__ == "__main__":
    asyncio.run(main())

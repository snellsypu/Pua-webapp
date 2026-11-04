"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "settings": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "appointments": [IndexModel([("date", ASCENDING), ("startTime", ASCENDING)], name="date_start")],
    "habits": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "habit_completions": [
        IndexModel([("habitId", ASCENDING), ("date", ASCENDING)], name="habit_date", unique=True),
        IndexModel([("date", ASCENDING)], name="date"),
    ],
    "meals": [IndexModel([("date", ASCENDING), ("slot", ASCENDING)], name="date_slot", unique=True)],
    "shopping_items": [
        IndexModel([("checked", ASCENDING), ("createdAt", DESCENDING)], name="checked_created")
    ],
    "reminders": [IndexModel([("date", ASCENDING), ("time", ASCENDING)], name="date_time")],
    "health_events": [
        IndexModel([("eventId", ASCENDING)], name="event_id", unique=True),
        IndexModel([("date", ASCENDING), ("start", ASCENDING)], name="date_start"),
        IndexModel([("type", ASCENDING), ("date", ASCENDING)], name="type_date"),
    ],
    "routines": [IndexModel([("kind", ASCENDING)], name="kind", unique=True)],
    "routine_checks": [
        IndexModel([("kind", ASCENDING), ("date", ASCENDING)], name="kind_date", unique=True),
        IndexModel([("kind", ASCENDING), ("complete", ASCENDING)], name="kind_complete"),
    ],
    "push_subscriptions": [IndexModel([("endpoint", ASCENDING)], name="endpoint", unique=True)],
    "users": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "access": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "cron_runs": [
        IndexModel([("runId", ASCENDING)], name="run_id", unique=True),
        IndexModel([("at", ASCENDING)], name="at_ttl", expireAfterSeconds=7 * 24 * 3600),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)

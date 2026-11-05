"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from contextvars import ContextVar
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
raw_db = client[os.environ["DB_NAME"]]

# ---- Per-user planners -------------------------------------------------------------
# Every planner collection is scoped to the signed-in user: `db.<scoped>` injects
# {"ownerId": current_owner} into filters and inserts, so routers stay unchanged.
# The owner is set by the auth gate (lib/auth.require_user), the cron loop (per user)
# and the shared-planner view (temporarily, read-only). No owner set → RuntimeError.
current_owner: ContextVar[str | None] = ContextVar("current_owner", default=None)

SCOPED = {
    "settings", "appointments", "habits", "habit_completions", "meals", "shopping_items",
    "reminders", "health_events", "routines", "routine_checks", "push_subscriptions",
    "anniversaries", "anniversary_prefs", "meal_recipes", "friend_gifts", "jobs",
}


def _owner() -> str:
    oid = current_owner.get()
    if not oid:
        raise RuntimeError("planner data accessed without a signed-in owner")
    return oid


class ScopedCollection:
    def __init__(self, coll):
        self._c = coll

    def _f(self, flt: dict | None) -> dict:
        return {**(flt or {}), "ownerId": _owner()}

    def find(self, flt=None, *a, **k):
        return self._c.find(self._f(flt), *a, **k)

    async def find_one(self, flt=None, *a, **k):
        return await self._c.find_one(self._f(flt), *a, **k)

    async def count_documents(self, flt=None, *a, **k):
        return await self._c.count_documents(self._f(flt), *a, **k)

    async def insert_one(self, doc, *a, **k):
        doc["ownerId"] = _owner()
        return await self._c.insert_one(doc, *a, **k)

    async def insert_many(self, docs, *a, **k):
        oid = _owner()
        for d in docs:
            d["ownerId"] = oid
        return await self._c.insert_many(docs, *a, **k)

    async def update_one(self, flt, upd, *a, **k):
        return await self._c.update_one(self._f(flt), upd, *a, **k)

    async def update_many(self, flt, upd, *a, **k):
        return await self._c.update_many(self._f(flt), upd, *a, **k)

    async def replace_one(self, flt, doc, *a, **k):
        return await self._c.replace_one(self._f(flt), {**doc, "ownerId": _owner()}, *a, **k)

    async def find_one_and_update(self, flt, upd, *a, **k):
        return await self._c.find_one_and_update(self._f(flt), upd, *a, **k)

    async def delete_one(self, flt, *a, **k):
        return await self._c.delete_one(self._f(flt), *a, **k)

    async def delete_many(self, flt, *a, **k):
        return await self._c.delete_many(self._f(flt), *a, **k)


class ScopedDB:
    def __getattr__(self, name: str):
        coll = raw_db[name]
        return ScopedCollection(coll) if name in SCOPED else coll

    def __getitem__(self, name: str):
        return self.__getattr__(name)


db = ScopedDB()

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "status_checks": [IndexModel([("timestamp", DESCENDING)], name="timestamp_desc")],
    "settings": [IndexModel([("ownerId", ASCENDING), ("id", ASCENDING)], name="owner_id", unique=True)],
    "appointments": [IndexModel([("ownerId", ASCENDING), ("date", ASCENDING), ("startTime", ASCENDING)], name="owner_date_start")],
    "habits": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "habit_completions": [
        IndexModel([("habitId", ASCENDING), ("date", ASCENDING)], name="habit_date", unique=True),
        IndexModel([("date", ASCENDING)], name="date"),
    ],
    "meals": [IndexModel([("ownerId", ASCENDING), ("date", ASCENDING), ("slot", ASCENDING)], name="owner_date_slot", unique=True)],
    "shopping_items": [
        IndexModel([("checked", ASCENDING), ("createdAt", DESCENDING)], name="checked_created")
    ],
    "reminders": [IndexModel([("date", ASCENDING), ("time", ASCENDING)], name="date_time")],
    "health_events": [
        IndexModel([("ownerId", ASCENDING), ("eventId", ASCENDING)], name="owner_event_id", unique=True),
        IndexModel([("date", ASCENDING), ("start", ASCENDING)], name="date_start"),
        IndexModel([("type", ASCENDING), ("date", ASCENDING)], name="type_date"),
    ],
    "routines": [IndexModel([("ownerId", ASCENDING), ("kind", ASCENDING)], name="owner_kind", unique=True)],
    "routine_checks": [
        IndexModel([("ownerId", ASCENDING), ("kind", ASCENDING), ("date", ASCENDING)], name="owner_kind_date", unique=True),
        IndexModel([("kind", ASCENDING), ("complete", ASCENDING)], name="kind_complete"),
    ],
    "push_subscriptions": [IndexModel([("ownerId", ASCENDING), ("endpoint", ASCENDING)], name="owner_endpoint", unique=True)],
    "users": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "bouquets": [
        IndexModel([("id", ASCENDING)], name="id", unique=True),
        IndexModel([("code", ASCENDING)], name="code", unique=True),
        IndexModel([("ownerId", ASCENDING), ("createdAt", ASCENDING)], name="owner_created"),
    ],
    "bouquet_members": [
        IndexModel([("bouquetId", ASCENDING), ("viewerId", ASCENDING)], name="bouquet_viewer", unique=True),
        IndexModel([("viewerId", ASCENDING), ("ownerId", ASCENDING)], name="viewer_owner"),
    ],
    "anniversary_prefs": [IndexModel([("ownerId", ASCENDING), ("id", ASCENDING)], name="owner_id", unique=True)],
    "anniversaries": [IndexModel([("ownerId", ASCENDING), ("id", ASCENDING)], name="owner_id", unique=True)],
    "strava_connections": [IndexModel([("user_id", ASCENDING)], name="user", unique=True)],
    "oauth_states": [
        IndexModel([("state", ASCENDING)], name="state", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "appointment_notes": [
        IndexModel([("ownerId", ASCENDING), ("appointmentId", ASCENDING), ("createdAt", ASCENDING)], name="owner_appt_created"),
        IndexModel([("id", ASCENDING)], name="id", unique=True),
    ],
    "cron_runs": [
        IndexModel([("runId", ASCENDING)], name="run_id", unique=True),
        IndexModel([("at", ASCENDING)], name="at_ttl", expireAfterSeconds=7 * 24 * 3600),
    ],
}


OLD_INDEXES = {"settings": "id", "meals": "date_slot", "health_events": "event_id", "routines": "kind",
               "routine_checks": "kind_date", "push_subscriptions": "endpoint", "appointments": "date_start"}


async def migrate_to_per_user() -> None:
    """One-off: drop pre-account unique indexes and the old shared (ownerless) data —
    every account now picks a sample or clear planner on first sign-in."""
    for coll, name in OLD_INDEXES.items():
        try:
            if name in await raw_db[coll].index_information():
                await raw_db[coll].drop_index(name)
        except Exception as exc:
            logger.error("drop index %s.%s: %s", coll, name, exc)
    for coll in SCOPED:
        res = await raw_db[coll].delete_many({"ownerId": {"$exists": False}})
        if res.deleted_count:
            logger.info("migrate: removed %d ownerless %s docs", res.deleted_count, coll)
    await raw_db.access.drop()
    # Bouquets replace the single friend code: old links and codes are removed (agreed).
    if "shares" in await raw_db.list_collection_names():
        await raw_db.shares.drop()
        logger.info("migrate: removed old friend-code shares")
    try:
        if "friend_code" in await raw_db.users.index_information():
            await raw_db.users.drop_index("friend_code")
    except Exception as exc:
        logger.error("drop index users.friend_code: %s", exc)
    await raw_db.users.update_many({"friendCode": {"$exists": True}},
                                   {"$unset": {"friendCode": "", "shareCategories": "", "shoppingEdit": ""}})


async def ensure_indexes() -> None:
    await migrate_to_per_user()
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await raw_db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)

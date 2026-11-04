"""Settings singleton — home location, weather units, distance unit, timezone."""

from datetime import datetime, timezone

from fastapi import APIRouter

from lib.db import db
from models.planner import AppSettings, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


async def _get_or_create() -> dict:
    doc = await db.settings.find_one({"id": "app"})
    if not doc:
        doc = {
            "id": "app",
            "home": None,
            "units": "celsius",
            "distanceUnit": "km",
            "timezone": "UTC",
            "updatedAt": datetime.now(timezone.utc),
        }
        await db.settings.insert_one(doc)
    return doc


def _out(doc: dict) -> AppSettings:
    return AppSettings(
        id="app",
        home=doc.get("home"),
        units=doc.get("units", "celsius"),
        distanceUnit=doc.get("distanceUnit", "km"),
        timezone=doc.get("timezone", "UTC"),
        premiumVoice=bool(doc.get("premiumVoice", False)),
    )


@router.get("", response_model=AppSettings)
async def get_settings():
    return _out(await _get_or_create())


@router.put("", response_model=AppSettings)
async def update_settings(input: SettingsUpdate):
    await _get_or_create()
    # Partial update: only fields the client sent change, so saving one setting
    # can never reset another. An explicit "home": null clears the home city.
    updates = input.model_dump(exclude_unset=True)
    if "home" in updates and updates["home"] is not None:
        updates["home"] = input.home.model_dump()  # type: ignore[union-attr]
    updates = {k: v for k, v in updates.items() if v is not None or k == "home"}
    updates["updatedAt"] = datetime.now(timezone.utc)
    await db.settings.update_one({"id": "app"}, {"$set": updates})
    return _out(await _get_or_create())

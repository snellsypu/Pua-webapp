"""Settings singleton — home location + weather units."""

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
            "updatedAt": datetime.now(timezone.utc),
        }
        await db.settings.insert_one(doc)
    return doc


@router.get("", response_model=AppSettings)
async def get_settings():
    doc = await _get_or_create()
    return AppSettings(id="app", home=doc.get("home"), units=doc.get("units", "celsius"))


@router.put("", response_model=AppSettings)
async def update_settings(input: SettingsUpdate):
    await _get_or_create()
    await db.settings.update_one(
        {"id": "app"},
        {
            "$set": {
                "home": input.home.model_dump() if input.home else None,
                "units": input.units,
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    doc = await _get_or_create()
    return AppSettings(id="app", home=doc.get("home"), units=doc.get("units", "celsius"))

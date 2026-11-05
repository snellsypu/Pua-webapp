"""Which meal plan Today / the overview / the bedtime read-out use: your own, or a bouquet's
shared plan (settings.mealPlanSource = that owner's user_id) while you still have access."""

from lib.db import current_owner, db, raw_db


async def can_use_meals(owner_id: str, viewer_id: str | None = None) -> bool:
    from routers.sharing import _access

    viewer_id = viewer_id or current_owner.get()
    if owner_id == viewer_id:
        return True
    cats, _, _ = await _access(owner_id, viewer_id)
    return "meals" in cats


async def plan_owner() -> str:
    me = current_owner.get()
    doc = await db.settings.find_one({"id": "app"}, {"mealPlanSource": 1}) or {}
    src = doc.get("mealPlanSource")
    return src if src and await can_use_meals(src, me) else me


async def plan_meals(query: dict) -> list[dict]:
    return await raw_db.meals.find({**query, "ownerId": await plan_owner()}, {"_id": 0}).to_list(1000)

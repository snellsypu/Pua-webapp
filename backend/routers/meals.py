"""Meal plan — one entry per (date, slot); POST upserts the slot."""

from pymongo import ASCENDING, ReturnDocument
from fastapi import APIRouter, HTTPException, Query

from lib.db import db
from models.planner import MEAL_SLOTS, Meal, MealUpsert

router = APIRouter(prefix="/meals", tags=["meals"])

_SLOT_ORDER = {slot: i for i, slot in enumerate(MEAL_SLOTS)}


@router.get("", response_model=list[Meal])
async def list_meals(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None, alias="to"),
):
    query: dict = {}
    if from_ or to:
        query["date"] = {"$gte": from_ or "0000-01-01", "$lte": to or "9999-12-31"}
    docs = await db.meals.find(query).sort([("date", ASCENDING)]).to_list(1000)
    docs.sort(key=lambda d: (d["date"], _SLOT_ORDER.get(d.get("slot", "snack"), 9)))
    return [Meal(**d) for d in docs]


@router.post("", response_model=Meal)
async def upsert_meal(input: MealUpsert):
    existing = await db.meals.find_one({"date": input.date, "slot": input.slot})
    if existing:
        updated = await db.meals.find_one_and_update(
            {"id": existing["id"]},
            {"$set": {"title": input.title, "notes": input.notes}},
            return_document=ReturnDocument.AFTER,
        )
        return Meal(**updated)
    meal = Meal(date=input.date, slot=input.slot, title=input.title, notes=input.notes)
    await db.meals.insert_one(meal.model_dump())
    return meal


@router.delete("/{id}")
async def delete_meal(id: str):
    res = await db.meals.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Meal not found")
    return {"ok": True}

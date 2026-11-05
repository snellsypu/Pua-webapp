"""Meal plan — one entry per (date, slot); POST upserts the slot. Each meal can carry
ingredients, remembered per meal name (meal_recipes) so planning it again fills them in.
Premium can ask the AI to guess ingredients; the week's ingredients become shopping suggestions."""

import json
import logging
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, StreamDone, TextDelta, UserMessage
from fastapi import APIRouter, HTTPException, Query, Request
from pymongo import ASCENDING, ReturnDocument

from lib.db import current_owner, db
from models.planner import (MEAL_SLOTS, FavouriteMeal, Meal, MealUpsert, Recipe, RecipeGuessIn, ShoppingSuggestion,
                            clean_ingredients)
from routers.premium import is_premium

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meals", tags=["meals"])

_SLOT_ORDER = {slot: i for i, slot in enumerate(MEAL_SLOTS)}


def _key(title: str) -> str:
    return " ".join(title.lower().split())


async def _recipe(title: str) -> list[str]:
    doc = await db.meal_recipes.find_one({"key": _key(title)})
    return doc.get("ingredients", []) if doc else []


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


@router.get("/recipe", response_model=Recipe)
async def get_recipe(title: str = Query(min_length=1)):
    return Recipe(title=title, ingredients=await _recipe(title))


@router.post("/recipe/guess", response_model=Recipe)
async def guess_recipe(input: RecipeGuessIn):
    """Premium: the AI suggests a short shopping-style ingredient list for a meal name."""
    if not await is_premium(current_owner.get()):
        raise HTTPException(status_code=402, detail="AI ingredient ideas are a Premium feature")
    chat = LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"meal-{uuid.uuid4()}",
        system_message=("You list the main shopping ingredients for a home-cooked meal (UK English names). "
                        'Reply ONLY with JSON: {"ingredients": ["..."]} — 3 to 12 short items, no quantities, '
                        "skip salt, pepper, water and cooking oil."),
    ).with_model("anthropic", "claude-sonnet-5-5")
    out: list[str] = []
    try:
        async for ev in chat.stream_message(UserMessage(text=input.title)):
            if isinstance(ev, TextDelta):
                out.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        m = re.search(r"\{.*\}", "".join(out), re.S)
        items = json.loads(m.group(0)).get("ingredients", []) if m else []
    except Exception:
        logger.exception("ingredient guess failed")
        raise HTTPException(status_code=502, detail="Couldn't think of ingredients right now — try again")
    return Recipe(title=input.title, ingredients=clean_ingredients([str(i) for i in items if isinstance(i, str)]))


@router.get("/favourites", response_model=list[FavouriteMeal])
async def favourites(slot: str | None = None, limit: int = Query(default=8, ge=1, le=20)):
    """Most-planned meals with their remembered ingredients — the given slot's favourites first."""
    counts: dict[str, list] = {}  # key → [title, total, in this slot]
    async for m in db.meals.find({}, {"title": 1, "slot": 1}):
        k = _key(m.get("title", ""))
        if k:
            c = counts.setdefault(k, [m["title"], 0, 0])
            c[1] += 1
            c[2] += m.get("slot") == slot
    top = sorted(counts.items(), key=lambda kv: (-kv[1][2], -kv[1][1], kv[0]))[:limit]
    return [FavouriteMeal(title=t, count=n, ingredients=await _recipe(t)) for _, (t, n, _s) in top]


def suggestions_for(meals: list[Meal], on_list_names: list[str]) -> list[ShoppingSuggestion]:
    on_list = {_key(n) for n in on_list_names}
    out: dict[str, ShoppingSuggestion] = {}
    for m in meals:
        for ing in m.ingredients:
            k = _key(ing)
            if k in on_list:
                continue
            s = out.setdefault(k, ShoppingSuggestion(name=ing, meals=[]))
            if m.title not in s.meals:
                s.meals.append(m.title)
    return sorted(out.values(), key=lambda s: (-len(s.meals), s.name.lower()))


async def my_list_names() -> list[str]:
    return [i["name"] async for i in db.shopping_items.find({}, {"name": 1})]


@router.get("/suggestions", response_model=list[ShoppingSuggestion])
async def shopping_suggestions(from_: str = Query(alias="from"), to: str = Query()):
    """Ingredients of the meals planned in [from, to] that aren't already on the shopping list."""
    return suggestions_for(await list_meals(from_, to), await my_list_names())


@router.post("", response_model=Meal)
async def upsert_meal(input: MealUpsert):
    existing = await db.meals.find_one({"date": input.date, "slot": input.slot})
    same_meal = existing and _key(existing.get("title", "")) == _key(input.title)
    if input.ingredients is not None:
        ingredients = clean_ingredients(input.ingredients)
        await db.meal_recipes.update_one(
            {"key": _key(input.title)}, {"$set": {"title": input.title.strip(), "ingredients": ingredients}}, upsert=True)
    elif same_meal:
        ingredients = existing.get("ingredients", [])
    else:
        ingredients = await _recipe(input.title)
    fields = {"title": input.title, "notes": input.notes, "ingredients": ingredients}
    if existing:
        updated = await db.meals.find_one_and_update(
            {"id": existing["id"]}, {"$set": fields}, return_document=ReturnDocument.AFTER)
        return Meal(**updated)
    meal = Meal(date=input.date, slot=input.slot, **fields)
    await db.meals.insert_one(meal.model_dump())
    return meal


async def toggle_cook(id: str, user: dict) -> Meal:
    """Add yourself as a cook on this meal, or step back if you already are (several can help)."""
    doc = await db.meals.find_one({"id": id})
    if not doc:
        raise HTTPException(status_code=404, detail="Meal not found")
    uid = user["user_id"]
    if any(c["user_id"] == uid for c in doc.get("cooks", [])):
        change = {"$pull": {"cooks": {"user_id": uid}}}
    else:
        change = {"$push": {"cooks": {"user_id": uid, "name": user.get("name", "Someone")}}}
    return Meal(**await db.meals.find_one_and_update({"id": id}, change, return_document=ReturnDocument.AFTER))


@router.post("/{id}/cook", response_model=Meal)
async def toggle_my_cook(id: str, request: Request):
    return await toggle_cook(id, request.state.user)


@router.delete("/{id}")
async def delete_meal(id: str):
    res = await db.meals.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Meal not found")
    return {"ok": True}

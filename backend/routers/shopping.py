"""Quick-access shopping list."""

from pymongo import ASCENDING, DESCENDING, ReturnDocument
from fastapi import APIRouter, HTTPException

from lib.db import db
from models.planner import ShoppingCreate, ShoppingItem, ShoppingUpdate

router = APIRouter(prefix="/shopping", tags=["shopping"])


@router.get("", response_model=list[ShoppingItem])
async def list_items():
    docs = (
        await db.shopping_items.find()
        .sort([("checked", ASCENDING), ("createdAt", DESCENDING)])
        .to_list(500)
    )
    return [ShoppingItem(**d) for d in docs]


@router.post("", response_model=ShoppingItem, status_code=201)
async def create_item(input: ShoppingCreate):
    obj = ShoppingItem(name=input.name.strip())
    await db.shopping_items.insert_one(obj.model_dump())
    return obj


@router.patch("/{id}", response_model=ShoppingItem)
async def update_item(id: str, input: ShoppingUpdate):
    updates = input.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    doc = await db.shopping_items.find_one_and_update(
        {"id": id}, {"$set": updates}, return_document=ReturnDocument.AFTER
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Item not found")
    return ShoppingItem(**doc)


@router.delete("/{id}")
async def delete_item(id: str):
    res = await db.shopping_items.delete_one({"id": id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@router.post("/clear-checked")
async def clear_checked():
    res = await db.shopping_items.delete_many({"checked": True})
    return {"ok": True, "deleted": res.deleted_count}

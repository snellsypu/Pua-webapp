"""Friend codes + view-only planner sharing.

Each user has a friendCode and a list of shareCategories (what friends may see).
Entering someone's code creates a `shares` link {ownerId, viewerId}. The planner owner
("admin") picks the categories and can remove members; viewers can leave. The shared
view is read-only: it runs the normal list handlers under the owner's scope.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from lib.auth import new_friend_code
from lib.dates import today_iso
from lib.db import current_owner, raw_db
from models.auth import CategoriesIn, JoinedPlanner, JoinIn, Person, SharingState, ShoppingEditIn
from models.planner import Appointment, ShoppingCreate, ShoppingItem, ShoppingUpdate
from models.sharing import FriendCalendar, SharedPlanner

router = APIRouter(prefix="/sharing", tags=["sharing"])


def _person(u: dict) -> Person:
    return Person(user_id=u["user_id"], name=u.get("name", ""), email=u["email"], picture=u.get("picture", ""))


async def _state(user: dict) -> SharingState:
    uid = user["user_id"]
    member_ids = [s["viewerId"] async for s in raw_db.shares.find({"ownerId": uid})]
    owner_ids = [s["ownerId"] async for s in raw_db.shares.find({"viewerId": uid})]
    members = [_person(u) async for u in raw_db.users.find({"user_id": {"$in": member_ids}}, {"_id": 0})]
    joined = [JoinedPlanner(**_person(u).model_dump(), categories=u.get("shareCategories", []),
                            shoppingEdit=_can_edit_shopping(u))
              async for u in raw_db.users.find({"user_id": {"$in": owner_ids}}, {"_id": 0})]
    code = user.get("friendCode")
    if not code:
        code = new_friend_code()
        await raw_db.users.update_one({"user_id": uid}, {"$set": {"friendCode": code}})
    return SharingState(friendCode=code, categories=user.get("shareCategories", []),
                        shoppingEdit=user.get("shoppingEdit", True), members=members, joined=joined)


def _can_edit_shopping(owner: dict) -> bool:
    return "shopping" in owner.get("shareCategories", []) and owner.get("shoppingEdit", True)


def _mask(a: Appointment) -> Appointment:
    """Private appointments reach friends as a blank 'Unavailable' block."""
    if not a.private:
        return a
    return Appointment(id=a.id, title="Unavailable", date=a.date, startTime=a.startTime,
                       endTime=a.endTime, private=True, createdAt=a.createdAt)


async def _owner_for(owner_id: str, viewer_id: str) -> dict:
    if not await raw_db.shares.find_one({"ownerId": owner_id, "viewerId": viewer_id}):
        raise HTTPException(status_code=404, detail="You don't have access to that planner")
    owner = await raw_db.users.find_one({"user_id": owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Planner not found")
    return owner


async def _fresh(request: Request) -> dict:
    return await raw_db.users.find_one({"user_id": request.state.user["user_id"]}, {"_id": 0})


@router.get("", response_model=SharingState)
async def get_sharing(request: Request):
    return await _state(await _fresh(request))


@router.put("/categories", response_model=SharingState)
async def set_categories(input: CategoriesIn, request: Request):
    cats = list(dict.fromkeys(input.categories))
    await raw_db.users.update_one({"user_id": request.state.user["user_id"]}, {"$set": {"shareCategories": cats}})
    return await _state(await _fresh(request))


@router.put("/shopping-edit", response_model=SharingState)
async def set_shopping_edit(input: ShoppingEditIn, request: Request):
    """Admin switch: may friends tick off and add items on the shared shopping list?"""
    await raw_db.users.update_one({"user_id": request.state.user["user_id"]}, {"$set": {"shoppingEdit": input.enabled}})
    return await _state(await _fresh(request))


@router.post("/code/regenerate", response_model=SharingState)
async def regenerate_code(request: Request):
    """New code — the old one stops working; people already joined stay."""
    await raw_db.users.update_one({"user_id": request.state.user["user_id"]}, {"$set": {"friendCode": new_friend_code()}})
    return await _state(await _fresh(request))


@router.post("/join", response_model=SharingState)
async def join(input: JoinIn, request: Request):
    me = request.state.user
    code = input.code.strip().upper().replace(" ", "").replace("-", "")
    owner = await raw_db.users.find_one({"friendCode": code}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="No planner has that friend code")
    if owner["user_id"] == me["user_id"]:
        raise HTTPException(status_code=400, detail="That's your own friend code")
    await raw_db.shares.update_one(
        {"ownerId": owner["user_id"], "viewerId": me["user_id"]},
        {"$setOnInsert": {"joinedAt": datetime.now(timezone.utc)}}, upsert=True,
    )
    return await _state(await _fresh(request))


@router.delete("/members/{viewer_id}", response_model=SharingState)
async def remove_member(viewer_id: str, request: Request):
    await raw_db.shares.delete_one({"ownerId": request.state.user["user_id"], "viewerId": viewer_id})
    return await _state(await _fresh(request))


@router.delete("/joined/{owner_id}", response_model=SharingState)
async def leave(owner_id: str, request: Request):
    await raw_db.shares.delete_one({"ownerId": owner_id, "viewerId": request.state.user["user_id"]})
    return await _state(await _fresh(request))


@router.get("/planner/{owner_id}", response_model=SharedPlanner)
async def shared_planner(owner_id: str, request: Request):
    """Read-only snapshot of a friend's planner — only the categories they share."""
    owner = await _owner_for(owner_id, request.state.user["user_id"])
    cats = set(owner.get("shareCategories", []))
    from routers import appointments, habits, meals, reminders, routines, shopping

    today = today_iso()
    until = (date.fromisoformat(today) + timedelta(days=13)).isoformat()
    token = current_owner.set(owner_id)  # read under the owner's scope, then restore
    try:
        appts = await appointments.list_appointments(from_=today, to=until) if "appointments" in cats else None
        out = SharedPlanner(
            owner=_person(owner), categories=sorted(cats), today=today, shoppingEdit=_can_edit_shopping(owner),
            appointments=[_mask(a) for a in appts] if appts is not None else None,
            reminders=await reminders.list_reminders(from_=today, to=until) if "reminders" in cats else None,
            habits=await habits.list_habits() if "habits" in cats else None,
            routines=await routines.list_routines() if "routines" in cats else None,
            meals=await meals.list_meals(from_=today, to=(date.fromisoformat(today) + timedelta(days=6)).isoformat()) if "meals" in cats else None,
            shopping=await shopping.list_items() if "shopping" in cats else None,
        )
    finally:
        current_owner.reset(token)
    return out


@router.get("/calendar", response_model=list[FriendCalendar])
async def friends_calendar(request: Request, from_: str = Query(alias="from"), to: str = Query(alias="to")):
    """Every joined planner that shares appointments, for the calendar overlay."""
    from routers import appointments

    me = request.state.user["user_id"]
    owner_ids = [s["ownerId"] async for s in raw_db.shares.find({"viewerId": me})]
    out: list[FriendCalendar] = []
    async for owner in raw_db.users.find({"user_id": {"$in": owner_ids}}, {"_id": 0}).sort("name", 1):
        if "appointments" not in owner.get("shareCategories", []):
            continue
        token = current_owner.set(owner["user_id"])
        try:
            appts = await appointments.list_appointments(from_=from_, to=to)
        finally:
            current_owner.reset(token)
        out.append(FriendCalendar(owner=_person(owner), appointments=[_mask(a) for a in appts]))
    return out


async def _shopping_owner(owner_id: str, request: Request) -> str:
    owner = await _owner_for(owner_id, request.state.user["user_id"])
    if not _can_edit_shopping(owner):
        raise HTTPException(status_code=403, detail="This shopping list is view-only")
    return owner_id


@router.post("/planner/{owner_id}/shopping", response_model=ShoppingItem, status_code=201)
async def friend_add_item(owner_id: str, input: ShoppingCreate, request: Request):
    from routers import shopping

    token = current_owner.set(await _shopping_owner(owner_id, request))
    try:
        return await shopping.create_item(input)
    finally:
        current_owner.reset(token)


@router.patch("/planner/{owner_id}/shopping/{item_id}", response_model=ShoppingItem)
async def friend_tick_item(owner_id: str, item_id: str, input: ShoppingUpdate, request: Request):
    """Friends may only tick / untick (not rename)."""
    from routers import shopping

    if input.checked is None:
        raise HTTPException(status_code=422, detail="Send checked: true or false")
    token = current_owner.set(await _shopping_owner(owner_id, request))
    try:
        return await shopping.update_item(item_id, ShoppingUpdate(checked=input.checked))
    finally:
        current_owner.reset(token)

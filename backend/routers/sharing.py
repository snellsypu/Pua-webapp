"""Bouquets — groups you share your planner with.

Each bouquet (owned by its admin = the planner owner) has its own join code and its own
categories. Entering a code adds you to that bouquet (`bouquet_members`); joining another
bouquet never removes you from the first. What a viewer may see of a planner is the union
of the categories of every bouquet of that owner they're in. Viewing is read-only except
the shopping list, when a bouquet that shares it allows edits. Private appointments are
masked as "Unavailable".
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from lib.auth import new_friend_code
from lib.dates import today_iso
from lib.db import current_owner, raw_db
from models.auth import (
    Leaderboard, LeaderboardEntry,
    Bouquet, BouquetCreate, BouquetUpdate, FriendColorIn, JoinedPlanner, JoinIn, Person, SharingState,
)
from models.planner import Appointment, ShoppingCreate, ShoppingItem, ShoppingUpdate
from models.sharing import FriendCalendar, SharedPlanner

router = APIRouter(prefix="/sharing", tags=["sharing"])

MAX_BOUQUETS = 12


async def paused_ids(owner_id: str) -> set[str]:
    """Without Premium only the owner's first FREE_BOUQUETS bouquets work; the rest pause."""
    from routers.premium import FREE_BOUQUETS, is_premium

    if await is_premium(owner_id):
        return set()
    ids = [b["id"] async for b in raw_db.bouquets.find({"ownerId": owner_id}, {"id": 1}).sort("createdAt", 1)]
    return set(ids[FREE_BOUQUETS:])


def _person(u: dict) -> Person:
    return Person(user_id=u["user_id"], name=u.get("name", ""), email=u["email"], picture=u.get("picture", ""))


def _uid(request: Request) -> str:
    return request.state.user["user_id"]


async def _unique_code() -> str:
    while True:
        code = new_friend_code()
        if not await raw_db.bouquets.find_one({"code": code}):
            return code


async def _access(owner_id: str, viewer_id: str) -> tuple[set[str], bool, list[dict]]:
    """(categories, shoppingEdit, bouquets in joined order) the viewer has on owner's planner."""
    ids = [m["bouquetId"] async for m in
           raw_db.bouquet_members.find({"ownerId": owner_id, "viewerId": viewer_id}).sort("joinedAt", 1)]
    paused = await paused_ids(owner_id)
    by_id = {b["id"]: b async for b in raw_db.bouquets.find({"id": {"$in": ids}}) if b["id"] not in paused}
    bouquets = [by_id[i] for i in ids if i in by_id]
    cats: set[str] = set()
    edit = False
    for b in bouquets:
        cats |= set(b.get("categories", []))
        edit = edit or ("shopping" in b.get("categories", []) and b.get("shoppingEdit", True))
    return cats, edit, bouquets


async def _colors(viewer_id: str) -> dict[str, str]:
    u = await raw_db.users.find_one({"user_id": viewer_id}, {"_id": 0, "friendColors": 1}) or {}
    return u.get("friendColors", {})


async def _state(uid: str) -> SharingState:
    bouquets: list[Bouquet] = []
    paused = await paused_ids(uid)
    async for b in raw_db.bouquets.find({"ownerId": uid}).sort("createdAt", 1):
        member_ids = [m["viewerId"] async for m in raw_db.bouquet_members.find({"bouquetId": b["id"]})]
        members = [_person(u) async for u in raw_db.users.find({"user_id": {"$in": member_ids}}, {"_id": 0})]
        bouquets.append(Bouquet(id=b["id"], name=b["name"], code=b["code"], categories=b.get("categories", []),
                                shoppingEdit=b.get("shoppingEdit", True), members=members, paused=b["id"] in paused))
    owner_ids = list(dict.fromkeys([m["ownerId"] async for m in raw_db.bouquet_members.find({"viewerId": uid})]))
    joined: list[JoinedPlanner] = []
    colors = await _colors(uid)
    async for u in raw_db.users.find({"user_id": {"$in": owner_ids}}, {"_id": 0}).sort("name", 1):
        cats, edit, bqs = await _access(u["user_id"], uid)
        joined.append(JoinedPlanner(**_person(u).model_dump(), categories=sorted(cats), shoppingEdit=edit,
                                    bouquets=[b["name"] for b in bqs], bouquetIds=[b["id"] for b in bqs],
                                    color=colors.get(u["user_id"])))
    return SharingState(bouquets=bouquets, joined=joined)


async def _own_bouquet(bid: str, uid: str) -> dict:
    b = await raw_db.bouquets.find_one({"id": bid, "ownerId": uid})
    if not b:
        raise HTTPException(status_code=404, detail="Bouquet not found")
    return b


@router.get("", response_model=SharingState)
async def get_sharing(request: Request):
    return await _state(_uid(request))


@router.post("/bouquets", response_model=SharingState, status_code=201)
async def create_bouquet(input: BouquetCreate, request: Request):
    from routers.premium import FREE_BOUQUETS, is_premium

    uid = _uid(request)
    count = await raw_db.bouquets.count_documents({"ownerId": uid})
    if count >= FREE_BOUQUETS and not await is_premium(uid):
        raise HTTPException(status_code=402, detail=f"Premium lets you make more than {FREE_BOUQUETS} bouquets")
    if count >= MAX_BOUQUETS:
        raise HTTPException(status_code=400, detail=f"You can have up to {MAX_BOUQUETS} bouquets")
    await raw_db.bouquets.insert_one({
        "id": str(uuid.uuid4()), "ownerId": uid, "name": input.name.strip(), "code": await _unique_code(),
        "categories": [], "shoppingEdit": True, "createdAt": datetime.now(timezone.utc),
    })
    return await _state(uid)


@router.put("/bouquets/{bid}", response_model=SharingState)
async def update_bouquet(bid: str, input: BouquetUpdate, request: Request):
    uid = _uid(request)
    await _own_bouquet(bid, uid)
    updates = input.model_dump(exclude_unset=True, exclude_none=True)
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if "categories" in updates:
        updates["categories"] = list(dict.fromkeys(updates["categories"]))
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    await raw_db.bouquets.update_one({"id": bid}, {"$set": updates})
    return await _state(uid)


@router.delete("/bouquets/{bid}", response_model=SharingState)
async def delete_bouquet(bid: str, request: Request):
    uid = _uid(request)
    await _own_bouquet(bid, uid)
    await raw_db.bouquet_members.delete_many({"bouquetId": bid})
    await raw_db.bouquets.delete_one({"id": bid})
    return await _state(uid)


@router.post("/bouquets/{bid}/code", response_model=SharingState)
async def regenerate_code(bid: str, request: Request):
    """New code for this bouquet — the old one stops working; members stay."""
    uid = _uid(request)
    await _own_bouquet(bid, uid)
    await raw_db.bouquets.update_one({"id": bid}, {"$set": {"code": await _unique_code()}})
    return await _state(uid)


@router.delete("/bouquets/{bid}/members/{viewer_id}", response_model=SharingState)
async def remove_member(bid: str, viewer_id: str, request: Request):
    uid = _uid(request)
    await _own_bouquet(bid, uid)
    await raw_db.bouquet_members.delete_one({"bouquetId": bid, "viewerId": viewer_id})
    return await _state(uid)


async def _month_lei(uid: str, month: str) -> tuple[int, int]:
    """(longest run of consecutive days with any finished routine this month, days finished)."""
    days = sorted({c["date"] async for c in raw_db.routine_checks.find(
        {"ownerId": uid, "complete": True, "date": {"$regex": f"^{month}-"}}, {"date": 1})})
    best = run = 0
    prev: date | None = None
    for d in (date.fromisoformat(x) for x in days):
        run = run + 1 if prev and (d - prev).days == 1 else 1
        best, prev = max(best, run), d
    return best, len(days)


@router.get("/bouquets/{bid}/leaderboard", response_model=Leaderboard)
async def leaderboard(bid: str, request: Request):
    """Everyone in a bouquet (owner + members) ranked by their longest lei this month."""
    uid = _uid(request)
    b = await raw_db.bouquets.find_one({"id": bid})
    if not b or (b["ownerId"] != uid and (
            b["id"] in await paused_ids(b["ownerId"])
            or not await raw_db.bouquet_members.find_one({"bouquetId": bid, "viewerId": uid}))):
        raise HTTPException(status_code=404, detail="Bouquet not found")
    ids = [b["ownerId"]] + [m["viewerId"] async for m in raw_db.bouquet_members.find({"bouquetId": bid})]
    month = today_iso()[:7]
    rows = []
    async for u in raw_db.users.find({"user_id": {"$in": ids}}, {"_id": 0}):
        lei, finished = await _month_lei(u["user_id"], month)
        rows.append((lei, finished, u))
    rows.sort(key=lambda r: (-r[0], -r[1], r[2].get("name", "")))
    entries, rank, last = [], 0, None
    for i, (lei, finished, u) in enumerate(rows):
        if (lei, finished) != last:
            rank, last = i + 1, (lei, finished)
        entries.append(LeaderboardEntry(**_person(u).model_dump(), longestLei=lei, daysFinished=finished,
                                        isOwner=u["user_id"] == b["ownerId"], me=u["user_id"] == uid, rank=rank))
    return Leaderboard(bouquetId=bid, bouquetName=b["name"], month=month, entries=entries)


@router.post("/join", response_model=SharingState)
async def join(input: JoinIn, request: Request):
    uid = _uid(request)
    code = input.code.strip().upper().replace(" ", "").replace("-", "")
    b = await raw_db.bouquets.find_one({"code": code})
    if not b:
        raise HTTPException(status_code=404, detail="No bouquet has that code")
    if b["ownerId"] == uid:
        raise HTTPException(status_code=400, detail="That's one of your own bouquets")
    if b["id"] in await paused_ids(b["ownerId"]):
        raise HTTPException(status_code=403, detail="That bouquet is paused right now — ask its owner")
    from routers.premium import FREE_GROUP_SIZE, is_premium

    already = await raw_db.bouquet_members.find_one({"bouquetId": b["id"], "viewerId": uid})
    if not already and not await is_premium(b["ownerId"]):
        if await raw_db.bouquet_members.count_documents({"bouquetId": b["id"]}) >= FREE_GROUP_SIZE - 1:
            raise HTTPException(status_code=403, detail=f"That bouquet is full ({FREE_GROUP_SIZE} people) — its owner can go Premium for more")
    await raw_db.bouquet_members.update_one(
        {"bouquetId": b["id"], "viewerId": uid},
        {"$setOnInsert": {"ownerId": b["ownerId"], "joinedAt": datetime.now(timezone.utc)}}, upsert=True,
    )
    out = await _state(uid)
    out.joinedOwnerId = b["ownerId"]
    return out


@router.put("/friends/{owner_id}/color", response_model=SharingState)
async def set_friend_color(owner_id: str, input: FriendColorIn, request: Request):
    """Your calendar colour for a friend's planner (null = their bouquet's colour)."""
    uid = _uid(request)
    if not await raw_db.bouquet_members.find_one({"ownerId": owner_id, "viewerId": uid}):
        raise HTTPException(status_code=404, detail="You don't have access to that planner")
    key = f"friendColors.{owner_id}"
    upd = {"$set": {key: input.color}} if input.color else {"$unset": {key: ""}}
    await raw_db.users.update_one({"user_id": uid}, upd)
    return await _state(uid)


@router.delete("/joined/{owner_id}", response_model=SharingState)
async def leave(owner_id: str, request: Request):
    """Leave every bouquet of that planner."""
    uid = _uid(request)
    await raw_db.bouquet_members.delete_many({"ownerId": owner_id, "viewerId": uid})
    return await _state(uid)


def _mask(a: Appointment) -> Appointment:
    """Private appointments reach friends as a blank 'Unavailable' block."""
    if not a.private:
        return a
    return Appointment(id=a.id, title="Unavailable", date=a.date, startTime=a.startTime,
                       endTime=a.endTime, private=True, createdAt=a.createdAt)


async def _owner_for(owner_id: str, viewer_id: str) -> tuple[dict, set[str], bool]:
    if not await raw_db.bouquet_members.find_one({"ownerId": owner_id, "viewerId": viewer_id}):
        raise HTTPException(status_code=404, detail="You don't have access to that planner")
    owner = await raw_db.users.find_one({"user_id": owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(status_code=404, detail="Planner not found")
    cats, edit, _ = await _access(owner_id, viewer_id)
    return owner, cats, edit


@router.get("/planner/{owner_id}", response_model=SharedPlanner)
async def shared_planner(owner_id: str, request: Request):
    """Read-only snapshot of a friend's planner — only what their bouquets share with you."""
    uid = _uid(request)
    owner, cats, edit = await _owner_for(owner_id, uid)
    from routers import appointments, habits, meals, reminders, routines, shopping
    from routers.notes import viewer_notes

    today = today_iso()
    until = (date.fromisoformat(today) + timedelta(days=13)).isoformat()
    token = current_owner.set(owner_id)  # read under the owner's scope, then restore
    try:
        appts = await appointments.list_appointments(from_=today, to=until) if "appointments" in cats else None
        out = SharedPlanner(
            owner=_person(owner), categories=sorted(cats), today=today, shoppingEdit=edit,
            appointments=[_mask(a) for a in appts] if appts is not None else None,
            reminders=await reminders.list_reminders(from_=today, to=until) if "reminders" in cats else None,
            habits=await habits.list_habits() if "habits" in cats else None,
            routines=await routines.list_routines() if "routines" in cats else None,
            meals=await meals.list_meals(from_=today, to=(date.fromisoformat(today) + timedelta(days=6)).isoformat()) if "meals" in cats else None,
            shopping=await shopping.list_items() if "shopping" in cats else None,
        )
    finally:
        current_owner.reset(token)
    if out.appointments:
        out.notes, out.noteBouquets = await viewer_notes(owner_id, uid, [a.id for a in out.appointments if not a.private])
    return out


@router.get("/calendar", response_model=list[FriendCalendar])
async def friends_calendar(request: Request, from_: str = Query(alias="from"), to: str = Query(alias="to")):
    """Every joined planner that shares appointments with you, for the calendar overlay."""
    from routers import appointments

    uid = _uid(request)
    owner_ids = list(dict.fromkeys([m["ownerId"] async for m in raw_db.bouquet_members.find({"viewerId": uid})]))
    out: list[FriendCalendar] = []
    colors = await _colors(uid)
    async for owner in raw_db.users.find({"user_id": {"$in": owner_ids}}, {"_id": 0}).sort("name", 1):
        cats, _, bqs = await _access(owner["user_id"], uid)
        if "appointments" not in cats:
            continue
        token = current_owner.set(owner["user_id"])
        try:
            appts = await appointments.list_appointments(from_=from_, to=to)
        finally:
            current_owner.reset(token)
        out.append(FriendCalendar(owner=_person(owner), appointments=[_mask(a) for a in appts],
                                  bouquetId=bqs[0]["id"] if bqs else None, color=colors.get(owner["user_id"])))
    return out


async def _shopping_owner(owner_id: str, request: Request) -> str:
    _, _, edit = await _owner_for(owner_id, _uid(request))
    if not edit:
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

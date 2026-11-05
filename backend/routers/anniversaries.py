"""Anniversaries: birthdays, anniversaries and your own yearly events, plus holiday sets
(UK, religious, cultural) chosen in Settings. Each event gets a countdown; the morning
briefing mentions events 7 days and 1 day ahead (and on the day)."""

import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from lib.dates import today_iso
from lib.db import current_owner, db, raw_db
from lib.holidays import DEFAULT_SETS, HOLIDAY_SETS, holidays_between

router = APIRouter(prefix="/anniversaries", tags=["anniversaries"])

Kind = Literal["birthday", "anniversary", "event"]
HEADS_UP = (7, 1, 0)
MILESTONE_LEAD = 30  # milestone birthdays/anniversaries get an extra heads-up a month ahead


class GiftIdea(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str = Field(min_length=1, max_length=80)
    bought: bool = False


class AnniversaryIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    kind: Kind = "birthday"
    date: str  # MM-DD (repeats yearly)
    year: int | None = Field(default=None, ge=1900, le=2100)  # birth / wedding year → "turns 30"
    emoji: str = Field(default="", max_length=8)
    gifts: list[GiftIdea] = Field(default_factory=list, max_length=20)  # gift ideas (birthdays)

    @field_validator("date")
    @classmethod
    def _md(cls, v: str) -> str:
        try:
            date.fromisoformat(f"2024-{v}")  # leap year so 02-29 is allowed
        except ValueError:
            raise ValueError("date must be MM-DD")
        return v


class Anniversary(AnniversaryIn):
    id: str


class UpcomingEvent(BaseModel):
    id: str  # custom id, or "holiday:<set>:<date>:<title>"
    title: str
    emoji: str
    kind: Literal["birthday", "anniversary", "event", "holiday"]
    holidaySet: str | None = None
    next: str  # YYYY-MM-DD of the next occurrence
    daysUntil: int
    years: int | None = None  # "turns N" / "N years" on the next occurrence
    custom: Anniversary | None = None  # editable fields (custom events only)
    friend: str | None = None  # user_id when it's a bouquet friend's shared birthday
    milestone: str | None = None  # e.g. "18th", "Big 40", "Silver" — decades + English milestones
    gifts: list[GiftIdea] = Field(default_factory=list)  # your private gift ideas for a friend's birthday
    pool: list["PoolGift"] = Field(default_factory=list)  # the bouquet's shared ideas (never shown to the friend)


class HolidaySetState(BaseModel):
    id: str
    label: str
    group: str
    enabled: bool


class MyBirthday(BaseModel):
    date: str | None = None  # MM-DD; null = not set
    year: int | None = Field(default=None, ge=1900, le=2100)  # birth year → bouquet sees your age
    share: bool = False  # bouquet friends see it in their Anniversaries
    declined: bool = False  # "Don't want to share" — stops the bouquet birthday nudge

    @field_validator("date")
    @classmethod
    def _md(cls, v: str | None) -> str | None:
        if v:
            date.fromisoformat(f"2024-{v}")
        return v or None


class HolidaySetsIn(BaseModel):
    sets: list[str] = Field(max_length=20)


EMOJI = {"birthday": "🎂", "anniversary": "💞", "event": "📅"}
# English milestones on top of every decade: coming of age, plus the traditional anniversary names
BIRTHDAY_MILESTONES = {18: "18th", 21: "21st"}
ANNIVERSARY_NAMES = {1: "Paper", 5: "Wood", 10: "Tin", 20: "China", 25: "Silver", 30: "Pearl", 40: "Ruby",
                     50: "Golden", 60: "Diamond", 65: "Sapphire", 70: "Platinum", 80: "Oak"}


def milestone(kind: str, years: int | None) -> str | None:
    if not years or years < 1:
        return None
    if kind == "birthday":
        return BIRTHDAY_MILESTONES.get(years) or (f"Big {years}" if years % 10 == 0 else None)
    if kind == "anniversary":
        return ANNIVERSARY_NAMES.get(years) or (f"{years}th" if years % 10 == 0 else None)
    return None


def spoken_name(e: "UpcomingEvent") -> str:
    """"Mum turns 60 — a milestone birthday" / "Wedding — 25 years, the Silver anniversary"."""
    if e.kind == "birthday":
        if not e.years:
            return f"{e.title}'s birthday"
        return f"{e.title} turns {e.years}" + (" — a milestone birthday" if e.milestone else "")
    if e.kind == "anniversary" and e.years:
        named = e.milestone if e.milestone in ANNIVERSARY_NAMES.values() else None
        return f"{e.title} — {e.years} year{'s' if e.years != 1 else ''}" + (
            f", the {named} anniversary" if named else " — a milestone" if e.milestone else "")
    return e.title


def _next(md: str, today: date) -> date:
    for y in (today.year, today.year + 1, today.year + 2):
        try:
            d = date.fromisoformat(f"{y}-{md}")
        except ValueError:  # 29 Feb in a non-leap year → 28 Feb
            d = date.fromisoformat(f"{y}-02-28")
        if d >= today:
            return d
    return today


async def _sets() -> list[str]:
    doc = await db.anniversary_prefs.find_one({"id": "prefs"})
    return doc.get("sets", DEFAULT_SETS) if doc else DEFAULT_SETS


async def _friend_birthdays(uid: str) -> list[dict]:
    """Shared birthdays of everyone you share an active bouquet with (owners and members)."""
    from routers.sharing import co_members

    return [u async for u in raw_db.users.find(
        {"user_id": {"$in": await co_members(uid)}, "birthday.share": True, "birthday.date": {"$ne": None}}, {"_id": 0})]


async def upcoming(days: int = 366) -> list[UpcomingEvent]:
    from lib.db import current_owner

    today = date.fromisoformat(today_iso())
    out: list[UpcomingEvent] = []
    friend_gifts = {g["friendId"]: g.get("gifts", []) async for g in db.friend_gifts.find({}, {"_id": 0})}
    me = current_owner.get()
    for u in await _friend_birthdays(me):
        nxt = _next(u["birthday"]["date"], today)
        by = u["birthday"].get("year")
        yrs = nxt.year - by if by else None
        out.append(UpcomingEvent(
            id=f"friend:{u['user_id']}", title=u.get("name", "Friend").split(" ")[0], emoji="🎈", kind="birthday",
            next=nxt.isoformat(), daysUntil=(nxt - today).days, years=yrs, milestone=milestone("birthday", yrs),
            friend=u["user_id"], gifts=[GiftIdea(**g) for g in friend_gifts.get(u["user_id"], [])],
            pool=await _pool(u["user_id"], me)))
    async for a in db.anniversaries.find({}, {"_id": 0}):
        ann = Anniversary(**a)
        nxt = _next(ann.date, today)
        out.append(UpcomingEvent(
            id=ann.id, title=ann.title, emoji=ann.emoji or EMOJI[ann.kind], kind=ann.kind, next=nxt.isoformat(),
            daysUntil=(nxt - today).days, years=(yrs := (nxt.year - ann.year) if ann.year else None),
            milestone=milestone(ann.kind, yrs), custom=ann))
    for h in holidays_between(await _sets(), today, today + timedelta(days=days)):
        out.append(UpcomingEvent(
            id=f"holiday:{h['set']}:{h['date'].isoformat()}:{h['title']}", title=h["title"], emoji=h["emoji"],
            kind="holiday", holidaySet=h["set"], next=h["date"].isoformat(), daysUntil=(h["date"] - today).days))
    out.sort(key=lambda e: (e.daysUntil, e.kind == "holiday", e.title))
    return [e for e in out if e.daysUntil <= days]


def heads_up_line(events: list[UpcomingEvent]) -> str:
    """Briefing sentence for events today, tomorrow and in a week ("" if none)."""
    name = spoken_name
    def gifts(e: UpcomingEvent) -> str:
        todo = [g.text for g in (e.custom.gifts if e.custom else e.gifts) if not g.bought]
        todo += [f"{g.text} (you're buying it)" for g in e.pool if g.claimedByMe]
        todo += [f"{g.text} (you're chipping in £{c.amount:g})" for g in e.pool if not g.claimedByMe for c in g.chipIns if c.mine]
        return f" — gift ideas: {', '.join(todo[:4])}" if todo else ""
    groups = {d: [name(e) + (gifts(e) if d in (7, 1) else "") for e in events if e.daysUntil == d] for d in HEADS_UP}
    month = [name(e) for e in events if is_heads_up(e) and e.daysUntil == MILESTONE_LEAD]
    bits = []
    if groups[0]:
        bits.append(f"Today is {' and '.join(groups[0])}.")
    if groups[1]:
        bits.append(f"Tomorrow: {' and '.join(groups[1])}.")
    if groups[7]:
        bits.append(f"In one week: {' and '.join(groups[7])}.")
    if month:
        bits.append(f"In a month: {' and '.join(month)} — time to start planning.")
    return " ".join(bits)


def is_heads_up(e: UpcomingEvent) -> bool:
    return e.daysUntil in HEADS_UP or (e.daysUntil == MILESTONE_LEAD and bool(e.milestone))


@router.get("", response_model=list[UpcomingEvent])
async def list_upcoming():
    return await upcoming()


@router.get("/heads-up", response_model=list[UpcomingEvent])
async def heads_up():
    """Events today, tomorrow and in exactly one week (for the morning briefing card)."""
    return [e for e in await upcoming(MILESTONE_LEAD + 1) if is_heads_up(e)]


@router.get("/my-birthday", response_model=MyBirthday)
async def get_my_birthday(request: Request):
    u = await raw_db.users.find_one({"user_id": request.state.user["user_id"]}, {"birthday": 1}) or {}
    return MyBirthday(**(u.get("birthday") or {}))


@router.put("/my-birthday", response_model=MyBirthday)
async def put_my_birthday(input: MyBirthday, request: Request):
    await raw_db.users.update_one({"user_id": request.state.user["user_id"]}, {"$set": {"birthday": input.model_dump()}})
    return input


# ---------------------------------------------------------------- bouquet gift pool
# Shared ideas for a friend's birthday, visible to everyone in the bouquets the adder shares
# with that friend — never to the friend. "I'm buying this" claims one so nobody doubles up.


class ChipIn(BaseModel):
    name: str  # first name
    amount: float
    mine: bool = False


class PoolGift(BaseModel):
    id: str
    text: str
    addedBy: str
    mine: bool = False
    claimedBy: str | None = None
    claimedByMe: bool = False
    chipIns: list[ChipIn] = Field(default_factory=list)  # who's putting money towards it, and how much
    chipTotal: float = 0


class ChipInIn(BaseModel):
    amount: float = Field(gt=0, le=10000)


class PoolGiftIn(BaseModel):
    text: str = Field(min_length=1, max_length=80)


def _pool_out(d: dict, me: str) -> PoolGift:
    c = d.get("claimedBy")
    chips = [ChipIn(name=x["name"].split(" ")[0], amount=x["amount"], mine=x["user_id"] == me) for x in d.get("chipIns", [])]
    return PoolGift(id=d["id"], text=d["text"], addedBy=d["addedBy"]["name"].split(" ")[0],
                    mine=d["addedBy"]["user_id"] == me, claimedBy=c["name"].split(" ")[0] if c else None,
                    claimedByMe=bool(c and c["user_id"] == me), chipIns=chips,
                    chipTotal=round(sum(x.amount for x in chips), 2))


async def _common(friend_id: str, me: str) -> list[str]:
    from routers.sharing import shared_bouquets

    return [b["id"] for b, _, _ in await shared_bouquets(friend_id, me)]


async def _pool(friend_id: str, me: str) -> list[PoolGift]:
    if friend_id == me:
        return []
    ids = await _common(friend_id, me)
    docs = await raw_db.gift_pool.find({"friendId": friend_id, "bouquetIds": {"$in": ids}}, {"_id": 0}).sort("createdAt", 1).to_list(100)
    return [_pool_out(d, me) for d in docs]


async def _pool_doc(friend_id: str, gift_id: str, me: str) -> dict:
    ids = await _common(friend_id, me) if friend_id != me else []
    doc = await raw_db.gift_pool.find_one({"id": gift_id, "friendId": friend_id, "bouquetIds": {"$in": ids}}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Gift idea not found")
    return doc


@router.get("/friends/{friend_id}/pool", response_model=list[PoolGift])
async def get_pool(friend_id: str, request: Request):
    return await _pool(friend_id, request.state.user["user_id"])


@router.post("/friends/{friend_id}/pool", response_model=list[PoolGift], status_code=201)
async def add_pool_gift(friend_id: str, input: PoolGiftIn, request: Request):
    me = request.state.user
    if friend_id not in {u["user_id"] for u in await _friend_birthdays(me["user_id"])}:
        raise HTTPException(status_code=404, detail="That friend's birthday isn't shared with you")
    await raw_db.gift_pool.insert_one({
        "id": str(uuid.uuid4()), "friendId": friend_id, "bouquetIds": await _common(friend_id, me["user_id"]),
        "text": input.text.strip(), "addedBy": {"user_id": me["user_id"], "name": me.get("name", "Friend")},
        "claimedBy": None, "createdAt": datetime.now(timezone.utc)})
    return await _pool(friend_id, me["user_id"])


@router.post("/friends/{friend_id}/pool/{gift_id}/claim", response_model=list[PoolGift])
async def claim_pool_gift(friend_id: str, gift_id: str, request: Request):
    """I'm buying this (or un-claim if it's yours)."""
    me = request.state.user
    doc = await _pool_doc(friend_id, gift_id, me["user_id"])
    c = doc.get("claimedBy")
    if c and c["user_id"] != me["user_id"]:
        raise HTTPException(status_code=409, detail=f"{c['name'].split(' ')[0]} is already buying this")
    new = None if c else {"user_id": me["user_id"], "name": me.get("name", "Friend")}
    await raw_db.gift_pool.update_one({"id": gift_id}, {"$set": {"claimedBy": new}})
    return await _pool(friend_id, me["user_id"])


@router.put("/friends/{friend_id}/pool/{gift_id}/chip-in", response_model=list[PoolGift])
async def chip_in(friend_id: str, gift_id: str, input: ChipInIn, request: Request):
    """Join in on a pool gift (or change how much you're putting in)."""
    me = request.state.user
    await _pool_doc(friend_id, gift_id, me["user_id"])
    await raw_db.gift_pool.update_one({"id": gift_id}, {"$pull": {"chipIns": {"user_id": me["user_id"]}}})
    await raw_db.gift_pool.update_one({"id": gift_id}, {"$push": {"chipIns": {
        "user_id": me["user_id"], "name": me.get("name", "Friend"), "amount": round(input.amount, 2)}}})
    return await _pool(friend_id, me["user_id"])


@router.delete("/friends/{friend_id}/pool/{gift_id}/chip-in", response_model=list[PoolGift])
async def leave_chip_in(friend_id: str, gift_id: str, request: Request):
    me = request.state.user["user_id"]
    await _pool_doc(friend_id, gift_id, me)
    await raw_db.gift_pool.update_one({"id": gift_id}, {"$pull": {"chipIns": {"user_id": me}}})
    return await _pool(friend_id, me)


@router.delete("/friends/{friend_id}/pool/{gift_id}", response_model=list[PoolGift])
async def delete_pool_gift(friend_id: str, gift_id: str, request: Request):
    me = request.state.user["user_id"]
    doc = await _pool_doc(friend_id, gift_id, me)
    if doc["addedBy"]["user_id"] != me:
        raise HTTPException(status_code=403, detail="Only the person who added it can remove it")
    await raw_db.gift_pool.delete_one({"id": gift_id})
    return await _pool(friend_id, me)


class FriendGiftsIn(BaseModel):
    gifts: list[GiftIdea] = Field(default_factory=list, max_length=20)


@router.put("/friends/{friend_id}/gifts", response_model=list[GiftIdea])
async def put_friend_gifts(friend_id: str, input: FriendGiftsIn):
    """Your own (private) gift list for a bouquet friend's shared birthday."""
    if friend_id not in {u["user_id"] for u in await _friend_birthdays(current_owner.get())}:
        raise HTTPException(status_code=404, detail="That friend's birthday isn't shared with you")
    gifts = [g.model_dump() for g in input.gifts]
    await db.friend_gifts.update_one({"friendId": friend_id}, {"$set": {"gifts": gifts}}, upsert=True)
    return input.gifts


@router.get("/holiday-sets", response_model=list[HolidaySetState])
async def get_sets():
    on = set(await _sets())
    return [HolidaySetState(id=k, label=v["label"], group=v["group"], enabled=k in on) for k, v in HOLIDAY_SETS.items()]


@router.put("/holiday-sets", response_model=list[HolidaySetState])
async def put_sets(input: HolidaySetsIn):
    sets = [s for s in dict.fromkeys(input.sets) if s in HOLIDAY_SETS]
    await db.anniversary_prefs.update_one({"id": "prefs"}, {"$set": {"sets": sets}}, upsert=True)
    return await get_sets()


@router.post("", response_model=Anniversary, status_code=201)
async def create(input: AnniversaryIn):
    doc = {"id": str(uuid.uuid4()), **input.model_dump(), "createdAt": datetime.now(timezone.utc)}
    await db.anniversaries.insert_one(doc)
    return Anniversary(**doc)


@router.put("/{aid}", response_model=Anniversary)
async def update(aid: str, input: AnniversaryIn):
    res = await db.anniversaries.update_one({"id": aid}, {"$set": input.model_dump()})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Event not found")
    return Anniversary(id=aid, **input.model_dump())


@router.delete("/{aid}")
async def delete(aid: str):
    res = await db.anniversaries.delete_one({"id": aid})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


UpcomingEvent.model_rebuild()

"""Premium — MOCKED paywall. Checkout flips Premium on without charging anything; it is
the place to plug in Stripe later. Premium unlocks AI voice, per-appointment travel modes,
live-location commutes and more than 2 bouquets."""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter

from lib.dates import today_iso
from lib.db import db, raw_db
from models.premium import CheckoutIn, PremiumPrice, PremiumState

router = APIRouter(prefix="/premium", tags=["premium"])

FREE_BOUQUETS = 2
PRICES = [
    PremiumPrice(plan="monthly", label="£2.99 / month", amount=2.99),
    PremiumPrice(plan="yearly", label="£24.99 / year", amount=24.99),
]


async def is_premium(owner_id: str) -> bool:
    doc = await raw_db.settings.find_one({"ownerId": owner_id, "id": "app"}, {"premiumVoice": 1})
    return bool(doc and doc.get("premiumVoice"))


async def _state() -> PremiumState:
    doc = await db.settings.find_one({"id": "app"}) or {}
    active = bool(doc.get("premiumVoice"))
    plan = doc.get("premiumPlan") if active else None
    since = doc.get("premiumSince") if active else None
    renews = None
    if active and since:
        start = date.fromisoformat(since)
        renews = (start + timedelta(days=365 if plan == "yearly" else 30)).isoformat()
    return PremiumState(active=active, plan=plan, since=since, renewsOn=renews, prices=PRICES,
                        freeBouquets=FREE_BOUQUETS)


@router.get("", response_model=PremiumState)
async def get_premium():
    return await _state()


@router.post("/checkout", response_model=PremiumState)
async def checkout(input: CheckoutIn):
    """MOCKED: no payment provider yet — records the plan and turns Premium on."""
    await db.settings.update_one(
        {"id": "app"},
        {"$set": {"premiumVoice": True, "premiumPlan": input.plan, "premiumSince": today_iso(),
                  "premiumCardLast4": input.cardLast4, "updatedAt": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return await _state()


@router.post("/cancel", response_model=PremiumState)
async def cancel():
    await db.settings.update_one(
        {"id": "app"}, {"$set": {"premiumVoice": False, "updatedAt": datetime.now(timezone.utc)},
                        "$unset": {"premiumPlan": "", "premiumSince": "", "premiumCardLast4": ""}},
    )
    return await _state()

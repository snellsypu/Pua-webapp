"""Premium — real Stripe subscriptions (claimable sandbox, test mode for now).

Plans £4.99/month and £50/year live in Stripe (setup_stripe.py, looked up by
lookup_key). Checkout → Stripe-hosted page → /payment/success polls /premium/status/{id};
the webhook (/api/stripe/webhook) and the status poll both activate Premium idempotently.
Premium unlocks AI voice, per-appointment travel modes, live-location commutes, more than
FREE_BOUQUETS bouquets and bouquets bigger than FREE_GROUP_SIZE people."""

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request

from lib.db import db, raw_db
from models.premium import CheckoutIn, CheckoutOut, PaymentStatus, PremiumPrice, PremiumState

logger = logging.getLogger(__name__)
router = APIRouter(tags=["premium"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY") or "sk_test_emergent"
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
TAX_MODE = "full"  # digital subscription in an SMP country → Stripe manages tax

FREE_BOUQUETS = 1
FREE_GROUP_SIZE = 6  # people per bouquet including its owner
PRICES = [
    PremiumPrice(plan="monthly", label="£4.99 / month", amount=4.99),
    PremiumPrice(plan="yearly", label="£50 / year", amount=50.0),
]
LOOKUP = {"monthly": "pua_premium_monthly", "yearly": "pua_premium_yearly"}


async def is_premium(owner_id: str) -> bool:
    doc = await raw_db.settings.find_one({"ownerId": owner_id, "id": "app"}, {"premiumVoice": 1})
    return bool(doc and doc.get("premiumVoice"))


async def _activate(tx: dict, subscription_id: str | None) -> None:
    """Paid → mark the transaction and switch the buyer's Premium on (idempotent)."""
    res = await raw_db.payment_transactions.update_one(
        {"session_id": tx["session_id"], "payment_status": {"$ne": "paid"}},
        {"$set": {"status": "completed", "payment_status": "paid", "stripe_subscription_id": subscription_id,
                  "updated_at": datetime.now(timezone.utc)}},
    )
    if not res.modified_count:
        return
    await raw_db.settings.update_one(
        {"ownerId": tx["user_id"], "id": "app"},
        {"$set": {"premiumVoice": True, "premiumPlan": tx["plan"], "premiumSince": date.today().isoformat(),
                  "stripeSubscriptionId": subscription_id, "updatedAt": datetime.now(timezone.utc)}},
        upsert=True,
    )
    logger.info("premium on for %s (%s)", tx["user_id"], tx["plan"])


async def _state() -> PremiumState:
    doc = await db.settings.find_one({"id": "app"}) or {}
    active = bool(doc.get("premiumVoice"))
    plan = doc.get("premiumPlan") if active else None
    since = doc.get("premiumSince") if active else None
    renews = None
    if active and since:
        renews = (date.fromisoformat(since) + timedelta(days=365 if plan == "yearly" else 30)).isoformat()
    return PremiumState(active=active, plan=plan, since=since, renewsOn=renews, demo=False, testMode=True,
                        prices=PRICES, freeBouquets=FREE_BOUQUETS, freeGroupSize=FREE_GROUP_SIZE)


@router.get("/premium", response_model=PremiumState)
async def get_premium():
    return await _state()


@router.post("/premium/checkout", response_model=CheckoutOut)
async def checkout(input: CheckoutIn, request: Request):
    user = request.state.user
    prices = (await asyncio.to_thread(stripe.Price.list, lookup_keys=[LOOKUP[input.plan]], active=True, limit=1)).data
    if not prices:
        raise HTTPException(status_code=500, detail="Premium price not set up")
    price = prices[0]
    origin = input.origin_url.rstrip("/")
    kwargs = dict(
        line_items=[{"price": price.id, "quantity": 1}],
        mode="subscription",
        success_url=f"{origin}/payment/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{origin}/payment/cancel",
        customer_email=user.get("email") or None,
        metadata={"user_id": user["user_id"], "plan": input.plan},
    )
    try:
        session = await asyncio.to_thread(stripe.checkout.Session.create, **kwargs, managed_payments={"enabled": True})
    except stripe.error.InvalidRequestError as e:
        msg = (e.user_message or str(e)).lower()
        if "managed payments" not in msg and "ineligible" not in msg and "managed_payments" not in msg:
            raise
        session = await asyncio.to_thread(stripe.checkout.Session.create, **kwargs,
                                          automatic_tax={"enabled": True}, billing_address_collection="required")
    await raw_db.payment_transactions.insert_one({
        "session_id": session.id, "user_id": user["user_id"], "plan": input.plan, "lookup_key": LOOKUP[input.plan],
        "amount": (price.unit_amount or 0) / 100, "currency": price.currency,
        "status": "initiated", "payment_status": "pending",
        "created_at": datetime.now(timezone.utc), "updated_at": datetime.now(timezone.utc),
    })
    return CheckoutOut(checkout_url=session.url, session_id=session.id)


@router.get("/premium/status/{session_id}", response_model=PaymentStatus)
async def payment_status(session_id: str, request: Request):
    tx = await raw_db.payment_transactions.find_one({"session_id": session_id, "user_id": request.state.user["user_id"]})
    if not tx:
        raise HTTPException(status_code=404, detail="Payment not found")
    if tx.get("payment_status") != "paid":
        try:
            s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
            if s.payment_status == "paid" or s.status == "complete":
                await _activate(tx, s.subscription)
            elif s.status == "expired":
                await raw_db.payment_transactions.update_one(
                    {"session_id": session_id}, {"$set": {"status": "expired", "payment_status": "expired"}})
            tx = await raw_db.payment_transactions.find_one({"session_id": session_id})
        except stripe.error.StripeError:
            pass
    return PaymentStatus(session_id=session_id, status=tx["status"], payment_status=tx["payment_status"])


@router.post("/premium/cancel", response_model=PremiumState)
async def cancel():
    doc = await db.settings.find_one({"id": "app"}) or {}
    sub = doc.get("stripeSubscriptionId")
    if sub:
        try:
            await asyncio.to_thread(stripe.Subscription.cancel, sub)
        except stripe.error.StripeError as e:
            logger.warning("cancel %s: %s", sub, e)
    await db.settings.update_one(
        {"id": "app"}, {"$set": {"premiumVoice": False, "updatedAt": datetime.now(timezone.utc)},
                        "$unset": {"premiumPlan": "", "premiumSince": "", "stripeSubscriptionId": ""}},
    )
    return await _state()


@router.post("/stripe/webhook")  # public (see lib/auth.PUBLIC_PATHS); verified by signature
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, request.headers.get("stripe-signature", ""), WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid signature")
    obj, t = event["data"]["object"], event["type"]
    if t in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        tx = await raw_db.payment_transactions.find_one({"session_id": obj["id"]})
        if tx and (obj.get("payment_status") == "paid" or obj.get("status") == "complete"):
            await _activate(tx, obj.get("subscription"))
    elif t in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        await raw_db.payment_transactions.update_one(
            {"session_id": obj["id"]}, {"$set": {"status": "failed" if "failed" in t else "expired",
                                                 "payment_status": "failed" if "failed" in t else "expired"}})
    elif t == "customer.subscription.deleted":
        await raw_db.settings.update_many(
            {"stripeSubscriptionId": obj["id"]},
            {"$set": {"premiumVoice": False}, "$unset": {"premiumPlan": "", "premiumSince": "", "stripeSubscriptionId": ""}})
    return {"status": "ok"}

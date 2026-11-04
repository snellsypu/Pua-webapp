"""Push subscription endpoints + the platform-cron routine notifier.

The cron (.emergent/crons.yml, every 5 min) also sends the wake-up push, and POSTs /api/cron/routines. For each
routine with notifications on, if its time (in settings.timezone) passed within
the last hour and it hasn't been notified today, send one push — unless the
routine is already complete."""

import hmac
import logging
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request
from pymongo.errors import DuplicateKeyError

from lib import push as push_lib
from lib.db import db
from lib.dates import today_iso, wake_time_for
from models.push import PushPublicKey, PushSendResult, PushStatus, PushSubscriptionIn
from routers.routines import ensure_routines, routine_state

router = APIRouter(tags=["push"])
logger = logging.getLogger(__name__)

WINDOW = timedelta(minutes=60)  # a 15-min cron always lands inside this window


@router.get("/push/public-key", response_model=PushPublicKey)
async def get_public_key():
    key = push_lib.public_key()
    if not key:
        raise HTTPException(status_code=503, detail="Push is not configured")
    return PushPublicKey(publicKey=key)


@router.get("/push/status", response_model=PushStatus)
async def push_status():
    return PushStatus(subscriptions=await db.push_subscriptions.count_documents({}))


@router.post("/push/subscribe", response_model=PushStatus, status_code=201)
async def subscribe(sub: PushSubscriptionIn):
    doc = sub.model_dump(mode="json")
    await db.push_subscriptions.update_one({"endpoint": doc["endpoint"]}, {"$set": doc}, upsert=True)
    return PushStatus(subscriptions=await db.push_subscriptions.count_documents({}))


@router.delete("/push/subscribe", response_model=PushStatus)
async def unsubscribe(endpoint: str = Query(min_length=10)):
    await db.push_subscriptions.delete_one({"endpoint": endpoint})
    return PushStatus(subscriptions=await db.push_subscriptions.count_documents({}))


@router.post("/push/test", response_model=PushSendResult)
async def send_test():
    return await push_lib.send_to_all(
        "PUA notifications are on 🔔",
        "Your morning and bedtime routine reminders will arrive here.",
        url="/",
        tag="daily-loop-test",
    )


async def _maybe_wake(settings: dict, now_local: datetime, local_date: str) -> None:
    """Wake-up push at settings.wakeTime; tapping it opens PUA, which reads the morning out."""
    if not settings.get("wakeNotify") or settings.get("lastWakeNotifiedDate") == local_date:
        return
    hh, mm = (int(p) for p in wake_time_for(settings, local_date).split(":"))
    scheduled = now_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if not (timedelta(0) <= now_local - scheduled < WINDOW):
        return
    claimed = await db.settings.update_one(
        {"id": "app", "lastWakeNotifiedDate": {"$ne": local_date}},
        {"$set": {"lastWakeNotifiedDate": local_date}},
    )
    if not claimed.modified_count:
        return
    result = await push_lib.send_to_all(
        "Good morning ☀️", "Tap and PUA will read today's weather and your first routine step.",
        url="/overview?wake=1", tag="wake-up",
    )
    logger.info("wake push: %s", result.model_dump())


async def run_routine_notifications() -> None:
    settings = await db.settings.find_one({"id": "app"}) or {}
    try:
        tz = ZoneInfo(settings.get("timezone") or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = datetime.now(tz)
    local_date = now_local.strftime("%Y-%m-%d")
    await _maybe_wake(settings, now_local, local_date)
    for doc in await ensure_routines():
        if not doc.get("notify") or doc.get("lastNotifiedDate") == local_date:
            continue
        hh, mm = (int(p) for p in doc.get("time", "07:00").split(":"))
        scheduled = now_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if not (timedelta(0) <= now_local - scheduled < WINDOW):
            continue
        state = await routine_state(doc, today_iso())
        # Claim the day first so overlapping cron runs can't double-send.
        claimed = await db.routines.update_one(
            {"kind": doc["kind"], "lastNotifiedDate": {"$ne": local_date}},
            {"$set": {"lastNotifiedDate": local_date}},
        )
        if not claimed.modified_count or state.complete:
            continue
        remaining = [s.text for s in state.steps if s.id not in state.doneStepIds]
        body = f"{len(state.doneStepIds)}/{len(state.steps)} done"
        if remaining:
            body += " · next: " + ", ".join(remaining[:3])
        result = await push_lib.send_to_all(
            state.title,
            body,
            # bedtime: tapping opens tomorrow's review and reads it out
            url="/overview?view=today" if doc["kind"] == "morning" else "/overview?bedtime=1",
            tag=f"routine-{doc['kind']}",
        )
        logger.info("routine push %s: %s", doc["kind"], result.model_dump())


@router.post("/cron/routines", status_code=202)
async def cron_routines(
    request: Request,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
    x_webhook_id: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else ""
    if not secret or not token or not hmac.compare_digest(token.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="unauthorized")
    try:
        envelope = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid body") from exc
    if not isinstance(envelope, dict):
        raise HTTPException(status_code=400, detail="invalid body")
    run_id = x_webhook_id or envelope.get("run_id")
    if run_id:
        try:
            await db.cron_runs.insert_one({"runId": str(run_id), "at": datetime.now(ZoneInfo("UTC"))})
        except DuplicateKeyError:
            return {"accepted": True, "duplicate": True}
    background_tasks.add_task(run_routine_notifications)
    return {"accepted": True}

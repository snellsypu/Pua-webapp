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


async def _leave_alerts(settings: dict, now_local: datetime) -> None:
    """'Time to leave' push ~5 min before each appointment's leave-by time (commute from the
    home address; rain-aware). One alert per appointment per day (appointments.leaveAlertDate)."""
    if not settings.get("leaveAlerts") or not settings.get("homeAddress"):
        return
    from lib.briefing import plan_commute, spoken_time
    from lib.travel import MODE_WORDS, _minus

    today = today_iso()
    now = now_local.strftime("%H:%M")
    horizon = (now_local + timedelta(hours=4)).strftime("%H:%M") if now_local.hour < 20 else "23:59"
    appts = await db.appointments.find({
        "date": today, "startTime": {"$gt": now, "$lte": horizon},
        "location": {"$nin": ["", None]}, "leaveAlertDate": {"$ne": today},
    }).sort("startTime", 1).to_list(20)
    for a in appts:
        plan = await plan_commute(settings, a, None)
        if not isinstance(plan, dict):
            continue
        leave_by = plan["rain"]["leaveBy"] if plan["rain"] else plan["leaveBy"]
        earliest = min(plan["leaveBy"], leave_by)
        if now < _minus(earliest, 5):
            continue
        claimed = await db.appointments.update_one(
            {"id": a["id"], "leaveAlertDate": {"$ne": today}}, {"$set": {"leaveAlertDate": today}}
        )
        if not claimed.modified_count:
            continue
        body = (f"{a['title']} at {spoken_time(a['startTime'])} — about {plan['minutes']} min "
                f"{MODE_WORDS[plan['mode']]}, leave by {spoken_time(plan['leaveBy'])}.")
        if plan["rain"]:
            body += f" Heavy rain likely — driving is ~{plan['rain']['minutes']} min."
        result = await push_lib.send_to_all("Time to leave 🚶", body, url="/overview?view=today", tag=f"leave-{a['id']}")
        logger.info("leave alert %s: %s", a["id"], result.model_dump())


async def _run_reminder(settings: dict, now_local: datetime) -> None:
    """Push 15 min before the planned best run time, once a day (settings.lastRunReminderDate)."""
    if not settings.get("runReminders"):
        return
    today = today_iso()
    if settings.get("lastRunReminderDate") == today:
        return
    from lib.briefing import spoken_time
    from lib.runplan import build_run_plan

    plan = await build_run_plan()
    now = now_local.strftime("%H:%M")
    if not plan or not (plan["remindAt"] <= now < plan["time"]):
        return
    claimed = await db.settings.update_one(
        {"id": "app", "lastRunReminderDate": {"$ne": today}}, {"$set": {"lastRunReminderDate": today}}
    )
    if not claimed.modified_count:
        return
    body = f"Best time for {plan['habitName'].lower()}: {spoken_time(plan['time'])} — {plan['reason']}."
    result = await push_lib.send_to_all("Run time 🏃", body, url="/habits", tag="run-plan")
    logger.info("run reminder: %s", result.model_dump())


async def run_routine_notifications() -> None:
    """Cron: run every signed-up user's notifications inside their own planner scope."""
    from lib.db import current_owner, raw_db

    async for u in raw_db.users.find({"onboarded": True}, {"user_id": 1}):
        token = current_owner.set(u["user_id"])
        try:
            await _run_for_owner()
        except Exception:
            logger.exception("notifications failed for %s", u["user_id"])
        finally:
            current_owner.reset(token)


async def _anniversary_alert(now_local: datetime, local_date: str) -> None:
    """Once a day at the morning routine time: push events 1 week and 1 day away (+ gift ideas)."""
    from routers.anniversaries import spoken_name, upcoming

    routine = await db.routines.find_one({"kind": "morning"}) or {}
    hh, mm = (int(p) for p in (routine.get("time") or "07:00").split(":"))
    scheduled = now_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
    if now_local < scheduled or now_local.hour >= 21:
        return
    prefs = await db.anniversary_prefs.find_one({"id": "prefs"}) or {}
    if prefs.get("lastAlertDate") == local_date:
        return
    events = [e for e in await upcoming(8) if e.daysUntil in (7, 1)]
    claimed = await db.anniversary_prefs.update_one(
        {"id": "prefs", "lastAlertDate": {"$ne": local_date}}, {"$set": {"lastAlertDate": local_date}}, upsert=True)
    if not (claimed.modified_count or claimed.upserted_id) or not events:
        return
    def line(e) -> str:
        n = spoken_name(e)
        todo = [g.text for g in (e.custom.gifts if e.custom else []) if not g.bought]
        return f"{'Tomorrow' if e.daysUntil == 1 else 'In 1 week'}: {n}" + (f" (gifts: {', '.join(todo[:3])})" if todo else "")
    result = await push_lib.send_to_all("Coming up 🎂", " · ".join(line(e) for e in events[:4]), url="/anniversaries", tag="anniversaries")
    logger.info("anniversary push: %s", result.model_dump())


async def _run_for_owner() -> None:
    settings = await db.settings.find_one({"id": "app"}) or {}
    try:
        tz = ZoneInfo(settings.get("timezone") or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    now_local = datetime.now(tz)
    local_date = now_local.strftime("%Y-%m-%d")
    await _maybe_wake(settings, now_local, local_date)
    try:
        await _leave_alerts(settings, now_local)
    except Exception:
        logger.exception("leave alerts failed")
    try:
        await _run_reminder(settings, now_local)
    except Exception:
        logger.exception("run reminder failed")
    try:
        await _anniversary_alert(now_local, local_date)
    except Exception:
        logger.exception("anniversary alert failed")
    try:
        from lib.duolingo import sync_duolingo

        await sync_duolingo(local_date)
    except Exception:
        logger.exception("duolingo sync failed")
    try:
        from routers.strava import sync_strava

        await sync_strava()
    except Exception:
        logger.exception("strava sync failed")
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

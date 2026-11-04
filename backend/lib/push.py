"""Web Push sender (VAPID via pywebpush). pywebpush is synchronous, so each send
runs in a worker thread. Expired subscriptions (404/410) are deleted."""

import asyncio
import json
import logging
import os

from pywebpush import WebPushException, webpush

from lib.db import db
from models.push import PushSendResult

logger = logging.getLogger(__name__)


def public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY", "")


def _send_sync(sub: dict, payload: str) -> int | None:
    """None = delivered; otherwise the push service's status (0 = network error)."""
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=payload,
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:admin@example.com")},
            ttl=3600,
            timeout=10,
        )
        return None
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else 0
    except Exception:  # network/DNS/timeouts — keep the subscription, retry next run
        logger.exception("web push send failed")
        return 0


async def send_to_all(title: str, body: str, url: str = "/", tag: str = "pua") -> PushSendResult:
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    sent = removed = failed = 0
    subs = await db.push_subscriptions.find().to_list(500)
    for sub in subs:
        code = await asyncio.to_thread(_send_sync, sub, payload)
        if code is None:
            sent += 1
        elif code in (404, 410):  # push service forgot this endpoint — clean up
            await db.push_subscriptions.delete_one({"endpoint": sub["endpoint"]})
            removed += 1
        else:
            failed += 1
    return PushSendResult(sent=sent, removed=removed, failed=failed)

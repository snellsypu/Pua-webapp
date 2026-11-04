"""Server-side date helpers. The pod clock is UTC — anchor "today" here, never in the browser."""

import os
from datetime import datetime
from zoneinfo import ZoneInfo


def today_iso(tz: str | None = None) -> str:
    """Today's date as YYYY-MM-DD in `tz` (default: APP_TZ env, else UTC)."""
    zone = tz or os.environ.get("APP_TZ", "UTC")
    return datetime.now(ZoneInfo(zone)).strftime("%Y-%m-%d")


def wake_time_for(settings: dict, iso_date: str) -> str:
    """Wake-up time for a date: the weekend time on Sat/Sun when one is set."""
    from datetime import date

    weekend = date.fromisoformat(iso_date).weekday() >= 5
    if weekend and settings.get("weekendWakeTime"):
        return settings["weekendWakeTime"]
    return settings.get("wakeTime") or "07:00"

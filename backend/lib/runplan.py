"""Run time planner: picks the best hour left today for the running (distance-tracking)
habit — between wake-up and an hour before the bedtime routine, avoiding appointments
(30 min before / 15 min after), scored on rain chance, wind, temperature and daylight."""

from lib import weather as weather_lib
from lib.briefing import _local_now, spoken_time
from lib.dates import today_iso, wake_time_for
from lib.db import db

RUN_MIN = 45  # a run + changing
IDEAL_C = 12


def _m(hhmm: str) -> int:
    return int(hhmm[:2]) * 60 + int(hhmm[3:5])


def _hhmm(m: int) -> str:
    m = max(0, min(m, 23 * 60 + 59))
    return f"{m // 60:02d}:{m % 60:02d}"


async def build_run_plan() -> dict | None:
    habit = await db.habits.find_one({"tracksDistance": True}, sort=[("createdAt", 1)])
    if not habit:
        return None
    today = today_iso()
    if await db.habit_completions.find_one({"habitId": habit["id"], "date": today}):
        return None  # already ran today
    settings = await db.settings.find_one({"id": "app"}) or {}
    home = settings.get("home")
    if not home:
        return None
    units = settings.get("units", "celsius")
    try:
        hours = await weather_lib.get_hourly_days(home["latitude"], home["longitude"], units)
    except Exception:
        return None

    now = _local_now(settings)
    now_m = now.hour * 60 + now.minute
    bedtime = await db.routines.find_one({"kind": "bedtime"}) or {}
    start_m = max(now_m + 10, _m(wake_time_for(settings, today)))
    start_m = (start_m + 4) // 5 * 5  # tidy start times
    end_m = _m(bedtime.get("time", "22:00")) - 60 - RUN_MIN

    appts = await db.appointments.find({"date": today}).sort("startTime", 1).to_list(50)
    busy = []
    for a in appts:
        s = _m(a["startTime"])
        e = _m(a["endTime"]) if a.get("endTime") else s + 60
        busy.append((s - 30, e + 15, a))

    local_date = now.strftime("%Y-%m-%d")
    best = None
    for h in hours:
        if h["date"] != local_date:
            continue
        t = _m(h["time"])
        if t < start_m - 59 or t > end_m:  # the current hour counts if there's time left in it
            continue
        t = max(t, start_m)
        if t > end_m or any(s < t + RUN_MIN and t < e for s, e, _ in busy):
            continue
        temp_c = h["temperature"] if units == "celsius" else (h["temperature"] - 32) * 5 / 9
        score = (h["precipProb"] * 1.2 + max(0.0, h["windSpeed"] - 15) * 1.5
                 + abs(temp_c - IDEAL_C) * 0.8 + (0 if h["isDay"] else 25) + (t - start_m) / 120)
        if best is None or score < best[0]:
            best = (score, t, h)
    if not best:
        return None
    _, t, h = best
    bits = ["dry" if h["precipProb"] < 20 else f"{round(h['precipProb'])}% chance of rain",
            "light wind" if h["windSpeed"] < 20 else f"breezy ({round(h['windSpeed'])} km/h)"]
    if not h["isDay"]:
        bits.append("after dark — wear something bright")
    nxt = next((a for s, _, a in busy if s >= t + RUN_MIN), None)
    if nxt:
        bits.append(f"free before your {spoken_time(nxt['startTime'])} {nxt['title']}")
    return {
        "habitId": habit["id"], "habitName": habit["name"], "time": _hhmm(t),
        "temperature": h["temperature"], "precipProb": h["precipProb"], "windSpeed": h["windSpeed"],
        "isDay": h["isDay"], "reason": ", ".join(bits), "remindAt": _hhmm(t - 15),
    }

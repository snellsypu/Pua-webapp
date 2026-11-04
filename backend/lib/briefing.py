"""Spoken "what's my day?" briefing: weather at home, today's appointments and
reminders, routine progress and habits — composed as plain sentences for speech."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from lib import weather as weather_lib
from lib.db import db
from lib.dates import today_iso

WEATHER_WORDS = {
    0: "clear skies", 1: "mostly clear skies", 2: "partly cloudy skies", 3: "overcast skies",
    45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    56: "freezing drizzle", 57: "freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
    66: "freezing rain", 67: "freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
    77: "snow grains", 80: "rain showers", 81: "rain showers", 82: "heavy showers",
    85: "snow showers", 86: "heavy snow showers", 95: "thunderstorms", 96: "thunderstorms with hail",
    99: "thunderstorms with hail",
}


def spoken_time(hhmm: str | None) -> str:
    if not hhmm:
        return ""
    h, m = (int(x) for x in hhmm.split(":"))
    if h == 0 and m == 0:
        return "midnight"
    if h == 12 and m == 0:
        return "noon"
    suffix = "AM" if h < 12 else "PM"
    h12 = h % 12 or 12
    return f"{h12} {suffix}" if m == 0 else f"{h12}:{m:02d} {suffix}"


def _ordinal(n: int) -> str:
    return f"{n}{'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def _join(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


async def build_briefing() -> str:
    settings = await db.settings.find_one({"id": "app"}) or {}
    tz = settings.get("timezone") or "UTC"
    try:
        hour = datetime.now(ZoneInfo(tz)).hour
    except Exception:
        hour = datetime.utcnow().hour
    today = today_iso()
    d = date.fromisoformat(today)
    greet = "Good morning" if hour < 12 else "Good afternoon" if hour < 18 else "Good evening"
    out = [f"{greet}! Here's your {d.strftime('%A')}, {d.strftime('%B')} {_ordinal(d.day)}."]

    home = settings.get("home")
    if home:
        try:
            units = settings.get("units", "celsius")
            wb = await weather_lib.get_bundle(home["latitude"], home["longitude"], units)
            day = next((x for x in wb.days if x.date == today), wb.days[0] if wb.days else None)
            line = (f"In {home['name']} it's {round(wb.now.temperature)} degrees with "
                    f"{WEATHER_WORDS.get(wb.now.code, 'mixed weather')}")
            if day:
                line += f", heading for a high of {round(day.tempMax)}"
                if day.precipProb >= 20:
                    line += f" and a {round(day.precipProb)} percent chance of rain"
            out.append(line + ".")
        except Exception:
            out.append("I couldn't reach the weather service just now.")
    else:
        out.append("Set a home city in Settings and I'll include the weather.")

    appts = await db.appointments.find({"date": today}).sort("startTime", 1).to_list(50)
    if appts:
        bits = []
        for a in appts[:6]:
            s = f"{a['title']} at {spoken_time(a.get('startTime'))}"
            if a.get("location"):
                s += f" at {a['location']}"
            bits.append(s)
        out.append(f"You have {_plural(len(appts), 'appointment')}: {_join(bits)}.")
    else:
        out.append("No appointments today.")

    rems = [r for r in await db.reminders.find({"date": today}).sort("time", 1).to_list(50) if not r.get("done")]
    if rems:
        bits = [f"{r['title']} at {spoken_time(r.get('time'))}" for r in rems[:6]]
        out.append(f"{_plural(len(rems), 'reminder').capitalize()}: {_join(bits)}.")

    for r in sorted(await db.routines.find().to_list(10), key=lambda x: x["kind"] != "morning"):
        steps = {s["id"] for s in r.get("steps", [])}
        if not steps:
            continue
        check = await db.routine_checks.find_one({"kind": r["kind"], "date": today}) or {}
        done = len(set(check.get("doneStepIds", [])) & steps)
        name = "Morning routine" if r["kind"] == "morning" else "Bedtime routine"
        state = "all done" if done == len(steps) else "not started" if done == 0 else f"{done} of {len(steps)} done"
        out.append(f"{name}: {state}.")

    habits = await db.habits.find().to_list(100)
    if habits:
        done_ids = {c["habitId"] for c in await db.habit_completions.find({"date": today}).to_list(500)}
        n_done = sum(1 for h in habits if h["id"] in done_ids)
        left = [h["name"] for h in habits if h["id"] not in done_ids]
        if not left:
            out.append("Every habit is ticked off. Nice work!")
        else:
            out.append(f"Habits: {n_done} of {len(habits)} done" + (f" — still to do: {_join(left[:4])}." if left else "."))
    return " ".join(out)

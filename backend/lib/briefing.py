"""Spoken "what's my day?" briefing: weather at home, today's appointments and
reminders, routine progress and habits — composed as plain sentences for speech."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from lib import travel
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


async def _weather_line(settings: dict, today: str) -> str:
    home = settings.get("home")
    if not home:
        return "Set a home city in Settings and I'll include the weather."
    try:
        wb = await weather_lib.get_bundle(home["latitude"], home["longitude"], settings.get("units", "celsius"))
    except Exception:
        return "I couldn't reach the weather service just now."
    day = next((x for x in wb.days if x.date == today), wb.days[0] if wb.days else None)
    line = (f"In {home['name']} it's {round(wb.now.temperature)} degrees with "
            f"{WEATHER_WORDS.get(wb.now.code, 'mixed weather')}")
    if day:
        line += f", heading for a high of {round(day.tempMax)}"
        if day.precipProb >= 20:
            line += f" and a {round(day.precipProb)} percent chance of rain"
            if day.precipProb >= 50:
                line += ", so take an umbrella"
    return line + "."


def _local_now(settings: dict) -> datetime:
    try:
        return datetime.now(ZoneInfo(settings.get("timezone") or "UTC"))
    except Exception:
        return datetime.now(ZoneInfo("UTC"))


def _origin(settings: dict, live: tuple[float, float] | None) -> tuple[tuple[float, float] | None, str]:
    """Commute start: live phone location (Premium + switch on) or the home address."""
    if live and settings.get("premiumVoice") and settings.get("liveLocation"):
        return live, "from where you are"
    addr = settings.get("homeAddress")
    if addr:
        return (addr["latitude"], addr["longitude"]), "from home"
    return None, ""


def _mode(settings: dict, appt: dict) -> str:
    if settings.get("premiumVoice") and appt.get("travelMode") in travel.ROUTERS:
        return appt["travelMode"]
    return settings.get("travelMode") if settings.get("travelMode") in travel.ROUTERS else "car"


async def commute_sentence(settings: dict, appt: dict, live: tuple[float, float] | None, now_hhmm: str | None) -> str:
    """'It's about 18 minutes by car from home — leave by 1:32 PM.' (or a hint / '')."""
    if not (appt.get("location") or "").strip():
        return ""
    origin, from_words = _origin(settings, live)
    if not origin:
        return "Add your home address in Settings and I'll tell you when to leave."
    c = await travel.commute(appt, origin, _mode(settings, appt))
    if not c:
        return f"I couldn't find {appt['location']} on the map for a travel time."
    leave = "leave now" if now_hhmm and c["leaveBy"] <= now_hhmm else f"leave by {spoken_time(c['leaveBy'])}"
    m = c["minutes"]
    dur = _plural(m, "minute") if m < 60 else _plural(m // 60, "hour") + (f" {_plural(m % 60, 'minute')}" if m % 60 else "")
    return f"It's about {dur} {travel.MODE_WORDS[c['mode']]} {from_words} — {leave}."


def _appt_phrase(a: dict) -> str:
    s = f"{a['title']} at {spoken_time(a.get('startTime'))}"
    return s + (f" at {a['location']}" if a.get("location") else "")


async def build_wake(live: tuple[float, float] | None = None) -> str:
    """Read after the wake-up alarm: weather, first open routine step, and the commute
    to the next appointment today."""
    settings = await db.settings.find_one({"id": "app"}) or {}
    today = today_iso()
    now_hhmm = _local_now(settings).strftime("%H:%M")
    out = ["Good morning!", await _weather_line(settings, today)]
    routine = await db.routines.find_one({"kind": "morning"}) or {}
    steps = routine.get("steps", [])
    check = await db.routine_checks.find_one({"kind": "morning", "date": today}) or {}
    open_steps = [s for s in steps if s["id"] not in check.get("doneStepIds", [])]
    if not steps:
        out.append("Your morning routine has no steps yet.")
    elif not open_steps:
        out.append("Your morning routine is already done. Nice!")
    elif len(open_steps) == len(steps):
        out.append(f"First step of your morning routine: {open_steps[0]['text']}.")
    else:
        out.append(f"Next step of your morning routine: {open_steps[0]['text']}.")
    appts = await db.appointments.find({"date": today, "startTime": {"$gte": now_hhmm}}).sort("startTime", 1).to_list(20)
    if appts:
        first = appts[0]
        out.append(f"Your first appointment is {_appt_phrase(first)}.")
        line = await commute_sentence(settings, first, live, now_hhmm)
        if line:
            out.append(line)
    return " ".join(out)


async def build_bedtime() -> str:
    """Read when the bedtime routine starts: tomorrow's weather, first appointment
    (with commute from home) and meals."""
    settings = await db.settings.find_one({"id": "app"}) or {}
    tomorrow = (date.fromisoformat(today_iso()) + timedelta(days=1)).isoformat()
    t = date.fromisoformat(tomorrow)
    out = [f"Here's tomorrow, {t.strftime('%A')} {t.strftime('%B')} {_ordinal(t.day)}."]
    home = settings.get("home")
    if home:
        try:
            wb = await weather_lib.get_bundle(home["latitude"], home["longitude"], settings.get("units", "celsius"))
            day = next((x for x in wb.days if x.date == tomorrow), None)
            if day:
                line = (f"Expect {WEATHER_WORDS.get(day.code, 'mixed weather')}, a high of {round(day.tempMax)} "
                        f"and a low of {round(day.tempMin)}")
                if day.precipProb >= 20:
                    line += f", with a {round(day.precipProb)} percent chance of rain"
                    if day.precipProb >= 50:
                        line += " — pack an umbrella"
                out.append(line + ".")
        except Exception:
            out.append("I couldn't reach the weather service just now.")
    appts = await db.appointments.find({"date": tomorrow}).sort("startTime", 1).to_list(20)
    if appts:
        more = len(appts) - 1
        out.append(f"Your first appointment is {_appt_phrase(appts[0])}"
                   + (f", then {more} more." if more else "."))
        line = await commute_sentence(settings, appts[0], None, None)
        if line:
            out.append(line)
    else:
        out.append("No appointments tomorrow.")
    order = {"breakfast": 0, "lunch": 1, "dinner": 2, "snack": 3}
    meals = sorted(await db.meals.find({"date": tomorrow}).to_list(20), key=lambda m: order.get(m.get("slot"), 9))
    if meals:
        out.append("Meals: " + _join([f"{m['slot']} is {m['title']}" for m in meals]) + ".")
    else:
        out.append("No meals planned yet.")
    out.append("Sleep well!")
    return " ".join(out)


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

    out.append(await _weather_line(settings, today))

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
